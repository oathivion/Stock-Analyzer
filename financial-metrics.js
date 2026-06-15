function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, places = 1) {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function ratio(numerator, denominator, multiplier = 100) {
  const top = finite(numerator);
  const bottom = finite(denominator);
  return top !== null && bottom ? round((top / bottom) * multiplier) : null;
}

export function calculateFinancialMetrics(input = {}) {
  const revenue = finite(input.revenue);
  const netIncome = finite(input.netIncome);
  const operatingCashFlow = finite(input.operatingCashFlow);
  const capitalExpenditures = Math.abs(finite(input.capitalExpenditures) || 0);
  const assets = finite(input.assets);
  const equity = finite(input.equity);
  const debt = finite(input.debt);
  const cash = finite(input.cash);
  const shares = finite(input.shares);
  const priorShares = finite(input.priorShares);
  const freeCashFlow = operatingCashFlow === null ? null : operatingCashFlow - capitalExpenditures;
  const shareChangePercent = shares !== null && priorShares ? round(((shares - priorShares) / priorShares) * 100) : null;

  return {
    freeCashFlow,
    freeCashFlowMargin: ratio(freeCashFlow, revenue),
    netMargin: ratio(netIncome, revenue),
    returnOnAssets: ratio(netIncome, assets),
    returnOnEquity: ratio(netIncome, equity),
    debtToEquity: ratio(debt, equity, 1),
    netDebt: debt === null && cash === null ? null : (debt || 0) - (cash || 0),
    shareChangePercent,
    dilutionLabel: shareChangePercent === null ? "Unavailable" : shareChangePercent > 1 ? "Diluting" : shareChangePercent < -1 ? "Buyback" : "Stable"
  };
}
