"""
AI Service - "The Visionary"
Uses OpenAI GPT-4o with Google Gemini fallback for image condition analysis
and smart product field generation. Includes a persistent JSON cache for
product fields so similar queries reuse previously generated fields.
"""

import json
import os
import re
import pathlib
import threading

from openai import OpenAI

# Lazy-load Gemini to avoid import errors if not installed
_gemini = None


def _get_gemini():
    global _gemini
    if _gemini is None:
        try:
            import google.generativeai as genai
            _gemini = genai
        except ImportError:
            _gemini = False  # Mark as unavailable
    return _gemini if _gemini else None


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

CONDITION_PROMPT = """You are an expert second-hand goods appraiser. Analyse the product image and provide:

1. **Overall Condition Rating**: X/10
2. **Visible Damage**: List any scratches, dents, discoloration, missing parts.
3. **Cosmetic Notes**: General wear level (Mint / Like New / Good / Fair / Poor).
4. **Purchase Recommendation**: Brief 1-sentence recommendation for a buyer.

Be concise but thorough. If the image is unclear, note that."""


STRUCTURED_CONDITION_PROMPT = """You are a STRICT and CRITICAL second-hand goods appraiser. Your job is to protect buyers from overpaying. Look carefully at the product image and rate its TRUE physical condition.

Return ONLY a JSON object (no markdown, no code fences) with these exact keys:

{
  "rating": <integer 1-10>,
  "label": "<one of: Mint, Like New, Good, Fair, Poor>",
  "notes": "<one concise sentence listing ALL visible defects>"
}

STRICT rating guide — when in doubt, round DOWN:
- 10: Factory sealed, brand new in packaging, never opened
- 9: Opened but pristine, zero wear, indistinguishable from new
- 7-8: Light cosmetic wear — tiny scuffs or light scratches only, fully functional
- 5-6: Obvious wear — visible scratches, scuffs, discoloration, dents, but still works
- 3-4: Damaged — cracked, broken parts, heavy scratches, peeling, missing pieces
- 1-2: For parts only — shattered screen, snapped headband, non-functional, major breaks

CRITICAL RULES:
- If you see ANY crack, break, or snapped component → rate 1-3
- If you see heavy scratches, deep scuffs, or peeling → rate 3-5
- If the item looks worn but intact → rate 5-7
- Only rate 8+ if the item looks nearly perfect
- NEVER rate a visibly damaged item above 5
- Describe the WORST defect you can see in the notes

Return ONLY valid JSON."""


PRODUCT_FIELDS_PROMPT = """You are a second-hand marketplace expert. Given a product name, return ONLY a JSON array (no markdown, no code fences) of 3-5 attributes that BUYERS commonly filter by when shopping for this item.

CRITICAL RULES:
1. DO NOT include attributes that are already obvious from the product name (e.g. don't list "Processor" for "MacBook Pro M2" — the M2 chip is already specified)
2. Focus on what DIFFERENTIATES listings and what buyers actually care about
3. This must work for ANY product category: electronics, clothing, furniture, sports, toys, vehicles, etc.
4. Keep options BROAD and commonly-used, not hyper-specific

Each element must have:
{
  "name": "<Human-readable label>",
  "key": "<snake_case key>",
  "type": "<select or boolean>",
  "options": ["option1", "option2", ...] // empty array for boolean
}

Category-specific guidance:
- Electronics: storage, color, connectivity (unlocked/carrier), accessories included
- Clothing/Shoes: size, color, material
- Furniture: color/finish, size/dimensions range, material
- Sports equipment: size, color, skill level
- Vehicles/parts: year range, mileage range, color
- General: color, size, completeness (has box/manual/accessories)

ALWAYS include:
- "Includes Original Box/Packaging" as a boolean (buyers care about this universally)

NEVER include:
- Brand (already in the product name)
- Model number (already in the product name)
- Processor/chip type if already specified
- Memory, RAM, Logic Board, Motherboard, or any internal/repair/parts attributes (buyers search for complete devices, not components)
- Overly technical specs that most buyers don't filter by

Return ONLY valid JSON. Product: """


QUERY_REFINEMENT_PROMPT = """You are a second-hand marketplace search expert. Given a product search query, determine whether it is too BROAD to return precise results, or already SPECIFIC enough.

A query is BROAD if it lacks key distinguishing attributes. Examples:
- "macbook air" -> BROAD (missing year, chip, storage)
- "macbook air m2 256gb 2023" -> SPECIFIC
- "iphone" -> BROAD (missing model number, storage)
- "iphone 15 pro 256gb" -> SPECIFIC
- "nike shoes" -> BROAD (missing model, size)
- "nike air max 90 size 10" -> SPECIFIC
- "sony headphones" -> BROAD (missing model)
- "sony wh-1000xm4" -> SPECIFIC
- "ps5" -> SPECIFIC (already a precise product)
- "playstation" -> BROAD (which model?)

If the query is BROAD, return 2-4 key parameters that would narrow it down. Each parameter should have 3-6 options.

Return ONLY a JSON object (no markdown, no code fences):
{
  "needs_refinement": true/false,
  "fields": [
    {
      "name": "<Human-readable label>",
      "key": "<snake_case>",
      "type": "select",
      "options": ["opt1", "opt2", ...]
    }
  ]
}

If needs_refinement is false, fields should be an empty array [].

RULES:
- Only flag as BROAD if adding parameters would genuinely help narrow eBay search results.
- Do NOT include brand (it's already in the query).
- Keep it practical: 2-4 fields max, 3-6 options each.
- For laptops (MacBook, etc.): suggest ONLY attributes buyers use when searching for a complete machine: Year (release year), Chip/Model (e.g. M1, M2, M3), Storage (e.g. 256GB, 512GB), Screen size (e.g. 13", 15") if relevant, Color. Do NOT suggest: Memory, RAM, Logic Board, Motherboard, or any internal/repair/parts terms. Buyers search for "MacBook Air M2 256GB 2022", not for RAM or logic board.
- For phones/tablets (iPhone, iPad, etc.): Year, Model (e.g. 15 Pro), Storage, Color. No internal components.
- For other electronics: prioritize model/generation, then storage/capacity, then year. No repair or parts terms.
- For clothing: prioritize size, color, style.
- For vehicles: prioritize year (recent first), mileage, trim.
- For YEAR: list the most RECENT years first (e.g. 2025, 2024, 2023, 2022). Do not suggest only old years unless the product has no newer models.
- Options must be what buyers actually type into search; prefer current and recent generations. Never suggest fields that describe parts, repairs, or internal components.

Query: """


BRAND_RETAIL_PRICE_PROMPT = """You are a product pricing expert. Given a product name or search query, return the current MANUFACTURER / BRAND retail price — i.e. what the brand itself sells the product for (MSRP or official list price from the manufacturer's website or official retailers), NOT third-party or marketplace prices.

Return ONLY a JSON object (no markdown, no code fences):
{
  "price_usd": <number or null>,
  "discontinued": <true if the brand has discontinued this product; false if still sold by the brand>,
  "note": "<optional one-line note, e.g. 'Sony US MSRP'>"
}

RULES:
- Match the EXACT product and generation the user asked for. NEVER return a newer generation's price for an older one (e.g. "AirPods Pro 2" must not get Pro 3's $249; "MacBook Pro M2" must not get M3/M4's price — set discontinued: true for superseded models).
- Use USD. If you only know another currency, convert to USD at current approximate rates.
- discontinued: true if the manufacturer/brand NO LONGER sells this exact product. Be STRICT. This includes: officially discontinued, end-of-life, or SUPERSEDED BY A NEWER MODEL OR CHIP. Examples that must be discontinued: "iPad Air 5th Gen", "AirPods Pro 2", "MacBook Pro M2", "MacBook Pro M1", "MacBook Air M1" (Apple now sells M3/M4; M1/M2 MacBooks are discontinued). When in doubt that the brand still sells this specific model/chip/generation, set discontinued to true.
- price_usd must be the MSRP for THIS exact model only when the brand still sells it; use null if discontinued or no reliable price. If discontinued is true, we ignore price_usd and do not show MSRP.
- Prefer the brand's own US MSRP or the price on the brand's official site. Do NOT use the cheapest eBay/Amazon listing.
- For products with multiple SKUs (e.g. different storage), use the most common or base model's price.

Product query: """


# ---------------------------------------------------------------------------
# Cache paths (used by refinement and product fields caches)
# ---------------------------------------------------------------------------

CACHE_DIR = pathlib.Path(__file__).parent.parent / "cache"


# ---------------------------------------------------------------------------
# Query refinement cache
# ---------------------------------------------------------------------------

REFINEMENT_CACHE_FILE = CACHE_DIR / "query_refinement_cache.json"
_refinement_cache_lock = threading.Lock()


def _load_refinement_cache() -> dict:
    try:
        if REFINEMENT_CACHE_FILE.exists():
            return json.loads(REFINEMENT_CACHE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[ai_service] Refinement cache read error: {exc}")
    return {}


def _save_refinement_cache(cache: dict):
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        REFINEMENT_CACHE_FILE.write_text(
            json.dumps(cache, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        print(f"[ai_service] Refinement cache write error: {exc}")


def _find_cached_refinement(query: str) -> dict | None:
    normalized = _normalize_query(query)
    with _refinement_cache_lock:
        cache = _load_refinement_cache()
    if normalized in cache:
        print(f"[ai_service] Refinement cache HIT: '{normalized}'")
        return cache[normalized]
    return None


def _cache_refinement(query: str, result: dict):
    normalized = _normalize_query(query)
    with _refinement_cache_lock:
        cache = _load_refinement_cache()
        cache[normalized] = result
        _save_refinement_cache(cache)
    print(f"[ai_service] Cached refinement for '{normalized}'")


# ---------------------------------------------------------------------------
# API key helpers
# ---------------------------------------------------------------------------

def _has_openai_key() -> bool:
    key = os.getenv("OPENAI_API_KEY", "")
    return bool(key) and key != "your_openai_api_key_here"


def _has_gemini_key() -> bool:
    key = os.getenv("GEMINI_API_KEY", "")
    return bool(key) and key != "your_gemini_api_key_here"


def _get_openai_client() -> OpenAI:
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


def _configure_gemini():
    genai = _get_gemini()
    if genai:
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    return genai


# ---------------------------------------------------------------------------
# JSON parsing helper
# ---------------------------------------------------------------------------

def _parse_json_response(raw: str):
    """Strip markdown fences and parse JSON."""
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    return json.loads(text)


# ---------------------------------------------------------------------------
# Product fields cache (dynamic programming)
# ---------------------------------------------------------------------------

CACHE_FILE = CACHE_DIR / "product_fields_cache.json"
_cache_lock = threading.Lock()


def _load_field_cache() -> dict:
    """Load the product fields cache from disk."""
    try:
        if CACHE_FILE.exists():
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except Exception as exc:
        print(f"[ai_service] Cache read error: {exc}")
    return {}


def _save_field_cache(cache: dict):
    """Save the product fields cache to disk."""
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(
            json.dumps(cache, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except Exception as exc:
        print(f"[ai_service] Cache write error: {exc}")


def _normalize_query(query: str) -> str:
    """Normalize a product query for cache lookup."""
    q = query.lower().strip()
    q = re.sub(r"[^a-z0-9\s]", "", q)
    q = re.sub(r"\s+", " ", q)
    return q


def _find_cached_fields(query: str) -> list[dict] | None:
    """
    Look up cached fields using fuzzy matching.
    Strategy: exact match first, then check if any cached key is a
    substring of the query or vice versa (handles "iPhone 15 Pro 128GB"
    matching cached "iPhone 15 Pro").
    """
    normalized = _normalize_query(query)
    with _cache_lock:
        cache = _load_field_cache()

    # Exact match
    if normalized in cache:
        print(f"[ai_service] Cache HIT (exact): '{normalized}'")
        return cache[normalized]

    # Substring match: cached key is contained in query
    best_match = None
    best_len = 0
    for key, fields in cache.items():
        if key in normalized and len(key) > best_len:
            best_match = fields
            best_len = len(key)
        elif normalized in key and len(normalized) > best_len:
            best_match = fields
            best_len = len(normalized)

    if best_match and best_len >= 6:  # Require at least 6 chars overlap
        print(f"[ai_service] Cache HIT (fuzzy, {best_len} chars): '{normalized}'")
        return best_match

    return None


def _cache_fields(query: str, fields: list[dict]):
    """Store generated fields in the cache."""
    normalized = _normalize_query(query)
    with _cache_lock:
        cache = _load_field_cache()
        cache[normalized] = fields
        _save_field_cache(cache)
    print(f"[ai_service] Cached fields for '{normalized}'")


# ---------------------------------------------------------------------------
# Original free-text condition analysis (kept for backward compat)
# ---------------------------------------------------------------------------

def analyze_condition(image_url: str) -> dict:
    """
    Analyse a product image for condition using AI vision.
    Returns: { "analysis": str, "source": "ai" | "gemini" | "mock" }
    """
    # Try OpenAI
    if _has_openai_key():
        try:
            client = _get_openai_client()
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": CONDITION_PROMPT},
                        {"type": "image_url", "image_url": {"url": image_url, "detail": "auto"}},
                    ],
                }],
                max_tokens=500,
            )
            return {"analysis": response.choices[0].message.content, "source": "ai"}
        except Exception as exc:
            print(f"[ai_service] OpenAI error: {exc}")

    return _mock_analysis(image_url)


# ---------------------------------------------------------------------------
# Structured condition analysis with fallback chain
# ---------------------------------------------------------------------------

def _openai_structured_condition(image_content: list) -> dict | None:
    """Try OpenAI GPT-4o for structured condition analysis."""
    if not _has_openai_key():
        return None
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": image_content}],
            max_tokens=300,
        )
        raw = response.choices[0].message.content
        print(f"[ai_service] OpenAI raw response: {raw}")
        data = _parse_json_response(raw)
        result = {
            "rating": int(data.get("rating", 5)),
            "label": str(data.get("label", "Good")),
            "notes": str(data.get("notes", "")),
            "source": "ai",
        }
        print(f"[ai_service] OpenAI condition result: {result}")
        return result
    except Exception as exc:
        print(f"[ai_service] OpenAI structured error: {exc}")
        return None


def _gemini_structured_condition_base64(base64_data: str) -> dict | None:
    """Try Google Gemini for structured condition analysis from base64 image."""
    if not _has_gemini_key():
        return None
    genai = _configure_gemini()
    if not genai:
        return None

    try:
        # Extract mime type and raw base64 from data URL
        # Format: "data:image/jpeg;base64,/9j/4AAQ..."
        if base64_data.startswith("data:"):
            header, b64_str = base64_data.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
        else:
            b64_str = base64_data
            mime_type = "image/jpeg"

        import base64
        image_bytes = base64.b64decode(b64_str)

        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            [
                STRUCTURED_CONDITION_PROMPT,
                {"mime_type": mime_type, "data": image_bytes},
            ],
            generation_config=genai.GenerationConfig(max_output_tokens=300),
        )

        raw = response.text
        print(f"[ai_service] Gemini base64 raw response: {raw}")
        data = _parse_json_response(raw)
        result = {
            "rating": int(data.get("rating", 5)),
            "label": str(data.get("label", "Good")),
            "notes": str(data.get("notes", "")),
            "source": "gemini",
        }
        print(f"[ai_service] Gemini base64 condition result: {result}")
        return result
    except Exception as exc:
        print(f"[ai_service] Gemini structured error: {exc}")
        return None


def _gemini_structured_condition_url(image_url: str) -> dict | None:
    """Try Google Gemini for structured condition analysis from URL."""
    if not _has_gemini_key():
        return None
    genai = _configure_gemini()
    if not genai:
        return None

    try:
        # Gemini can't directly access URLs, so download the image first
        import requests as _requests
        resp = _requests.get(image_url, timeout=10)
        resp.raise_for_status()
        image_bytes = resp.content
        content_type = resp.headers.get("Content-Type", "image/jpeg")

        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            [
                STRUCTURED_CONDITION_PROMPT,
                {"mime_type": content_type, "data": image_bytes},
            ],
            generation_config=genai.GenerationConfig(max_output_tokens=300),
        )

        raw = response.text
        print(f"[ai_service] Gemini URL raw response: {raw}")
        data = _parse_json_response(raw)
        result = {
            "rating": int(data.get("rating", 5)),
            "label": str(data.get("label", "Good")),
            "notes": str(data.get("notes", "")),
            "source": "gemini",
        }
        print(f"[ai_service] Gemini URL condition result: {result}")
        return result
    except Exception as exc:
        print(f"[ai_service] Gemini URL condition error: {exc}")
        return None


def analyze_condition_structured(image_url: str) -> dict:
    """
    Analyse a product image and return structured condition data.
    Fallback chain: OpenAI -> Gemini -> Mock
    """
    print(f"[ai_service] Analyzing URL image for condition: {image_url[:80]}...")
    # Try OpenAI — use detail: "auto" for URL images
    content = [
        {"type": "text", "text": STRUCTURED_CONDITION_PROMPT},
        {"type": "image_url", "image_url": {"url": image_url, "detail": "auto"}},
    ]
    result = _openai_structured_condition(content)
    if result:
        return result

    # Try Gemini
    result = _gemini_structured_condition_url(image_url)
    if result:
        return result

    return _mock_structured()


def analyze_condition_from_base64(base64_data: str) -> dict:
    """
    Analyse a product image from base64 data.
    Fallback chain: OpenAI -> Gemini -> Mock
    """
    print("[ai_service] Analyzing uploaded image for condition...")
    # Try OpenAI — use detail: "high" so damage is visible
    content = [
        {"type": "text", "text": STRUCTURED_CONDITION_PROMPT},
        {"type": "image_url", "image_url": {"url": base64_data, "detail": "high"}},
    ]
    result = _openai_structured_condition(content)
    if result:
        return result

    # Try Gemini
    result = _gemini_structured_condition_base64(base64_data)
    if result:
        return result

    return _mock_structured()


# ---------------------------------------------------------------------------
# Combined: product detection + condition from uploaded image
# ---------------------------------------------------------------------------

DETECT_AND_ANALYZE_PROMPT = """You are an expert product appraiser. Look at this product image and return ONLY a JSON object (no markdown, no code fences) with these exact keys:

{
  "condition": {
    "rating": <integer 1-10>,
    "label": "<Mint | Like New | Good | Fair | Poor>",
    "notes": "<one sentence listing ALL visible defects>"
  },
  "detected_product": "<what this product is, e.g. 'Sony WH-1000XM4 Wireless Headphones'>",
  "detected_attributes": {
    "<attribute_key>": "<detected_value>"
  }
}

For condition, be STRICT — round DOWN when in doubt:
- 10: Factory sealed, brand new in packaging
- 9: Opened but pristine, zero wear
- 7-8: Light cosmetic wear, fully functional
- 5-6: Obvious scratches, scuffs, dents, but works
- 3-4: Cracked, broken parts, heavy damage
- 1-2: For parts only, major breaks, non-functional
- NEVER rate a visibly damaged item above 5

For detected_attributes, identify ONLY what you can visually confirm:
- "color": the color you see
- "storage" / "size": if visible on the device or label
- "has_box": "Yes" if original packaging is visible, "No" otherwise
- "has_accessories": "Yes" if cables/chargers/extras are visible
- Any other clearly visible attributes (screen size text, model markings, etc.)

Only include attributes you can ACTUALLY SEE. Do not guess.

Return ONLY valid JSON."""


def _gemini_detect_and_analyze(base64_data: str) -> dict | None:
    """Use Gemini to detect product + analyze condition from base64 image."""
    if not _has_gemini_key():
        return None
    genai = _configure_gemini()
    if not genai:
        return None

    try:
        if base64_data.startswith("data:"):
            header, b64_str = base64_data.split(",", 1)
            mime_type = header.split(":")[1].split(";")[0]
        else:
            b64_str = base64_data
            mime_type = "image/jpeg"

        import base64
        image_bytes = base64.b64decode(b64_str)

        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            [
                DETECT_AND_ANALYZE_PROMPT,
                {"mime_type": mime_type, "data": image_bytes},
            ],
            generation_config=genai.GenerationConfig(max_output_tokens=500),
        )

        raw = response.text
        print(f"[ai_service] Gemini detect+analyze raw: {raw}")
        data = _parse_json_response(raw)

        cond = data.get("condition", {})
        result = {
            "rating": int(cond.get("rating", 5)),
            "label": str(cond.get("label", "Good")),
            "notes": str(cond.get("notes", "")),
            "source": "gemini",
            "detected_product": str(data.get("detected_product", "")),
            "detected_attributes": data.get("detected_attributes", {}),
        }
        print(f"[ai_service] Gemini detect+analyze result: {result}")
        return result
    except Exception as exc:
        print(f"[ai_service] Gemini detect+analyze error: {exc}")
        return None


def _openai_detect_and_analyze(base64_data: str) -> dict | None:
    """Use OpenAI to detect product + analyze condition from base64 image."""
    if not _has_openai_key():
        return None
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": DETECT_AND_ANALYZE_PROMPT},
                    {"type": "image_url", "image_url": {"url": base64_data, "detail": "high"}},
                ],
            }],
            max_tokens=500,
        )
        raw = response.choices[0].message.content
        print(f"[ai_service] OpenAI detect+analyze raw: {raw}")
        data = _parse_json_response(raw)

        cond = data.get("condition", {})
        result = {
            "rating": int(cond.get("rating", 5)),
            "label": str(cond.get("label", "Good")),
            "notes": str(cond.get("notes", "")),
            "source": "ai",
            "detected_product": str(data.get("detected_product", "")),
            "detected_attributes": data.get("detected_attributes", {}),
        }
        print(f"[ai_service] OpenAI detect+analyze result: {result}")
        return result
    except Exception as exc:
        print(f"[ai_service] OpenAI detect+analyze error: {exc}")
        return None


def detect_and_analyze_image(base64_data: str) -> dict:
    """
    Combined: detect product identity + analyze condition from uploaded image.
    Fallback chain: OpenAI -> Gemini -> Mock
    Returns { rating, label, notes, source, detected_product, detected_attributes }
    """
    print("[ai_service] Running combined detect + analyze...")

    # Try OpenAI
    result = _openai_detect_and_analyze(base64_data)
    if result:
        return result

    # Try Gemini
    result = _gemini_detect_and_analyze(base64_data)
    if result:
        return result

    # Mock fallback
    mock = _mock_structured()
    mock["detected_product"] = ""
    mock["detected_attributes"] = {}
    return mock


# ---------------------------------------------------------------------------
# Smart product fields generation with caching
# ---------------------------------------------------------------------------

def _openai_generate_fields(product_name: str) -> list[dict] | None:
    """Try OpenAI to generate product fields."""
    if not _has_openai_key():
        return None
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": PRODUCT_FIELDS_PROMPT + product_name}],
            max_tokens=500,
        )
        fields = _parse_json_response(response.choices[0].message.content)
        if not isinstance(fields, list):
            return None
        validated = []
        for f in fields[:6]:
            validated.append({
                "name": str(f.get("name", "")),
                "key": str(f.get("key", "")),
                "type": str(f.get("type", "select")),
                "options": list(f.get("options", [])),
            })
        return validated
    except Exception as exc:
        print(f"[ai_service] OpenAI fields error: {exc}")
        return None


def _gemini_generate_fields(product_name: str) -> list[dict] | None:
    """Try Google Gemini to generate product fields."""
    if not _has_gemini_key():
        return None
    genai = _configure_gemini()
    if not genai:
        return None

    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            PRODUCT_FIELDS_PROMPT + product_name,
            generation_config=genai.GenerationConfig(max_output_tokens=500),
        )
        fields = _parse_json_response(response.text)
        if not isinstance(fields, list):
            return None
        validated = []
        for f in fields[:6]:
            validated.append({
                "name": str(f.get("name", "")),
                "key": str(f.get("key", "")),
                "type": str(f.get("type", "select")),
                "options": list(f.get("options", [])),
            })
        return validated
    except Exception as exc:
        print(f"[ai_service] Gemini fields error: {exc}")
        return None


def generate_product_fields(product_name: str) -> list[dict]:
    """
    Generate product attribute fields.
    Strategy: Cache -> OpenAI -> Gemini -> Mock
    Results are cached so similar future queries return instantly.
    """
    # 1. Check cache first (dynamic programming)
    cached = _find_cached_fields(product_name)
    if cached:
        return cached

    # 2. Try OpenAI
    fields = _openai_generate_fields(product_name)
    if fields:
        _cache_fields(product_name, fields)
        return fields

    # 3. Try Gemini
    fields = _gemini_generate_fields(product_name)
    if fields:
        _cache_fields(product_name, fields)
        return fields

    # 4. Fall back to mock (also cache it so we don't retry)
    mock = _mock_product_fields(product_name)
    _cache_fields(product_name, mock)
    return mock


# ---------------------------------------------------------------------------
# Query refinement (broad query detection)
# ---------------------------------------------------------------------------

def _validate_refinement(data: dict) -> dict:
    """Validate and normalize an AI refinement response."""
    needs = bool(data.get("needs_refinement", False))
    fields = []
    if needs:
        for f in data.get("fields", [])[:4]:
            fields.append({
                "name": str(f.get("name", "")),
                "key": str(f.get("key", "")),
                "type": "select",
                "options": [str(o) for o in f.get("options", [])][:6],
            })
    return {"needs_refinement": needs and len(fields) > 0, "fields": fields}


def _openai_refinement(query: str) -> dict | None:
    if not _has_openai_key():
        return None
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": QUERY_REFINEMENT_PROMPT + query}],
            max_tokens=500,
        )
        raw = response.choices[0].message.content
        print(f"[ai_service] OpenAI refinement raw: {raw}")
        data = _parse_json_response(raw)
        return _validate_refinement(data)
    except Exception as exc:
        print(f"[ai_service] OpenAI refinement error: {exc}")
        return None


def _gemini_refinement(query: str) -> dict | None:
    if not _has_gemini_key():
        return None
    genai = _configure_gemini()
    if not genai:
        return None
    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            QUERY_REFINEMENT_PROMPT + query,
            generation_config=genai.GenerationConfig(max_output_tokens=500),
        )
        raw = response.text
        print(f"[ai_service] Gemini refinement raw: {raw}")
        data = _parse_json_response(raw)
        return _validate_refinement(data)
    except Exception as exc:
        print(f"[ai_service] Gemini refinement error: {exc}")
        return None


def check_query_refinement(query: str) -> dict:
    """
    Check if a query is too broad and needs refinement.
    Strategy: Cache -> OpenAI -> Gemini -> default (no refinement)
    Returns: { needs_refinement: bool, fields: [...] }
    """
    # 1. Cache
    cached = _find_cached_refinement(query)
    if cached is not None:
        return cached

    # 2. OpenAI
    result = _openai_refinement(query)
    if result:
        _cache_refinement(query, result)
        return result

    # 3. Gemini
    result = _gemini_refinement(query)
    if result:
        _cache_refinement(query, result)
        return result

    # 4. Default: no refinement
    fallback = {"needs_refinement": False, "fields": []}
    _cache_refinement(query, fallback)
    return fallback


# ---------------------------------------------------------------------------
# Brand / manufacturer retail price (OpenAI or Gemini)
# ---------------------------------------------------------------------------

def _parse_brand_price_response(raw: str) -> tuple[float | None, bool]:
    """
    Parse price_usd and discontinued from AI response.
    Returns (price_usd or None, discontinued). If JSON fails, (fallback_price, False).
    """
    if not raw or not raw.strip():
        return (None, False)
    text = raw.strip()
    # Try JSON first
    try:
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
        data = json.loads(text)
        discontinued = bool(data.get("discontinued", False))
        val = data.get("price_usd")
        if val is None:
            return (None, discontinued)
        p = float(val)
        price = round(p, 2) if p > 0 else None
        return (price, discontinued)
    except (json.JSONDecodeError, TypeError, ValueError):
        pass
    # Fallback: find $XX.XX or XX.XX in text (no discontinued info, assume not discontinued)
    match = re.search(r"\$?\s*(\d{1,6}(?:\.\d{2})?)", text)
    if match:
        p = float(match.group(1))
        return (round(p, 2) if p > 0 else None, False)
    return (None, False)


def _openai_brand_retail_price(query: str) -> float | None:
    """Use OpenAI to get manufacturer/brand retail price for the product. Returns None if discontinued or no price."""
    if not _has_openai_key():
        return None
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": BRAND_RETAIL_PRICE_PROMPT + query}],
            max_tokens=150,
        )
        raw = response.choices[0].message.content or ""
        price, discontinued = _parse_brand_price_response(raw)
        if discontinued or price is None:
            return None
        return price
    except Exception as exc:
        print(f"[ai_service] OpenAI brand price error: {exc}")
        return None


def _gemini_brand_retail_price(query: str) -> float | None:
    """Use Gemini to get manufacturer/brand retail price for the product. Returns None if discontinued or no price."""
    if not _has_gemini_key():
        return None
    genai = _configure_gemini()
    if not genai:
        return None
    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        response = model.generate_content(
            BRAND_RETAIL_PRICE_PROMPT + query,
            generation_config=genai.GenerationConfig(max_output_tokens=150),
        )
        raw = response.text if response else ""
        price, discontinued = _parse_brand_price_response(raw)
        if discontinued or price is None:
            return None
        return price
    except Exception as exc:
        print(f"[ai_service] Gemini brand price error: {exc}")
        return None


def get_brand_retail_price(query: str) -> float | None:
    """
    Get the manufacturer/brand retail price (what the brand sells for) using AI.
    Tries OpenAI first, then Gemini. Returns None if unavailable, no price, or product is discontinued by the brand.
    """
    result = _openai_brand_retail_price(query)
    if result is not None:
        return result
    return _gemini_brand_retail_price(query)


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

def _mock_analysis(image_url: str) -> dict:
    """Return a realistic mock condition analysis."""
    return {
        "analysis": (
            "**Overall Condition Rating**: 7/10\n\n"
            "**Visible Damage**: Minor scuffing on the headband. "
            "Small scratch near the left hinge. Ear cushions show light wear.\n\n"
            "**Cosmetic Notes**: Good condition overall. Signs of regular use "
            "but no structural damage. All buttons and ports appear functional.\n\n"
            "**Purchase Recommendation**: A solid buy if priced 20%+ below retail. "
            "The cosmetic wear is typical and does not affect functionality."
        ),
        "source": "mock",
    }


def _mock_structured() -> dict:
    """Return a mock structured condition result."""
    return {
        "rating": 7,
        "label": "Good",
        "notes": "Mock analysis – add a GEMINI_API_KEY (free) or OpenAI credits for real AI condition checks.",
        "source": "mock",
    }


def _mock_product_fields(product_name: str) -> list[dict]:
    """Return generic mock product fields."""
    return [
        {"name": "Color", "key": "color", "type": "select",
         "options": ["Black", "White", "Silver", "Blue", "Red", "Other"]},
        {"name": "Includes Original Packaging", "key": "has_box", "type": "boolean", "options": []},
        {"name": "All Accessories Included", "key": "has_accessories", "type": "boolean", "options": []},
    ]
