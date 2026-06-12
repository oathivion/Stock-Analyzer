# AI Stock Research Assistant

A dependency-free stock research assistant prototype with a Node backend and a responsive browser UI.

## Run

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

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
- `POST /api/research`
- `POST /api/chat`
- `POST /api/refresh`

`/api/research` returns the generated brief plus calculation price, quote source, quote timestamp, source metadata, company context, provider warnings, and chart data.
`/api/lookup/:ticker` enriches an arbitrary U.S.-listed ticker and stores it in `data/lookups.json`. Lookup symbols are not added to the default watchlist or peer comparison.
`/api/live-prices` returns lightweight quote updates for real-time UI refreshes without regenerating a full research brief.
`/api/history/:ticker` returns real historical close prices for the selected research horizon.
`/api/compare` returns trusted cached fundamentals and lens-adjusted peer scores immediately; the live-price feed updates quote fields in the table.
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
