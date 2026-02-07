# MarketMaker

**AI-powered deal finder for second-hand goods on eBay.** Find underpriced listings, estimate fair market value, and get sell-side pricing advice—with optional AI refinement and condition analysis.

**Live app:** [https://second-hand-market-maker.vercel.app](https://second-hand-market-maker.vercel.app)

---

## What it does

### Buy side (The Scout + The Quant)
- **Search** eBay sold and active listings via [Real-Time eBay Data](https://rapidapi.com/mahmudulhasandev/api/real-time-ebay-data) (RapidAPI).
- **Fair market value** from recent sold/completed listings (median-based).
- **Deals** — active listings priced 20%+ below fair value.
- **Smart filtering** — drops obvious scams, accessories, and mismatched products (e.g. “keyboard only” when you searched for “MacBook”).
- **Condition** from listing data (and optional per-listing scrape for missing condition).
- **Query refinement** — for broad searches (e.g. “iPhone”, “MacBook Air”), AI suggests parameters (year, storage, model) so you can narrow the search.

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
# Edit .env: set RAPID_API_KEY (required); OPENAI_API_KEY, GEMINI_API_KEY (optional)
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

See `backend/.env.example` for a full list.

---

## Project structure

```
SecondHandMarketMaker/
├── backend/                 # FastAPI app
│   ├── main.py              # Routes, CORS, request/response models
│   ├── requirements.txt
│   ├── Procfile             # For Render/Railway
│   └── services/
│       ├── ebay_client.py   # RapidAPI eBay search + product scrape
│       ├── valuation_service.py  # Fair value, deals, filtering, flip profit
│       └── ai_service.py   # OpenAI/Gemini: refinement, product fields, condition
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
| GET | `/api/market-maker?query=...` | Sold + active data, fair value, deals |
| POST | `/api/sell-advisor` | Pricing tiers and fair value for selling |
| POST | `/api/refine-query` | AI query refinement (e.g. “iPhone” → year, storage) |
| POST | `/api/product-fields` | AI-generated product fields for sell form |
| POST | `/api/analyze-upload` | Condition analysis from uploaded image |
| POST | `/api/verify-condition` | Condition check from image URL |

Full interactive docs: **http://localhost:8000/docs** (when the backend is running).

---

## Deployment

Backend (Render or Railway) + frontend (Vercel), env vars, and CORS are covered in **[DEPLOY.md](./DEPLOY.md)**.

---