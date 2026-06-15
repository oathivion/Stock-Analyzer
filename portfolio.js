function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

export function analyzePortfolio(holdings = [], stocks = {}) {
  const rows = holdings.map((holding) => {
    const stock = stocks[holding.ticker] || {};
    const shares = Number(holding.shares) || 0;
    const averageCost = Number(holding.averageCost) || 0;
    const price = Number(stock.price) || 0;
    const marketValue = shares * price;
    const costBasis = shares * averageCost;
    const gainLoss = marketValue - costBasis;
    const gainLossPercent = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;

    return {
      ticker: holding.ticker,
      name: stock.name || holding.ticker,
      sector: stock.sector || "Unclassified",
      shares: round(shares, 4),
      averageCost: round(averageCost),
      price: round(price),
      marketValue: round(marketValue),
      costBasis: round(costBasis),
      gainLoss: round(gainLoss),
      gainLossPercent: round(gainLossPercent),
      riskLevel: Math.max(1, Math.min(5, Number(stock.riskLevel) || 3)),
      quoteSource: stock.quoteSource || "Cached research data",
      quoteUpdatedAt: stock.quoteUpdatedAt || "Unavailable"
    };
  });

  const totalValue = rows.reduce((sum, row) => sum + row.marketValue, 0);
  const totalCost = rows.reduce((sum, row) => sum + row.costBasis, 0);
  for (const row of rows) row.allocation = totalValue > 0 ? round((row.marketValue / totalValue) * 100, 1) : 0;

  const sectorMap = new Map();
  for (const row of rows) sectorMap.set(row.sector, (sectorMap.get(row.sector) || 0) + row.marketValue);
  const sectors = [...sectorMap.entries()]
    .map(([sector, value]) => ({ sector, value: round(value), allocation: totalValue > 0 ? round((value / totalValue) * 100, 1) : 0 }))
    .sort((a, b) => b.value - a.value);
  const largestPosition = [...rows].sort((a, b) => b.allocation - a.allocation)[0] || null;
  const weightedRisk = totalValue > 0
    ? rows.reduce((sum, row) => sum + row.riskLevel * row.marketValue, 0) / totalValue
    : 0;
  const concentration = largestPosition?.allocation || 0;

  return {
    rows: rows.sort((a, b) => b.marketValue - a.marketValue),
    sectors,
    summary: {
      totalValue: round(totalValue),
      totalCost: round(totalCost),
      gainLoss: round(totalValue - totalCost),
      gainLossPercent: totalCost > 0 ? round(((totalValue - totalCost) / totalCost) * 100) : 0,
      weightedRisk: round(weightedRisk, 1),
      largestPosition: largestPosition ? { ticker: largestPosition.ticker, allocation: largestPosition.allocation } : null,
      concentrationLabel: concentration > 35 ? "High" : concentration > 20 ? "Moderate" : "Diversified"
    }
  };
}
