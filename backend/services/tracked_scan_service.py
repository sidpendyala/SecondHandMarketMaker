"""
Tracked scan service: run agentic scan for a tracked search, upsert seen_items, create alert_events.
Never logs plaintext query; use tracked_search_id or query_hash prefix.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import select

from db.models import TrackedSearch, ScanRun, SeenItem, AlertEvent
from services.crypto_service import decrypt_query, query_hash_prefix
from services.agentic_scan import run_agentic_scan
from services.valuation_service import make_item_key


def scan_tracked_search(tracked_search_id: int, session) -> dict:
    """
    Load tracked search, decrypt query, run agentic scan, upsert seen_items, create alert_events.
    Returns { "ok": bool, "error": str?, "deals_processed": int, "new_alerts": int }.
    """
    row = session.get(TrackedSearch, tracked_search_id)
    if not row:
        return {"ok": False, "error": "tracked search not found", "deals_processed": 0, "new_alerts": 0}
    if not row.enabled:
        return {"ok": True, "skipped": True, "reason": "disabled", "deals_processed": 0, "new_alerts": 0}

    hash_prefix = query_hash_prefix(row.query_hash)
    scan_run = ScanRun(
        tracked_search_id=tracked_search_id,
        started_at=datetime.now(timezone.utc),
        status="running",
    )
    session.add(scan_run)
    session.commit()
    session.refresh(scan_run)

    try:
        query = decrypt_query(row.query_ciphertext)
    except Exception as e:
        scan_run.finished_at = datetime.now(timezone.utc)
        scan_run.status = "failed"
        scan_run.error = str(e)
        session.commit()
        return {"ok": False, "error": str(e), "deals_processed": 0, "new_alerts": 0}

    try:
        result = run_agentic_scan(query, row.min_discount)
    except Exception as e:
        scan_run.finished_at = datetime.now(timezone.utc)
        scan_run.status = "failed"
        scan_run.error = str(e)
        session.commit()
        return {"ok": False, "error": str(e), "deals_processed": 0, "new_alerts": 0}

    deals = result.get("deals") or []
    valuation = result.get("valuation") or {}
    now = datetime.now(timezone.utc)
    deals_processed = 0
    new_alerts = 0

    for deal in deals:
        url = deal.get("url") or ""
        title = deal.get("title") or ""
        price = deal.get("price", 0)
        image = deal.get("image") or ""
        if price <= 0:
            continue
        item_key = make_item_key(url, title, price, image)
        if not item_key:
            continue

        existing = session.execute(
            select(SeenItem).where(
                SeenItem.tracked_search_id == tracked_search_id,
                SeenItem.item_key == item_key,
            )
        ).scalars().one_or_none()

        payload = {
            "title": title,
            "price": price,
            "url": url,
            "image": image,
            "discount_pct": deal.get("discount_pct"),
            "fair_value": deal.get("fair_value"),
        }

        if existing:
            existing.url = url
            existing.title = title
            existing.last_price = price
            existing.last_seen_at = now
            if existing.alerted_at is None:
                session.add(AlertEvent(
                    tracked_search_id=tracked_search_id,
                    item_key=item_key,
                    payload_json=json.dumps(payload),
                ))
                existing.alerted_at = now
                new_alerts += 1
        else:
            session.add(SeenItem(
                tracked_search_id=tracked_search_id,
                item_key=item_key,
                url=url,
                title=title,
                last_price=price,
                first_seen_at=now,
                last_seen_at=now,
                alerted_at=now,
            ))
            session.add(AlertEvent(
                tracked_search_id=tracked_search_id,
                item_key=item_key,
                payload_json=json.dumps(payload),
            ))
            new_alerts += 1
        deals_processed += 1

    stats = {
        "deals_processed": deals_processed,
        "new_alerts": new_alerts,
        "sample_size": valuation.get("sample_size", 0),
        "confidence": valuation.get("confidence", ""),
    }
    scan_run.finished_at = now
    scan_run.status = "success"
    scan_run.stats_json = json.dumps(stats)
    row.last_run_at = now
    session.commit()

    return {
        "ok": True,
        "deals_processed": deals_processed,
        "new_alerts": new_alerts,
    }
