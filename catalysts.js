function parseDate(value) {
  const text = String(value || "").trim();
  if (!text || /unavailable|no scheduled/i.test(text)) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00Z` : text;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function event({ type, title, date, detail, source, confidence = "confirmed", url }) {
  const parsed = parseDate(date);
  return {
    type,
    title,
    date: parsed ? parsed.toISOString().slice(0, 10) : null,
    detail,
    source,
    confidence,
    url: url || null
  };
}

export function buildCatalysts(stock, now = new Date()) {
  const context = stock.context || {};
  const events = [];
  if (context.nextEarningsDate) {
    events.push(event({ type: "earnings", title: "Expected earnings report", date: context.nextEarningsDate, detail: context.nextEarningsEstimate ? `Consensus EPS estimate ${context.nextEarningsEstimate}.` : "Expected reporting date from the configured earnings calendar.", source: "Alpha Vantage", confidence: "scheduled" }));
  }
  if (context.exDividendDate) {
    events.push(event({ type: "dividend", title: "Ex-dividend date", date: context.exDividendDate, detail: `Annualized dividend ${context.annualDividend || "not reported"}; yield ${context.dividendYield || "not reported"}.`, source: "Nasdaq", confidence: "scheduled" }));
  }
  if (context.dividendPaymentDate) {
    events.push(event({ type: "dividend", title: "Dividend payment date", date: context.dividendPaymentDate, detail: "Scheduled dividend payment date.", source: "Nasdaq", confidence: "scheduled" }));
  }
  if (context.latestFilingDate) {
    events.push(event({ type: "filing", title: "Latest SEC filing", date: context.latestFilingDate, detail: `Latest reported fiscal period: ${context.latestFiscalPeriod || "not reported"}.`, source: "SEC EDGAR", confidence: "reported" }));
  }
  for (const news of (context.latestNews || []).slice(0, 5)) {
    events.push(event({ type: "news", title: news.title || "Company news", date: news.publishedAt, detail: `Sentiment: ${news.sentiment || "unrated"}.`, source: news.provider || "News provider", confidence: "reported", url: news.url }));
  }
  if (context.analystTargetPrice && context.analystTargetPrice !== "Unavailable") {
    events.push(event({ type: "signal", title: "Analyst target monitor", detail: `Consensus target ${context.analystTargetPrice}; range ${context.analystTargetLow || "unavailable"} to ${context.analystTargetHigh || "unavailable"}.`, source: "Nasdaq", confidence: "monitor" }));
  }
  if (stock.checks?.[0]) {
    events.push(event({ type: "check", title: "Thesis checkpoint", detail: stock.checks[0], source: "Research model", confidence: "monitor" }));
  }

  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z");
  return events.filter((item) => item.date || item.confidence === "monitor").map((item) => {
    const itemDate = item.date ? parseDate(item.date) : null;
    const daysAway = itemDate ? Math.round((itemDate - today) / 86_400_000) : null;
    return { ...item, daysAway, timing: daysAway === null ? "monitor" : daysAway >= 0 ? "upcoming" : "recent" };
  }).sort((a, b) => {
    const order = { upcoming: 0, recent: 1, monitor: 2 };
    if (order[a.timing] !== order[b.timing]) return order[a.timing] - order[b.timing];
    if (a.timing === "upcoming") return a.daysAway - b.daysAway;
    if (a.timing === "recent") return b.daysAway - a.daysAway;
    return a.title.localeCompare(b.title);
  });
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < String(text).length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); value = "";
      if (row.some((cell) => cell.length)) rows.push(row);
      row = [];
    } else value += char;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }
  const [headers = [], ...data] = rows;
  return data.map((cells) => Object.fromEntries(headers.map((header, index) => [header.trim(), String(cells[index] || "").trim()])));
}
