"""
MarketMaker API - Agentic Deal Finder Backend
"""

import asyncio
import base64
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, FastAPI, Header, Query, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

import requests as _requests
from sqlalchemy import select
from sqlalchemy.orm import Session

from db import get_db_session, get_session_factory
from db.models import TrackedSearch, ScanRun, AlertEvent
from services.crypto_service import encrypt_query, query_hmac, query_hash_prefix
from services.ebay_client import search_sold, search_active, scrape_listing_condition
from services.valuation_service import (
    calculate_fair_value,
    find_deals,
    calculate_sell_tiers,
    calculate_flip_profit,
    apply_condition_scoring,
    filter_suspicious_deals,
)
from services.ai_service import (
    analyze_condition,
    analyze_condition_structured,
    analyze_condition_from_base64,
    detect_and_analyze_image,
    generate_product_fields,
    check_query_refinement,
    get_brand_retail_price,
)
from services.tracked_scan_service import scan_tracked_search


app = FastAPI(
    title="MarketMaker API",
    description="AI Deal Finder for second-hand goods",
    version="1.0.0",
)

# CORS: allow any *.vercel.app and localhost (no FRONTEND_URL needed)
_origin_regex = r"https://.*\.vercel\.app$|http://localhost(:\d+)?$|http://127\.0\.0\.1(:\d+)?$"
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # use regex below; if set, allow_origin_regex is ignored
    allow_origin_regex=_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class ConditionRequest(BaseModel):
    image_url: str


class DealItem(BaseModel):
    title: str
    price: float
    image: str
    url: str
    status: str
    discount_pct: float
    fair_value: float
    flip_profit: float
    flip_roi: float
    condition_rating: Optional[int] = None
    condition_label: Optional[str] = None
    condition_notes: Optional[str] = None
    condition_adjusted_discount: Optional[float] = None
    condition_flag: Optional[str] = None  # "top_pick" | "fair_warning" | None


class FilteredItem(BaseModel):
    title: str
    price: float
    url: str
    image: str
    reason: str
    filter_type: str  # "scam" | "mismatch" | "poor_condition"


class MarketMakerResponse(BaseModel):
    query: str
    fair_value: float
    mean_price: float
    min_price: float
    max_price: float
    sample_size: int
    std_dev: float
    confidence: str
    deals: list[DealItem]
    total_active: int
    deals_eliminated: int
    filtered_items: list[FilteredItem] = []
    manufacturer_price: Optional[float] = None  # brand/manufacturer retail (MSRP) from OpenAI or Gemini


class PriceTier(BaseModel):
    name: str
    list_price: float
    ebay_fee: float
    shipping: float
    net_payout: float


class SellAdvisorRequest(BaseModel):
    query: str
    condition: Optional[int] = None  # 1-10
    details: Optional[dict] = None   # key/value from smart fields


class SellAdvisorResponse(BaseModel):
    query: str
    fair_value: float
    mean_price: float
    min_price: float
    max_price: float
    sample_size: int
    std_dev: float
    confidence: str
    tiers: list[PriceTier]
    recommended_tier: Optional[str] = None  # tier name to recommend


class ConditionResponse(BaseModel):
    analysis: str
    source: str


class StructuredConditionResponse(BaseModel):
    rating: int
    label: str
    notes: str
    source: str = "ai"  # "ai" | "gemini" | "mock"
    detected_product: Optional[str] = None
    detected_attributes: Optional[dict] = None


class ProductFieldItem(BaseModel):
    name: str
    key: str
    type: str
    options: list[str]


class ProductFieldsResponse(BaseModel):
    query: str
    fields: list[ProductFieldItem]


class ProductFieldsRequest(BaseModel):
    query: str


class RefineQueryRequest(BaseModel):
    query: str


class RefineQueryResponse(BaseModel):
    query: str
    needs_refinement: bool
    fields: list[ProductFieldItem] = []


# Tracked searches (persistence only when user explicitly creates)
class CreateTrackedSearchRequest(BaseModel):
    query: str
    min_discount: Optional[float] = 0.15
    frequency_minutes: Optional[int] = 15


class CreateTrackedSearchResponse(BaseModel):
    id: int


class TrackedSearchListItem(BaseModel):
    id: int
    query_hash_prefix: str
    min_discount: float
    frequency_minutes: int
    enabled: bool
    last_run_at: Optional[str] = None
    created_at: str


class UpdateTrackedSearchRequest(BaseModel):
    enabled: Optional[bool] = None
    min_discount: Optional[float] = None
    frequency_minutes: Optional[int] = None


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/market-maker", response_model=MarketMakerResponse)
async def market_maker(query: str = Query(..., min_length=2, description="Product search query")):
    """
    The Quant + The Scout + The Visionary pipeline:
    1. Fetch sold + active + brand price in parallel
    2. Valuation, deals, filter, condition scrapes, scoring
    """
    # Step 1 – Run sold, active, and brand price in parallel for faster load
    async def _sold():
        try:
            return await asyncio.to_thread(search_sold, query)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except _requests.RequestException as e:
            raise HTTPException(
                status_code=502,
                detail=f"eBay search failed: {e}. Check RAPID_API_KEY and RapidAPI subscription.",
            )

    async def _active():
        try:
            return await asyncio.to_thread(search_active, query)
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except _requests.RequestException as e:
            raise HTTPException(status_code=502, detail=f"eBay search failed: {e}")

    async def _brand_price():
        try:
            return await asyncio.to_thread(get_brand_retail_price, query)
        except Exception:
            return None

    sold_items, active_items, manufacturer_price = await asyncio.gather(
        _sold(), _active(), _brand_price()
    )

    # -------------------------------------------------------------------------
    # Phase 1: Indexing complete — valuation from ALL sold data (unchanged)
    # Fair value and avg sell price are computed from full sold set only.
    # -------------------------------------------------------------------------
    valuation = calculate_fair_value(sold_items)
    fair_value = valuation["fair_value"]

    if fair_value <= 0:
        raise HTTPException(
            status_code=404,
            detail=f"Could not determine fair value for '{query}'. Try a different search.",
        )

    # -------------------------------------------------------------------------
    # Phase 2: Only values below market value — deal pipeline runs AFTER indexing.
    # All downstream work (scam filter, condition scrapes, scoring) uses only
    # active listings that are below fair value; valuation stats stay untouched.
    # -------------------------------------------------------------------------
    deals = find_deals(active_items, fair_value)
    deals, suspicious_items = filter_suspicious_deals(deals, fair_value, query)

    enriched = []
    for d in deals:
        flip = calculate_flip_profit(d["price"], fair_value)
        d["flip_profit"] = flip["net_profit"]
        d["flip_roi"] = flip["roi_pct"]
        enriched.append(d)

    # Condition scrapes only for below-market deals (not full active list)
    needs_scrape = [d for d in enriched if d.get("condition_rating") is None]
    max_condition_scrapes = 5
    if len(needs_scrape) > max_condition_scrapes:
        needs_scrape = needs_scrape[:max_condition_scrapes]

    if needs_scrape:
        async def _scrape_one(deal: dict) -> dict:
            try:
                result = await asyncio.to_thread(
                    scrape_listing_condition, deal.get("url", "")
                )
                if result:
                    deal["condition_rating"] = result["rating"]
                    deal["condition_label"] = result["label"]
                    deal["condition_notes"] = result["notes"]
            except Exception as exc:
                print(f"[market_maker] Listing scrape failed: {exc}")
            return deal

        await asyncio.gather(*[_scrape_one(d) for d in needs_scrape])

    # Condition-based filtering and scoring (still only below-market deals)
    scored_deals, condition_eliminated = apply_condition_scoring(enriched)

    # Combine all filtered items for the response
    all_filtered: list[dict] = list(suspicious_items)  # already formatted
    # Add condition-eliminated items
    # (condition filter doesn't return the items, so count only)
    total_eliminated = len(suspicious_items) + condition_eliminated

    # Build response models
    deal_models = []
    for d in scored_deals:
        deal_models.append(DealItem(
            title=d["title"],
            price=d["price"],
            image=d["image"],
            url=d["url"],
            status=d.get("status", "active"),
            discount_pct=d["discount_pct"],
            fair_value=d["fair_value"],
            flip_profit=d["flip_profit"],
            flip_roi=d["flip_roi"],
            condition_rating=d.get("condition_rating"),
            condition_label=d.get("condition_label"),
            condition_notes=d.get("condition_notes"),
            condition_adjusted_discount=d.get("condition_adjusted_discount"),
            condition_flag=d.get("condition_flag"),
        ))

    filtered_models = [FilteredItem(**f) for f in all_filtered]

    # Sort so top picks appear first, then fair_warning, then the rest
    def _deal_order_key(d: DealItem) -> int:
        if d.condition_flag == "top_pick":
            return 0
        if d.condition_flag == "fair_warning":
            return 1
        return 2

    deal_models.sort(key=_deal_order_key)

    return MarketMakerResponse(
        query=query,
        fair_value=valuation["fair_value"],
        mean_price=valuation["mean_price"],
        min_price=valuation["min_price"],
        max_price=valuation["max_price"],
        sample_size=valuation["sample_size"],
        std_dev=valuation["std_dev"],
        confidence=valuation["confidence"],
        deals=deal_models,
        total_active=len(active_items),
        deals_eliminated=total_eliminated,
        filtered_items=filtered_models,
        manufacturer_price=manufacturer_price,
    )


@app.post("/api/sell-advisor", response_model=SellAdvisorResponse)
async def sell_advisor(body: SellAdvisorRequest):
    """
    Sell Advisor: tells you what to list your item for.
    1. Fetch sold history (optionally refined by details)
    2. Calculate fair value + stats
    3. Calculate pricing tiers with fee breakdowns
    4. Recommend a tier based on condition
    """
    # Build refined query from details -- try refined first, fall back to base query
    search_query = body.query
    if body.details:
        extras = " ".join(str(v) for v in body.details.values() if v)
        if extras:
            search_query = f"{body.query} {extras}"

    try:
        sold_items = search_sold(search_query)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except _requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"eBay search failed: {e}")

    valuation = calculate_fair_value(sold_items)

    # If refined query found nothing, fall back to the base query
    if valuation["fair_value"] <= 0 and search_query != body.query:
        print(f"[sell_advisor] Refined query '{search_query}' found nothing, falling back to '{body.query}'")
        try:
            sold_items = search_sold(body.query)
        except (_requests.RequestException, RuntimeError):
            pass
        valuation = calculate_fair_value(sold_items)

    fair_value = valuation["fair_value"]

    if fair_value <= 0:
        raise HTTPException(
            status_code=404,
            detail=f"Could not determine fair value for '{body.query}'. Try a different search.",
        )

    tiers = calculate_sell_tiers(sold_items, condition_rating=body.condition)

    # Determine recommended tier based on condition
    recommended = "Competitive"  # default
    if body.condition is not None:
        if body.condition >= 8:
            recommended = "Market Value"
        elif body.condition >= 5:
            recommended = "Competitive"
        else:
            recommended = "Quick Sale"

    return SellAdvisorResponse(
        query=body.query,
        fair_value=valuation["fair_value"],
        mean_price=valuation["mean_price"],
        min_price=valuation["min_price"],
        max_price=valuation["max_price"],
        sample_size=valuation["sample_size"],
        std_dev=valuation["std_dev"],
        confidence=valuation["confidence"],
        tiers=[PriceTier(**t) for t in tiers],
        recommended_tier=recommended,
    )


@app.post("/api/analyze-upload", response_model=StructuredConditionResponse)
async def analyze_upload(file: UploadFile = File(...)):
    """
    Analyse an uploaded product image.
    Returns structured { rating, label, notes, detected_product, detected_attributes }.
    Uses combined AI call to detect the product AND rate its condition.
    """
    contents = await file.read()
    # Determine MIME type
    content_type = file.content_type or "image/jpeg"
    b64 = base64.b64encode(contents).decode("utf-8")
    data_url = f"data:{content_type};base64,{b64}"

    result = await asyncio.to_thread(detect_and_analyze_image, data_url)
    return StructuredConditionResponse(**result)


@app.post("/api/product-fields", response_model=ProductFieldsResponse)
async def product_fields(body: ProductFieldsRequest):
    """
    Generate smart product attribute fields using AI.
    """
    if not body.query or len(body.query) < 2:
        raise HTTPException(status_code=400, detail="query is required")

    fields = await asyncio.to_thread(generate_product_fields, body.query)
    return ProductFieldsResponse(
        query=body.query,
        fields=[ProductFieldItem(**f) for f in fields],
    )


@app.post("/api/refine-query", response_model=RefineQueryResponse)
async def refine_query(body: RefineQueryRequest):
    """
    Check if a search query is too broad and suggest refinement parameters.
    """
    if not body.query or len(body.query.strip()) < 2:
        raise HTTPException(status_code=400, detail="query is required")

    result = await asyncio.to_thread(check_query_refinement, body.query.strip())
    fields = []
    if result.get("needs_refinement"):
        for f in result.get("fields", []):
            fields.append(ProductFieldItem(**f))

    return RefineQueryResponse(
        query=body.query,
        needs_refinement=result.get("needs_refinement", False),
        fields=fields,
    )


# ---------- Tracked searches (opt-in persistence; only these endpoints write query to DB) ----------

@app.post("/api/tracked-searches", response_model=CreateTrackedSearchResponse)
async def create_tracked_search(
    body: CreateTrackedSearchRequest,
    session: Session = Depends(get_db_session),
):
    """Create a tracked search. Query is stored encrypted; only place that persists search query."""
    query = (body.query or "").strip()
    if len(query) < 2:
        raise HTTPException(status_code=400, detail="query must be at least 2 characters")
    min_discount = body.min_discount if body.min_discount is not None else 0.15
    frequency_minutes = body.frequency_minutes if body.frequency_minutes is not None else 15
    if min_discount < 0 or min_discount > 1:
        raise HTTPException(status_code=400, detail="min_discount must be between 0 and 1")
    if frequency_minutes < 1 or frequency_minutes > 10080:
        raise HTTPException(status_code=400, detail="frequency_minutes must be between 1 and 10080")

    query_hash = query_hmac(query)
    query_ciphertext = encrypt_query(query)
    row = TrackedSearch(
        query_ciphertext=query_ciphertext,
        query_hash=query_hash,
        min_discount=min_discount,
        frequency_minutes=frequency_minutes,
        enabled=True,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return CreateTrackedSearchResponse(id=row.id)


@app.get("/api/tracked-searches", response_model=list[TrackedSearchListItem])
async def list_tracked_searches(session: Session = Depends(get_db_session)):
    """List all tracked searches. Returns query_hash prefix only (never plaintext)."""
    rows = session.execute(select(TrackedSearch).order_by(TrackedSearch.created_at.desc())).scalars().all()
    return [
        TrackedSearchListItem(
            id=r.id,
            query_hash_prefix=query_hash_prefix(r.query_hash),
            min_discount=r.min_discount,
            frequency_minutes=r.frequency_minutes,
            enabled=r.enabled,
            last_run_at=r.last_run_at.isoformat() if r.last_run_at else None,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@app.patch("/api/tracked-searches/{tracked_search_id}")
async def update_tracked_search(
    tracked_search_id: int,
    body: UpdateTrackedSearchRequest,
    session: Session = Depends(get_db_session),
):
    """Update enabled, min_discount, or frequency_minutes."""
    row = session.get(TrackedSearch, tracked_search_id)
    if not row:
        raise HTTPException(status_code=404, detail="tracked search not found")
    if body.enabled is not None:
        row.enabled = body.enabled
    if body.min_discount is not None:
        if body.min_discount < 0 or body.min_discount > 1:
            raise HTTPException(status_code=400, detail="min_discount must be between 0 and 1")
        row.min_discount = body.min_discount
    if body.frequency_minutes is not None:
        if body.frequency_minutes < 1 or body.frequency_minutes > 10080:
            raise HTTPException(status_code=400, detail="frequency_minutes must be between 1 and 10080")
        row.frequency_minutes = body.frequency_minutes
    session.commit()
    return {"ok": True}


@app.delete("/api/tracked-searches/{tracked_search_id}")
async def delete_tracked_search(
    tracked_search_id: int,
    session: Session = Depends(get_db_session),
):
    """Delete one tracked search and its scan_runs, seen_items, alert_events."""
    row = session.get(TrackedSearch, tracked_search_id)
    if not row:
        raise HTTPException(status_code=404, detail="tracked search not found")
    session.delete(row)
    session.commit()
    return {"ok": True}


@app.delete("/api/tracked-searches")
async def delete_all_tracked_searches(session: Session = Depends(get_db_session)):
    """Delete all tracked searches (privacy/admin cleanup)."""
    from sqlalchemy import delete
    session.execute(delete(TrackedSearch))
    session.commit()
    return {"ok": True, "deleted": "all"}


# ---------- Job endpoints (Railway Cron); protected by X-Job-Secret ----------

def _job_secret() -> str:
    return os.getenv("JOB_SECRET", "").strip()


def _require_job_secret(x_job_secret: Optional[str] = Header(None, alias="X-Job-Secret")):
    if not _job_secret():
        raise HTTPException(status_code=500, detail="JOB_SECRET not configured")
    if x_job_secret != _job_secret():
        raise HTTPException(status_code=401, detail="Invalid or missing X-Job-Secret")


@app.post("/jobs/scan_all")
async def job_scan_all(
    _: None = Depends(_require_job_secret),
    session: Session = Depends(get_db_session),
):
    """
    Run scans for all enabled tracked searches that are due.
    Concurrency limited by Semaphore(2). For Railway Cron: POST with header X-Job-Secret.
    """
    rows = session.execute(select(TrackedSearch).where(TrackedSearch.enabled == True)).scalars().all()
    now = datetime.now(timezone.utc)
    due = []
    for r in rows:
        if r.last_run_at is None:
            due.append(r.id)
        elif r.last_run_at + timedelta(minutes=r.frequency_minutes) < now:
            due.append(r.id)
    if not due:
        return {"runs": 0, "succeeded": [], "failed": []}

    sem = asyncio.Semaphore(2)
    succeeded = []
    failed = []
    factory = get_session_factory()
    if factory is None:
        raise HTTPException(status_code=500, detail="DATABASE_URL not configured")

    def _run_scan(tracked_search_id: int):
        sess = factory()
        try:
            return scan_tracked_search(tracked_search_id, sess)
        finally:
            sess.close()

    async def run_one(tracked_search_id: int):
        async with sem:
            try:
                out = await asyncio.to_thread(_run_scan, tracked_search_id)
                if out.get("ok") and not out.get("skipped"):
                    succeeded.append({"id": tracked_search_id, "deals_processed": out.get("deals_processed", 0), "new_alerts": out.get("new_alerts", 0)})
                elif not out.get("ok"):
                    failed.append({"id": tracked_search_id, "error": out.get("error", "unknown")})
            except Exception as e:
                failed.append({"id": tracked_search_id, "error": str(e)})

    for tid in due:
        await run_one(tid)

    return {"runs": len(due), "succeeded": succeeded, "failed": failed}


@app.post("/jobs/cleanup")
async def job_cleanup(
    _: None = Depends(_require_job_secret),
    session: Session = Depends(get_db_session),
):
    """
    Delete scan_runs and alert_events older than DATA_RETENTION_DAYS.
    For Railway Cron: POST with header X-Job-Secret.
    """
    from sqlalchemy import delete
    days = int(os.getenv("DATA_RETENTION_DAYS", "30"))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    r1 = session.execute(delete(ScanRun).where(ScanRun.started_at < cutoff))
    r2 = session.execute(delete(AlertEvent).where(AlertEvent.created_at < cutoff))
    deleted_runs = r1.rowcount if r1.rowcount is not None else 0
    deleted_events = r2.rowcount if r2.rowcount is not None else 0
    session.commit()
    return {"deleted_scan_runs": deleted_runs, "deleted_alert_events": deleted_events}


@app.post("/api/verify-condition", response_model=ConditionResponse)
async def verify_condition(body: ConditionRequest):
    """
    The Visionary: analyse a product image for condition (free-text).
    """
    if not body.image_url:
        raise HTTPException(status_code=400, detail="image_url is required")

    result = analyze_condition(body.image_url)
    return ConditionResponse(**result)


@app.get("/")
async def root():
    """Root route so GET / returns 200 (e.g. for Render health checks)."""
    return {"service": "MarketMaker API", "docs": "/docs", "health": "/health"}


@app.head("/")
async def root_head():
    """Allow HEAD / for health checks and probes (avoid 405 Method Not Allowed)."""
    return Response(status_code=200)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "MarketMaker API"}


@app.head("/health")
async def health_head():
    return Response(status_code=200)
