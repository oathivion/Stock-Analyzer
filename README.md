# AI Stock Research Assistant

A dependency-free stock research assistant prototype with a Node backend and a responsive browser UI.

The research view includes a transparent Purchase Fit Score combining the research score (45%), reported revenue growth (30%), selected risk match (15%), and investment-horizon fit (10%). The weighted score then applies a `1.3x` penalty to points below 100, making the result roughly 30% stricter. It is a research-fit indicator, not personalized financial advice.

Each result includes its weighted component contributions, the confidence penalty applied, methodology version, source links, and available source timestamps.

## Run

```powershell
npm start
```

Run the scoring regression suite with:

```powershell
npm test
```

Then open:

```text
http://localhost:3000
```

## Render Deployment

The included `render.yaml` deploys the full Node application as a Render web service.

1. Push the repository to GitHub.
2. In Render, create a new Blueprint and select this repository.
3. Allow the Blueprint to create the included PostgreSQL database.
4. Set `SEC_USER_AGENT` to a real app/contact string.
5. Optionally set `OPENAI_API_KEY` and `ALPHA_VANTAGE_API_KEY`.

Render supplies `PORT` automatically. The service health check is available at `/health`.

When `DATABASE_URL` is configured, trusted stock and lookup caches are stored in PostgreSQL. On the first connection, existing JSON cache records are migrated automatically. Without a database, the app keeps using `data/stocks.json` and `data/lookups.json`.

The Blueprint uses Render's Free Postgres plan for the demo. Render currently expires Free Postgres databases after 30 days, so upgrade the database before using this persistence layer for a lasting production environment.

The API also applies request-size limits, input validation, security headers, and per-client rate limits. Expensive POST endpoints allow 30 requests per minute; GET API endpoints allow 120.

Accounts use `scrypt` password hashing and server-side sessions. Signed-in users can keep a personal watchlist of up to 30 tickers. PostgreSQL stores accounts and sessions when available; local development uses the ignored `data/auth.json` fallback.

Signed-in users can also save up to 50 portfolio holdings with share counts and average cost. Portfolio analysis calculates current value, unrealized gain or loss, position allocation, sector allocation, concentration, and value-weighted risk.

Research briefs include expanded fundamentals derived from SEC company facts: free cash flow, FCF margin, net margin, return on assets/equity, debt, cash, net debt, debt-to-equity, capital spending, and annual diluted-share change. Alpha Vantage adds price-to-sales, EV/EBITDA, and quarterly earnings surprise when configured.

The stock screener searches the trusted local universe: the default watchlist plus previously enriched lookup symbols. It supports company search, sector, growth, P/E, market cap, risk, research score, Purchase Fit, and sorting filters.

The catalyst timeline combines expected earnings dates, SEC filing recency, dividend dates, sourced news, analyst-target monitoring, and thesis checkpoints. Expected earnings use Alpha Vantage's symbol-specific 12-month earnings calendar when configured.

Assistant answers are returned as source-linked claims. Citation IDs are validated against a server-built evidence catalog, client-submitted source URLs are ignored, and unsupported AI citations are discarded before rendering.

The validation lab separates a look-ahead-biased retrospective association study from genuine forward validation. Research runs save one standardized balanced/risk-3/12-month score snapshot per ticker per day; 3-, 6-, and 12-month outcomes are evaluated only after each window matures.

Signed-in users can create up to 30 persistent research alerts. Alerts monitor live price or Purchase Fit thresholds, retain the selected lens/risk/horizon for score rules, and record the first trigger time until the condition resets. They are evaluated in the app using current provider data; external email, SMS, and push delivery are not enabled.

## Optional API Keys

Create a `.env` file from `.env.example`, or set these variables before starting the server:

```powershell
$env:OPENAI_API_KEY="your_key"
$env:OPENAI_MODEL="gpt-4.1-mini"
$env:ALPHA_VANTAGE_API_KEY="your_key"
npm start
```

Without keys, the app still runs with built-in demo market data and local research generation. It will try Yahoo Finance quote data for the calculation price. With `ALPHA_VANTAGE_API_KEY`, research uses Alpha Vantage quotes, company overview, and news sentiment context when available.

SEC EDGAR company facts are used for reported fundamentals. Set `SEC_USER_AGENT` to a real app/contact string before refreshing data from SEC APIs.

## Endpoints

- `GET /api/quote/:ticker`
- `GET /api/lookup/:ticker`
- `GET /api/live-prices?tickers=NVDA,AAPL,MSFT`
- `GET /api/history/:ticker?horizon=12%20months`
- `GET /api/compare?tickers=NVDA,AAPL,MSFT&lens=balanced&risk=3`
- `GET /api/screener?sector=Technology&minGrowth=10&maxPe=40`
- `GET /api/catalysts/:ticker`
- `GET /api/validation?tickers=NVDA,AAPL,MSFT`
- `POST /api/research`
- `POST /api/chat`
- `POST /api/refresh`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/watchlist`
- `PUT /api/watchlist`
- `GET /api/portfolio`
- `PUT /api/portfolio`
- `GET /api/alerts`
- `POST /api/alerts`
- `DELETE /api/alerts/:id`

`/api/research` returns the generated brief plus calculation price, quote source, quote timestamp, source metadata, company context, provider warnings, and chart data.
`/api/lookup/:ticker` enriches an arbitrary U.S.-listed ticker and stores it in `data/lookups.json`. Lookup symbols are not added to the default watchlist or peer comparison.
`/api/live-prices` returns lightweight quote updates for real-time UI refreshes without regenerating a full research brief.
`/api/history/:ticker` returns real historical close prices for the selected research horizon.
`/api/compare` returns trusted cached fundamentals, research scores, and purchase-fit scores immediately; the live-price feed updates quote fields in the table.
`/api/refresh` updates the local trusted-source cache for the supported watchlist.

Example research body:

```json
{
  "ticker": "NVDA",
  "lens": "balanced",
  "horizon": "12 months",
  "risk": 3
}
```

Example refresh body:

```json
{
  "tickers": ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "JPM", "DIS"]
}
```

Example chat body:

```json
{
  "question": "What is the bear case?",
  "ticker": "NVDA",
  "brief": {
    "ticker": "NVDA",
    "name": "NVIDIA Corporation",
    "score": 82,
    "thesis": "Brief text from /api/research"
  }
}
```
