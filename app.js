const demoStocks = {
  NVDA: { name: "NVIDIA Corporation", price: 126.8, change: 2.4, marketCap: "$3.1T", pe: "38.7", revenue: "+78%", margin: "74%" },
  AAPL: { name: "Apple Inc.", price: 203.5, change: -0.7, marketCap: "$3.0T", pe: "29.4", revenue: "+3%", margin: "46%" },
  MSFT: { name: "Microsoft Corporation", price: 438.2, change: 1.1, marketCap: "$3.3T", pe: "34.2", revenue: "+16%", margin: "45%" },
  TSLA: { name: "Tesla, Inc.", price: 177.4, change: -1.9, marketCap: "$566B", pe: "58.1", revenue: "-4%", margin: "18%" },
  AMZN: { name: "Amazon.com, Inc.", price: 185.7, change: 0.8, marketCap: "$1.9T", pe: "41.5", revenue: "+12%", margin: "10%" },
  META: { name: "Meta Platforms, Inc.", price: 491.6, change: 1.7, marketCap: "$1.25T", pe: "25.8", revenue: "+21%", margin: "39%" },
  JPM: { name: "JPMorgan Chase & Co.", price: 214.1, change: 0.3, marketCap: "$610B", pe: "12.1", revenue: "+8%", margin: "32%" },
  DIS: { name: "The Walt Disney Company", price: 101.2, change: -0.4, marketCap: "$184B", pe: "20.3", revenue: "+5%", margin: "14%" }
};

const defaultWatchlist = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "JPM", "DIS"];
let activeTicker = "NVDA";
let activeBrief = null;
let currentRequest = 0;
let historyRequest = 0;

const form = document.querySelector("#researchForm");
const tickerInput = document.querySelector("#tickerInput");
const watchlistGrid = document.querySelector("#watchlistGrid");
const companyName = document.querySelector("#companyName");
const marketStrip = document.querySelector("#marketStrip");
const verdictTitle = document.querySelector("#verdictTitle");
const scorePill = document.querySelector("#scorePill");
const thesisText = document.querySelector("#thesisText");
const metricGrid = document.querySelector("#metricGrid");
const driversList = document.querySelector("#driversList");
const risksList = document.querySelector("#risksList");
const checksList = document.querySelector("#checksList");
const contextList = document.querySelector("#contextList");
const sourcesList = document.querySelector("#sourcesList");
const chart = document.querySelector("#priceChart");
const chartLabel = document.querySelector("#chartLabel");
const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const questionInput = document.querySelector("#questionInput");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");
const refreshButton = document.querySelector("#refreshButton");
const refreshStatus = document.querySelector("#refreshStatus");
const liveStatus = document.querySelector("#liveStatus");
const comparisonBody = document.querySelector("#comparisonBody");
const comparisonStatus = document.querySelector("#comparisonStatus");
const comparisonSort = document.querySelector("#comparisonSort");
const liveQuotes = {};
const liveRefreshMs = 30000;
let liveTimer = null;
let comparisonRows = [];

function getLens() {
  return new FormData(form).get("lens");
}

function getControls() {
  return {
    ticker: tickerInput.value.trim().toUpperCase() || activeTicker,
    lens: getLens(),
    horizon: document.querySelector("#horizonInput").value,
    risk: Number(document.querySelector("#riskInput").value)
  };
}

function fallbackBrief(ticker) {
  const stock = demoStocks[ticker] || {
    name: ticker,
    price: 0,
    change: 0,
    marketCap: "Not reported",
    pe: "Not reported",
    revenue: "Not reported",
    margin: "Not reported"
  };
  return {
    ticker,
    ...stock,
    score: 68,
    verdict: "Demo brief ready",
    thesis:
      "The backend is reachable when served through Node. This fallback brief keeps the interface usable if the server is offline or a research request fails.",
    drivers: ["Durable business quality is the first item to validate.", "Revenue growth should be compared against valuation.", "Cash conversion matters more as the holding period lengthens."],
    risks: ["Live API data may be unavailable without configured keys.", "Valuation can compress if growth expectations cool.", "Company-specific risks need source-backed research before investing."],
    checks: ["Start the Node server for API-backed briefs.", "Add API keys in the environment for live quote and AI generation.", "Verify the latest filings and earnings transcript before making decisions."],
    chart: generateLocalPath(stock.price, 68),
    generatedBy: "browser fallback",
    source: "demo",
    quoteSource: "Browser fallback",
    quoteUpdatedAt: "Unavailable",
    context: {
      sector: "Unavailable",
      industry: "Unavailable",
      analystTargetPrice: "Unavailable",
      dividendYield: "Unavailable",
      fiftyTwoWeekHigh: "Unavailable",
      fiftyTwoWeekLow: "Unavailable",
      description: "Run the Node backend to enrich this symbol with source-backed fundamentals and market data."
    },
    sources: [
      {
        title: "Browser fallback profile",
        provider: "Demo data",
        detail: "Shown when the backend cannot be reached from the page."
      }
    ]
  };
}

function formatClock(value) {
  if (!value || value === "Unavailable") return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function generateLocalPath(price, score) {
  const series = [];
  let value = price * 0.82;
  for (let i = 0; i < 42; i += 1) {
    value += price * ((score - 58) / 1700) + Math.sin(i * 0.55) * price * 0.004;
    series.push(Number(Math.max(price * 0.55, value).toFixed(2)));
  }
  return series;
}

async function requestResearch() {
  const controls = getControls();
  const requestId = ++currentRequest;
  setLoading(true);

  try {
    if (!defaultWatchlist.includes(controls.ticker)) {
      const lookupResponse = await fetch(`/api/lookup/${encodeURIComponent(controls.ticker)}`);
      if (!lookupResponse.ok) throw new Error(`Ticker lookup failed with ${lookupResponse.status}.`);
      const lookupData = await lookupResponse.json();
      if (requestId !== currentRequest) return;
      const stock = lookupData.stock;
      activeTicker = stock.ticker;
      tickerInput.value = activeTicker;
      render({
        ...fallbackBrief(stock.ticker),
        ...stock,
        lens: controls.lens,
        horizon: controls.horizon,
        score: stock.score || 65,
        verdict: stock.verdict || "Source-backed lookup ready",
        thesis: stock.thesis || `${stock.name} has been loaded with current market, SEC, and Nasdaq data.`,
        chart: generateLocalPath(stock.price, stock.score || 65)
      });
      requestPriceHistory(stock.ticker, controls.horizon);
      verdictTitle.textContent = "Generating research brief...";
    }

    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(controls)
    });

    if (!response.ok) throw new Error(`Research request failed with ${response.status}.`);
    const data = await response.json();
    if (!data.brief) throw new Error("Research response was empty.");
    if (requestId !== currentRequest) return;

    activeTicker = data.brief.ticker;
    tickerInput.value = activeTicker;
    render(data.brief);
    requestPriceHistory(data.brief.ticker, controls.horizon);
  } catch (error) {
    if (requestId !== currentRequest) return;
    const brief = fallbackBrief(controls.ticker);
    brief.warning = error.message;
    activeTicker = brief.ticker;
    tickerInput.value = activeTicker;
    render(brief);
  } finally {
    if (requestId === currentRequest) setLoading(false);
  }
}

function setLoading(isLoading) {
  form.classList.toggle("is-loading", isLoading);
  copyButton.disabled = isLoading;
  downloadButton.disabled = isLoading;
  if (isLoading && defaultWatchlist.includes(getControls().ticker)) {
    verdictTitle.textContent = "Researching...";
    thesisText.textContent = "Gathering quote data, applying your research lens, and drafting the brief.";
  }
}

function renderWatchlist() {
  watchlistGrid.innerHTML = "";
  defaultWatchlist.forEach((ticker) => {
    const stock = demoStocks[ticker];
    const live = liveQuotes[ticker];
    const change = live?.change ?? stock.change;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `watch-button${ticker === activeTicker ? " active" : ""}`;
    button.innerHTML = `
      <strong>${ticker}</strong>
      <span>${stock.name}</span>
      <b class="${change >= 0 ? "gain" : "loss"}">${change >= 0 ? "+" : ""}${change}%</b>
    `;
    button.addEventListener("click", () => {
      activeTicker = ticker;
      tickerInput.value = ticker;
      requestResearch();
    });
    watchlistGrid.appendChild(button);
  });
}

function numericValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function renderComparison() {
  const sortKey = comparisonSort.value;
  const rows = [...comparisonRows].sort((a, b) => numericValue(b[sortKey]) - numericValue(a[sortKey]));
  comparisonBody.innerHTML = "";

  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.className = `comparison-row${row.ticker === activeTicker ? " active" : ""}`;
    tr.tabIndex = 0;
    tr.innerHTML = `
      <td class="company-cell"><strong>${escapeHtml(row.ticker)}</strong><span>${escapeHtml(row.name)}</span></td>
      <td>$${Number(row.price).toFixed(2)}</td>
      <td class="${row.change >= 0 ? "gain" : "loss"}">${row.change >= 0 ? "+" : ""}${Number(row.change).toFixed(2)}%</td>
      <td>${escapeHtml(row.marketCap)}</td>
      <td>${escapeHtml(row.pe)}</td>
      <td>${escapeHtml(row.revenue)}</td>
      <td>${escapeHtml(row.margin)}</td>
      <td class="table-score">${row.score}</td>
    `;
    const selectRow = () => {
      activeTicker = row.ticker;
      tickerInput.value = row.ticker;
      requestResearch();
    };
    tr.addEventListener("click", selectRow);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRow();
      }
    });
    comparisonBody.appendChild(tr);
  });
}

async function requestComparison() {
  comparisonStatus.textContent = "Updating live peer comparison...";
  const controls = getControls();

  try {
    const params = new URLSearchParams({
      tickers: defaultWatchlist.join(","),
      lens: controls.lens,
      risk: String(controls.risk)
    });
    const response = await fetch(`/api/compare?${params}`);
    if (!response.ok) throw new Error(`Comparison request failed with ${response.status}.`);
    const data = await response.json();
    comparisonRows = data.rows || [];
    renderComparison();
    comparisonStatus.textContent = `${controls.lens} lens - updated ${formatClock(data.updatedAt)}`;
  } catch (error) {
    comparisonStatus.textContent = `Comparison unavailable: ${error.message}`;
  }
}

function renderList(target, items) {
  target.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    target.appendChild(li);
  });
}

function renderMarketStrip(brief) {
  const sourceLabel = brief.quoteSource || (brief.generatedBy === "openai" ? "OpenAI brief" : `${brief.source || "demo"} data`);
  const values = [
    ["Last price", `$${Number(brief.price).toFixed(2)}`],
    ["Today", `${brief.change >= 0 ? "+" : ""}${brief.change}%`, brief.change >= 0 ? "gain" : "loss"],
    ["Market cap", brief.marketCap],
    ["Quote source", sourceLabel],
    ["Quote time", formatClock(brief.quoteUpdatedAt)]
  ];

  marketStrip.innerHTML = values
    .map(([label, value, className]) => `<div class="market-card"><span>${label}</span><strong class="${className || ""}">${value}</strong></div>`)
    .join("");
}

function renderMetrics(brief) {
  const values = [
    ["Revenue", brief.revenue],
    ["Gross margin", brief.margin],
    ["Sector", brief.context?.sector || "Unavailable"],
    ["Industry", brief.context?.industry || "Unavailable"]
  ];

  metricGrid.innerHTML = values
    .map(([label, value]) => `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderContext(brief) {
  const context = brief.context || {};
  const values = [
    ["Analyst target", context.analystTargetPrice || "Unavailable"],
    ["Dividend yield", context.dividendYield || "Unavailable"],
    ["52W high", context.fiftyTwoWeekHigh || "Unavailable"],
    ["52W low", context.fiftyTwoWeekLow || "Unavailable"],
    ["SEC revenue", context.fiscalRevenue || "Unavailable"],
    ["SEC net income", context.fiscalNetIncome || "Unavailable"],
    ["Assets", context.totalAssets || "Unavailable"],
    ["Liabilities", context.totalLiabilities || "Unavailable"],
    ["Operating cash flow", context.operatingCashFlow || "Unavailable"],
    ["Latest filing", context.latestFilingDate || "Unavailable"],
    ["Lens", brief.lens || getLens()],
    ["Horizon", brief.horizon || document.querySelector("#horizonInput").value]
  ];

  contextList.innerHTML = `
    <p>${escapeHtml(context.description || "Company profile context is unavailable.")}</p>
    <div class="context-metrics">
      ${values.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("")}
    </div>
  `;
}

function renderSources(brief) {
  const sources = brief.sources?.length
    ? brief.sources
    : [{ title: "No external source available", provider: "Local fallback", detail: "Configure API keys to add source-backed context." }];
  const warnings = brief.warnings?.length ? brief.warnings : [];

  sourcesList.innerHTML = [
    ...sources.slice(0, 7).map((source) => {
      const safeTitle = escapeHtml(source.title);
      const safeUrl = encodeURI(String(source.url || ""));
      const title = source.url
        ? `<a href="${safeUrl}" target="_blank" rel="noreferrer">${safeTitle}</a>`
        : `<strong>${safeTitle}</strong>`;
      return `<div class="source-item">${title}<span>${escapeHtml(source.provider || "Unknown source")}</span><p>${escapeHtml(source.detail || "")}</p></div>`;
    }),
    ...warnings.map((warning) => `<div class="source-item warning"><strong>Provider warning</strong><span>Runtime</span><p>${escapeHtml(warning)}</p></div>`)
  ].join("");
}

function drawChart(brief) {
  const ctx = chart.getContext("2d");
  const width = chart.width;
  const height = chart.height;
  const pad = 34;
  const series = brief.chart?.length ? brief.chart : generateLocalPath(brief.price, brief.score);
  const min = Math.min(...series);
  const max = Math.max(...series);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#dce2dd";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = pad + ((height - pad * 2) / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }

  const xFor = (index) => pad + (index / (series.length - 1)) * (width - pad * 2);
  const yFor = (value) => height - pad - ((value - min) / (max - min || 1)) * (height - pad * 2);
  const gradient = ctx.createLinearGradient(0, pad, 0, height - pad);
  gradient.addColorStop(0, "rgba(31, 138, 91, 0.26)");
  gradient.addColorStop(1, "rgba(31, 138, 91, 0)");

  ctx.beginPath();
  series.forEach((value, index) => {
    const x = xFor(index);
    const y = yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(width - pad, height - pad);
  ctx.lineTo(pad, height - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  series.forEach((value, index) => {
    const x = xFor(index);
    const y = yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#1f8a5b";
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.fillStyle = "#17211b";
  ctx.font = "700 18px Inter, sans-serif";
  ctx.fillText(`$${series.at(-1).toFixed(2)}`, width - 124, pad + 18);

  if (brief.chartDates?.length) {
    const firstDate = new Date(brief.chartDates[0] * 1000);
    const lastDate = new Date(brief.chartDates.at(-1) * 1000);
    const dateFormat = new Intl.DateTimeFormat([], { month: "short", day: "numeric", year: "2-digit" });
    ctx.fillStyle = "#65716a";
    ctx.font = "600 12px Inter, sans-serif";
    ctx.fillText(dateFormat.format(firstDate), pad, height - 8);
    const lastLabel = dateFormat.format(lastDate);
    const labelWidth = ctx.measureText(lastLabel).width;
    ctx.fillText(lastLabel, width - pad - labelWidth, height - 8);
  }

  chartLabel.textContent = brief.chartSource
    ? `${brief.horizon || "12 months"} history - ${brief.chartSource}`
    : `${brief.horizon || "12 months"} estimate`;
}

async function requestPriceHistory(ticker, horizon) {
  const requestId = ++historyRequest;
  chartLabel.textContent = `Loading ${horizon} history...`;

  try {
    const response = await fetch(`/api/history/${encodeURIComponent(ticker)}?horizon=${encodeURIComponent(horizon)}`);
    if (!response.ok) throw new Error(`History request failed with ${response.status}.`);
    const data = await response.json();
    if (requestId !== historyRequest || activeTicker !== ticker) return;

    const closes = data.points?.map((point) => point.close).filter(Number.isFinite) || [];
    if (!closes.length) throw new Error("Historical price response was empty.");

    if (activeBrief?.ticker === ticker) {
      closes[closes.length - 1] = Number(activeBrief.price);
      activeBrief = {
        ...activeBrief,
        chart: closes,
        chartDates: data.points.map((point) => point.timestamp),
        chartSource: data.source,
        chartInterval: data.interval
      };
      drawChart(activeBrief);
    }
  } catch (error) {
    if (requestId === historyRequest) {
      chartLabel.textContent = `${horizon} estimate - history unavailable`;
    }
  }
}

function resetChat(brief) {
  chatLog.innerHTML = "";
  const qualifier = brief.warning ? ` I also hit this API issue: ${brief.warning}` : "";
  addMessage("ai", `I built a ${brief.lens || getLens()} brief for ${brief.ticker}.${qualifier} Ask me to pressure-test valuation, catalysts, margin risk, or what would change the thesis.`);
}

function addMessage(role, text) {
  const message = document.createElement("div");
  message.className = `message ${role}`;
  message.textContent = text;
  chatLog.appendChild(message);
  chatLog.scrollTop = chatLog.scrollHeight;
  return message;
}

async function askAssistant(question) {
  const pending = addMessage("ai", "Thinking...");
  questionInput.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question,
        ticker: activeTicker,
        brief: activeBrief
      })
    });

    if (!response.ok) throw new Error(`Chat request failed with ${response.status}.`);
    const data = await response.json();
    pending.textContent = data.answer || "I could not generate a response for that question.";
  } catch (error) {
    pending.textContent = `I could not reach the chat endpoint, so here is the practical fallback: ${activeBrief.thesis}`;
  } finally {
    questionInput.disabled = false;
    questionInput.focus();
    chatLog.scrollTop = chatLog.scrollHeight;
  }
}

async function refreshTrustedData() {
  refreshButton.disabled = true;
  refreshStatus.textContent = "Refreshing supported stocks from trusted sources...";

  try {
    const response = await fetch("/api/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tickers: defaultWatchlist })
    });

    if (!response.ok) throw new Error(`Refresh failed with ${response.status}.`);
    const data = await response.json();
    const refreshed = data.results?.length || 0;
    const warningCount = data.results?.reduce((count, item) => count + (item.warnings?.length || 0), 0) || 0;
    refreshStatus.textContent = `Refreshed ${refreshed} stocks. ${warningCount ? `${warningCount} provider warnings.` : "No provider warnings."}`;
    requestResearch();
    requestComparison();
  } catch (error) {
    refreshStatus.textContent = `Refresh failed: ${error.message}`;
  } finally {
    refreshButton.disabled = false;
  }
}

function applyLiveQuote(quote) {
  if (!quote || !quote.ticker) return;
  liveQuotes[quote.ticker] = quote;

  if (activeBrief?.ticker === quote.ticker) {
    const existingChart = activeBrief.chart?.length ? [...activeBrief.chart] : null;
    if (existingChart && activeBrief.chartSource) {
      existingChart[existingChart.length - 1] = Number(quote.price);
    }
    activeBrief = {
      ...activeBrief,
      price: quote.price,
      change: quote.change,
      quoteSource: quote.quoteSource,
      quoteUpdatedAt: quote.quoteUpdatedAt,
      chart: existingChart && activeBrief.chartSource ? existingChart : generateLocalPath(quote.price, activeBrief.score)
    };
    renderMarketStrip(activeBrief);
    drawChart(activeBrief);
  }
}

async function refreshLivePrices() {
  try {
    const requestedTickers = [...new Set([...defaultWatchlist, activeTicker])];
    const response = await fetch(`/api/live-prices?tickers=${requestedTickers.join(",")}`);
    if (!response.ok) throw new Error(`Live price request failed with ${response.status}.`);
    const data = await response.json();
    data.quotes?.forEach(applyLiveQuote);
    renderWatchlist();
    if (comparisonRows.length) {
      comparisonRows = comparisonRows.map((row) => ({ ...row, ...(liveQuotes[row.ticker] || {}) }));
      renderComparison();
    }
    const warningCount = data.warnings?.length || 0;
    liveStatus.textContent = `Live prices updated ${formatClock(data.updatedAt)}${warningCount ? ` with ${warningCount} warning${warningCount === 1 ? "" : "s"}` : ""}`;
  } catch (error) {
    liveStatus.textContent = `Live price update failed: ${error.message}`;
  }
}

function startLivePrices() {
  refreshLivePrices();
  window.clearInterval(liveTimer);
  liveTimer = window.setInterval(refreshLivePrices, liveRefreshMs);
}

function briefText() {
  const brief = activeBrief || fallbackBrief(activeTicker);
  return `${brief.name} (${brief.ticker})
Calculation price: $${Number(brief.price).toFixed(2)}
Quote source: ${brief.quoteSource || brief.source || "Local fallback"}
Quote time: ${brief.quoteUpdatedAt || "Unavailable"}
Score: ${brief.score}
Verdict: ${brief.verdict}

${brief.thesis}

Key drivers:
- ${brief.drivers.join("\n- ")}

Risks:
- ${brief.risks.join("\n- ")}

Next checks:
- ${brief.checks.join("\n- ")}

Sources:
- ${(brief.sources || []).map((source) => `${source.provider || "Source"}: ${source.title}`).join("\n- ") || "Local fallback"}`;
}

function render(brief) {
  activeBrief = brief;
  companyName.textContent = brief.name;
  verdictTitle.textContent = brief.verdict;
  scorePill.textContent = brief.score;
  thesisText.textContent = brief.thesis;
  renderMarketStrip(brief);
  renderMetrics(brief);
  renderList(driversList, brief.drivers);
  renderList(risksList, brief.risks);
  renderList(checksList, brief.checks);
  renderContext(brief);
  renderSources(brief);
  drawChart(brief);
  renderWatchlist();
  renderComparison();
  resetChat(brief);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  requestResearch();
});

form.addEventListener("change", () => {
  requestResearch();
  requestComparison();
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = questionInput.value.trim();
  if (!question || !activeBrief) return;
  addMessage("user", question);
  questionInput.value = "";
  askAssistant(question);
});

copyButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(briefText());
});

downloadButton.addEventListener("click", () => {
  const blob = new Blob([briefText()], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${activeTicker}-research-brief.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
});

document.querySelector("#resetButton").addEventListener("click", () => {
  activeTicker = "NVDA";
  tickerInput.value = activeTicker;
  document.querySelector('input[name="lens"][value="balanced"]').checked = true;
  document.querySelector("#horizonInput").value = "12 months";
  document.querySelector("#riskInput").value = "3";
  requestResearch();
});

refreshButton.addEventListener("click", refreshTrustedData);
comparisonSort.addEventListener("change", renderComparison);

render(fallbackBrief(activeTicker));
requestResearch();
requestComparison();
startLivePrices();
