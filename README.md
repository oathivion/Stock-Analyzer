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

Without keys, the app still runs with built-in demo market data and local research generation.

## Endpoints

- `GET /api/quote/:ticker`
- `POST /api/research`
- `POST /api/chat`

Example research body:

```json
{
  "ticker": "NVDA",
  "lens": "balanced",
  "horizon": "12 months",
  "risk": 3
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
