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
const chart = document.querySelector("#priceChart");
const chartLabel = document.querySelector("#chartLabel");
const chatLog = document.querySelector("#chatLog");
const chatForm = document.querySelector("#chatForm");
const questionInput = document.querySelector("#questionInput");
const copyButton = document.querySelector("#copyButton");
const downloadButton = document.querySelector("#downloadButton");

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
  const stock = demoStocks[ticker] || demoStocks.NVDA;
  return {
    ticker: demoStocks[ticker] ? ticker : "NVDA",
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
    source: "demo"
  };
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
  verdictTitle.textContent = isLoading ? "Researching..." : verdictTitle.textContent;
  thesisText.textContent = isLoading ? "Gathering quote data, applying your research lens, and drafting the brief." : thesisText.textContent;
}

function renderWatchlist() {
  watchlistGrid.innerHTML = "";
  defaultWatchlist.forEach((ticker) => {
    const stock = demoStocks[ticker];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `watch-button${ticker === activeTicker ? " active" : ""}`;
    button.innerHTML = `
      <strong>${ticker}</strong>
      <span>${stock.name}</span>
      <b class="${stock.change >= 0 ? "gain" : "loss"}">${stock.change >= 0 ? "+" : ""}${stock.change}%</b>
    `;
    button.addEventListener("click", () => {
      activeTicker = ticker;
      tickerInput.value = ticker;
      requestResearch();
    });
    watchlistGrid.appendChild(button);
  });
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
  const sourceLabel = brief.generatedBy === "openai" ? "OpenAI brief" : `${brief.source || "demo"} data`;
  const values = [
    ["Last price", `$${Number(brief.price).toFixed(2)}`],
    ["Today", `${brief.change >= 0 ? "+" : ""}${brief.change}%`, brief.change >= 0 ? "gain" : "loss"],
    ["Market cap", brief.marketCap],
    ["Source", sourceLabel]
  ];

  marketStrip.innerHTML = values
    .map(([label, value, className]) => `<div class="market-card"><span>${label}</span><strong class="${className || ""}">${value}</strong></div>`)
    .join("");
}

function renderMetrics(brief) {
  const values = [
    ["Revenue growth", brief.revenue],
    ["Gross margin", brief.margin],
    ["Research lens", brief.lens || getLens()],
    ["Horizon", brief.horizon || document.querySelector("#horizonInput").value]
  ];

  metricGrid.innerHTML = values
    .map(([label, value]) => `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
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

  chartLabel.textContent = `${brief.horizon || "12 months"} simulated`;
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

function briefText() {
  const brief = activeBrief || fallbackBrief(activeTicker);
  return `${brief.name} (${brief.ticker})
Score: ${brief.score}
Verdict: ${brief.verdict}

${brief.thesis}

Key drivers:
- ${brief.drivers.join("\n- ")}

Risks:
- ${brief.risks.join("\n- ")}

Next checks:
- ${brief.checks.join("\n- ")}`;
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
  drawChart(brief);
  renderWatchlist();
  resetChat(brief);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  requestResearch();
});

form.addEventListener("change", requestResearch);

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

render(fallbackBrief(activeTicker));
requestResearch();
