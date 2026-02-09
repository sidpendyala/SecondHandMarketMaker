# MarketMaker

**AI-powered deal finder for second-hand goods on eBay.** Find underpriced listings, estimate fair market value, and get sell-side pricing advice—with optional AI refinement and condition analysis.

**Live app:** [https://second-hand-market-maker.vercel.app](https://second-hand-market-maker.vercel.app)

**Privacy:** Tracking is opt-in. Normal search via `GET /api/market-maker?query=...` is stateless and does not write to the database. Searches are stored only when you explicitly create a tracked search with `POST /api/tracked-searches`. Stored queries are encrypted at rest; logs never contain plaintext search terms.

---

## What it does

### Buy side (The Scout + The Quant)
- **Search** eBay sold and active listings via [Real-Time eBay Data](https://rapidapi.com/mahmudulhasandev/api/real-time-ebay-data) (RapidAPI).
- **Fair market value** from recent sold/completed listings (median-based).
- **Deals** — active listings priced 20%+ below fair value.
- **Smart filtering** — drops obvious scams, accessories, and mismatched products (e.g. “keyboard only” when you searched for “MacBook”).
- **Condition** from listing data (and optional per-listing scrape for missing condition).
- **Query refinement** — for broad searches (e.g. “iPhone”, “MacBook Air”), AI suggests parameters (year, storage, model) so you can narrow the search.
- **Tracked searches (opt-in)** — create a saved search; the backend runs it on a schedule, stores new deals as alert events, and can retry with AI/heuristic query refinement when results are poor.

### Sell side (The Visionary + Sell Advisor)
- **Pricing tiers** — suggested list price, eBay fees, shipping, net payout.
- **Product-specific fields** — AI-generated form fields (year, storage, color, etc.) based on the product type.
- **Condition check** — optional image upload for condition hints (OpenAI/Gemini).
- **Sell Advisor** — fair value estimate and tiered pricing for your listing.

---

## Tech stack

| Layer    | Stack |
|----------|--------|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui, Lucide |
| Backend  | Python 3.10+, FastAPI, Uvicorn |
| Data     | [Real-Time eBay Data](https://rapidapi.com/mahmudulhasandev/api/real-time-ebay-data) (RapidAPI) |
| AI       | OpenAI (GPT-4o) and/or Google Gemini (fallback) for refinement, product fields, condition |

---

## Prerequisites

- **Node.js** 18+ (frontend)
- **Python** 3.10+ (backend)
- **RapidAPI key** for [Real-Time eBay Data](https://rapidapi.com/mahmudulhasandev/api/real-time-ebay-data) (required)
- **OpenAI** and/or **Gemini** API keys (optional; for AI refinement, product fields, image condition)

---

## Quick start

### 1. Clone and install

```bash
git clone <your-repo-url>
cd SecondHandMarketMaker
```

### 2. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

Copy env and add your keys:

```bash
cp .env.example .env
# Edit .env: RAPID_API_KEY (required); OPENAI_API_KEY, GEMINI_API_KEY (optional);
# for tracked searches: DATABASE_URL, JOB_SECRET, SEARCH_ENCRYPTION_KEY
```

If using tracked searches, run migrations (from `backend/`):

```bash
alembic upgrade head
```

Run the API:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

API: [http://localhost:8000](http://localhost:8000) · Docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 3. Frontend

```bash
cd frontend
npm install
```

Point the app at your backend:

```bash
# Create frontend/.env.local with:
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment variables

| Variable | Where | Required | Description |
|----------|--------|----------|-------------|
| `RAPID_API_KEY` | Backend | Yes | [Real-Time eBay Data](https://rapidapi.com/mahmudulhasandev/api/real-time-ebay-data) API key |
| `OPENAI_API_KEY` | Backend | No | OpenAI API key (refinement, product fields, condition) |
| `GEMINI_API_KEY` | Backend | No | Gemini API key (fallback for AI features) |
| `NEXT_PUBLIC_API_URL` | Frontend | Yes (for prod) | Backend URL (e.g. `http://localhost:8000` or your deployed API URL) |
| `DATABASE_URL` | Backend | Yes (for tracked searches) | PostgreSQL URL (e.g. from Railway); `postgres://` is auto-converted to `postgresql://` |
| `JOB_SECRET` | Backend | Yes (for cron jobs) | Secret for `POST /jobs/scan_all` and `POST /jobs/cleanup`; send as header `X-Job-Secret` |
| `SEARCH_ENCRYPTION_KEY` | Backend | Yes (for tracked searches) | Fernet key for encrypting stored queries; generate with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DATA_RETENTION_DAYS` | Backend | No | Delete old scan_runs and alert_events after this many days (default 30) |

See `backend/.env.example` for a full list.

---

## Project structure

```
SecondHandMarketMaker/
├── backend/                 # FastAPI app
│   ├── main.py              # Routes, CORS, request/response models
│   ├── requirements.txt
│   ├── Procfile             # For Render/Railway
│   ├── alembic/             # DB migrations (tracked_searches, scan_runs, seen_items, alert_events)
│   ├── db/                   # SQLAlchemy models and session
│   └── services/
│       ├── ebay_client.py   # RapidAPI eBay search + product scrape
│       ├── valuation_service.py  # Fair value, deals, filtering, flip profit, make_item_key
│       ├── ai_service.py    # OpenAI/Gemini: refinement, product fields, condition
│       ├── crypto_service.py # Encrypt/decrypt stored queries, query HMAC
│       ├── agentic_scan.py  # Pipeline + quality retries (AI/heuristic refinement)
│       └── tracked_scan_service.py  # Run scan, upsert seen_items, create alert_events
├── frontend/                # Next.js app
│   ├── src/
│   │   ├── app/             # App Router pages, layout, styles
│   │   ├── components/     # UI (SearchHeader, DealCard, SellAdvisorPanel, etc.)
│   │   └── lib/            # api.ts, types, utils
│   └── package.json
├── DEPLOY.md                # Deploy backend (Render/Railway) + frontend (Vercel)
└── README.md                # This file
```

---

## API overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root (service info) |
| GET | `/health` | Health check |
| GET | `/api/market-maker?query=...` | Sold + active data, fair value, deals (stateless, no DB) |
| POST | `/api/tracked-searches` | Create tracked search (query stored encrypted) |
| GET | `/api/tracked-searches` | List tracked searches (query_hash prefix only) |
| PATCH | `/api/tracked-searches/{id}` | Update enabled, min_discount, frequency_minutes |
| DELETE | `/api/tracked-searches/{id}` | Delete one tracked search |
| DELETE | `/api/tracked-searches` | Delete all tracked searches (privacy cleanup) |
| POST | `/api/sell-advisor` | Pricing tiers and fair value for selling |
| POST | `/api/refine-query` | AI query refinement (e.g. “iPhone” → year, storage) |
| POST | `/api/product-fields` | AI-generated product fields for sell form |
| POST | `/api/analyze-upload` | Condition analysis from uploaded image |
| POST | `/api/verify-condition` | Condition check from image URL |
| POST | `/jobs/scan_all` | Run due tracked scans (requires `X-Job-Secret` header) |
| POST | `/jobs/cleanup` | Delete old scan_runs and alert_events (requires `X-Job-Secret` header) |

Full interactive docs: **https://secondhandmarketmaker.onrender.com/docs**

### Railway Cron setup

To run tracked searches on a schedule (e.g. every 15 minutes):

1. In Railway, add a **Cron Job** (or use an external cron service that can send HTTP requests).
2. Set the schedule (e.g. `*/15 * * * *` for every 15 minutes).
3. Configure the job to send **POST** to your backend URL: `https://<your-backend>.railway.app/jobs/scan_all`
4. Add the header **`X-Job-Secret`** with the same value as your `JOB_SECRET` environment variable.

Example with `curl` (for testing or a script-based cron):

```bash
curl -X POST "https://YOUR_RAILWAY_URL/jobs/scan_all" -H "X-Job-Secret: YOUR_JOB_SECRET"
```

Optional: run retention cleanup (e.g. weekly) by calling **POST** `/jobs/cleanup` with the same `X-Job-Secret` header. This deletes `scan_runs` and `alert_events` older than `DATA_RETENTION_DAYS`.
