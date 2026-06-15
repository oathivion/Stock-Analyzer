import test from "node:test";
import assert from "node:assert/strict";
import { calculateFinancialMetrics } from "../financial-metrics.js";

test("calculates cash flow, profitability, leverage, and dilution metrics", () => {
  const metrics = calculateFinancialMetrics({
    revenue: 1000,
    netIncome: 150,
    operatingCashFlow: 220,
    capitalExpenditures: 70,
    assets: 1200,
    equity: 600,
    debt: 300,
    cash: 100,
    shares: 95,
    priorShares: 100
  });

  assert.equal(metrics.freeCashFlow, 150);
  assert.equal(metrics.freeCashFlowMargin, 15);
  assert.equal(metrics.netMargin, 15);
  assert.equal(metrics.returnOnAssets, 12.5);
  assert.equal(metrics.returnOnEquity, 25);
  assert.equal(metrics.debtToEquity, 0.5);
  assert.equal(metrics.netDebt, 200);
  assert.equal(metrics.shareChangePercent, -5);
  assert.equal(metrics.dilutionLabel, "Buyback");
});

test("preserves negative free cash flow and identifies dilution", () => {
  const metrics = calculateFinancialMetrics({
    revenue: 500,
    netIncome: -20,
    operatingCashFlow: 40,
    capitalExpenditures: 90,
    shares: 110,
    priorShares: 100
  });

  assert.equal(metrics.freeCashFlow, -50);
  assert.equal(metrics.freeCashFlowMargin, -10);
  assert.equal(metrics.netMargin, -4);
  assert.equal(metrics.shareChangePercent, 10);
  assert.equal(metrics.dilutionLabel, "Diluting");
});
