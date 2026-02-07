"""
MarketMaker API - Agentic Deal Finder Backend
"""

import asyncio
import base64
import os
from typing import Optional

from fastapi import FastAPI, Query, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

import requests as _requests
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


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/market-maker", response_model=MarketMakerResponse)
async def market_maker(query: str = Query(..., min_length=2, description="Product search query")):
    """
    The Quant + The Scout + The Visionary pipeline:
    1. Fetch sold history
    2. Calculate fair market value
    3. Fetch active listings
    4. Identify deals (20%+ undervalued)
    5. Concurrent AI condition analysis on all deals
    6. Condition-based filtering and scoring
    """
    # Step 1 – The Quant: sold history
    try:
        sold_items = search_sold(query)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except _requests.RequestException as e:
        raise HTTPException(
            status_code=502,
            detail=f"eBay search failed: {e}. Check RAPID_API_KEY and RapidAPI subscription.",
        )

    # Step 2 – Valuation
    valuation = calculate_fair_value(sold_items)
    fair_value = valuation["fair_value"]

    if fair_value <= 0:
        raise HTTPException(
            status_code=404,
            detail=f"Could not determine fair value for '{query}'. Try a different search.",
        )

    # Step 3 – The Scout: active listings
    try:
        active_items = search_active(query)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except _requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"eBay search failed: {e}")

    # Step 3b – Brand/manufacturer retail price (what the brand sells for) via OpenAI or Gemini
    try:
        manufacturer_price = get_brand_retail_price(query)
    except Exception:
        manufacturer_price = None

    # Step 4 – Filter deals (price threshold)
    deals = find_deals(active_items, fair_value)

    # Step 5 – Smart filter: remove scams, fakes, and mismatched products
    deals, suspicious_items = filter_suspicious_deals(deals, fair_value, query)

    # Step 6 – Enrich deals with flip-profit data
    enriched = []
    for d in deals:
        flip = calculate_flip_profit(d["price"], fair_value)
        d["flip_profit"] = flip["net_profit"]
        d["flip_roi"] = flip["roi_pct"]
        enriched.append(d)

    # Step 7 – Condition analysis from eBay listing data (not GPT Vision)
    # First pass: many deals already have condition from search subTitles
    # Second pass: for deals missing condition, scrape the listing page
    needs_scrape = [d for d in enriched if d.get("condition_rating") is None]
    # Cap scrapes so we don't hammer RapidAPI (slow product_get.php) and avoid timeouts
    max_condition_scrapes = 10
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

    # Step 8 – Condition-based filtering and scoring
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
    """Root route so GET/HEAD / return 200 (e.g. for Render health checks)."""
    return {"service": "MarketMaker API", "docs": "/docs", "health": "/health"}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "MarketMaker API"}
