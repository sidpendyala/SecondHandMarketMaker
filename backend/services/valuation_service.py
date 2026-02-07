"""
Valuation Service - "The Quant"
Calculates Fair Market Value from sold listing data.
Also provides sell-side pricing tiers and flip-profit calculations.
Includes smart filtering for scams, fakes, and product mismatches.
"""

import re
import statistics
from typing import Optional


# eBay fee constants
EBAY_FEE_RATE = 0.1325   # 13.25 % final value fee
EBAY_FEE_FIXED = 0.30    # $0.30 per-order fee
ESTIMATED_SHIPPING = 8.00 # flat shipping estimate


def calculate_fair_value(sold_items: list[dict]) -> dict:
    """
    Calculate Fair Market Value from a list of sold items.
    
    Returns a dict with:
      - fair_value: the median sold price (robust to outliers)
      - mean_price: arithmetic mean
      - min_price: lowest sold price
      - max_price: highest sold price
      - sample_size: number of items analysed
      - std_dev: standard deviation (measure of price spread)
      - confidence: 'high' | 'medium' | 'low' based on sample size & spread
    """
    prices = _extract_prices(sold_items)

    if not prices:
        return {
            "fair_value": 0.0,
            "mean_price": 0.0,
            "min_price": 0.0,
            "max_price": 0.0,
            "sample_size": 0,
            "std_dev": 0.0,
            "confidence": "low",
        }

    # Remove extreme outliers (beyond 2 std-devs from mean) for robustness
    prices = _remove_outliers(prices)

    median = round(statistics.median(prices), 2)
    mean = round(statistics.mean(prices), 2)
    std_dev = round(statistics.stdev(prices), 2) if len(prices) > 1 else 0.0
    min_p = round(min(prices), 2)
    max_p = round(max(prices), 2)

    confidence = _assess_confidence(len(prices), std_dev, mean)

    return {
        "fair_value": median,
        "mean_price": mean,
        "min_price": min_p,
        "max_price": max_p,
        "sample_size": len(prices),
        "std_dev": std_dev,
        "confidence": confidence,
    }


def find_deals(active_items: list[dict], fair_value: float, threshold: float = 0.20) -> list[dict]:
    """
    Filter active listings that are priced at least `threshold` (default 20 %)
    below the Fair Market Value.

    Each returned item gets extra fields:
      - discount_pct: percentage below fair value (e.g. 25.3)
      - fair_value: the fair value used for comparison
    """
    if fair_value <= 0:
        return []

    deals = []
    for item in active_items:
        price = item.get("price", 0)
        if price <= 0:
            continue

        discount = (fair_value - price) / fair_value
        if discount >= threshold:
            deals.append({
                **item,
                "discount_pct": round(discount * 100, 1),
                "fair_value": fair_value,
            })

    # Sort by biggest discount first
    deals.sort(key=lambda d: d["discount_pct"], reverse=True)
    return deals


def _condition_multiplier(rating: int | None) -> float:
    """
    Return a price multiplier based on the item's condition rating (1-10).

    A broken item (1-2) should sell for ~25-35% of market value.
    A pristine item (9-10) should sell at full market value.
    """
    if rating is None:
        return 1.0
    if rating >= 9:
        return 1.0        # Mint — full price
    if rating == 8:
        return 0.92       # Like New — slight discount
    if rating == 7:
        return 0.82       # Good — noticeable discount
    if rating == 6:
        return 0.72       # Fair — significant discount
    if rating == 5:
        return 0.60       # Below Fair — buyers wary
    if rating == 4:
        return 0.48       # Damaged — steep discount
    if rating == 3:
        return 0.38       # Heavily damaged
    if rating == 2:
        return 0.28       # Barely functional / for parts
    # rating 1
    return 0.20            # Parts only / non-functional


def calculate_sell_tiers(
    sold_items: list[dict],
    condition_rating: int | None = None,
) -> list[dict]:
    """
    Calculate 4 sell-pricing tiers based on sold-item percentiles,
    adjusted for condition rating if provided.

    Returns a list of dicts, each with:
      name, list_price, ebay_fee, shipping, net_payout
    """
    prices = _extract_prices(sold_items)
    prices = _remove_outliers(prices) if len(prices) >= 5 else prices

    if not prices:
        return []

    sorted_prices = sorted(prices)
    multiplier = _condition_multiplier(condition_rating)

    tiers_def = [
        ("Quick Sale",    15),
        ("Competitive",   30),
        ("Market Value",  50),
        ("Premium",       75),
    ]

    tiers = []
    for name, pct in tiers_def:
        raw_price = _percentile(sorted_prices, pct)
        list_price = round(raw_price * multiplier, 2)
        ebay_fee = round(list_price * EBAY_FEE_RATE + EBAY_FEE_FIXED, 2)
        net_payout = round(list_price - ebay_fee - ESTIMATED_SHIPPING, 2)
        tiers.append({
            "name": name,
            "list_price": list_price,
            "ebay_fee": ebay_fee,
            "shipping": ESTIMATED_SHIPPING,
            "net_payout": max(0, net_payout),
        })

    return tiers


def apply_condition_scoring(deals: list[dict]) -> tuple[list[dict], int]:
    """
    Apply condition-based scoring to filter and re-rank deals.

    - Rating 8-10 (Mint/Like New): multiplier 1.15, flag "top_pick"
    - Rating 6-7 (Good):           multiplier 1.0,  flag None
    - Rating 4-5 (Fair):           multiplier 0.65, flag "fair_warning"
    - Rating 1-3 (Poor):           ELIMINATED from results
    - Rating None (failed):        multiplier 1.0,  flag None

    Returns: (filtered_deals, eliminated_count)
    """
    kept = []
    eliminated = 0

    for deal in deals:
        rating = deal.get("condition_rating")

        if rating is not None and 1 <= rating <= 3:
            eliminated += 1
            continue

        raw_discount = deal.get("discount_pct", 0.0)

        if rating is not None and rating >= 8:
            multiplier = 1.15
            flag = "top_pick"
        elif rating is not None and rating <= 5:
            multiplier = 0.65
            flag = "fair_warning"
        else:
            multiplier = 1.0
            flag = None

        adjusted = round(raw_discount * multiplier, 1)
        deal["condition_adjusted_discount"] = adjusted
        deal["condition_flag"] = flag
        kept.append(deal)

    # Re-sort by condition-adjusted discount (best deals first)
    kept.sort(key=lambda d: d.get("condition_adjusted_discount", 0), reverse=True)
    return kept, eliminated


# ---------------------------------------------------------------------------
# Smart Deal Filters — Scam / TGTBT / Mismatch Detection
# ---------------------------------------------------------------------------

# Keywords that signal the listing is NOT the actual product
SCAM_KEYWORDS = [
    "box only", "empty box", "case only", "manual only",
    "booklet only", "instructions only", "poster only",
    "read description", "see description", "description only",
    "for parts", "not working", "doesnt work", "does not work",
    "broken screen", "cracked screen", "water damage",
    "as is", "as-is", "no returns", "sold as is",
    "replica", "fake", "counterfeit", "clone", "knockoff",
    "paper weight", "paperweight", "display only", "dummy",
    "demo unit", "decoy", "prop", "toy version",
    "no item", "no product", "no phone", "no console", "no laptop",
    "no tablet", "no headphones", "no earbuds",
    "image only", "photo only", "picture only", "digital download",
    "parts only", "logic board only", "memory only", "ram only",
]

# Keywords for accessories / peripheral items that aren't the main product
# These are checked as substrings in the listing title (eBay returns parts/accessories in search)
ACCESSORY_KEYWORDS = [
    # ---- General accessories ----
    "case for", "cover for", "skin for", "sleeve for",
    "screen protector", "tempered glass", "glass protector",
    "charger for", "cable for", "adapter for", "cord for",
    "mount for", "stand for", "holder for", "dock for",
    "strap for", "band for", "wristband for",
    "ear tips", "ear pads", "ear cushion", "replacement pads",
    "remote control for", "controller skin",
    "carrying case", "travel case", "pouch for",
    "sticker for", "decal for", "vinyl for",
    "repair kit", "tool kit", "replacement part",
    "user guide", "quick start", "getting started",
    "silicone case", "rubber case", "hard case", "clear case",
    "protective case", "phone case", "laptop case",
    "charging cable", "usb cable", "lightning cable",
    "wall charger", "car charger", "wireless charger",
    "screen film", "privacy screen",
    "keyboard cover", "trackpad cover",
    "dust plug", "port cover",
    "replacement battery", "battery pack",
    # ---- Parts / components (eBay often returns these for "macbook", "iphone", etc.) ----
    "logic board", "logicboard",
    "motherboard", "mainboard",
    "memory module", "ram module", "ram only", "memory only",
    "replacement memory", "replacement ram",
    "palmrest", "palm rest", "top case", "topcase", "bottom case",
    "keyboard assembly", "trackpad assembly", "touchpad assembly",
    "display assembly", "lcd assembly", "screen assembly",
    "battery only", "charger only", "dock only", "cable only",
    "ssd only", "hard drive only", "storage only",
    "screen only", "display only", "lcd only",
    "flex cable", "ribbon cable", "dc in board", "magsafe board",
    "replacement screen", "replacement lcd", "replacement display",
    "for parts", "parts only",
]

# Standalone words that indicate an accessory when combined with
# the absence of the product's category word in the title
ACCESSORY_STANDALONE = {
    "case", "cover", "protector", "charger", "cable", "adapter",
    "sleeve", "pouch", "strap", "band", "skin", "decal", "sticker",
    "mount", "stand", "holder", "dock", "cradle", "film", "wrap",
    "cushion", "pad", "tip", "grip", "bumper", "folio", "wallet",
}

# Words that are too generic to be meaningful in matching
STOPWORDS = {
    "the", "a", "an", "and", "or", "for", "with", "in", "on", "of",
    "to", "new", "used", "pre-owned", "lot", "set", "bundle",
    "free", "shipping", "fast", "oem", "genuine", "original",
    "authentic", "official", "brand", "sealed",
}

# Product category words — if one of these is in the QUERY but the listing
# title has it replaced by an accessory word, that's a mismatch
PRODUCT_TYPE_WORDS = {
    "phone", "laptop", "tablet", "headphones", "earbuds", "console",
    "camera", "watch", "speaker", "monitor", "tv", "television",
    "keyboard", "mouse", "printer", "drone", "guitar", "bike",
    "shoe", "shoes", "sneaker", "sneakers", "boot", "boots",
    "jacket", "coat", "bag", "backpack", "desk", "chair", "sofa",
    "mattress", "macbook", "ipad", "iphone", "airpods", "playstation",
    "xbox", "nintendo", "switch", "gopro",
}


def _normalize_text(text: str) -> str:
    """Lower-case and strip special chars for comparison."""
    return re.sub(r"[^a-z0-9\s]", "", text.lower().strip())


def _extract_core_terms(query: str) -> list[str]:
    """
    Pull the meaningful product terms out of a search query.
    e.g. "Sony WH-1000XM4 headphones" -> ["sony", "wh1000xm4", "headphones"]
    """
    normalized = _normalize_text(query)
    tokens = normalized.split()
    return [t for t in tokens if t not in STOPWORDS and len(t) >= 2]


def filter_suspicious_deals(
    deals: list[dict], fair_value: float, query: str
) -> tuple[list[dict], list[dict]]:
    """
    Filter out suspicious/scam/mismatched deals.

    Checks:
      1. SCAM / TOO GOOD TO BE TRUE
         - Title contains scam keywords (box only, replica, broken, etc.)
         - Price is absurdly low (< 25% of fair value when fair value > $50)
         - Discount exceeds 70% for items worth > $100

      2. PRODUCT MISMATCH
         - Title is missing key product terms from the query
         - Title is clearly an accessory (case, charger, screen protector)

    Returns: (kept_deals, filtered_items)
      filtered_items: list of { title, price, url, image, reason, filter_type }
    """
    core_terms = _extract_core_terms(query)
    kept = []
    filtered = []

    for deal in deals:
        title_lower = deal.get("title", "").lower()
        title_normalized = _normalize_text(deal.get("title", ""))
        price = deal.get("price", 0)
        discount = deal.get("discount_pct", 0)
        reasons = []
        filter_type = None

        # ----- CHECK 1: Scam keyword detection -----
        matched_scam_kw = []
        for kw in SCAM_KEYWORDS:
            if kw in title_lower:
                matched_scam_kw.append(kw)

        if matched_scam_kw:
            reasons.append(
                f"Listing contains suspicious terms: {', '.join(matched_scam_kw)}"
            )
            filter_type = "scam"

        # ----- CHECK 2: Price too good to be true -----
        if fair_value > 50 and price > 0:
            price_ratio = price / fair_value
            if price_ratio < 0.20:
                reasons.append(
                    f"Price (${price:.2f}) is only {price_ratio*100:.0f}% of "
                    f"market value (${fair_value:.2f}) — likely a scam or bait listing"
                )
                filter_type = filter_type or "scam"
            elif price_ratio < 0.30 and discount > 65:
                reasons.append(
                    f"Suspiciously cheap at ${price:.2f} vs "
                    f"${fair_value:.2f} market value ({discount:.0f}% discount)"
                )
                filter_type = filter_type or "scam"

        # ----- CHECK 3: Accessory phrase detection -----
        if not filter_type:
            for kw in ACCESSORY_KEYWORDS:
                if kw in title_lower:
                    reasons.append(
                        f"Listing appears to be an accessory, not the product: "
                        f"title contains \"{kw}\""
                    )
                    filter_type = "mismatch"
                    break  # one accessory reason is enough

        # ----- CHECK 4: Standalone accessory word detection -----
        if not filter_type:
            title_words = set(title_normalized.split())
            accessory_words_in_title = title_words & ACCESSORY_STANDALONE

            # If the title contains accessory words but NO product-type words
            # from the query, it's very likely an accessory listing
            query_product_words = set(core_terms) & PRODUCT_TYPE_WORDS
            if accessory_words_in_title and query_product_words:
                # User searched for a product category; does the listing have it?
                if not (query_product_words & title_words):
                    reasons.append(
                        f"Listing is an accessory ({', '.join(accessory_words_in_title)}) "
                        f"— missing the product itself ({', '.join(query_product_words)})"
                    )
                    filter_type = "mismatch"

        # ----- CHECK 5: Product term mismatch (STRICT) -----
        if core_terms and not filter_type:
            # Count how many core query terms are present in the title
            matches = sum(1 for t in core_terms if t in title_normalized)
            match_ratio = matches / len(core_terms)
            missing = [t for t in core_terms if t not in title_normalized]

            # STRICT thresholds:
            # - 2-3 core terms: ALL must match (100%)
            # - 4+ core terms: at least 75% must match
            if len(core_terms) <= 3:
                required_ratio = 1.0
            else:
                required_ratio = 0.75

            if match_ratio < required_ratio and len(core_terms) >= 2:
                reasons.append(
                    f"Product mismatch — listing title is missing key terms: "
                    f"{', '.join(missing)}"
                )
                filter_type = "mismatch"

        # ----- VERDICT -----
        if filter_type:
            filtered.append({
                "title": deal.get("title", ""),
                "price": price,
                "url": deal.get("url", ""),
                "image": deal.get("image", ""),
                "reason": " | ".join(reasons),
                "filter_type": filter_type,
            })
            try:
                print(
                    f"[filter] REMOVED ({filter_type}): "
                    f"${price:.2f} - {deal.get('title', '')[:60]} - {reasons[0]}"
                )
            except UnicodeEncodeError:
                print(f"[filter] REMOVED ({filter_type}): ${price:.2f}")
        else:
            kept.append(deal)

    return kept, filtered


def calculate_flip_profit(buy_price: float, fair_value: float) -> dict:
    """
    Calculate the profit from buying at `buy_price` and reselling at `fair_value`.

    Returns:
      buy_price, sell_price, ebay_fee, shipping, net_profit, roi_pct
    """
    sell_price = fair_value
    ebay_fee = round(sell_price * EBAY_FEE_RATE + EBAY_FEE_FIXED, 2)
    total_cost = buy_price + ESTIMATED_SHIPPING
    net_revenue = sell_price - ebay_fee
    net_profit = round(net_revenue - total_cost, 2)
    roi_pct = round((net_profit / total_cost) * 100, 1) if total_cost > 0 else 0.0

    return {
        "buy_price": buy_price,
        "sell_price": sell_price,
        "ebay_fee": ebay_fee,
        "shipping": ESTIMATED_SHIPPING,
        "net_profit": net_profit,
        "roi_pct": roi_pct,
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _percentile(sorted_data: list[float], pct: int) -> float:
    """Return the pct-th percentile from a pre-sorted list."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (pct / 100)
    f = int(k)
    c = f + 1
    if c >= len(sorted_data):
        return sorted_data[-1]
    d = k - f
    return sorted_data[f] + d * (sorted_data[c] - sorted_data[f])

def _extract_prices(items: list[dict]) -> list[float]:
    """Pull numeric prices from item dicts."""
    prices = []
    for item in items:
        raw = item.get("price", 0)
        price = _to_float(raw)
        if price > 0:
            prices.append(price)
    return prices


def _to_float(raw) -> float:
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        cleaned = raw.replace("$", "").replace(",", "").replace(" ", "").strip()
        try:
            return float(cleaned)
        except ValueError:
            return 0.0
    return 0.0


def _remove_outliers(prices: list[float]) -> list[float]:
    """Remove values beyond 2 standard deviations from the mean."""
    if len(prices) < 5:
        return prices
    mean = statistics.mean(prices)
    sd = statistics.stdev(prices)
    if sd == 0:
        return prices
    return [p for p in prices if abs(p - mean) <= 2 * sd]


def _assess_confidence(sample_size: int, std_dev: float, mean: float) -> str:
    """Heuristic confidence rating based on data quality."""
    if sample_size >= 20 and (std_dev / mean if mean else 1) < 0.25:
        return "high"
    if sample_size >= 10:
        return "medium"
    return "low"
