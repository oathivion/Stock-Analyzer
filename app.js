import { calculatePurchaseFit as scorePurchaseFit } from "./scoring.js";

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

const coreWatchlist = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "JPM", "DIS"];
let displayedWatchlist = [...coreWatchlist];
let currentUser = null;
let authMode = "login";
let portfolioHoldings = [];
let alertRules = [];
let activeTicker = "NVDA";
let activeBrief = null;
let currentRequest = 0;
let historyRequest = 0;
let catalystRequest = 0;
let catalystEvents = [];

const form = document.querySelector("#researchForm");
const tickerInput = document.querySelector("#tickerInput");
const watchlistGrid = document.querySelector("#watchlistGrid");
const companyName = document.querySelector("#companyName");
const marketStrip = document.querySelector("#marketStrip");
const verdictTitle = document.querySelector("#verdictTitle");
const scorePill = document.querySelector("#scorePill");
const purchaseScore = document.querySelector("#purchaseScore");
const purchaseLabel = document.querySelector("#purchaseLabel");
const purchaseDescription = document.querySelector("#purchaseDescription");
const purchaseComponents = document.querySelector("#purchaseComponents");
const thesisText = document.querySelector("#thesisText");
const metricGrid = document.querySelector("#metricGrid");
const driversList = document.querySelector("#driversList");
const risksList = document.querySelector("#risksList");
const checksList = document.querySelector("#checksList");
const fundamentalsGrid = document.querySelector("#fundamentalsGrid");
const fundamentalsStatus = document.querySelector("#fundamentalsStatus");
const screenerForm = document.querySelector("#screenerForm");
const screenerStatus = document.querySelector("#screenerStatus");
const screenerBody = document.querySelector("#screenerBody");
const screenSector = document.querySelector("#screenSector");
const catalystStatus = document.querySelector("#catalystStatus");
const catalystTimeline = document.querySelector("#catalystTimeline");
const catalystFilter = document.querySelector("#catalystFilter");
const validationStatus = document.querySelector("#validationStatus");
const validationSummary = document.querySelector("#validationSummary");
const validationNotice = document.querySelector("#validationNotice");
const validationTierBody = document.querySelector("#validationTierBody");
const validationStockBody = document.querySelector("#validationStockBody");
const runValidationButton = document.querySelector("#runValidationButton");
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
const accountButton = document.querySelector("#accountButton");
const accountLabel = document.querySelector("#accountLabel");
const accountEmail = document.querySelector("#accountEmail");
const saveTickerButton = document.querySelector("#saveTickerButton");
const authDialog = document.querySelector("#authDialog");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authStatus = document.querySelector("#authStatus");
const authSubmitButton = document.querySelector("#authSubmitButton");
const authModeButton = document.querySelector("#authModeButton");
const holdingForm = document.querySelector("#holdingForm");
const holdingTicker = document.querySelector("#holdingTicker");
const holdingShares = document.querySelector("#holdingShares");
const holdingCost = document.querySelector("#holdingCost");
const portfolioStatus = document.querySelector("#portfolioStatus");
const portfolioSummary = document.querySelector("#portfolioSummary");
const sectorAllocation = document.querySelector("#sectorAllocation");
const portfolioBody = document.querySelector("#portfolioBody");
const alertForm = document.querySelector("#alertForm");
const alertTicker = document.querySelector("#alertTicker");
const alertMetric = document.querySelector("#alertMetric");
const alertOperator = document.querySelector("#alertOperator");
const alertThreshold = document.querySelector("#alertThreshold");
const alertsStatus = document.querySelector("#alertsStatus");
const alertsBody = document.querySelector("#alertsBody");
const refreshAlertsButton = document.querySelector("#refreshAlertsButton");
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
    if (!coreWatchlist.includes(controls.ticker)) {
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
  if (isLoading && coreWatchlist.includes(getControls().ticker)) {
    verdictTitle.textContent = "Researching...";
    thesisText.textContent = "Gathering quote data, applying your research lens, and drafting the brief.";
  }
}

function renderWatchlist() {
  watchlistGrid.innerHTML = "";
  displayedWatchlist.forEach((ticker) => {
    const stock = demoStocks[ticker] || (activeBrief?.ticker === ticker ? activeBrief : { name: "Saved stock", change: 0 });
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

function renderAccount() {
  accountLabel.textContent = currentUser ? "Personal watchlist" : "Guest watchlist";
  accountEmail.textContent = currentUser?.email || "Not signed in";
  accountButton.textContent = currentUser ? "Sign out" : "Sign in";
  saveTickerButton.textContent = displayedWatchlist.includes(activeTicker) ? "Remove stock" : "Save stock";
  saveTickerButton.disabled = !currentUser;
  saveTickerButton.title = currentUser ? "Update saved watchlist" : "Sign in to save stocks";
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function setPortfolioEnabled(enabled) {
  [...holdingForm.elements].forEach((element) => { element.disabled = !enabled; });
}

function setAlertsEnabled(enabled) {
  [...alertForm.elements].forEach((element) => { element.disabled = !enabled; });
  refreshAlertsButton.disabled = !enabled;
}

function alertValue(rule) {
  if (!Number.isFinite(rule.currentValue)) return "Unavailable";
  return rule.metric === "price" ? money(rule.currentValue) : `${rule.currentValue} / 100`;
}

function renderAlerts(data = null) {
  if (!currentUser) {
    setAlertsEnabled(false);
    alertRules = [];
    alertsStatus.textContent = "Sign in to monitor price and Purchase Fit thresholds.";
    alertsBody.innerHTML = '<tr><td colspan="6">Sign in to create alerts.</td></tr>';
    return;
  }

  setAlertsEnabled(true);
  const triggeredCount = data?.triggeredCount ?? alertRules.filter((alert) => alert.isTriggered).length;
  alertsStatus.textContent = alertRules.length
    ? `${alertRules.length} active rule${alertRules.length === 1 ? "" : "s"}; ${triggeredCount} currently triggered.`
    : "Create a price or Purchase Fit rule for any researched stock.";
  if (!alertRules.length) {
    alertsBody.innerHTML = '<tr><td colspan="6">No alerts created yet.</td></tr>';
    return;
  }

  alertsBody.innerHTML = alertRules.map((rule) => {
    const settings = rule.metric === "purchaseScore" ? `${rule.lens}, risk ${rule.risk}, ${rule.horizon}` : rule.quoteSource || "Current quote";
    return `<tr class="${rule.isTriggered ? "alert-triggered" : ""}">
      <td class="company-cell"><strong>${escapeHtml(rule.ticker)}</strong><span>${escapeHtml(rule.quoteSource || "Market data")}</span></td>
      <td>${escapeHtml(rule.label)}</td>
      <td>${escapeHtml(alertValue(rule))}</td>
      <td>${escapeHtml(settings)}</td>
      <td><span class="alert-state ${rule.isTriggered ? "triggered" : "watching"}">${rule.isTriggered ? "Triggered" : "Watching"}</span></td>
      <td><button class="remove-alert" type="button" data-alert-id="${escapeHtml(rule.id)}" title="Remove alert" aria-label="Remove alert">&times;</button></td>
    </tr>`;
  }).join("");
}

async function loadAlerts(silent = false) {
  if (!currentUser) {
    renderAlerts();
    return;
  }
  try {
    if (!silent) alertsStatus.textContent = "Evaluating alerts with current market data...";
    const data = await apiRequest("/api/alerts");
    alertRules = data.alerts || [];
    currentUser.alertCount = alertRules.length;
    renderAlerts(data);
  } catch (error) {
    if (!silent) alertsStatus.textContent = `Alerts unavailable: ${error.message}`;
  }
}

function renderPortfolio(data = null) {
  const analysis = data?.analysis;
  if (!currentUser) {
    setPortfolioEnabled(false);
    portfolioStatus.textContent = "Sign in to save holdings and analyze allocation.";
    portfolioSummary.innerHTML = "";
    sectorAllocation.innerHTML = "";
    portfolioBody.innerHTML = '<tr><td colspan="8">Your saved portfolio will appear here.</td></tr>';
    return;
  }

  setPortfolioEnabled(true);
  if (!analysis?.rows?.length) {
    portfolioStatus.textContent = "Add your first holding to begin portfolio analysis.";
    portfolioSummary.innerHTML = "";
    sectorAllocation.innerHTML = "";
    portfolioBody.innerHTML = '<tr><td colspan="8">No holdings saved yet.</td></tr>';
    return;
  }

  const summary = analysis.summary;
  const gainClass = summary.gainLoss >= 0 ? "gain" : "loss";
  portfolioStatus.textContent = `${analysis.rows.length} holding${analysis.rows.length === 1 ? "" : "s"} analyzed using current available quotes.`;
  portfolioSummary.innerHTML = [
    ["Portfolio value", money(summary.totalValue), ""],
    ["Cost basis", money(summary.totalCost), ""],
    ["Unrealized gain/loss", `${money(summary.gainLoss)} (${summary.gainLossPercent >= 0 ? "+" : ""}${summary.gainLossPercent.toFixed(2)}%)`, gainClass],
    ["Weighted risk", `${summary.weightedRisk.toFixed(1)} / 5`, ""],
    ["Concentration", `${summary.concentrationLabel}${summary.largestPosition ? ` (${summary.largestPosition.ticker} ${summary.largestPosition.allocation}%)` : ""}`, ""]
  ].map(([label, value, className]) => `<div class="portfolio-stat"><span>${label}</span><strong class="${className}">${escapeHtml(value)}</strong></div>`).join("");
  sectorAllocation.innerHTML = analysis.sectors
    .map((sector) => `<div class="allocation-item"><strong>${escapeHtml(sector.sector)}</strong> ${sector.allocation}%</div>`)
    .join("");
  portfolioBody.innerHTML = analysis.rows.map((row) => `
    <tr>
      <td class="company-cell"><strong>${escapeHtml(row.ticker)}</strong><span>${escapeHtml(row.name)}</span></td>
      <td>${row.shares}</td>
      <td>${money(row.price)}</td>
      <td>${money(row.marketValue)}</td>
      <td>${row.allocation}%</td>
      <td class="${row.gainLoss >= 0 ? "gain" : "loss"}">${money(row.gainLoss)} (${row.gainLossPercent >= 0 ? "+" : ""}${row.gainLossPercent.toFixed(2)}%)</td>
      <td>${row.riskLevel}/5</td>
      <td><button class="remove-holding" type="button" data-ticker="${escapeHtml(row.ticker)}" title="Remove ${escapeHtml(row.ticker)}" aria-label="Remove ${escapeHtml(row.ticker)}">&times;</button></td>
    </tr>
  `).join("");
}

async function loadPortfolio() {
  if (!currentUser) {
    portfolioHoldings = [];
    renderPortfolio();
    return;
  }
  try {
    portfolioStatus.textContent = "Updating portfolio quotes...";
    const data = await apiRequest("/api/portfolio");
    portfolioHoldings = data.holdings || [];
    currentUser.portfolio = portfolioHoldings;
    renderPortfolio(data);
  } catch (error) {
    portfolioStatus.textContent = `Portfolio unavailable: ${error.message}`;
  }
}

async function savePortfolio(holdings) {
  const data = await apiRequest("/api/portfolio", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ holdings })
  });
  portfolioHoldings = data.holdings;
  currentUser.portfolio = data.holdings;
  renderPortfolio(data);
}

function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  authTitle.textContent = signup ? "Create account" : "Sign in";
  authSubmitButton.textContent = signup ? "Create account" : "Sign in";
  authModeButton.textContent = signup ? "Use an existing account" : "Create an account";
  authPassword.autocomplete = signup ? "new-password" : "current-password";
  authStatus.textContent = "";
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed with ${response.status}.`);
  return data;
}

async function loadAccount() {
  try {
    const data = await apiRequest("/api/auth/me");
    currentUser = data.user;
    displayedWatchlist = currentUser?.watchlist?.length ? [...currentUser.watchlist] : [...coreWatchlist];
  } catch {
    currentUser = null;
    displayedWatchlist = [...coreWatchlist];
  }
  renderAccount();
  renderWatchlist();
  await loadPortfolio();
  await loadAlerts();
}

async function submitAuth() {
  authStatus.textContent = "";
  authSubmitButton.disabled = true;
  try {
    const data = await apiRequest(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: authEmail.value, password: authPassword.value })
    });
    currentUser = data.user;
    displayedWatchlist = currentUser.watchlist?.length ? [...currentUser.watchlist] : [...coreWatchlist];
    authDialog.close();
    authForm.reset();
    renderAccount();
    renderWatchlist();
    await loadPortfolio();
    await loadAlerts();
    requestComparison();
    refreshLivePrices();
  } catch (error) {
    authStatus.textContent = error.message;
  } finally {
    authSubmitButton.disabled = false;
  }
}

async function signOut() {
  await apiRequest("/api/auth/logout", { method: "POST" });
  currentUser = null;
  displayedWatchlist = [...coreWatchlist];
  portfolioHoldings = [];
  alertRules = [];
  renderAccount();
  renderWatchlist();
  renderPortfolio();
  renderAlerts();
  requestComparison();
  refreshLivePrices();
}

async function toggleSavedTicker() {
  if (!currentUser) return;
  const exists = displayedWatchlist.includes(activeTicker);
  if (exists && displayedWatchlist.length === 1) {
    refreshStatus.textContent = "Keep at least one stock in your saved watchlist.";
    return;
  }
  const next = exists
    ? displayedWatchlist.filter((ticker) => ticker !== activeTicker)
    : [...displayedWatchlist, activeTicker].slice(0, 30);

  saveTickerButton.disabled = true;
  try {
    const data = await apiRequest("/api/watchlist", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tickers: next })
    });
    displayedWatchlist = data.tickers;
    currentUser.watchlist = data.tickers;
    refreshStatus.textContent = exists ? `${activeTicker} removed from your watchlist.` : `${activeTicker} saved to your watchlist.`;
    renderAccount();
    renderWatchlist();
    requestComparison();
    refreshLivePrices();
  } catch (error) {
    refreshStatus.textContent = `Watchlist update failed: ${error.message}`;
  } finally {
    saveTickerButton.disabled = false;
  }
}

function numericValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function calculatePurchaseFit(brief) {
  const controls = getControls();
  return scorePurchaseFit({
    researchScore: brief.score,
    growthPercent: brief.context?.revenueGrowthPercent,
    price: brief.price,
    fiftyTwoWeekHigh: brief.context?.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: brief.context?.fiftyTwoWeekLow,
    pe: brief.pe,
    selectedRisk: controls.risk,
    horizon: controls.horizon
  });
}

function renderPurchaseFit(brief) {
  const suppliedFit = brief.purchaseFit;
  const fit = suppliedFit?.componentDetails ? suppliedFit : calculatePurchaseFit(brief);
  purchaseScore.textContent = fit.score;
  purchaseLabel.textContent = fit.label;
  purchaseDescription.textContent = `${fit.explanation} Estimated risk ${fit.estimatedRiskLevel}/5 versus selected ${fit.selectedRisk}/5. Research fit only, not a recommendation.`;
  purchaseComponents.innerHTML = (fit.componentDetails || [])
    .map((component) => `<div class="purchase-component"><span>${escapeHtml(component.label)} ${Math.round(component.weight * 100)}%</span><strong>${component.score} <small>+${component.contribution.toFixed(1)}</small></strong></div>`)
    .join("");
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
      <td class="table-score">${row.purchaseFit?.score ?? "--"}</td>
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
      tickers: displayedWatchlist.join(","),
      lens: controls.lens,
      risk: String(controls.risk),
      horizon: controls.horizon
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

function screenerParams() {
  const controls = getControls();
  return new URLSearchParams({
    query: document.querySelector("#screenQuery").value.trim(),
    sector: screenSector.value,
    minGrowth: document.querySelector("#screenGrowth").value,
    maxPe: document.querySelector("#screenPe").value,
    minMarketCap: document.querySelector("#screenMarketCap").value,
    maxRisk: document.querySelector("#screenRisk").value,
    minScore: document.querySelector("#screenScore").value,
    minPurchaseScore: document.querySelector("#screenPurchase").value,
    sort: document.querySelector("#screenSort").value,
    lens: controls.lens,
    risk: String(controls.risk),
    horizon: controls.horizon
  });
}

function renderScreener(rows) {
  if (!rows.length) {
    screenerBody.innerHTML = '<tr><td colspan="10">No cached stocks match these filters.</td></tr>';
    return;
  }
  screenerBody.innerHTML = rows.map((row) => `
    <tr class="screener-row" tabindex="0" data-ticker="${escapeHtml(row.ticker)}">
      <td class="company-cell"><strong>${escapeHtml(row.ticker)}</strong><span>${escapeHtml(row.name)}</span></td>
      <td>${escapeHtml(row.sector)}</td>
      <td>$${Number(row.price).toFixed(2)}</td>
      <td>${escapeHtml(row.marketCap)}</td>
      <td class="${row.growthPercent >= 0 ? "gain" : "loss"}">${row.growthPercent >= 0 ? "+" : ""}${Number(row.growthPercent).toFixed(1)}%</td>
      <td>${Number.isFinite(Number(row.pe)) ? Number(row.pe).toFixed(1) : "--"}</td>
      <td>${escapeHtml(row.margin)}</td>
      <td>${row.riskLevel}/5</td>
      <td class="table-score">${row.score}</td>
      <td class="table-score">${row.purchaseScore}</td>
    </tr>
  `).join("");
}

async function requestScreener() {
  screenerStatus.textContent = "Applying discovery filters...";
  try {
    const data = await apiRequest(`/api/screener?${screenerParams()}`);
    const currentSector = screenSector.value;
    screenSector.innerHTML = '<option value="all">All sectors</option>'
      + data.sectors.map((sector) => `<option value="${escapeHtml(sector)}">${escapeHtml(sector)}</option>`).join("");
    screenSector.value = data.sectors.includes(currentSector) ? currentSector : "all";
    renderScreener(data.rows || []);
    screenerStatus.textContent = `${data.resultCount} of ${data.universeSize} trusted stocks match. Updated ${formatClock(data.updatedAt)}.`;
  } catch (error) {
    screenerStatus.textContent = `Screener unavailable: ${error.message}`;
  }
}

function percentValue(value) {
  if (!Number.isFinite(Number(value))) return "--";
  const number = Number(value);
  return `${number >= 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function correlationLabel(value) {
  if (!Number.isFinite(Number(value))) return "Pending";
  const absolute = Math.abs(Number(value));
  return absolute >= 0.6 ? "Strong" : absolute >= 0.3 ? "Moderate" : "Weak";
}

function renderValidation(data) {
  const retrospective = data.retrospective;
  const forward = data.forward;
  const correlations = retrospective.summary.correlations;
  const matured = Object.values(forward.summary).reduce((sum, item) => sum + item.observations, 0);
  validationSummary.innerHTML = [
    ["Historical sample", retrospective.summary.sampleSize, "stocks"],
    ["3M correlation", correlations.threeMonth ?? "--", correlationLabel(correlations.threeMonth)],
    ["12M correlation", correlations.twelveMonth ?? "--", correlationLabel(correlations.twelveMonth)],
    ["Forward snapshots", forward.snapshotCount, "captured observations"],
    ["Matured outcomes", matured, "across 3M, 6M, and 12M"]
  ].map(([label, value, detail]) => `<div class="validation-stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`).join("");
  validationNotice.textContent = `${retrospective.limitation} ${forward.limitation}`;
  validationTierBody.innerHTML = retrospective.summary.tiers.map((tier) => `
    <tr><td>${escapeHtml(tier.label)}</td><td>${tier.count}</td><td>${percentValue(tier.threeMonth)}</td><td>${percentValue(tier.twelveMonth)}</td><td>${percentValue(tier.threeYear)}</td></tr>
  `).join("");
  validationStockBody.innerHTML = retrospective.rows.length ? retrospective.rows.map((row) => `
    <tr><td class="company-cell"><strong>${escapeHtml(row.ticker)}</strong><span>${escapeHtml(row.name)}</span></td><td class="table-score">${row.purchaseScore}</td><td>${percentValue(row.returns.threeMonth)}</td><td>${percentValue(row.returns.twelveMonth)}</td><td>${percentValue(row.returns.threeYear)}</td></tr>
  `).join("") : '<tr><td colspan="5">Historical prices are currently unavailable.</td></tr>';
}

async function requestValidation() {
  const controls = getControls();
  runValidationButton.disabled = true;
  validationStatus.textContent = "Fetching historical prices and evaluating score snapshots...";
  try {
    const params = new URLSearchParams({
      tickers: displayedWatchlist.slice(0, 12).join(","),
      lens: controls.lens,
      risk: String(controls.risk),
      horizon: controls.horizon
    });
    const data = await apiRequest(`/api/validation?${params}`);
    renderValidation(data);
    validationStatus.textContent = `Validation generated ${formatClock(data.generatedAt)}${data.warnings.length ? ` with ${data.warnings.length} history warning${data.warnings.length === 1 ? "" : "s"}` : ""}.`;
  } catch (error) {
    validationStatus.textContent = `Validation unavailable: ${error.message}`;
  } finally {
    runValidationButton.disabled = false;
  }
}

function selectScreenerRow(row) {
  const ticker = row?.dataset?.ticker;
  if (!ticker) return;
  activeTicker = ticker;
  tickerInput.value = ticker;
  requestResearch();
  window.scrollTo({ top: 0, behavior: "smooth" });
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
    ["Revenue growth", brief.context?.revenueGrowth || "Not reported"],
    ["Gross margin", brief.margin],
    ["Sector", brief.context?.sector || "Unavailable"],
    ["Industry", brief.context?.industry || "Unavailable"]
  ];

  metricGrid.innerHTML = values
    .map(([label, value]) => `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderFundamentals(brief) {
  const context = brief.context || {};
  const surprise = context.earningsSurprisePercent;
  const shareChange = context.shareChangePercent;
  const values = [
    ["Free cash flow", context.freeCashFlow || "Unavailable", "Operating cash flow less capital expenditures"],
    ["FCF margin", context.freeCashFlowMargin || "Unavailable", "Free cash flow as a share of revenue"],
    ["Net margin", context.netMargin || context.providerProfitMargin || "Unavailable", "Net income as a share of revenue"],
    ["Return on equity", context.returnOnEquity || context.providerReturnOnEquity || "Unavailable", "Net income relative to shareholder equity"],
    ["Return on assets", context.returnOnAssets || "Unavailable", "Net income relative to total assets"],
    ["Total debt", context.totalDebt || "Unavailable", "Latest reported interest-bearing debt"],
    ["Net debt", context.netDebt || "Unavailable", "Debt less cash and equivalents"],
    ["Debt / equity", context.debtToEquity || "Unavailable", "Debt divided by shareholder equity"],
    ["P/E", brief.pe || "Unavailable", context.peMethod || "Provider valuation multiple"],
    ["Price / sales", context.priceToSales || "Unavailable", "Trailing market value relative to revenue"],
    ["EV / EBITDA", context.evToEbitda || "Unavailable", "Enterprise value relative to EBITDA"],
    ["Share change", context.shareChange || "Unavailable", `${context.dilutionLabel || "Unavailable"} versus prior fiscal year`],
    ["Diluted shares", context.dilutedShares || "Unavailable", "Latest annual diluted weighted-average shares"],
    ["EPS surprise", Number.isFinite(Number(surprise)) ? `${Number(surprise) >= 0 ? "+" : ""}${Number(surprise).toFixed(1)}%` : "Unavailable", context.earningsSurpriseLabel || "Requires configured earnings provider"],
    ["Reported EPS", Number.isFinite(Number(context.reportedEps)) ? Number(context.reportedEps).toFixed(2) : "Unavailable", context.latestEarningsDate || "Latest quarter"],
    ["Capital spending", context.capitalExpenditures || "Unavailable", "Property, plant, and equipment investment"]
  ];

  fundamentalsStatus.textContent = `Fiscal period ${context.latestFiscalPeriod || "unavailable"}; latest filing ${context.latestFilingDate || "unavailable"}.`;
  fundamentalsGrid.innerHTML = values.map(([label, value, detail]) => {
    const numericSignal = label === "EPS surprise" ? Number(surprise) : label === "Share change" ? Number(shareChange) : null;
    const className = Number.isFinite(numericSignal) ? (label === "Share change" ? (numericSignal <= 0 ? "gain" : "loss") : (numericSignal >= 0 ? "gain" : "loss")) : "";
    return `<div class="fundamental-item"><span>${escapeHtml(label)}</span><strong class="${className}">${escapeHtml(value)}</strong><small>${escapeHtml(detail)}</small></div>`;
  }).join("");
}

function formatEventDate(event) {
  if (!event.date) return "Ongoing";
  const date = new Date(`${event.date}T12:00:00`);
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function timingLabel(event) {
  if (event.daysAway === null) return "Monitor";
  if (event.daysAway === 0) return "Today";
  if (event.daysAway === 1) return "Tomorrow";
  if (event.daysAway > 1) return `In ${event.daysAway} days`;
  if (event.daysAway === -1) return "Yesterday";
  return `${Math.abs(event.daysAway)} days ago`;
}

function renderCatalysts() {
  const filter = catalystFilter.value;
  const events = filter === "all" ? catalystEvents : catalystEvents.filter((event) => event.timing === filter);
  if (!events.length) {
    catalystTimeline.innerHTML = '<p class="empty-state">No events match this view. Refresh trusted data to check for updated schedules.</p>';
    return;
  }
  catalystTimeline.innerHTML = events.map((event) => {
    const title = event.url
      ? `<a href="${encodeURI(event.url)}" target="_blank" rel="noreferrer">${escapeHtml(event.title)}</a>`
      : `<strong>${escapeHtml(event.title)}</strong>`;
    return `<div class="catalyst-event ${escapeHtml(event.timing)}">
      <div class="catalyst-date">${escapeHtml(formatEventDate(event))}<small>${escapeHtml(timingLabel(event))}</small></div>
      <div class="catalyst-dot" aria-hidden="true"></div>
      <div class="catalyst-copy">${title}<span>${escapeHtml(event.detail || "")}</span><small>${escapeHtml(event.source || "Unknown source")} | ${escapeHtml(event.confidence || "monitor")}</small></div>
      <span class="event-badge">${escapeHtml(event.type)}</span>
    </div>`;
  }).join("");
}

async function requestCatalysts(ticker) {
  const requestId = ++catalystRequest;
  catalystStatus.textContent = `Loading ${ticker} events...`;
  try {
    const data = await apiRequest(`/api/catalysts/${encodeURIComponent(ticker)}`);
    if (requestId !== catalystRequest) return;
    const merged = new Map();
    for (const event of [...catalystEvents, ...(data.events || [])]) {
      merged.set([event.type, event.title, event.date || "monitor"].join("|"), event);
    }
    catalystEvents = [...merged.values()].sort((a, b) => {
      const order = { upcoming: 0, recent: 1, monitor: 2 };
      if (order[a.timing] !== order[b.timing]) return order[a.timing] - order[b.timing];
      if (a.timing === "upcoming") return a.daysAway - b.daysAway;
      if (a.timing === "recent") return b.daysAway - a.daysAway;
      return a.title.localeCompare(b.title);
    });
    renderCatalysts();
    const upcoming = catalystEvents.filter((event) => event.timing === "upcoming").length;
    catalystStatus.textContent = `${upcoming} upcoming and ${catalystEvents.length - upcoming} recent or monitoring events. Updated ${formatClock(data.updatedAt)}.`;
  } catch (error) {
    if (requestId !== catalystRequest) return;
    catalystEvents = [];
    renderCatalysts();
    catalystStatus.textContent = `Catalysts unavailable: ${error.message}`;
  }
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
      const sourceDate = source.publishedAt || source.filedAt || source.asOf || source.updatedAt || source.retrievedAt || brief.refreshedAt || brief.quoteUpdatedAt;
      const dateLabel = source.publishedAt ? "Published" : source.filedAt ? "Filed" : "Retrieved";
      const freshness = sourceDate && sourceDate !== "Unavailable" ? ` | ${dateLabel} ${escapeHtml(formatDateTime(sourceDate))}` : "";
      return `<div class="source-item">${title}<span>${escapeHtml(source.provider || "Unknown source")}${freshness}</span><p>${escapeHtml(source.detail || "")}</p></div>`;
    }),
    ...warnings.map((warning) => `<div class="source-item warning"><strong>Provider warning</strong><span>Runtime</span><p>${escapeHtml(warning)}</p></div>`)
  ].join("");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "Unavailable");
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
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

function renderCitedAnswer(message, data) {
  message.textContent = "";
  message.classList.add("cited-message");
  const citations = new Map((data.citations || []).map((source) => [source.id, source]));
  for (const claim of data.claims || []) {
    const paragraph = document.createElement("p");
    paragraph.append(document.createTextNode(claim.text));
    const markers = document.createElement("span");
    markers.className = "citation-markers";
    for (const sourceId of claim.sourceIds || []) {
      const source = citations.get(sourceId);
      if (!source) continue;
      const marker = source.url ? document.createElement("a") : document.createElement("span");
      marker.className = "citation-marker";
      marker.textContent = `[${sourceId}]`;
      marker.title = `${source.provider}: ${source.title}`;
      if (source.url) {
        marker.href = source.url;
        marker.target = "_blank";
        marker.rel = "noreferrer";
      }
      markers.appendChild(marker);
    }
    paragraph.appendChild(markers);
    message.appendChild(paragraph);
  }

  if (data.citations?.length) {
    const evidence = document.createElement("details");
    evidence.className = "chat-evidence";
    const summary = document.createElement("summary");
    summary.textContent = `${data.citations.length} source${data.citations.length === 1 ? "" : "s"}`;
    evidence.appendChild(summary);
    for (const source of data.citations) {
      const item = document.createElement("div");
      const title = source.url ? document.createElement("a") : document.createElement("strong");
      title.textContent = `${source.id} ${source.title}`;
      if (source.url) {
        title.href = source.url;
        title.target = "_blank";
        title.rel = "noreferrer";
      }
      const provider = document.createElement("span");
      provider.textContent = source.provider;
      item.append(title, provider);
      evidence.appendChild(item);
    }
    message.appendChild(evidence);
  }

  if (data.caveat) {
    const caveat = document.createElement("small");
    caveat.className = "chat-caveat";
    caveat.textContent = data.caveat;
    message.appendChild(caveat);
  }
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
    if (data.grounded && data.claims?.length) renderCitedAnswer(pending, data);
    else pending.textContent = "The available evidence was not sufficient to support a grounded answer.";
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
      body: JSON.stringify({ tickers: displayedWatchlist })
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
    activeBrief.purchaseFit = calculatePurchaseFit(activeBrief);
    renderMarketStrip(activeBrief);
    renderPurchaseFit(activeBrief);
    drawChart(activeBrief);
  }
}

async function refreshLivePrices() {
  try {
    const requestedTickers = [...new Set([...displayedWatchlist, activeTicker])];
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
    if (currentUser && alertRules.length) loadAlerts(true);
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
  const fit = brief.purchaseFit || calculatePurchaseFit(brief);
  return `${brief.name} (${brief.ticker})
Calculation price: $${Number(brief.price).toFixed(2)}
Quote source: ${brief.quoteSource || brief.source || "Local fallback"}
Quote time: ${brief.quoteUpdatedAt || "Unavailable"}
Score: ${brief.score}
Purchase fit: ${fit.score} (${fit.label})
Reported revenue growth: ${fit.growthPercent >= 0 ? "+" : ""}${Number(fit.growthPercent).toFixed(1)}%
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
  renderPurchaseFit(brief);
  thesisText.textContent = brief.thesis;
  renderMarketStrip(brief);
  renderMetrics(brief);
  renderFundamentals(brief);
  catalystEvents = brief.catalysts || [];
  renderCatalysts();
  requestCatalysts(brief.ticker);
  renderList(driversList, brief.drivers);
  renderList(risksList, brief.risks);
  renderList(checksList, brief.checks);
  renderContext(brief);
  renderSources(brief);
  drawChart(brief);
  renderWatchlist();
  renderAccount();
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
  requestScreener();
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
saveTickerButton.addEventListener("click", toggleSavedTicker);
accountButton.addEventListener("click", () => {
  if (currentUser) {
    signOut().catch((error) => { refreshStatus.textContent = `Sign out failed: ${error.message}`; });
    return;
  }
  setAuthMode("login");
  authDialog.showModal();
});
document.querySelector("#closeAuthButton").addEventListener("click", () => authDialog.close());
authModeButton.addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));
authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitAuth();
});
holdingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const ticker = holdingTicker.value.trim().toUpperCase();
  const holding = { ticker, shares: Number(holdingShares.value), averageCost: Number(holdingCost.value) };
  const next = [...portfolioHoldings.filter((item) => item.ticker !== ticker), holding];
  try {
    portfolioStatus.textContent = `Updating ${ticker}...`;
    await savePortfolio(next);
    holdingForm.reset();
  } catch (error) {
    portfolioStatus.textContent = `Portfolio update failed: ${error.message}`;
  }
});
portfolioBody.addEventListener("click", async (event) => {
  const button = event.target.closest(".remove-holding");
  if (!button || !currentUser) return;
  try {
    portfolioStatus.textContent = `Removing ${button.dataset.ticker}...`;
    await savePortfolio(portfolioHoldings.filter((holding) => holding.ticker !== button.dataset.ticker));
  } catch (error) {
    portfolioStatus.textContent = `Portfolio update failed: ${error.message}`;
  }
});
alertForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser) return;
  const controls = getControls();
  try {
    alertsStatus.textContent = "Creating alert...";
    const data = await apiRequest("/api/alerts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ticker: alertTicker.value.trim().toUpperCase(),
        metric: alertMetric.value,
        operator: alertOperator.value,
        threshold: Number(alertThreshold.value),
        lens: controls.lens,
        risk: controls.risk,
        horizon: controls.horizon
      })
    });
    alertRules = data.alerts || [];
    alertForm.reset();
    alertTicker.value = activeTicker;
    renderAlerts(data);
  } catch (error) {
    alertsStatus.textContent = `Alert creation failed: ${error.message}`;
  }
});
alertsBody.addEventListener("click", async (event) => {
  const button = event.target.closest(".remove-alert");
  if (!button || !currentUser) return;
  try {
    alertsStatus.textContent = "Removing alert...";
    const data = await apiRequest(`/api/alerts/${encodeURIComponent(button.dataset.alertId)}`, { method: "DELETE" });
    alertRules = data.alerts || [];
    renderAlerts(data);
  } catch (error) {
    alertsStatus.textContent = `Alert removal failed: ${error.message}`;
  }
});
refreshAlertsButton.addEventListener("click", () => loadAlerts());
alertMetric.addEventListener("change", () => {
  const purchaseFit = alertMetric.value === "purchaseScore";
  alertThreshold.max = purchaseFit ? "100" : "";
  alertThreshold.step = purchaseFit ? "1" : "0.01";
  alertThreshold.placeholder = purchaseFit ? "75" : "150.00";
});
screenerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestScreener();
});
document.querySelector("#resetScreenerButton").addEventListener("click", () => {
  screenerForm.reset();
  screenSector.value = "all";
  requestScreener();
});
screenerBody.addEventListener("click", (event) => selectScreenerRow(event.target.closest(".screener-row")));
screenerBody.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    selectScreenerRow(event.target.closest(".screener-row"));
  }
});
catalystFilter.addEventListener("change", renderCatalysts);
runValidationButton.addEventListener("click", requestValidation);

async function initializeApp() {
  render(fallbackBrief(activeTicker));
  alertTicker.value = activeTicker;
  await loadAccount();
  requestResearch();
  requestComparison();
  requestScreener();
  requestValidation();
  startLivePrices();
}

initializeApp();
