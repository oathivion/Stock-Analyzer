import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
loadEnv();
const port = Number(process.env.PORT || 3000);
const cachePath = join(root, "data", "stocks.json");
const lookupCachePath = join(root, "data", "lookups.json");
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body ? JSON.parse(body) : {}));
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

function loadStockCache() {
  if (!existsSync(cachePath)) return {};
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

function loadLookupCache() {
  if (!existsSync(lookupCachePath)) return {};
  try {
    return JSON.parse(readFileSync(lookupCachePath, "utf8"));
  } catch {
    return {};
  }
}

async function saveStockCache(cache) {
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
}

async function saveLookupCache(cache) {
  await mkdir(join(root, "data"), { recursive: true });
  await writeFile(lookupCachePath, `${JSON.stringify(cache, null, 2)}\n`);
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
    "3 years": { range: "3y", interval: "1wk" }
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
      fiftyTwoWeekLow: data["52WeekLow"] || "Unavailable"
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
  const netIncomeFact = latestAnnualFact(facts.NetIncomeLoss);
  const grossProfitFact = latestAnnualFact(facts.GrossProfit);
  const assetsFact = latestInstantFact(facts.Assets);
  const liabilitiesFact = latestInstantFact(facts.Liabilities);
  const equityFact = latestInstantFact(facts.StockholdersEquity);
  const operatingCashFlowFact = latestAnnualFact(facts.NetCashProvidedByUsedInOperatingActivities);
  const operatingIncomeFact = latestAnnualFact(facts.OperatingIncomeLoss);
  const dilutedEpsFact = latestAnnualFactForUnit(facts.EarningsPerShareDiluted, "USD/shares");

  const revenue = revenueFact?.val;
  const grossProfit = grossProfitFact?.val;

  const liabilities = liabilitiesFact?.val || (assetsFact?.val && equityFact?.val ? assetsFact.val - equityFact.val : null);

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
      fiscalNetIncome: netIncomeFact?.val ? formatLargeNumber(netIncomeFact.val) : "Unavailable",
      totalAssets: assetsFact?.val ? formatLargeNumber(assetsFact.val) : "Unavailable",
      totalLiabilities: liabilities ? formatLargeNumber(liabilities) : "$0",
      stockholdersEquity: equityFact?.val ? formatLargeNumber(equityFact.val) : "Unavailable",
      operatingCashFlow: operatingCashFlowFact?.val ? formatLargeNumber(operatingCashFlowFact.val) : "Unavailable",
      operatingIncome: operatingIncomeFact?.val ? formatLargeNumber(operatingIncomeFact.val) : "$0",
      dilutedEps: dilutedEpsFact?.val ? Number(dilutedEpsFact.val) : null,
      latestFiscalPeriod: revenueFact?.fy ? `${revenueFact.fy}${revenueFact.fp ? ` ${revenueFact.fp}` : ""}` : "Unavailable",
      latestFilingDate: revenueFact?.filed || "Unavailable"
    },
    sourceItem: {
      title: "SEC EDGAR Company Facts",
      provider: "U.S. Securities and Exchange Commission",
      url,
      detail: "XBRL company facts for reported revenue, net income, assets, liabilities, equity, and operating cash flow."
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
  return concepts
    .map(latestAnnualFact)
    .filter(Boolean)
    .sort((a, b) => String(b.end).localeCompare(String(a.end)) || String(b.filed).localeCompare(String(a.filed)))[0] || null;
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

  return { stock: { ...stock, sources: dedupeSources(stock.sources) }, warnings };
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
    lens: input.lens,
    horizon: input.horizon,
    chart: generatePath(input.stock, Number(brief.score)),
    generatedBy: "openai",
    sources: input.stock.sources || [],
    context: input.stock.context || {}
  };
}

function localChat({ question, brief }) {
  const q = String(question || "").toLowerCase();
  const clean = (value) => String(value || "").replace(/[.!?]+$/, "");

  if (q.includes("valuation") || q.includes("multiple") || q.includes("pe")) {
    return `${brief.ticker} has a forward P/E marker of ${brief.pe}. With a research score of ${brief.score}, I would compare earnings growth, free cash flow conversion, and margin durability before increasing position size.`;
  }

  if (q.includes("risk") || q.includes("bear")) {
    return `The most important bear case is: ${clean(brief.risks?.[0] || "the thesis weakens if execution or demand slows")}. The next check is: ${clean(brief.risks?.[1] || "valuation sensitivity")}.`;
  }

  if (q.includes("catalyst") || q.includes("driver")) {
    return `The cleanest catalyst is: ${clean(brief.drivers?.[0] || "continued execution against growth expectations")}. I would also watch: ${clean(brief.drivers?.[1] || "margin performance")}.`;
  }

  if (q.includes("margin") || q.includes("profit")) {
    return `${brief.name}'s margin marker is ${brief.margin}. The question is whether revenue growth produces operating leverage or gets absorbed by reinvestment, pricing pressure, or competition.`;
  }

  if (q.includes("what would change") || q.includes("change the thesis")) {
    return `I would change the thesis if the next checks start failing: ${brief.checks?.slice(0, 2).map(clean).join(". ")}. The score should move down if those weaken, and up if they improve while valuation stays reasonable.`;
  }

  return `For ${brief.ticker}, I would anchor the answer in this thesis: ${brief.thesis}`;
}

async function aiChat(input) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const prompt = `You are an equity research assistant. Answer the user's question using only the brief below.

Rules:
- Be concise and practical.
- Do not provide personalized financial advice.
- Do not claim access to live news, filings, or prices beyond the provided context.
- If the user asks for a buy/sell decision, frame decision criteria instead.

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
        format: { type: "text" },
        verbosity: "low"
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI returned ${response.status}: ${detail}`);
  }

  const data = await response.json();
  return extractOutputText(data);
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
    json(res, 500, { error: error.message });
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
    const lens = url.searchParams.get("lens") || "balanced";
    const risk = Number(url.searchParams.get("risk") || 3);
    const cache = loadStockCache();
    const rows = requested.map((ticker) => {
      const base = cache[ticker] || fallbackStock(ticker);
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
        score: scoreFor(base, lens, risk),
        source: base.source || "demo"
      };
    });

    json(res, 200, {
      updatedAt: new Date().toISOString(),
      lens,
      risk,
      rows,
      warnings: []
    });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

async function handlePriceHistory(req, res, ticker) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const horizon = url.searchParams.get("horizon") || "12 months";
    const history = await fetchYahooHistory(ticker, horizon);
    json(res, 200, history);
  } catch (error) {
    json(res, 502, { error: error.message });
  }
}

async function handleResearch(req, res) {
  try {
    const body = await readBody(req);
    const ticker = normalizeTicker(body.ticker);
    const { stock, warnings } = await buildStockSnapshot(ticker);
    await saveLookupStock(stock, warnings);
    const input = {
      stock,
      lens: body.lens || "balanced",
      horizon: body.horizon || "12 months",
      risk: Number(body.risk || 3)
    };
    const brief = (await aiResearch(input)) || localResearch(input);
    json(res, 200, { brief: { ...brief, warnings } });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

async function handleChat(req, res) {
  try {
    const body = await readBody(req);
    const question = String(body.question || "").trim();
    const brief = body.brief || fallbackStock(normalizeTicker(body.ticker));

    if (!question) {
      json(res, 400, { error: "Question is required." });
      return;
    }

    const answer = (await aiChat({ question, brief })) || localChat({ question, brief });
    json(res, 200, {
      answer,
      generatedBy: process.env.OPENAI_API_KEY ? "openai" : "local"
    });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

async function handleRefresh(req, res) {
  try {
    const body = await readBody(req);
    const tickers = Array.isArray(body.tickers) && body.tickers.length ? body.tickers : supportedTickers;
    const refresh = await refreshTrustedStocks(tickers);
    json(res, 200, {
      refreshedAt: refresh.refreshedAt,
      results: refresh.results
    });
  } catch (error) {
    json(res, 500, { error: error.message });
  }
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const requested = requestPath === "/" ? "/index.html" : requestPath;
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

  if (req.method === "GET" && tickerMatch) {
    await handleQuote(req, res, normalizeTicker(tickerMatch[1]));
    return;
  }

  if (req.method === "GET" && lookupMatch) {
    await handleLookup(req, res, normalizeTicker(lookupMatch[1]));
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

  if (req.method === "GET" && historyMatch) {
    await handlePriceHistory(req, res, normalizeTicker(historyMatch[1]));
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
  console.log(`AI Stock Research Assistant running at http://localhost:${port}`);
});
