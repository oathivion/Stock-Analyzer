const DAY_MS = 86_400_000;

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function closeAtOrBefore(points, targetSeconds) {
  let match = null;
  for (const point of points) {
    if (point.timestamp <= targetSeconds) match = point;
    else break;
  }
  return match;
}

export function trailingReturns(points = [], asOf = new Date()) {
  const sorted = [...points].filter((point) => Number.isFinite(point.close) && Number.isFinite(point.timestamp)).sort((a, b) => a.timestamp - b.timestamp);
  const latest = sorted.at(-1);
  if (!latest) return { threeMonth: null, twelveMonth: null, threeYear: null };
  const latestDate = new Date(latest.timestamp * 1000);
  const calculate = (days) => {
    const prior = closeAtOrBefore(sorted, Math.floor((latestDate.getTime() - days * DAY_MS) / 1000));
    return prior?.close ? round(((latest.close - prior.close) / prior.close) * 100) : null;
  };
  return { threeMonth: calculate(91), twelveMonth: calculate(365), threeYear: calculate(1095), asOf: latestDate.toISOString(), latestPrice: round(latest.close) };
}

export function pearsonCorrelation(pairs = []) {
  const clean = pairs.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (clean.length < 2) return null;
  const xMean = clean.reduce((sum, [x]) => sum + x, 0) / clean.length;
  const yMean = clean.reduce((sum, [, y]) => sum + y, 0) / clean.length;
  const numerator = clean.reduce((sum, [x, y]) => sum + (x - xMean) * (y - yMean), 0);
  const xVariance = clean.reduce((sum, [x]) => sum + (x - xMean) ** 2, 0);
  const yVariance = clean.reduce((sum, [, y]) => sum + (y - yMean) ** 2, 0);
  if (!xVariance || !yVariance) return null;
  return round(numerator / Math.sqrt(xVariance * yVariance), 3);
}

export function summarizeRetrospective(rows = []) {
  const tiers = [
    { label: "Strong fit", minimum: 80, maximum: 100 },
    { label: "Good fit", minimum: 65, maximum: 79 },
    { label: "Watch closely", minimum: 50, maximum: 64 },
    { label: "Weak fit", minimum: 0, maximum: 49 }
  ].map((tier) => {
    const matches = rows.filter((row) => row.purchaseScore >= tier.minimum && row.purchaseScore <= tier.maximum);
    const average = (key) => {
      const values = matches.map((row) => row.returns?.[key]).filter(Number.isFinite);
      return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };
    return { label: tier.label, count: matches.length, threeMonth: average("threeMonth"), twelveMonth: average("twelveMonth"), threeYear: average("threeYear") };
  });
  return {
    sampleSize: rows.length,
    correlations: {
      threeMonth: pearsonCorrelation(rows.map((row) => [row.purchaseScore, row.returns?.threeMonth])),
      twelveMonth: pearsonCorrelation(rows.map((row) => [row.purchaseScore, row.returns?.twelveMonth])),
      threeYear: pearsonCorrelation(rows.map((row) => [row.purchaseScore, row.returns?.threeYear]))
    },
    tiers
  };
}

export function createScoreSnapshot({ ticker, score, researchScore, price, capturedAt = new Date().toISOString(), methodologyVersion = "1.1" }) {
  return { ticker, score, researchScore, price, capturedAt, methodologyVersion, outcomes: {} };
}

export function evaluateSnapshots(snapshots = [], pricesByTicker = {}, asOf = new Date()) {
  const windows = [{ key: "threeMonth", days: 91 }, { key: "sixMonth", days: 182 }, { key: "twelveMonth", days: 365 }];
  return snapshots.map((snapshot) => {
    const currentPrice = Number(pricesByTicker[snapshot.ticker]);
    const ageDays = Math.floor((asOf - new Date(snapshot.capturedAt)) / DAY_MS);
    const outcomes = { ...(snapshot.outcomes || {}) };
    for (const window of windows) {
      if (!outcomes[window.key] && ageDays >= window.days && currentPrice > 0 && Number(snapshot.price) > 0) {
        outcomes[window.key] = { returnPercent: round(((currentPrice - snapshot.price) / snapshot.price) * 100), evaluatedAt: asOf.toISOString(), price: round(currentPrice) };
      }
    }
    return { ...snapshot, outcomes, ageDays };
  });
}

export function summarizeForwardValidation(snapshots = []) {
  const windows = ["threeMonth", "sixMonth", "twelveMonth"];
  return Object.fromEntries(windows.map((window) => {
    const matured = snapshots.filter((snapshot) => Number.isFinite(snapshot.outcomes?.[window]?.returnPercent));
    const winners = matured.filter((snapshot) => snapshot.outcomes[window].returnPercent > 0).length;
    const averageReturn = matured.length ? round(matured.reduce((sum, snapshot) => sum + snapshot.outcomes[window].returnPercent, 0) / matured.length) : null;
    const correlation = pearsonCorrelation(matured.map((snapshot) => [snapshot.score, snapshot.outcomes[window].returnPercent]));
    return [window, { observations: matured.length, positiveRate: matured.length ? round((winners / matured.length) * 100, 1) : null, averageReturn, correlation }];
  }));
}
