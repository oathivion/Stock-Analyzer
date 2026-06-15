import test from "node:test";
import assert from "node:assert/strict";
import { analyzePortfolio } from "../portfolio.js";

test("calculates value, gain, allocation, concentration, and weighted risk", () => {
  const analysis = analyzePortfolio([
    { ticker: "AAA", shares: 10, averageCost: 80 },
    { ticker: "BBB", shares: 5, averageCost: 120 }
  ], {
    AAA: { name: "Alpha", price: 100, sector: "Technology", riskLevel: 4 },
    BBB: { name: "Beta", price: 100, sector: "Financials", riskLevel: 2 }
  });

  assert.equal(analysis.summary.totalValue, 1500);
  assert.equal(analysis.summary.totalCost, 1400);
  assert.equal(analysis.summary.gainLoss, 100);
  assert.equal(analysis.rows[0].ticker, "AAA");
  assert.equal(analysis.rows[0].allocation, 66.7);
  assert.equal(analysis.summary.concentrationLabel, "High");
  assert.equal(analysis.summary.weightedRisk, 3.3);
  assert.equal(analysis.sectors.length, 2);
});

test("handles an empty portfolio without invalid numbers", () => {
  const analysis = analyzePortfolio([], {});

  assert.equal(analysis.summary.totalValue, 0);
  assert.equal(analysis.summary.gainLossPercent, 0);
  assert.equal(analysis.summary.weightedRisk, 0);
  assert.equal(analysis.summary.largestPosition, null);
});
