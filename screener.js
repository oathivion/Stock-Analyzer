function number(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseMarketCap(value) {
  const text = String(value || "").replace(/[$,]/g, "").trim().toUpperCase();
  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return null;
  if (text.endsWith("T")) return parsed * 1_000_000_000_000;
  if (text.endsWith("B")) return parsed * 1_000_000_000;
  if (text.endsWith("M")) return parsed * 1_000_000;
  return parsed;
}

export function screenStocks(rows = [], filters = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const sector = String(filters.sector || "all");
  const minGrowth = number(filters.minGrowth);
  const maxPe = number(filters.maxPe);
  const minScore = number(filters.minScore);
  const minPurchaseScore = number(filters.minPurchaseScore);
  const maxRisk = number(filters.maxRisk);
  const minMarketCap = number(filters.minMarketCap);
  const sort = filters.sort || "purchaseScore";

  const results = rows.filter((row) => {
    if (query && !`${row.ticker} ${row.name}`.toLowerCase().includes(query)) return false;
    if (sector !== "all" && row.sector !== sector) return false;
    if (minGrowth !== null && number(row.growthPercent, Number.NEGATIVE_INFINITY) < minGrowth) return false;
    if (maxPe !== null && number(row.pe, Number.POSITIVE_INFINITY) > maxPe) return false;
    if (minScore !== null && number(row.score, Number.NEGATIVE_INFINITY) < minScore) return false;
    if (minPurchaseScore !== null && number(row.purchaseScore, Number.NEGATIVE_INFINITY) < minPurchaseScore) return false;
    if (maxRisk !== null && number(row.riskLevel, Number.POSITIVE_INFINITY) > maxRisk) return false;
    if (minMarketCap !== null && number(row.marketCapValue, Number.NEGATIVE_INFINITY) < minMarketCap) return false;
    return true;
  });

  const direction = sort === "pe" || sort === "riskLevel" ? 1 : -1;
  return results.sort((a, b) => {
    const aValue = number(a[sort], direction === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    const bValue = number(b[sort], direction === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
    return (aValue - bValue) * direction || a.ticker.localeCompare(b.ticker);
  });
}
