import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { calculatePurchaseFit } from "./scoring.js";
import { createCacheStorage } from "./storage.js";
import { clearSessionCookie, createSession, hashPassword, hashSessionToken, newUser, parseCookies, sessionCookie, validateCredentials, verifyPassword } from "./auth.js";
import { analyzePortfolio } from "./portfolio.js";
import { calculateFinancialMetrics } from "./financial-metrics.js";
import { parseMarketCap, screenStocks } from "./screener.js";
import { buildCatalysts, parseCsv } from "./catalysts.js";
import { buildEvidenceCatalog, citedText, relevantEvidenceIds, validateGroundedAnswer } from "./grounding.js";
import { createScoreSnapshot, evaluateSnapshots, summarizeForwardValidation, summarizeRetrospective, trailingReturns } from "./validation.js";
import { alertLabel, createAlertRule, evaluateAlert } from "./alerts.js";

const root = fileURLToPath(new URL(".", import.meta.url));
loadEnv();
const port = Number(process.env.PORT || 3000);
const cachePath = join(root, "data", "stocks.json");
const lookupCachePath = join(root, "data", "lookups.json");
const snapshotPath = join(root, "data", "score-snapshots.json");
const authPath = process.env.AUTH_PATH || join(root, "data", "auth.json");
const storage = createCacheStorage({
  stockPath: cachePath,
  lookupPath: lookupCachePath,
  snapshotPath,
  authPath,
  databaseUrl: process.env.DATABASE_URL
});
const storageStartup = await storage.initialize();
const supportedTickers = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "JPM", "DIS"];
const defaultCikByTicker = {
  AAPL: "0000320193",
  MSFT: "0000789019",
  NVDA: "0001045810",
  TSLA: "0001318605",
  AMZN: "0001018724",
  META: "0001326801",
  JPM: "0000019617",
  DIS: "0001744489"
};
let secTickerMap = { ...defaultCikByTicker };
let secTickerMapUpdatedAt = 0;
const rateLimitBuckets = new Map();
const validLenses = new Set(["balanced", "growth", "value"]);
const validHorizons = new Set(["3 months", "12 months", "3 years"]);

const demoStocks = {
  NVDA: {
    name: "NVIDIA Corporation",
    price: 126.8,
    change: 2.4,
    marketCap: "$3.1T",
    pe: "38.7",
    revenue: "+78%",
    margin: "74%",
    score: 82,
    verdict: "Constructive, but valuation-sensitive",
    thesis:
      "NVIDIA keeps a durable lead in accelerated computing, with data center demand still doing the heavy lifting. The setup is attractive when earnings growth outruns multiple compression, but the stock needs clean execution and visible AI infrastructure spending to defend its premium.",
    drivers: [
      "Data center GPUs and networking remain the primary growth engine.",
      "CUDA ecosystem depth makes customer switching slower and more expensive.",
      "Sovereign AI and enterprise inference could widen demand beyond hyperscalers."
    ],
    risks: [
      "Customer concentration leaves results exposed to hyperscaler capex cycles.",
      "Export controls and supply constraints can interrupt shipment timing.",
      "A rich valuation leaves little room for slower earnings revisions."
    ],
    checks: [
      "Track data center sequential growth and backlog commentary.",
      "Compare gross margin durability against competitive accelerator launches.",
      "Watch free cash flow conversion after inventory and supply commitments."
    ]
  },
  AAPL: {
    name: "Apple Inc.",
    price: 203.5,
    change: -0.7,
    marketCap: "$3.0T",
    pe: "29.4",
    revenue: "+3%",
    margin: "46%",
    score: 71,
    verdict: "Stable compounder with slower growth",
    thesis:
      "Apple remains an exceptional cash generator with sticky hardware, services, and a powerful buyback. The research question is whether AI-enabled devices and services can reaccelerate revenue enough to justify a premium multiple.",
    drivers: [
      "Services revenue improves mix and recurring cash flow.",
      "Large installed base supports upgrade cycles and pricing power.",
      "Capital returns provide downside support during slower product cycles."
    ],
    risks: [
      "iPhone growth can stay muted without a stronger replacement cycle.",
      "Regulatory pressure may weigh on App Store economics.",
      "Premium valuation is sensitive to flat revenue expectations."
    ],
    checks: [
      "Follow iPhone unit demand by region, especially China.",
      "Monitor services gross margin and regulatory disclosures.",
      "Compare buyback pace against free cash flow generation."
    ]
  },
  MSFT: {
    name: "Microsoft Corporation",
    price: 438.2,
    change: 1.1,
    marketCap: "$3.3T",
    pe: "34.2",
    revenue: "+16%",
    margin: "45%",
    score: 84,
    verdict: "High-quality AI platform exposure",
    thesis:
      "Microsoft offers one of the cleaner enterprise AI stories through Azure, Copilot, and the broader productivity suite. The business has multiple monetization paths, though investors should keep checking whether AI capex produces enough revenue leverage.",
    drivers: [
      "Azure AI services can lift cloud share and average contract value.",
      "Copilot creates an upsell motion across Office and developer tools.",
      "Enterprise relationships reduce adoption friction for new AI products."
    ],
    risks: [
      "Heavy capex can pressure free cash flow if utilization lags.",
      "Cloud competition may limit pricing power.",
      "Security or reliability issues could slow enterprise adoption."
    ],
    checks: [
      "Separate Azure growth from reported cloud growth.",
      "Watch AI-related capex intensity and depreciation guidance.",
      "Track Copilot seat adoption and renewal commentary."
    ]
  },
  TSLA: {
    name: "Tesla, Inc.",
    price: 177.4,
    change: -1.9,
    marketCap: "$566B",
    pe: "58.1",
    revenue: "-4%",
    margin: "18%",
    score: 55,
    verdict: "Optionality-rich, execution-heavy",
    thesis:
      "Tesla trades less like a traditional automaker and more like a bundle of autonomy, robotics, energy, and brand optionality. That upside is meaningful, but the current case needs margin stabilization and visible progress in autonomy monetization.",
    drivers: [
      "Energy storage growth diversifies revenue away from vehicles.",
      "Autonomy milestones can shift the valuation framework.",
      "Manufacturing scale remains a long-term cost advantage."
    ],
    risks: [
      "Vehicle price cuts can keep pressuring automotive gross margin.",
      "Autonomy timelines remain difficult to underwrite.",
      "Competition is rising in China and lower-priced EV segments."
    ],
    checks: [
      "Track automotive gross margin excluding credits.",
      "Watch delivery growth by model and region.",
      "Review concrete autonomy revenue disclosures."
    ]
  },
  AMZN: {
    name: "Amazon.com, Inc.",
    price: 185.7,
    change: 0.8,
    marketCap: "$1.9T",
    pe: "41.5",
    revenue: "+12%",
    margin: "10%",
    score: 79,
    verdict: "Margin expansion story still working",
    thesis:
      "Amazon's appeal rests on improving retail efficiency, AWS recovery, and advertising growth. The stock can keep working if operating leverage continues while AI investment supports cloud demand instead of only adding cost.",
    drivers: [
      "Advertising growth carries attractive incremental margins.",
      "Regional fulfillment improvements support retail profitability.",
      "AWS AI demand can improve growth after optimization headwinds."
    ],
    risks: [
      "Cloud growth can disappoint if enterprise optimization persists.",
      "Logistics and content spending may absorb margin gains.",
      "Regulatory scrutiny can pressure marketplace practices."
    ],
    checks: [
      "Compare AWS growth to peers each quarter.",
      "Watch North America operating margin progression.",
      "Track advertising growth and third-party seller trends."
    ]
  },
  META: {
    name: "Meta Platforms, Inc.",
    price: 491.6,
    change: 1.7,
    marketCap: "$1.25T",
    pe: "25.8",
    revenue: "+21%",
    margin: "39%",
    score: 81,
    verdict: "Efficient core business funding AI",
    thesis:
      "Meta combines a highly profitable advertising engine with aggressive AI investment. The case works when AI improves ad targeting, engagement, and business messaging while management keeps spending discipline visible.",
    drivers: [
      "AI ranking and ad tools can improve monetization.",
      "Reels and messaging provide engagement and commerce optionality.",
      "Buybacks amplify earnings growth when cash flow remains strong."
    ],
    risks: [
      "AI and Reality Labs spending can expand faster than revenue.",
      "Ad cycles remain tied to macro and small business demand.",
      "Regulatory and privacy changes may limit targeting efficiency."
    ],
    checks: [
      "Track capex guidance and operating expense discipline.",
      "Watch ad impression growth versus price growth.",
      "Monitor Reality Labs losses against core cash generation."
    ]
  },
  JPM: {
    name: "JPMorgan Chase & Co.",
    price: 214.1,
    change: 0.3,
    marketCap: "$610B",
    pe: "12.1",
    revenue: "+8%",
    margin: "32%",
    score: 74,
    verdict: "Best-in-class bank with cycle risk",
    thesis:
      "JPMorgan offers scale, diversification, and strong management quality. The opportunity is steadier than high-growth tech, with upside tied to credit resilience, deposit cost control, and capital returns.",
    drivers: [
      "Scale supports expense efficiency and broad client reach.",
      "Investment banking recovery can add fee income upside.",
      "Strong capital position supports dividends and repurchases."
    ],
    risks: [
      "Credit normalization can raise provisions.",
      "Deposit beta may pressure net interest income.",
      "Regulatory capital rules can constrain buybacks."
    ],
    checks: [
      "Watch net interest income guidance and deposit trends.",
      "Track charge-offs across cards and commercial loans.",
      "Review CET1 capital and buyback authorization updates."
    ]
  },
  DIS: {
    name: "The Walt Disney Company",
    price: 101.2,
    change: -0.4,
    marketCap: "$184B",
    pe: "20.3",
    revenue: "+5%",
    margin: "14%",
    score: 63,
    verdict: "Turnaround needs proof",
    thesis:
      "Disney has valuable brands and parks economics, but streaming profitability and linear TV decline still shape the debate. The stock needs consistent execution before the multiple can fully recover.",
    drivers: [
      "Parks demand and pricing remain powerful cash flow contributors.",
      "Streaming losses have room to improve with pricing and bundling.",
      "Franchise content can support licensing, experiences, and merchandise."
    ],
    risks: [
      "Linear network decline can offset direct-to-consumer gains.",
      "Content misses pressure both streaming engagement and brand momentum.",
      "Consumer weakness can affect parks attendance and spending."
    ],
    checks: [
      "Track streaming operating income and subscriber quality.",
      "Watch parks margins and attendance commentary.",
      "Review film slate performance and franchise pipeline."
    ]
  }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};
const publicAssets = new Set(["/index.html", "/styles.css", "/app.js", "/scoring.js"]);

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function sendError(res, error) {
  json(res, error.status || 500, { error: error.message || "Unexpected server error." });
}

function applySecurityHeaders(res) {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("content-security-policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
}

function isRateLimited(req, url) {
  if (!url.pathname.startsWith("/api/")) return false;
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const client = forwarded || req.socket.remoteAddress || "unknown";
  const windowMs = 60_000;
  const limit = req.method === "POST" ? 30 : 120;
  const key = `${client}:${req.method}`;
  const now = Date.now();
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new HttpError(413, "Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new HttpError(400, "Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function normalizeTicker(value) {
  return String(value || "NVDA")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z.]/g, "")
    .slice(0, 8) || "NVDA";
}

function requireTicker(value) {
  const ticker = String(value || "").trim().toUpperCase();
  if (!/^[A-Z][A-Z.]{0,7}$/.test(ticker)) throw new HttpError(400, "Ticker must contain 1-8 letters or periods.");
  return ticker;
}

function routeTicker(res, value) {
  try {
    return requireTicker(value);
  } catch (error) {
    sendError(res, error);
    return null;
  }
}

function researchControls(body = {}) {
  const ticker = requireTicker(body.ticker);
  const lens = body.lens || "balanced";
  const horizon = body.horizon || "12 months";
  const risk = Number(body.risk ?? 3);

  if (!validLenses.has(lens)) throw new HttpError(400, "Lens must be balanced, growth, or value.");
  if (!validHorizons.has(horizon)) throw new HttpError(400, "Horizon must be 3 months, 12 months, or 3 years.");
  if (!Number.isInteger(risk) || risk < 1 || risk > 5) throw new HttpError(400, "Risk must be an integer from 1 to 5.");
  return { ticker, lens, horizon, risk };
}

function publicUser(user) {
  return { id: user.id, email: user.email, watchlist: user.watchlist || [], portfolio: user.portfolio || [], alertCount: user.alerts?.length || 0, createdAt: user.createdAt };
}

function secureRequest(req) {
  return String(req.headers["x-forwarded-proto"] || "").split(",")[0] === "https";
}

async function authenticatedUser(req) {
  const token = parseCookies(req.headers.cookie).stock_session;
  if (!token) return null;
  const session = await storage.findSession(hashSessionToken(token));
  return session ? storage.findUserById(session.userId) : null;
}

async function requireUser(req) {
  const user = await authenticatedUser(req);
  if (!user) throw new HttpError(401, "Sign in to manage saved account data.");
  return user;
}

async function startUserSession(req, res, user) {
  const session = createSession(user.id);
  await storage.saveSession(session.record);
  res.setHeader("set-cookie", sessionCookie(session.token, secureRequest(req)));
}

function queryControls(url) {
  const lens = url.searchParams.get("lens") || "balanced";
  const horizon = url.searchParams.get("horizon") || "12 months";
  const risk = Number(url.searchParams.get("risk") || 3);
  if (!validLenses.has(lens)) throw new HttpError(400, "Lens must be balanced, growth, or value.");
  if (!validHorizons.has(horizon)) throw new HttpError(400, "Horizon must be 3 months, 12 months, or 3 years.");
  if (!Number.isInteger(risk) || risk < 1 || risk > 5) throw new HttpError(400, "Risk must be an integer from 1 to 5.");
  return { lens, horizon, risk };
}

function loadStockCache() {
  return storage.get("stocks");
}

function loadLookupCache() {
  return storage.get("lookups");
}

function loadScoreSnapshots() {
  return storage.get("snapshots");
}

async function saveStockCache(cache) {
  await storage.replaceNamespace("stocks", cache);
}

async function saveLookupCache(cache) {
  await storage.replaceNamespace("lookups", cache);
}

async function saveScoreSnapshots(cache) {
  await storage.replaceNamespace("snapshots", cache);
}

function fallbackStock(ticker) {
  const cached = loadStockCache()[ticker] || loadLookupCache()[ticker];
  if (cached) {
    return {
      ...cached,
      source: cached.source || "trusted-cache",
      sources: cached.sources?.length
        ? cached.sources
        : [
            {
              title: "Local trusted-source cache",
              provider: "Stock Analyzer",
              detail: `Last refreshed ${cached.refreshedAt || "previously"}.`
            }
          ]
    };
  }

  const demo = demoStocks[ticker];
  if (!demo) {
    return {
      ticker,
      name: ticker,
      price: 0,
      change: 0,
      marketCap: "Not reported",
      pe: "Not reported",
      revenue: "Not reported",
      margin: "Not reported",
      score: 65,
      verdict: "Research pending",
      thesis: "The stock is being enriched from live market, SEC, and Nasdaq sources.",
      drivers: ["Review reported growth.", "Compare valuation with peers.", "Track cash flow and margins."],
      risks: ["Provider coverage may vary by security.", "Market prices can change rapidly.", "Verify material developments in company filings."],
      checks: ["Review the latest SEC filing.", "Confirm current valuation metrics.", "Compare recent price performance."],
      source: "lookup",
      sources: [],
      context: {
        sector: "Not classified",
        industry: "Not classified",
        description: `${ticker} company profile lookup.`,
        analystTargetPrice: "No consensus",
        dividendYield: "0.00%",
        fiftyTwoWeekHigh: "Not reported",
        fiftyTwoWeekLow: "Not reported",
        latestNews: []
      }
    };
  }

  return {
    ticker,
    ...demo,
    source: "demo",
    sources: [
      {
        title: "Built-in demo company profile",
        provider: "Demo data",
        detail: "Used when live provider keys are not configured or provider data is unavailable."
      }
    ],
    context: {
      sector: "Unavailable",
      industry: "Unavailable",
      description: "Live company profile data is unavailable. Configure provider keys to enrich this brief with source-backed fundamentals and news context.",
      analystTargetPrice: "Unavailable",
      dividendYield: "Unavailable",
      fiftyTwoWeekHigh: "Unavailable",
      fiftyTwoWeekLow: "Unavailable",
      latestNews: []
    }
  };
}

function scoreFor(stock, lens, risk) {
  let score = Number(stock.score || 65);
  if (lens === "growth") score += String(stock.revenue).includes("-") ? -7 : 5;
  if (lens === "value") score += Number.parseFloat(stock.pe) < 26 ? 5 : -5;
  score += Number(risk) >= 4 && score > 78 ? 2 : 0;
  score -= Number(risk) <= 2 && Number.parseFloat(stock.pe) > 35 ? 4 : 0;
  return Math.max(25, Math.min(95, score));
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function parseScaledFinancial(value) {
  const text = String(value || "").replace(/[$,%+]/g, "").trim();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return null;
  const multiplier = text.endsWith("T") ? 1_000_000_000_000 : text.endsWith("B") ? 1_000_000_000 : text.endsWith("M") ? 1_000_000 : 1;
  return number * multiplier;
}

function enrichCachedFinancialMetrics(stock) {
  const context = { ...(stock.context || {}) };
  const revenue = parseScaledFinancial(context.fiscalRevenue || stock.revenue);
  const netIncome = parseScaledFinancial(context.fiscalNetIncome);
  const assets = parseScaledFinancial(context.totalAssets);
  const equity = parseScaledFinancial(context.stockholdersEquity);
  const marketCap = parseScaledFinancial(stock.marketCap);
  const metrics = calculateFinancialMetrics({ revenue, netIncome, assets, equity });

  if (!context.netMargin && metrics.netMargin !== null) context.netMargin = `${metrics.netMargin.toFixed(1)}%`;
  if (!context.returnOnAssets && metrics.returnOnAssets !== null) context.returnOnAssets = `${metrics.returnOnAssets.toFixed(1)}%`;
  if (!context.returnOnEquity && metrics.returnOnEquity !== null) context.returnOnEquity = `${metrics.returnOnEquity.toFixed(1)}%`;
  if (!context.priceToSales && marketCap !== null && revenue) context.priceToSales = (marketCap / revenue).toFixed(2);
  return { ...stock, context };
}

function purchaseFitFor(stock, researchScore, risk, horizon) {
  return calculatePurchaseFit({
    researchScore,
    growthPercent: stock.context?.revenueGrowthPercent,
    price: stock.price,
    fiftyTwoWeekHigh: stock.context?.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: stock.context?.fiftyTwoWeekLow,
    pe: stock.pe,
    selectedRisk: risk,
    horizon
  });
}

function generatePath(stock, score) {
  const points = 42;
  const volatility = 0.045 + (100 - score) / 1800;
  const drift = (score - 58) / 1700;
  let price = stock.price * 0.82;
  const series = [];

  for (let i = 0; i < points; i += 1) {
    const wave = Math.sin(i * 0.55 + stock.ticker.charCodeAt(0)) * volatility * stock.price;
    price += stock.price * drift + wave * 0.12;
    series.push(Number(Math.max(stock.price * 0.55, price).toFixed(2)));
  }

  return series;
}

function extractOutputText(data) {
  return data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
}

function dedupeSources(sources = []) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = [source.provider, source.title, source.url].filter(Boolean).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`);
  return response.text();
}

async function resolveSecCik(ticker) {
  if (secTickerMap[ticker]) return secTickerMap[ticker];
  const oneDay = 24 * 60 * 60 * 1000;

  if (Date.now() - secTickerMapUpdatedAt > oneDay) {
    const userAgent = process.env.SEC_USER_AGENT || "StockAnalyzer/1.0 contact@example.com";
    const data = await fetchJson("https://www.sec.gov/files/company_tickers.json", {
      headers: {
        "user-agent": userAgent,
        accept: "application/json"
      }
    });
    const entries = Array.isArray(data) ? data : Object.values(data || {});
    secTickerMap = { ...defaultCikByTicker };
    for (const entry of entries) {
      if (!entry?.ticker || entry.cik_str === undefined) continue;
      secTickerMap[String(entry.ticker).toUpperCase()] = String(entry.cik_str).padStart(10, "0");
    }
    secTickerMapUpdatedAt = Date.now();
  }

  return secTickerMap[ticker] || null;
}

async function fetchAlphaVantageQuote(ticker) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "GLOBAL_QUOTE");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", key);

  const data = await fetchJson(url);
  const quote = data["Global Quote"];
  if (!quote || !quote["05. price"]) return null;

  const base = fallbackStock(ticker);
  return {
    ...base,
    price: Number.parseFloat(quote["05. price"]),
    change: Number.parseFloat(String(quote["10. change percent"]).replace("%", "")),
    quoteSource: "Alpha Vantage",
    quoteUpdatedAt: quote["07. latest trading day"] || new Date().toISOString(),
    source: "alpha-vantage",
    sources: [
      ...(base.sources || []),
      {
        title: "Global Quote",
        provider: "Alpha Vantage",
        detail: "Latest quote endpoint for price and daily percentage change."
      }
    ]
  };
}

async function fetchYahooQuote(ticker) {
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1m");

  const data = await fetchJson(url);
  const result = data.chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price)) return null;

  const previousClose = Number(meta.chartPreviousClose || meta.previousClose);
  const change = Number.isFinite(previousClose) && previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : undefined;
  const quoteUpdatedAt = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : new Date().toISOString();
  const base = fallbackStock(ticker);

  return {
    ...base,
    name: meta.longName || meta.shortName || base.name,
    price,
    change: Number.isFinite(change) ? Number(change.toFixed(2)) : base.change,
    quoteSource: "Yahoo Finance",
    quoteUpdatedAt,
    context: {
      ...(base.context || {}),
      fiftyTwoWeekHigh: Number.isFinite(Number(meta.fiftyTwoWeekHigh)) ? `$${Number(meta.fiftyTwoWeekHigh).toFixed(2)}` : base.context?.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: Number.isFinite(Number(meta.fiftyTwoWeekLow)) ? `$${Number(meta.fiftyTwoWeekLow).toFixed(2)}` : base.context?.fiftyTwoWeekLow
    },
    source: base.source === "demo" ? "yahoo-finance" : base.source,
    sources: [
      ...(base.sources || []),
      {
        title: "Chart quote",
        provider: "Yahoo Finance",
        url: url.toString(),
        detail: "No-key quote endpoint used for the current calculation price and daily percentage change."
      }
    ]
  };
}

function nasdaqHeaders() {
  return {
    "user-agent": "Mozilla/5.0 (compatible; StockAnalyzer/1.0)",
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9"
  };
}

async function fetchNasdaqProfile(ticker) {
  const url = `https://api.nasdaq.com/api/company/${ticker}/company-profile`;
  const data = await fetchJson(url, { headers: nasdaqHeaders() });
  const profile = data.data;
  if (!profile) return null;

  return {
    name: profile.CompanyName?.value || ticker,
    context: {
      sector: profile.Sector?.value || "Not classified",
      industry: profile.Industry?.value || "Not classified",
      description: profile.CompanyDescription?.value || `${profile.CompanyName?.value || ticker} company profile.`,
      companyUrl: profile.CompanyUrl?.value || "",
      address: profile.Address?.value || "",
      region: profile.Region?.value || ""
    },
    sourceItem: {
      title: "Company Profile",
      provider: "Nasdaq",
      url,
      detail: "Company description, sector, industry, region, address, and corporate website."
    }
  };
}

async function fetchNasdaqAnalystTarget(ticker) {
  const url = `https://api.nasdaq.com/api/analyst/${ticker}/targetprice`;
  const data = await fetchJson(url, { headers: nasdaqHeaders() });
  const consensus = data.data?.consensusOverview;
  if (!consensus) return null;

  return {
    context: {
      analystTargetPrice: Number.isFinite(Number(consensus.priceTarget)) ? `$${Number(consensus.priceTarget).toFixed(2)}` : "No consensus",
      analystTargetLow: Number.isFinite(Number(consensus.lowPriceTarget)) ? `$${Number(consensus.lowPriceTarget).toFixed(2)}` : "No consensus",
      analystTargetHigh: Number.isFinite(Number(consensus.highPriceTarget)) ? `$${Number(consensus.highPriceTarget).toFixed(2)}` : "No consensus",
      analystBuyRatings: Number(consensus.buy || 0),
      analystHoldRatings: Number(consensus.hold || 0),
      analystSellRatings: Number(consensus.sell || 0)
    },
    sourceItem: {
      title: "Analyst Price Targets",
      provider: "Nasdaq",
      url,
      detail: "Consensus target range and current buy, hold, and sell counts."
    }
  };
}

async function fetchNasdaqDividend(ticker) {
  const url = `https://api.nasdaq.com/api/quote/${ticker}/dividends?assetclass=stocks`;
  const data = await fetchJson(url, { headers: nasdaqHeaders() });
  const dividend = data.data;
  if (!dividend) return null;
  const rawYield = dividend.yield;
  const dividendYield = /^\d+(\.\d+)?%$/.test(String(rawYield || "")) ? rawYield : "0.00%";
  const cleanDividendDate = (value) => value && !["N/A", "--"].includes(value) ? value : "No scheduled dividend";

  return {
    context: {
      dividendYield,
      annualDividend: dividend.annualizedDividend && dividend.annualizedDividend !== "--" ? `$${dividend.annualizedDividend}` : "$0.00",
      exDividendDate: cleanDividendDate(dividend.exDividendDate),
      dividendPaymentDate: cleanDividendDate(dividend.dividendPaymentDate)
    },
    sourceItem: {
      title: "Dividend History",
      provider: "Nasdaq",
      url,
      detail: "Current dividend yield, annualized dividend, ex-dividend date, and payment date."
    }
  };
}

async function fetchNasdaqSummary(ticker) {
  const url = `https://api.nasdaq.com/api/quote/${ticker}/summary?assetclass=stocks`;
  const data = await fetchJson(url, { headers: nasdaqHeaders() });
  const summary = data.data?.summaryData;
  if (!summary) return null;
  const marketCapValue = Number(String(summary.MarketCap?.value || "").replace(/,/g, ""));

  return {
    marketCap: Number.isFinite(marketCapValue) ? formatLargeNumber(marketCapValue) : undefined,
    context: {
      exchange: summary.Exchange?.value || "Not reported",
      averageVolume: summary.AverageVolume?.value || "Not reported"
    },
    sourceItem: {
      title: "Quote Summary",
      provider: "Nasdaq",
      url,
      detail: "Market capitalization, exchange, volume, dividend, and trading-range summary."
    }
  };
}

async function fetchYahooHistory(ticker, horizon) {
  const settings = {
    "3 months": { range: "3mo", interval: "1d" },
    "12 months": { range: "1y", interval: "1d" },
    "3 years": { range: "3y", interval: "1wk" },
    "5 years": { range: "5y", interval: "1wk" }
  }[horizon] || { range: "1y", interval: "1d" };
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`);
  url.searchParams.set("range", settings.range);
  url.searchParams.set("interval", settings.interval);
  url.searchParams.set("events", "history");

  const data = await fetchJson(url);
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = timestamps
    .map((timestamp, index) => ({ timestamp, close: Number(closes[index]) }))
    .filter((point) => Number.isFinite(point.close));

  if (!points.length) throw new Error(`No historical prices returned for ${ticker}.`);

  return {
    ticker,
    horizon,
    interval: settings.interval,
    source: "Yahoo Finance",
    updatedAt: new Date().toISOString(),
    points
  };
}

async function captureScoreSnapshot(stock) {
  const price = Number(stock.price);
  if (!stock.ticker || !Number.isFinite(price) || price <= 0) return null;
  const researchScore = scoreFor(stock, "balanced", 3);
  const purchaseFit = purchaseFitFor(stock, researchScore, 3, "12 months");
  const snapshots = loadScoreSnapshots();
  const date = new Date().toISOString().slice(0, 10);
  const key = `${date}:${stock.ticker}:balanced:3:12-months`;
  snapshots[key] = createScoreSnapshot({
    ticker: stock.ticker,
    score: purchaseFit.score,
    researchScore,
    price,
    capturedAt: new Date().toISOString(),
    methodologyVersion: purchaseFit.methodologyVersion
  });
  await saveScoreSnapshots(snapshots);
  return snapshots[key];
}

async function fetchAlphaVantageOverview(ticker) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "OVERVIEW");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", key);

  const data = await fetchJson(url);
  if (!data || !data.Symbol) return null;

  return {
    marketCap: formatLargeNumber(data.MarketCapitalization) || undefined,
    pe: data.PERatio && data.PERatio !== "None" ? data.PERatio : undefined,
    revenue: data.QuarterlyRevenueGrowthYOY && data.QuarterlyRevenueGrowthYOY !== "None" ? formatPercent(data.QuarterlyRevenueGrowthYOY) : undefined,
    margin: data.GrossProfitTTM && data.RevenueTTM ? formatPercent(Number(data.GrossProfitTTM) / Number(data.RevenueTTM)) : undefined,
    context: {
      sector: data.Sector || "Unavailable",
      industry: data.Industry || "Unavailable",
      description: data.Description || "Company description unavailable.",
      analystTargetPrice: data.AnalystTargetPrice || "Unavailable",
      dividendYield: data.DividendYield && data.DividendYield !== "None" ? formatPercent(data.DividendYield) : "Unavailable",
      fiftyTwoWeekHigh: data["52WeekHigh"] || "Unavailable",
      fiftyTwoWeekLow: data["52WeekLow"] || "Unavailable",
      priceToSales: data.PriceToSalesRatioTTM && data.PriceToSalesRatioTTM !== "None" ? Number(data.PriceToSalesRatioTTM).toFixed(2) : "Unavailable",
      evToEbitda: data.EVToEBITDA && data.EVToEBITDA !== "None" ? Number(data.EVToEBITDA).toFixed(2) : "Unavailable",
      providerProfitMargin: data.ProfitMargin && data.ProfitMargin !== "None" ? formatPercent(data.ProfitMargin) : "Unavailable",
      providerReturnOnEquity: data.ReturnOnEquityTTM && data.ReturnOnEquityTTM !== "None" ? formatPercent(data.ReturnOnEquityTTM) : "Unavailable"
    },
    source: "alpha-vantage",
    sourceItem: {
      title: "Company Overview",
      provider: "Alpha Vantage",
      detail: "Fundamentals endpoint for sector, industry, valuation, revenue growth, target price, dividend yield, and 52-week range."
    }
  };
}

async function fetchAlphaVantageNews(ticker) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return [];

  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "NEWS_SENTIMENT");
  url.searchParams.set("tickers", ticker);
  url.searchParams.set("limit", "5");
  url.searchParams.set("apikey", key);

  const data = await fetchJson(url);
  const feed = Array.isArray(data.feed) ? data.feed : [];

  return feed.slice(0, 5).map((item) => ({
    title: item.title || "Untitled news item",
    provider: item.source || "Alpha Vantage News",
    url: item.url,
    publishedAt: formatNewsDate(item.time_published),
    sentiment: item.overall_sentiment_label || "Unrated"
  }));
}

async function fetchAlphaVantageEarnings(ticker) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "EARNINGS");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("apikey", key);
  const data = await fetchJson(url);
  const quarter = data.quarterlyEarnings?.[0];
  if (!quarter) return null;
  const reported = Number(quarter.reportedEPS);
  const estimated = Number(quarter.estimatedEPS);
  const surprisePercent = Number(quarter.surprisePercentage);
  return {
    context: {
      latestEarningsDate: quarter.reportedDate || "Unavailable",
      reportedEps: Number.isFinite(reported) ? reported : null,
      estimatedEps: Number.isFinite(estimated) ? estimated : null,
      earningsSurprisePercent: Number.isFinite(surprisePercent) ? surprisePercent : null,
      earningsSurpriseLabel: Number.isFinite(surprisePercent) ? (surprisePercent > 2 ? "Beat" : surprisePercent < -2 ? "Miss" : "In line") : "Unavailable"
    },
    sourceItem: {
      title: "Quarterly Earnings",
      provider: "Alpha Vantage",
      url: `https://www.alphavantage.co/query?function=EARNINGS&symbol=${ticker}`,
      detail: "Latest reported EPS, consensus estimate, and earnings surprise percentage."
    }
  };
}

async function fetchAlphaVantageEarningsCalendar(ticker) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) return null;
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "EARNINGS_CALENDAR");
  url.searchParams.set("symbol", ticker);
  url.searchParams.set("horizon", "12month");
  url.searchParams.set("apikey", key);
  const rows = parseCsv(await fetchText(url));
  const entry = rows.find((row) => String(row.symbol || "").toUpperCase() === ticker) || rows[0];
  if (!entry?.reportDate) return null;
  return {
    context: {
      nextEarningsDate: entry.reportDate,
      nextEarningsEstimate: entry.estimate || null,
      nextFiscalPeriodEnd: entry.fiscalDateEnding || null,
      earningsCurrency: entry.currency || "USD"
    },
    sourceItem: {
      title: "Expected Earnings Calendar",
      provider: "Alpha Vantage",
      url: `https://www.alphavantage.co/query?function=EARNINGS_CALENDAR&symbol=${ticker}&horizon=12month`,
      detail: "Expected company earnings date and consensus EPS estimate for the next 12 months."
    }
  };
}

async function fetchSecCompanyFacts(ticker) {
  const cik = await resolveSecCik(ticker);
  if (!cik) return null;

  const userAgent = process.env.SEC_USER_AGENT || "StockAnalyzer/1.0 contact@example.com";
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  const data = await fetchJson(url, {
    headers: {
      "user-agent": userAgent,
      accept: "application/json"
    }
  });

  const facts = data.facts?.["us-gaap"] || {};
  const revenueFact = latestAnnualAcross([
    facts.RevenueFromContractWithCustomerExcludingAssessedTax,
    facts.Revenues,
    facts.SalesRevenueNet
  ]);
  const revenueFacts = annualFactsAcross([
    facts.RevenueFromContractWithCustomerExcludingAssessedTax,
    facts.Revenues,
    facts.SalesRevenueNet
  ]);
  const priorRevenueFact = revenueFacts[1] || null;
  const netIncomeFact = latestAnnualFact(facts.NetIncomeLoss);
  const grossProfitFact = latestAnnualFact(facts.GrossProfit);
  const assetsFact = latestInstantFact(facts.Assets);
  const liabilitiesFact = latestInstantFact(facts.Liabilities);
  const equityFact = latestInstantFact(facts.StockholdersEquity);
  const operatingCashFlowFact = latestAnnualFact(facts.NetCashProvidedByUsedInOperatingActivities);
  const operatingIncomeFact = latestAnnualFact(facts.OperatingIncomeLoss);
  const dilutedEpsFact = latestAnnualFactForUnit(facts.EarningsPerShareDiluted, "USD/shares");
  const capexFact = latestAnnualAcross([
    facts.PaymentsToAcquirePropertyPlantAndEquipment,
    facts.PaymentsForAdditionsToPropertyPlantAndEquipment
  ]);
  const cashFact = latestInstantFact(facts.CashAndCashEquivalentsAtCarryingValue);
  const debtValue = totalDebtValue(facts);
  const shareFacts = annualFactsForUnitAcross([
    facts.WeightedAverageNumberOfDilutedSharesOutstanding,
    facts.WeightedAverageNumberOfSharesOutstandingBasic
  ], "shares");
  const sharesFact = shareFacts[0] || null;
  const priorSharesFact = shareFacts[1] || null;

  const revenue = revenueFact?.val;
  const revenueGrowthPercent = revenue && priorRevenueFact?.val
    ? ((revenue - priorRevenueFact.val) / priorRevenueFact.val) * 100
    : 0;
  const grossProfit = grossProfitFact?.val;

  const liabilities = liabilitiesFact?.val || (assetsFact?.val && equityFact?.val ? assetsFact.val - equityFact.val : null);
  const financialMetrics = calculateFinancialMetrics({
    revenue,
    netIncome: netIncomeFact?.val,
    operatingCashFlow: operatingCashFlowFact?.val,
    capitalExpenditures: capexFact?.val,
    assets: assetsFact?.val,
    equity: equityFact?.val,
    debt: debtValue,
    cash: cashFact?.val,
    shares: sharesFact?.val,
    priorShares: priorSharesFact?.val
  });

  return {
    revenue: revenue ? formatLargeNumber(revenue) : undefined,
    margin: revenue && grossProfit
      ? formatPercent(grossProfit / revenue)
      : revenue && operatingIncomeFact?.val
        ? formatPercent(operatingIncomeFact.val / revenue)
        : undefined,
    context: {
      secCik: cik,
      secEntityName: data.entityName || "Unavailable",
      fiscalRevenue: revenue ? formatLargeNumber(revenue) : "Unavailable",
      priorFiscalRevenue: priorRevenueFact?.val ? formatLargeNumber(priorRevenueFact.val) : "Not reported",
      revenueGrowthPercent: Number(revenueGrowthPercent.toFixed(1)),
      revenueGrowth: `${revenueGrowthPercent >= 0 ? "+" : ""}${revenueGrowthPercent.toFixed(1)}%`,
      fiscalNetIncome: netIncomeFact?.val ? formatLargeNumber(netIncomeFact.val) : "Unavailable",
      totalAssets: assetsFact?.val ? formatLargeNumber(assetsFact.val) : "Unavailable",
      totalLiabilities: liabilities ? formatLargeNumber(liabilities) : "$0",
      stockholdersEquity: equityFact?.val ? formatLargeNumber(equityFact.val) : "Unavailable",
      operatingCashFlow: operatingCashFlowFact?.val ? formatLargeNumber(operatingCashFlowFact.val) : "Unavailable",
      operatingIncome: operatingIncomeFact?.val ? formatLargeNumber(operatingIncomeFact.val) : "$0",
      dilutedEps: dilutedEpsFact?.val ? Number(dilutedEpsFact.val) : null,
      capitalExpenditures: capexFact?.val ? formatLargeNumber(Math.abs(capexFact.val)) : "Unavailable",
      freeCashFlow: financialMetrics.freeCashFlow !== null ? formatSignedLargeNumber(financialMetrics.freeCashFlow) : "Unavailable",
      freeCashFlowMargin: financialMetrics.freeCashFlowMargin !== null ? `${financialMetrics.freeCashFlowMargin >= 0 ? "+" : ""}${financialMetrics.freeCashFlowMargin.toFixed(1)}%` : "Unavailable",
      netMargin: financialMetrics.netMargin !== null ? `${financialMetrics.netMargin >= 0 ? "+" : ""}${financialMetrics.netMargin.toFixed(1)}%` : "Unavailable",
      returnOnAssets: financialMetrics.returnOnAssets !== null ? `${financialMetrics.returnOnAssets.toFixed(1)}%` : "Unavailable",
      returnOnEquity: financialMetrics.returnOnEquity !== null ? `${financialMetrics.returnOnEquity.toFixed(1)}%` : "Unavailable",
      totalDebt: debtValue ? formatLargeNumber(debtValue) : "$0",
      cashAndEquivalents: cashFact?.val ? formatLargeNumber(cashFact.val) : "Unavailable",
      netDebt: financialMetrics.netDebt !== null ? formatSignedLargeNumber(financialMetrics.netDebt) : "Unavailable",
      debtToEquity: financialMetrics.debtToEquity !== null ? financialMetrics.debtToEquity.toFixed(2) : "Unavailable",
      dilutedShares: sharesFact?.val ? formatShareCount(sharesFact.val) : "Unavailable",
      shareChangePercent: financialMetrics.shareChangePercent,
      shareChange: financialMetrics.shareChangePercent !== null ? `${financialMetrics.shareChangePercent >= 0 ? "+" : ""}${financialMetrics.shareChangePercent.toFixed(1)}%` : "Unavailable",
      dilutionLabel: financialMetrics.dilutionLabel,
      latestFiscalPeriod: revenueFact?.fy ? `${revenueFact.fy}${revenueFact.fp ? ` ${revenueFact.fp}` : ""}` : "Unavailable",
      latestFilingDate: revenueFact?.filed || "Unavailable"
    },
    sourceItem: {
      title: "SEC EDGAR Company Facts",
      provider: "U.S. Securities and Exchange Commission",
      url,
      detail: "XBRL company facts for revenue, profitability, cash flow, debt, cash, equity, and diluted share trends."
    }
  };
}

function factCandidates(concept) {
  const usdFacts = concept?.units?.USD;
  if (!Array.isArray(usdFacts)) return [];

  return usdFacts.filter((fact) => fact.val !== undefined && fact.filed && ["10-K", "10-Q", "20-F", "40-F"].includes(fact.form));
}

function unitFactCandidates(concept, unit) {
  const facts = concept?.units?.[unit];
  if (!Array.isArray(facts)) return [];
  return facts.filter((fact) => fact.val !== undefined && fact.filed && ["10-K", "10-Q", "20-F", "40-F"].includes(fact.form));
}

function latestAnnualFact(concept) {
  return factCandidates(concept)
    .filter((fact) => fact.fp === "FY")
    .sort((a, b) => String(b.end).localeCompare(String(a.end)) || String(b.filed).localeCompare(String(a.filed)))[0] || null;
}

function latestAnnualAcross(concepts) {
  return annualFactsAcross(concepts)[0] || null;
}

function annualFactsAcross(concepts) {
  const byPeriod = new Map();
  for (const concept of concepts) {
    for (const fact of factCandidates(concept).filter((item) => item.fp === "FY")) {
      const current = byPeriod.get(fact.end);
      if (!current || String(fact.filed).localeCompare(String(current.filed)) > 0) byPeriod.set(fact.end, fact);
    }
  }
  return [...byPeriod.values()]
    .sort((a, b) => String(b.end).localeCompare(String(a.end)) || String(b.filed).localeCompare(String(a.filed)));
}

function latestAnnualFactForUnit(concept, unit) {
  return unitFactCandidates(concept, unit)
    .filter((fact) => fact.fp === "FY")
    .sort((a, b) => String(b.end).localeCompare(String(a.end)) || String(b.filed).localeCompare(String(a.filed)))[0] || null;
}

function latestInstantFact(concept) {
  return factCandidates(concept)
    .sort((a, b) => String(b.end).localeCompare(String(a.end)) || String(b.filed).localeCompare(String(a.filed)))[0] || null;
}

function latestInstantAcross(concepts) {
  return concepts.map(latestInstantFact).filter(Boolean)
    .sort((a, b) => String(b.end).localeCompare(String(a.end)) || String(b.filed).localeCompare(String(a.filed)))[0] || null;
}

function totalDebtValue(facts) {
  const combined = latestInstantFact(facts.LongTermDebtAndFinanceLeaseObligations);
  if (combined?.val !== undefined) return Number(combined.val);
  const current = latestInstantAcross([facts.LongTermDebtAndFinanceLeaseObligationsCurrent, facts.LongTermDebtCurrent]);
  const noncurrent = latestInstantAcross([facts.LongTermDebtAndFinanceLeaseObligationsNoncurrent, facts.LongTermDebtNoncurrent]);
  if (current || noncurrent) return Number(current?.val || 0) + Number(noncurrent?.val || 0);
  return Number(latestInstantFact(facts.LongTermDebt)?.val || 0);
}

function annualFactsForUnitAcross(concepts, unit) {
  const byPeriod = new Map();
  for (const concept of concepts) {
    for (const fact of unitFactCandidates(concept, unit).filter((item) => item.fp === "FY")) {
      const current = byPeriod.get(fact.end);
      if (!current || String(fact.filed).localeCompare(String(current.filed)) > 0) byPeriod.set(fact.end, fact);
    }
  }
  return [...byPeriod.values()].sort((a, b) => String(b.end).localeCompare(String(a.end)));
}

async function buildStockSnapshot(ticker) {
  const warnings = [];
  let stock = fallbackStock(ticker);

  try {
    stock = (await fetchAlphaVantageQuote(ticker)) || (await fetchYahooQuote(ticker)) || stock;
  } catch (error) {
    warnings.push(error.message);
  }

  try {
    const secFacts = await fetchSecCompanyFacts(ticker);
    if (secFacts) {
      stock = {
        ...stock,
        revenue: secFacts.revenue || stock.revenue,
        margin: secFacts.margin || stock.margin,
        context: { ...(stock.context || {}), ...(secFacts.context || {}) },
        source: stock.source === "demo" ? "sec-edgar" : stock.source,
        sources: [...(stock.sources || []), secFacts.sourceItem]
      };
    }
  } catch (error) {
    warnings.push(error.message);
  }

  try {
    const overview = await fetchAlphaVantageOverview(ticker);
    if (overview) {
      stock = {
        ...stock,
        marketCap: overview.marketCap || stock.marketCap,
        pe: overview.pe || stock.pe,
        revenue: overview.revenue || stock.revenue,
        margin: overview.margin || stock.margin,
        context: { ...(stock.context || {}), ...(overview.context || {}) },
        source: overview.source,
        sources: [...(stock.sources || []), overview.sourceItem]
      };
    }
  } catch (error) {
    warnings.push(error.message);
  }

  try {
    const news = await fetchAlphaVantageNews(ticker);
    if (news.length) {
      stock = {
        ...stock,
        context: { ...(stock.context || {}), latestNews: news },
        sources: [
          ...(stock.sources || []),
          ...news.map((item) => ({
            title: item.title,
            provider: item.provider,
            url: item.url,
            detail: `${item.publishedAt || "Recent"} sentiment: ${item.sentiment}`
          }))
        ]
      };
    }
  } catch (error) {
    warnings.push(error.message);
  }

  try {
    const earnings = await fetchAlphaVantageEarnings(ticker);
    if (earnings) {
      stock = {
        ...stock,
        context: { ...(stock.context || {}), ...(earnings.context || {}) },
        sources: [...(stock.sources || []), earnings.sourceItem]
      };
    }
  } catch (error) {
    warnings.push(error.message);
  }

  try {
    const calendar = await fetchAlphaVantageEarningsCalendar(ticker);
    if (calendar) {
      stock = {
        ...stock,
        context: { ...(stock.context || {}), ...(calendar.context || {}) },
        sources: [...(stock.sources || []), calendar.sourceItem]
      };
    }
  } catch (error) {
    warnings.push(error.message);
  }

  const nasdaqFetches = await Promise.allSettled([
    fetchNasdaqProfile(ticker),
    fetchNasdaqAnalystTarget(ticker),
    fetchNasdaqDividend(ticker),
    fetchNasdaqSummary(ticker)
  ]);
  for (const result of nasdaqFetches) {
    if (result.status === "fulfilled" && result.value) {
      stock = {
        ...stock,
        name: result.value.name || stock.name,
        marketCap: result.value.marketCap || stock.marketCap,
        context: { ...(stock.context || {}), ...(result.value.context || {}) },
        sources: [...(stock.sources || []), result.value.sourceItem]
      };
    } else if (result.status === "rejected") {
      warnings.push(result.reason?.message || "Nasdaq enrichment failed.");
    }
  }


  const dilutedEps = Number(stock.context?.dilutedEps);
  if ((!stock.pe || stock.pe === "Not reported") && Number.isFinite(dilutedEps) && dilutedEps > 0 && Number(stock.price) > 0) {
    stock.pe = (Number(stock.price) / dilutedEps).toFixed(1);
    stock.context = { ...(stock.context || {}), peMethod: "Current price divided by latest SEC diluted annual EPS" };
  }

  stock = enrichCachedFinancialMetrics(stock);

  const retrievedAt = new Date().toISOString();
  const sources = dedupeSources(stock.sources).map((source) => ({
    ...source,
    retrievedAt: source.retrievedAt || retrievedAt
  }));
  stock = { ...stock, catalysts: buildCatalysts(stock) };
  return { stock: { ...stock, sources }, warnings };
}

async function buildLiveQuote(ticker) {
  const warnings = [];

  try {
    const quote = (await fetchAlphaVantageQuote(ticker)) || (await fetchYahooQuote(ticker));
    if (quote) {
      return {
        quote: {
          ticker,
          price: quote.price,
          change: quote.change,
          quoteSource: quote.quoteSource,
          quoteUpdatedAt: quote.quoteUpdatedAt
        },
        warnings
      };
    }
  } catch (error) {
    warnings.push(error.message);
  }

  const fallback = fallbackStock(ticker);
  return {
    quote: {
      ticker,
      price: fallback.price,
      change: fallback.change,
      quoteSource: fallback.quoteSource || fallback.source || "fallback",
      quoteUpdatedAt: fallback.quoteUpdatedAt || fallback.refreshedAt || "Unavailable"
    },
    warnings
  };
}

async function refreshTrustedStocks(tickers = supportedTickers) {
  const cache = loadStockCache();
  const results = [];

  for (const ticker of tickers.map(normalizeTicker)) {
    const { stock, warnings } = await buildStockSnapshot(ticker);
    const refreshed = {
      ...stock,
      refreshedAt: new Date().toISOString(),
      warnings
    };
    cache[ticker] = refreshed;
    await captureScoreSnapshot(refreshed);
    results.push({ ticker, source: refreshed.source, warnings, sourceCount: refreshed.sources?.length || 0 });
  }

  await saveStockCache(cache);
  return { refreshedAt: new Date().toISOString(), results, cache };
}

async function saveLookupStock(stock, warnings = []) {
  if (supportedTickers.includes(stock.ticker)) return;
  const cache = loadLookupCache();
  cache[stock.ticker] = {
    ...stock,
    refreshedAt: new Date().toISOString(),
    warnings
  };
  await saveLookupCache(cache);
}

function formatLargeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (number >= 1_000_000_000_000) return `$${(number / 1_000_000_000_000).toFixed(1)}T`;
  if (number >= 1_000_000_000) return `$${(number / 1_000_000_000).toFixed(0)}B`;
  if (number >= 1_000_000) return `$${(number / 1_000_000).toFixed(0)}M`;
  return `$${number.toLocaleString("en-US")}`;
}

function formatSignedLargeNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const sign = number < 0 ? "-$" : "$";
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000_000_000) return `${sign}${(absolute / 1_000_000_000_000).toFixed(1)}T`;
  if (absolute >= 1_000_000_000) return `${sign}${(absolute / 1_000_000_000).toFixed(0)}B`;
  if (absolute >= 1_000_000) return `${sign}${(absolute / 1_000_000).toFixed(0)}M`;
  return `${sign}${absolute.toLocaleString("en-US")}`;
}

function formatShareCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unavailable";
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`;
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  return number.toLocaleString("en-US");
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Unavailable";
  return `${number >= 0 ? "+" : ""}${(number * 100).toFixed(1)}%`;
}

function formatNewsDate(value) {
  if (!value || value.length < 8) return "";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function localResearch({ stock, lens, horizon, risk }) {
  const score = scoreFor(stock, lens, risk);
  return {
    ...stock,
    score,
    purchaseFit: purchaseFitFor(stock, score, risk, horizon),
    horizon,
    lens,
    chart: generatePath(stock, score),
    generatedBy: "local",
    sources: stock.sources || [],
    context: stock.context || {}
  };
}

async function aiResearch(input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = `Create an equity research brief as strict JSON with keys verdict, thesis, drivers, risks, checks, score.

Ticker: ${input.stock.ticker}
Company: ${input.stock.name}
Price: ${input.stock.price}
Market cap: ${input.stock.marketCap}
Forward P/E: ${input.stock.pe}
Revenue growth: ${input.stock.revenue}
Margin: ${input.stock.margin}
Sector: ${input.stock.context?.sector || "Unavailable"}
Industry: ${input.stock.context?.industry || "Unavailable"}
Company description: ${input.stock.context?.description || "Unavailable"}
Analyst target price: ${input.stock.context?.analystTargetPrice || "Unavailable"}
52-week range: ${input.stock.context?.fiftyTwoWeekLow || "Unavailable"} to ${input.stock.context?.fiftyTwoWeekHigh || "Unavailable"}
Free cash flow: ${input.stock.context?.freeCashFlow || "Unavailable"}
Free cash flow margin: ${input.stock.context?.freeCashFlowMargin || "Unavailable"}
Net margin: ${input.stock.context?.netMargin || input.stock.context?.providerProfitMargin || "Unavailable"}
Return on equity: ${input.stock.context?.returnOnEquity || input.stock.context?.providerReturnOnEquity || "Unavailable"}
Total debt: ${input.stock.context?.totalDebt || "Unavailable"}
Net debt: ${input.stock.context?.netDebt || "Unavailable"}
Debt to equity: ${input.stock.context?.debtToEquity || "Unavailable"}
Annual diluted share change: ${input.stock.context?.shareChange || "Unavailable"}
Latest EPS surprise: ${input.stock.context?.earningsSurprisePercent ?? "Unavailable"}%
Recent news context: ${JSON.stringify(input.stock.context?.latestNews || [])}
Lens: ${input.lens}
Horizon: ${input.horizon}
Risk tolerance: ${input.risk}/5

Rules:
- score must be an integer from 25 to 95.
- drivers, risks, and checks must each contain exactly 3 concise strings.
- Do not make up live news. Base the brief only on the provided metrics, company context, and listed news context.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "stock_research_brief",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["verdict", "thesis", "drivers", "risks", "checks", "score"],
            properties: {
              verdict: { type: "string" },
              thesis: { type: "string" },
              drivers: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
              risks: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
              checks: { type: "array", minItems: 3, maxItems: 3, items: { type: "string" } },
              score: { type: "integer", minimum: 25, maximum: 95 }
            }
          }
        }
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI returned ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);
  if (!text) return null;

  const brief = JSON.parse(text);
  return {
    ...input.stock,
    ...brief,
    score: Number(brief.score),
    purchaseFit: purchaseFitFor(input.stock, Number(brief.score), input.risk, input.horizon),
    lens: input.lens,
    horizon: input.horizon,
    chart: generatePath(input.stock, Number(brief.score)),
    generatedBy: "openai",
    sources: input.stock.sources || [],
    context: input.stock.context || {}
  };
}

function localChat({ question, brief, evidence }) {
  const q = String(question || "").toLowerCase();
  const clean = (value) => String(value || "").replace(/[.!?]+$/, "");
  const sourceIds = relevantEvidenceIds(question, evidence);
  let text;

  if (q.includes("valuation") || q.includes("multiple") || q.includes("pe")) {
    text = `${brief.ticker} has a forward P/E marker of ${brief.pe}. With a research score of ${brief.score}, compare earnings growth, free cash flow conversion, and margin durability against that valuation.`;
  } else if (q.includes("risk") || q.includes("bear")) {
    text = `The main bear case is ${clean(brief.risks?.[0] || "execution or demand weakens")}. A second issue to monitor is ${clean(brief.risks?.[1] || "valuation sensitivity")}.`;
  } else if (q.includes("catalyst") || q.includes("driver")) {
    text = `The clearest driver is ${clean(brief.drivers?.[0] || "continued execution against growth expectations")}. Also monitor ${clean(brief.drivers?.[1] || "margin performance")}.`;
  } else if (q.includes("margin") || q.includes("profit")) {
    text = `${brief.name}'s reported margin marker is ${brief.margin}. The key question is whether revenue growth produces operating leverage or is absorbed by reinvestment, pricing pressure, or competition.`;
  } else if (q.includes("what would change") || q.includes("change the thesis")) {
    text = `The thesis should change if these checks begin failing: ${brief.checks?.slice(0, 2).map(clean).join(". ")}. The score should decline if they weaken and improve only when execution strengthens without valuation becoming less attractive.`;
  } else {
    text = `The current research thesis for ${brief.ticker} is: ${brief.thesis}`;
  }
  return validateGroundedAnswer({ claims: [{ text, sourceIds }], caveat: "Research support only; verify material decisions against the linked primary sources." }, evidence);
}

async function aiChat(input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = `You are an equity research assistant. Answer the user's question using only the evidence and brief below.

Rules:
- Be concise and practical.
- Do not provide personalized financial advice.
- Do not claim access to live news, filings, or prices beyond the provided context.
- If the user asks for a buy/sell decision, frame decision criteria instead.
- Return 1 to 3 claims. Every claim must cite one or more source IDs from the evidence catalog.
- Never invent a source ID. If the evidence is insufficient, state that in the caveat and omit the unsupported claim.

Evidence catalog:
${JSON.stringify(input.evidence, null, 2)}

Brief:
${JSON.stringify(input.brief, null, 2)}

User question:
${input.question}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "grounded_stock_answer",
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["claims", "caveat"],
            properties: {
              claims: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["text", "sourceIds"],
                  properties: {
                    text: { type: "string" },
                    sourceIds: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } }
                  }
                }
              },
              caveat: { type: "string" }
            }
          }
        },
        verbosity: "low"
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI returned ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);
  if (!text) return null;
  try {
    const grounded = validateGroundedAnswer(JSON.parse(text), input.evidence);
    return grounded.grounded ? grounded : null;
  } catch {
    return null;
  }
}

async function handleQuote(req, res, ticker) {
  try {
    const { stock, warnings } = await buildStockSnapshot(ticker);
    await saveLookupStock(stock, warnings);
    json(res, 200, { stock, warnings });
  } catch (error) {
    json(res, 200, { stock: fallbackStock(ticker), warning: error.message });
  }
}

async function handleLookup(req, res, ticker) {
  try {
    const { stock, warnings } = await buildStockSnapshot(ticker);
    await saveLookupStock(stock, warnings);
    json(res, 200, {
      stock: { ...stock, warnings },
      cachedSeparately: !supportedTickers.includes(ticker)
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleLivePrices(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const tickers = (url.searchParams.get("tickers") || "")
      .split(",")
      .map(normalizeTicker)
      .filter(Boolean)
      .slice(0, 25);
    const requested = tickers.length ? tickers : supportedTickers;
    const results = await Promise.all(requested.map((ticker) => buildLiveQuote(ticker)));

    json(res, 200, {
      updatedAt: new Date().toISOString(),
      quotes: results.map((result) => result.quote),
      warnings: results.flatMap((result) => result.warnings)
    });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

async function handleComparison(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requested = (url.searchParams.get("tickers") || supportedTickers.join(","))
      .split(",")
      .map(normalizeTicker)
      .filter(Boolean)
      .slice(0, 25);
    const { lens, risk, horizon } = queryControls(url);
    const cache = loadStockCache();
    const rows = requested.map((ticker) => {
      const base = cache[ticker] || fallbackStock(ticker);
      const researchScore = scoreFor(base, lens, risk);
      const purchaseFit = purchaseFitFor(base, researchScore, risk, horizon);
      return {
        ticker,
        name: base.name,
        price: base.price,
        change: base.change,
        quoteSource: base.quoteSource || base.source,
        quoteUpdatedAt: base.quoteUpdatedAt || base.refreshedAt,
        marketCap: base.marketCap,
        pe: base.pe,
        revenue: base.revenue,
        margin: base.margin,
        score: researchScore,
        purchaseScore: purchaseFit.score,
        purchaseFit,
        source: base.source || "demo"
      };
    });

    json(res, 200, {
      updatedAt: new Date().toISOString(),
      lens,
      risk,
      horizon,
      rows,
      warnings: []
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleScreener(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { lens, risk, horizon } = queryControls(url);
    const maxRisk = Number(url.searchParams.get("maxRisk") || 5);
    if (!Number.isInteger(maxRisk) || maxRisk < 1 || maxRisk > 5) throw new HttpError(400, "Maximum risk must be an integer from 1 to 5.");
    const allStocks = { ...loadStockCache(), ...loadLookupCache() };
    const rows = Object.entries(allStocks).map(([ticker, cached]) => {
      const stock = enrichCachedFinancialMetrics({ ticker, ...cached });
      const score = scoreFor(stock, lens, risk);
      const purchaseFit = purchaseFitFor(stock, score, risk, horizon);
      return {
        ticker,
        name: stock.name || ticker,
        sector: stock.context?.sector || "Not classified",
        industry: stock.context?.industry || "Not classified",
        price: Number(stock.price) || 0,
        marketCap: stock.marketCap || "Not reported",
        marketCapValue: parseMarketCap(stock.marketCap),
        pe: Number.parseFloat(stock.pe),
        growthPercent: Number(stock.context?.revenueGrowthPercent || 0),
        margin: stock.context?.netMargin || stock.margin || "Unavailable",
        score,
        purchaseScore: purchaseFit.score,
        riskLevel: purchaseFit.estimatedRiskLevel,
        refreshedAt: stock.refreshedAt || stock.quoteUpdatedAt || "Unavailable"
      };
    });
    const filters = {
      query: url.searchParams.get("query") || "",
      sector: url.searchParams.get("sector") || "all",
      minGrowth: url.searchParams.get("minGrowth"),
      maxPe: url.searchParams.get("maxPe"),
      minScore: url.searchParams.get("minScore"),
      minPurchaseScore: url.searchParams.get("minPurchaseScore"),
      maxRisk,
      minMarketCap: url.searchParams.get("minMarketCap"),
      sort: url.searchParams.get("sort") || "purchaseScore"
    };
    const results = screenStocks(rows, filters);
    const sectors = [...new Set(rows.map((row) => row.sector))].sort();
    json(res, 200, { updatedAt: new Date().toISOString(), universeSize: rows.length, resultCount: results.length, sectors, filters, rows: results });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleValidation(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const { lens, risk, horizon } = queryControls(url);
    const requested = (url.searchParams.get("tickers") || supportedTickers.join(","))
      .split(",")
      .map(requireTicker)
      .slice(0, 12);
    const cache = { ...loadStockCache(), ...loadLookupCache() };
    const histories = await Promise.allSettled(requested.map((ticker) => fetchYahooHistory(ticker, "5 years")));
    const rows = [];
    const warnings = [];

    histories.forEach((result, index) => {
      const ticker = requested[index];
      const stock = enrichCachedFinancialMetrics({ ticker, ...(cache[ticker] || fallbackStock(ticker)) });
      if (result.status === "rejected") {
        warnings.push(`${ticker}: ${result.reason?.message || "History unavailable."}`);
        return;
      }
      const researchScore = scoreFor(stock, lens, risk);
      const purchaseFit = purchaseFitFor(stock, researchScore, risk, horizon);
      rows.push({
        ticker,
        name: stock.name || ticker,
        researchScore,
        purchaseScore: purchaseFit.score,
        returns: trailingReturns(result.value.points),
        source: result.value.source
      });
    });

    const snapshotCache = loadScoreSnapshots();
    const selectedSnapshots = Object.values(snapshotCache).filter((snapshot) => requested.includes(snapshot.ticker));
    const currentPrices = Object.fromEntries(Object.entries(cache).map(([ticker, stock]) => [ticker, Number(stock.price) || 0]));
    const snapshotTickers = [...new Set(selectedSnapshots.map((snapshot) => snapshot.ticker))];
    const liveQuotes = await Promise.all(snapshotTickers.map((ticker) => buildLiveQuote(ticker)));
    liveQuotes.forEach(({ quote, warnings: quoteWarnings }, index) => {
      const ticker = snapshotTickers[index];
      if (Number(quote?.price) > 0) currentPrices[ticker] = Number(quote.price);
      quoteWarnings.forEach((warning) => warnings.push(`${ticker} quote: ${warning}`));
    });
    const evaluated = evaluateSnapshots(selectedSnapshots, currentPrices);
    for (const snapshot of evaluated) {
      const key = `${snapshot.capturedAt.slice(0, 10)}:${snapshot.ticker}:balanced:3:12-months`;
      snapshotCache[key] = snapshot;
    }
    await saveScoreSnapshots(snapshotCache);

    json(res, 200, {
      generatedAt: new Date().toISOString(),
      controls: { lens, risk, horizon },
      retrospective: {
        rows,
        summary: summarizeRetrospective(rows),
        limitation: "Retrospective association uses today's score against historical trailing returns. It is look-ahead biased and is not a point-in-time backtest."
      },
      forward: {
        snapshotCount: evaluated.length,
        firstCapturedAt: evaluated.map((item) => item.capturedAt).sort()[0] || null,
        summary: summarizeForwardValidation(evaluated),
        limitation: "Forward validation is unbiased but requires snapshots to age for 3, 6, and 12 months before outcomes mature."
      },
      warnings
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleCatalysts(req, res, ticker) {
  try {
    const stock = enrichCachedFinancialMetrics(fallbackStock(ticker));
    const events = buildCatalysts(stock);
    json(res, 200, {
      ticker,
      name: stock.name || ticker,
      updatedAt: stock.refreshedAt || stock.quoteUpdatedAt || new Date().toISOString(),
      nextEarningsDate: stock.context?.nextEarningsDate || null,
      events
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handlePriceHistory(req, res, ticker) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const horizon = url.searchParams.get("horizon") || "12 months";
    if (!validHorizons.has(horizon)) throw new HttpError(400, "Horizon must be 3 months, 12 months, or 3 years.");
    const history = await fetchYahooHistory(ticker, horizon);
    json(res, 200, history);
  } catch (error) {
    if (error instanceof HttpError) sendError(res, error);
    else json(res, 502, { error: error.message });
  }
}

async function handleResearch(req, res) {
  try {
    const body = await readBody(req);
    const controls = researchControls(body);
    const { ticker } = controls;
    const { stock, warnings } = await buildStockSnapshot(ticker);
    await saveLookupStock(stock, warnings);
    const input = {
      stock,
      lens: controls.lens,
      horizon: controls.horizon,
      risk: controls.risk
    };
    const brief = (await aiResearch(input)) || localResearch(input);
    await captureScoreSnapshot(stock);
    json(res, 200, { brief: { ...brief, warnings } });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const question = String(body.question || "").trim();
    const ticker = requireTicker(body.ticker || body.brief?.ticker);
    const trustedStock = enrichCachedFinancialMetrics(fallbackStock(ticker));
    const submitted = body.brief || {};
    const brief = {
      ...submitted,
      ...trustedStock,
      ticker,
      score: Number(submitted.score || trustedStock.score || 65),
      thesis: submitted.thesis || trustedStock.thesis,
      drivers: Array.isArray(submitted.drivers) ? submitted.drivers.slice(0, 3) : trustedStock.drivers,
      risks: Array.isArray(submitted.risks) ? submitted.risks.slice(0, 3) : trustedStock.risks,
      checks: Array.isArray(submitted.checks) ? submitted.checks.slice(0, 3) : trustedStock.checks,
      sources: trustedStock.sources || [],
      context: trustedStock.context || {}
    };

    if (!question) {
      json(res, 400, { error: "Question is required." });
      return;
    }
    if (question.length > 500) throw new HttpError(400, "Question must be 500 characters or fewer.");

    const evidence = buildEvidenceCatalog(brief);
    let groundedAnswer = null;
    let generatedBy = "local";
    if (process.env.OPENAI_API_KEY) {
      try {
        groundedAnswer = await aiChat({ question, brief, evidence });
        if (groundedAnswer) generatedBy = "openai";
      } catch {
        groundedAnswer = null;
      }
    }
    groundedAnswer ||= localChat({ question, brief, evidence });
    const citedSources = evidence.filter((source) => groundedAnswer.claims.some((claim) => claim.sourceIds.includes(source.id)));
    json(res, 200, {
      answer: citedText(groundedAnswer.claims),
      claims: groundedAnswer.claims,
      citations: citedSources,
      caveat: groundedAnswer.caveat,
      grounded: groundedAnswer.grounded,
      generatedBy
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleRefresh(req, res) {
  try {
    const body = await readBody(req);
    const tickers = Array.isArray(body.tickers) && body.tickers.length
      ? body.tickers.slice(0, 25).map(requireTicker)
      : supportedTickers;
    const refresh = await refreshTrustedStocks(tickers);
    json(res, 200, {
      refreshedAt: refresh.refreshedAt,
      results: refresh.results
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleSignup(req, res) {
  try {
    const body = await readBody(req);
    let credentials;
    try {
      credentials = validateCredentials(body.email, body.password);
    } catch (error) {
      throw new HttpError(400, error.message);
    }
    if (await storage.findUserByEmail(credentials.email)) throw new HttpError(409, "An account already exists for this email.");
    const user = newUser(credentials.email, await hashPassword(credentials.password));
    user.watchlist = [...defaultWatchlistForAccount()];
    await storage.createUser(user);
    await startUserSession(req, res, user);
    json(res, 201, { user: publicUser(user) });
  } catch (error) {
    if (error.code === "23505") error = new HttpError(409, "An account already exists for this email.");
    sendError(res, error);
  }
}

function defaultWatchlistForAccount() {
  return ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "JPM", "DIS"];
}

async function handleLogin(req, res) {
  try {
    const body = await readBody(req);
    const email = String(body.email || "").trim().toLowerCase();
    const user = await storage.findUserByEmail(email);
    if (!user || !(await verifyPassword(String(body.password || ""), user.passwordHash))) {
      throw new HttpError(401, "Email or password is incorrect.");
    }
    await startUserSession(req, res, user);
    json(res, 200, { user: publicUser(user) });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleLogout(req, res) {
  try {
    const token = parseCookies(req.headers.cookie).stock_session;
    if (token) await storage.deleteSession(hashSessionToken(token));
    res.setHeader("set-cookie", clearSessionCookie(secureRequest(req)));
    json(res, 200, { signedOut: true });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleCurrentUser(req, res) {
  try {
    const user = await authenticatedUser(req);
    json(res, 200, { user: user ? publicUser(user) : null });
  } catch (error) {
    sendError(res, error);
  }
}

async function handleWatchlist(req, res) {
  try {
    const user = await requireUser(req);
    if (req.method === "GET") {
      json(res, 200, { tickers: user.watchlist || [] });
      return;
    }
    const body = await readBody(req);
    if (!Array.isArray(body.tickers)) throw new HttpError(400, "Tickers must be an array.");
    const tickers = [...new Set(body.tickers.map(requireTicker))].slice(0, 30);
    await storage.updateWatchlist(user.id, tickers);
    json(res, 200, { tickers });
  } catch (error) {
    sendError(res, error);
  }
}

function validatedHoldings(value) {
  if (!Array.isArray(value)) throw new HttpError(400, "Holdings must be an array.");
  if (value.length > 50) throw new HttpError(400, "A portfolio can contain up to 50 holdings.");
  const byTicker = new Map();
  for (const item of value) {
    const ticker = requireTicker(item?.ticker);
    const shares = Number(item?.shares);
    const averageCost = Number(item?.averageCost);
    if (!Number.isFinite(shares) || shares <= 0 || shares > 1_000_000_000) throw new HttpError(400, `Shares for ${ticker} must be greater than zero.`);
    if (!Number.isFinite(averageCost) || averageCost < 0 || averageCost > 10_000_000) throw new HttpError(400, `Average cost for ${ticker} must be zero or greater.`);
    byTicker.set(ticker, { ticker, shares: Number(shares.toFixed(4)), averageCost: Number(averageCost.toFixed(2)) });
  }
  return [...byTicker.values()];
}

async function portfolioAnalysis(holdings) {
  const quotes = await Promise.all(holdings.map(async (holding) => {
    const base = fallbackStock(holding.ticker);
    const live = await buildLiveQuote(holding.ticker);
    const stockForRisk = { ...base, price: live.quote.price || base.price };
    const fit = purchaseFitFor(stockForRisk, Number(base.score) || 65, 3, "12 months");
    return [holding.ticker, {
      name: base.name,
      sector: base.context?.sector || "Unclassified",
      price: live.quote.price || base.price,
      quoteSource: live.quote.quoteSource,
      quoteUpdatedAt: live.quote.quoteUpdatedAt,
      riskLevel: fit.estimatedRiskLevel
    }];
  }));
  return analyzePortfolio(holdings, Object.fromEntries(quotes));
}

async function handlePortfolio(req, res) {
  try {
    const user = await requireUser(req);
    let holdings = user.portfolio || [];
    if (req.method === "PUT") {
      const body = await readBody(req);
      holdings = validatedHoldings(body.holdings);
      await storage.updatePortfolio(user.id, holdings);
    }
    const analysis = await portfolioAnalysis(holdings);
    json(res, 200, { holdings, analysis, updatedAt: new Date().toISOString() });
  } catch (error) {
    sendError(res, error);
  }
}

async function evaluateUserAlerts(rules = []) {
  const tickers = [...new Set(rules.map((rule) => rule.ticker))];
  const quoteResults = await Promise.all(tickers.map((ticker) => buildLiveQuote(ticker)));
  const quotes = Object.fromEntries(quoteResults.map((result, index) => [tickers[index], result]));

  return rules.map((rule) => {
    const stock = enrichCachedFinancialMetrics(fallbackStock(rule.ticker));
    const live = quotes[rule.ticker];
    const price = Number(live?.quote?.price) || Number(stock.price) || 0;
    const pricedStock = { ...stock, price };
    const researchScore = scoreFor(pricedStock, rule.lens, rule.risk);
    const fit = purchaseFitFor(pricedStock, researchScore, rule.risk, rule.horizon);
    const currentValue = rule.metric === "price" ? price : fit.score;
    return {
      ...evaluateAlert(rule, currentValue),
      label: alertLabel(rule),
      quoteSource: live?.quote?.quoteSource || stock.quoteSource || stock.source || "cache",
      evaluatedAt: new Date().toISOString()
    };
  });
}

function storedAlerts(alerts) {
  return alerts.map(({ label, quoteSource, evaluatedAt, ...alert }) => alert);
}

async function handleAlerts(req, res, alertId = null) {
  try {
    const user = await requireUser(req);
    let alerts = user.alerts || [];

    if (req.method === "POST") {
      if (alerts.length >= 30) throw new HttpError(400, "An account can have up to 30 alerts.");
      const body = await readBody(req);
      try {
        alerts = [...alerts, createAlertRule(body)];
      } catch (error) {
        throw new HttpError(400, error.message);
      }
    } else if (req.method === "DELETE") {
      const next = alerts.filter((alert) => alert.id !== alertId);
      if (next.length === alerts.length) throw new HttpError(404, "Alert not found.");
      alerts = next;
    }

    const evaluated = await evaluateUserAlerts(alerts);
    await storage.updateAlerts(user.id, storedAlerts(evaluated));
    json(res, 200, {
      alerts: evaluated,
      triggeredCount: evaluated.filter((alert) => alert.isTriggered).length,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    sendError(res, error);
  }
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const requested = requestPath === "/" ? "/index.html" : requestPath;
  if (!publicAssets.has(requested)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

export const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tickerMatch = url.pathname.match(/^\/api\/quote\/([^/]+)$/);
  const lookupMatch = url.pathname.match(/^\/api\/lookup\/([^/]+)$/);
  const historyMatch = url.pathname.match(/^\/api\/history\/([^/]+)$/);
  const catalystMatch = url.pathname.match(/^\/api\/catalysts\/([^/]+)$/);
  const alertMatch = url.pathname.match(/^\/api\/alerts\/([^/]+)$/);
  applySecurityHeaders(res);

  if (isRateLimited(req, url)) {
    res.setHeader("retry-after", "60");
    json(res, 429, { error: "Too many requests. Try again in one minute." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      status: "ok",
      service: "ai-stock-research-assistant",
      storage: storage.status(),
      timestamp: new Date().toISOString()
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/signup") {
    await handleSignup(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    await handleLogin(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    await handleLogout(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    await handleCurrentUser(req, res);
    return;
  }

  if ((req.method === "GET" || req.method === "PUT") && url.pathname === "/api/watchlist") {
    await handleWatchlist(req, res);
    return;
  }

  if ((req.method === "GET" || req.method === "PUT") && url.pathname === "/api/portfolio") {
    await handlePortfolio(req, res);
    return;
  }

  if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/alerts") {
    await handleAlerts(req, res);
    return;
  }

  if (req.method === "DELETE" && alertMatch) {
    await handleAlerts(req, res, decodeURIComponent(alertMatch[1]));
    return;
  }

  if (req.method === "GET" && tickerMatch) {
    const ticker = routeTicker(res, tickerMatch[1]);
    if (ticker) await handleQuote(req, res, ticker);
    return;
  }

  if (req.method === "GET" && lookupMatch) {
    const ticker = routeTicker(res, lookupMatch[1]);
    if (ticker) await handleLookup(req, res, ticker);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/live-prices") {
    await handleLivePrices(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/compare") {
    await handleComparison(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/screener") {
    await handleScreener(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/validation") {
    await handleValidation(req, res);
    return;
  }

  if (req.method === "GET" && catalystMatch) {
    const ticker = routeTicker(res, catalystMatch[1]);
    if (ticker) await handleCatalysts(req, res, ticker);
    return;
  }

  if (req.method === "GET" && historyMatch) {
    const ticker = routeTicker(res, historyMatch[1]);
    if (ticker) await handlePriceHistory(req, res, ticker);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/research") {
    await handleResearch(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    await handleChat(req, res);
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/refresh") {
    await handleRefresh(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    await serveStatic(req, res);
    return;
  }

  json(res, 405, { error: "Method not allowed" });
});

server.listen(port, () => {
  console.log(`AI Stock Research Assistant running at http://localhost:${port} with ${storageStartup.backend} storage`);
});
