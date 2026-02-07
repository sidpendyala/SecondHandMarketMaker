"""
eBay Client - Wrapper for the "Real-Time eBay Data" RapidAPI (by mahmudulhasandev).

API Host: real-time-ebay-data.p.rapidapi.com
Endpoints:
  GET /search_get.php?url={encoded_ebay_search_url}
  GET /product_get.php?url={encoded_ebay_product_url}

eBay URL parameters used:
  _nkw       = search keywords
  LH_Sold=1  = sold/completed listings only
  LH_Complete=1 = completed listings
  LH_BIN=1   = Buy It Now only
  _sop=13    = sort by newly listed
  _sop=15    = sort by price + shipping: lowest first
"""

import os
import urllib.parse
import requests


RAPIDAPI_HOST = "real-time-ebay-data.p.rapidapi.com"
BASE_URL = f"https://{RAPIDAPI_HOST}"


def _get_headers() -> dict:
    api_key = os.getenv("RAPID_API_KEY", "")
    return {
        "x-rapidapi-key": api_key,
        "x-rapidapi-host": RAPIDAPI_HOST,
    }


def _has_api_key() -> bool:
    key = os.getenv("RAPID_API_KEY", "")
    return bool(key) and key != "your_rapidapi_key_here"


def _parse_price(raw) -> float:
    """
    Convert price strings to float.
    Handles: '$1,200.00', '$120.00 to $150.00' (takes first), 'See price', etc.
    """
    if isinstance(raw, (int, float)):
        return float(raw)
    if not isinstance(raw, str):
        return 0.0
    cleaned = raw.strip()
    if not cleaned or cleaned.lower() in ("see price", "n/a", ""):
        return 0.0
    # Handle ranges -- take the "from" value
    if " to " in cleaned.lower():
        cleaned = cleaned.lower().split(" to ")[0].strip()
    cleaned = cleaned.replace("$", "").replace(",", "").replace(" ", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _extract_price_from_product(product: dict) -> float:
    """
    Extract a single price float from the API product price object.
    Price structure: { "current": { "from": "$153.10", "to": "$153.10" }, ... }
    """
    price_obj = product.get("price", {})
    if not isinstance(price_obj, dict):
        return _parse_price(price_obj)

    current = price_obj.get("current", {})
    if isinstance(current, dict):
        # Prefer "from" price
        from_price = _parse_price(current.get("from", ""))
        if from_price > 0:
            return from_price
        to_price = _parse_price(current.get("to", ""))
        if to_price > 0:
            return to_price

    # Fallback: try other price fields
    for key in ("value", "soldPrice", "trendingPrice", "previousPrice"):
        val = _parse_price(price_obj.get(key, ""))
        if val > 0:
            return val

    return 0.0


EBAY_CONDITION_MAP = {
    # eBay standard condition labels -> (rating, label)
    # Order matters when using startswith: longer/more specific keys checked first (see _condition_map_sorted).
    "new with tags": (10, "Mint"),
    "new with box": (10, "Mint"),
    "brand new": (10, "Mint"),
    "new": (10, "Mint"),
    "new without tags": (9, "Like New"),
    "new without box": (9, "Like New"),
    "new (other)": (9, "Like New"),
    "open box": (9, "Like New"),
    "like new": (9, "Like New"),
    "certified refurbished": (8, "Like New"),
    "certified - refurbished": (8, "Like New"),
    "excellent - refurbished": (8, "Like New"),
    "excellent": (8, "Like New"),
    "seller refurbished": (7, "Good"),
    "very good - refurbished": (7, "Good"),
    "very good": (7, "Good"),
    "used - very good": (7, "Good"),
    "used - good": (7, "Good"),
    "good - refurbished": (6, "Fair"),
    "good": (7, "Good"),
    "pre-owned": (6, "Fair"),
    "used": (6, "Fair"),
    "acceptable": (5, "Fair"),
    "used - acceptable": (5, "Fair"),
    "for parts or not working": (2, "Poor"),
    "for parts": (2, "Poor"),
}


def _condition_map_sorted():
    """Iterate condition map with longest keys first so 'used - good' matches before 'used'."""
    return sorted(EBAY_CONDITION_MAP.items(), key=lambda x: -len(x[0]))


def _extract_condition_from_subtitles(subtitles: list) -> dict | None:
    """
    Try to extract condition info from search result subTitles.
    Returns { "rating": int, "label": str, "notes": str } or None.
    Uses longest-key-first so e.g. "Used - Good" matches "used - good" (7) not "used" (6).
    """
    if not subtitles:
        return None

    for sub in subtitles:
        sub_lower = sub.strip().lower()
        for key, (rating, label) in _condition_map_sorted():
            if key == sub_lower or sub_lower.startswith(key):
                return {
                    "rating": rating,
                    "label": label,
                    "notes": f"Seller-stated condition: {sub.strip()}",
                }
    return None


def _normalize_product(product: dict, status: str = "active") -> dict:
    """Convert an API product object into our standard internal shape."""
    title = product.get("title", "Unknown")
    # Clean up eBay's "Opens in a new window or tab" suffix
    title = title.replace("Opens in a new window or tab", "").strip()

    price = _extract_price_from_product(product)
    image = product.get("image", "")
    url = product.get("url", "")

    # Extract condition from search result subTitles
    subtitles = product.get("subTitles", [])
    condition = _extract_condition_from_subtitles(subtitles)

    result = {
        "title": title,
        "price": price,
        "image": image,
        "status": status,
        "url": url,
    }

    if condition:
        result["condition_rating"] = condition["rating"]
        result["condition_label"] = condition["label"]
        result["condition_notes"] = condition["notes"]

    return result


def _build_ebay_search_url(query: str, **kwargs) -> str:
    """
    Build an eBay search URL with the given query and optional params.
    
    eBay _sop values:
      1  = Best Match (default)
      10 = Newly Listed
      13 = Newly Listed (alt)
      15 = Price + Shipping: lowest first
      16 = Price + Shipping: highest first
    
    eBay filter params:
      LH_Sold=1 & LH_Complete=1  = Sold items only
      LH_BIN=1                   = Buy It Now only
    """
    params = {"_nkw": query}
    params.update(kwargs)
    return "https://www.ebay.com/sch/i.html?" + urllib.parse.urlencode(params)


def _fetch_search(ebay_url: str) -> list[dict]:
    """Call the RapidAPI search endpoint and return the products list."""
    resp = requests.get(
        f"{BASE_URL}/search_get.php",
        headers=_get_headers(),
        params={"url": ebay_url},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    # Accept both shapes: { "body": { "products": [...] } } and { "products": [...] }
    products = data.get("body", {}).get("products", []) if isinstance(data.get("body"), dict) else []
    if not products and isinstance(data.get("products"), list):
        products = data["products"]
    return products


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def search_sold(query: str) -> list[dict]:
    """
    The Quant data source.
    Fetch recently SOLD listings for the given query.
    Returns list of { title, price, image, status, url }.
    """
    if not _has_api_key():
        raise RuntimeError("RAPID_API_KEY is not configured. Add it to your .env file.")

    ebay_url = _build_ebay_search_url(
        query,
        LH_Sold="1",
        LH_Complete="1",
        _sop="13",  # newly listed
    )
    raw_products = _fetch_search(ebay_url)

    items = [_normalize_product(p, status="sold") for p in raw_products]
    # Drop items with zero/unparseable price
    items = [i for i in items if i["price"] > 0]
    return items


def scrape_listing_condition(listing_url: str) -> dict | None:
    """
    Scrape a single eBay listing page via product_get.php to extract condition.
    Returns { "rating": int, "label": str, "notes": str } or None on failure.
    """
    if not _has_api_key() or not listing_url:
        return None

    try:
        resp = requests.get(
            f"{BASE_URL}/product_get.php",
            headers=_get_headers(),
            params={"url": listing_url},
            timeout=30,
        )
        resp.raise_for_status()
        body = _get_product_body(resp)

        condition_text = body.get("condition", "")
        if not condition_text:
            return None

        condition_lower = condition_text.strip().lower()
        for key, (rating, label) in _condition_map_sorted():
            if key == condition_lower or condition_lower.startswith(key):
                return {
                    "rating": rating,
                    "label": label,
                    "notes": f"Seller-stated condition: {condition_text.strip()}",
                }

        # Unknown condition: infer from keywords instead of defaulting everything to 6
        if "mint" in condition_lower or "new" in condition_lower:
            rating, label = 9, "Like New"
        elif "excellent" in condition_lower:
            rating, label = 8, "Like New"
        elif "very good" in condition_lower:
            rating, label = 7, "Good"
        elif "good" in condition_lower:
            rating, label = 7, "Good"
        elif "acceptable" in condition_lower:
            rating, label = 5, "Fair"
        elif "parts" in condition_lower or "not working" in condition_lower:
            rating, label = 2, "Poor"
        else:
            rating, label = 6, "Fair"
        return {
            "rating": rating,
            "label": label,
            "notes": f"Listed condition: {condition_text.strip()}",
        }

    except Exception as exc:
        print(f"[ebay_client] scrape_listing_condition error: {exc}")
        return None


def _get_product_body(resp) -> dict:
    """Get product detail body from Single Product response. Handles body vs top-level."""
    data = resp.json()
    body = data.get("body")
    if isinstance(body, dict):
        return body
    return data if isinstance(data, dict) else {}


def search_active(query: str) -> list[dict]:
    """
    The Scout data source.
    Fetch ACTIVE Buy-It-Now listings sorted by price ascending.
    Returns list of { title, price, image, status, url }.
    """
    if not _has_api_key():
        raise RuntimeError("RAPID_API_KEY is not configured. Add it to your .env file.")

    ebay_url = _build_ebay_search_url(
        query,
        LH_BIN="1",   # Buy It Now
        _sop="15",     # Price + Shipping: lowest first
    )
    raw_products = _fetch_search(ebay_url)

    items = [_normalize_product(p, status="active") for p in raw_products]
    items = [i for i in items if i["price"] > 0]
    return items
