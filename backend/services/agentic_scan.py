"""
Agentic scan engine: run market-maker pipeline with quality checks and optional retries.
Uses AI or heuristic query refinement when results are poor. Never logs plaintext query.
"""

from typing import Any

from services.ebay_client import search_sold, search_active, scrape_listing_condition
from services.valuation_service import (
    calculate_fair_value,
    find_deals,
    filter_suspicious_deals,
    apply_condition_scoring,
    calculate_flip_profit,
    heuristic_refine_query,
)
from services.ai_service import get_brand_retail_price, refine_query_to_string
from services.crypto_service import query_hmac, query_hash_prefix


def _run_pipeline(query: str, min_discount: float) -> dict[str, Any]:
    """
    Single run of the market-maker pipeline (sync).
    Returns dict with valuation, deals (list), suspicious_items, condition_eliminated, manufacturer_price.
    """
    try:
        sold_items = search_sold(query)
    except Exception as e:
        return {"error": str(e), "sold_items": [], "active_items": [], "valuation": None}

    try:
        active_items = search_active(query)
    except Exception as e:
        return {"error": str(e), "sold_items": sold_items, "active_items": [], "valuation": None}

    try:
        manufacturer_price = get_brand_retail_price(query)
    except Exception:
        manufacturer_price = None

    valuation = calculate_fair_value(sold_items)
    fair_value = valuation["fair_value"]
    if fair_value <= 0:
        return {
            "valuation": valuation,
            "deals": [],
            "suspicious_items": [],
            "condition_eliminated": 0,
            "manufacturer_price": manufacturer_price,
            "sold_items": sold_items,
            "active_items": active_items,
        }

    deals = find_deals(active_items, fair_value, threshold=min_discount)
    deals, suspicious_items = filter_suspicious_deals(deals, fair_value, query)

    enriched = []
    for d in deals:
        flip = calculate_flip_profit(d["price"], fair_value)
        d["flip_profit"] = flip["net_profit"]
        d["flip_roi"] = flip["roi_pct"]
        enriched.append(d)

    needs_scrape = [d for d in enriched if d.get("condition_rating") is None][:5]
    for deal in needs_scrape:
        try:
            result = scrape_listing_condition(deal.get("url", ""))
            if result:
                deal["condition_rating"] = result["rating"]
                deal["condition_label"] = result["label"]
                deal["condition_notes"] = result["notes"]
        except Exception:
            pass

    scored_deals, condition_eliminated = apply_condition_scoring(enriched)

    return {
        "valuation": valuation,
        "deals": scored_deals,
        "suspicious_items": suspicious_items,
        "condition_eliminated": condition_eliminated,
        "manufacturer_price": manufacturer_price,
        "sold_items": sold_items,
        "active_items": active_items,
    }


def _quality_metrics(result: dict[str, Any]) -> dict[str, Any]:
    valuation = result.get("valuation") or {}
    deals = result.get("deals") or []
    suspicious = result.get("suspicious_items") or []
    cond_elim = result.get("condition_eliminated") or 0
    sample_size = valuation.get("sample_size", 0)
    confidence = valuation.get("confidence", "low")
    deals_found = len(deals)
    total_filtered = len(suspicious) + cond_elim
    total_before_filter = deals_found + len(suspicious)
    filtered_ratio = total_filtered / total_before_filter if total_before_filter else 0.0
    return {
        "sample_size": sample_size,
        "confidence": confidence,
        "deals_found": deals_found,
        "filtered_ratio": round(filtered_ratio, 2),
        "total_filtered": total_filtered,
    }


def _is_poor_quality(metrics: dict[str, Any]) -> bool:
    if metrics.get("sample_size", 0) < 5:
        return True
    if metrics.get("confidence") == "low" and metrics.get("deals_found", 0) == 0:
        return True
    if metrics.get("filtered_ratio", 0) > 0.8:
        return True
    return False


def _score_result(result: dict[str, Any]) -> tuple[int, int]:
    """Higher is better: (sample_size weight, deals_found weight)."""
    m = _quality_metrics(result)
    return (m["sample_size"], m["deals_found"])


def run_agentic_scan(query: str, min_discount: float = 0.15) -> dict[str, Any]:
    """
    Run the market-maker pipeline; if quality is poor, retry up to 2 times with
    AI-refined or heuristic-refined query. Return best result and agent_trace.
    Trace entries use query_hash prefix only (never plaintext).
    """
    trace: list[dict[str, Any]] = []
    best: dict[str, Any] | None = None
    best_score: tuple[int, int] = (-1, -1)

    def run_and_record(q: str, attempt: int, action: str) -> dict[str, Any]:
        out = _run_pipeline(q, min_discount)
        metrics = _quality_metrics(out)
        hash_prefix = query_hash_prefix(query_hmac(q))
        trace.append({
            "attempt": attempt,
            "query_hash_prefix": hash_prefix,
            "action_taken": action,
            "quality_metrics": metrics,
        })
        return out

    # Attempt 1: original query
    result1 = run_and_record(query, 1, "initial")
    if result1.get("error"):
        return {
            "valuation": result1.get("valuation") or {},
            "deals": result1.get("deals") or [],
            "manufacturer_price": result1.get("manufacturer_price"),
            "agent_trace": trace,
            "error": result1.get("error"),
        }
    if best is None or _score_result(result1) > best_score:
        best = result1
        best_score = _score_result(result1)

    if not _is_poor_quality(_quality_metrics(result1)):
        return {
            "valuation": best["valuation"],
            "deals": best["deals"],
            "manufacturer_price": best.get("manufacturer_price"),
            "agent_trace": trace,
        }

    # Attempt 2: AI refinement
    refined = refine_query_to_string(query, "poor_results")
    if refined and refined.strip() != query.strip():
        result2 = run_and_record(refined.strip(), 2, "ai_refinement")
        if not result2.get("error") and _score_result(result2) > best_score:
            best = result2
            best_score = _score_result(result2)
    else:
        trace.append({
            "attempt": 2,
            "query_hash_prefix": query_hash_prefix(query_hmac(query)),
            "action_taken": "ai_refinement_skipped",
            "quality_metrics": {},
        })

    if best and not _is_poor_quality(_quality_metrics(best)):
        return {
            "valuation": best["valuation"],
            "deals": best["deals"],
            "manufacturer_price": best.get("manufacturer_price"),
            "agent_trace": trace,
        }

    # Attempt 3: heuristic refinement
    heuristic_q = heuristic_refine_query(query)
    if heuristic_q and heuristic_q.strip():
        result3 = run_and_record(heuristic_q, 3, "heuristic_refinement")
        if not result3.get("error") and _score_result(result3) > best_score:
            best = result3
            best_score = _score_result(result3)

    if best is None:
        best = result1

    return {
        "valuation": best["valuation"],
        "deals": best["deals"],
        "manufacturer_price": best.get("manufacturer_price"),
        "agent_trace": trace,
    }
