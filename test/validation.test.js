import test from "node:test";
import assert from "node:assert/strict";
import { createScoreSnapshot, evaluateSnapshots, pearsonCorrelation, summarizeForwardValidation, summarizeRetrospective, trailingReturns } from "../validation.js";

test("calculates trailing returns from historical closes", () => {
  const asOf = new Date("2026-06-15T00:00:00Z");
  const timestamp = (date) => Math.floor(new Date(`${date}T00:00:00Z`).getTime() / 1000);
  const returns = trailingReturns([
    { timestamp: timestamp("2023-06-16"), close: 50 },
    { timestamp: timestamp("2025-06-15"), close: 80 },
    { timestamp: timestamp("2026-03-16"), close: 100 },
    { timestamp: timestamp("2026-06-15"), close: 120 }
  ], asOf);

  assert.equal(returns.threeMonth, 20);
  assert.equal(returns.twelveMonth, 50);
  assert.equal(returns.threeYear, 140);
});

test("summarizes score tiers and score-return correlation", () => {
  const rows = [
    { purchaseScore: 90, returns: { twelveMonth: 30 } },
    { purchaseScore: 80, returns: { twelveMonth: 20 } },
    { purchaseScore: 60, returns: { twelveMonth: -10 } }
  ];
  const summary = summarizeRetrospective(rows);

  assert.equal(summary.tiers[0].count, 2);
  assert.equal(summary.tiers[0].twelveMonth, 25);
  assert.ok(summary.correlations.twelveMonth > 0.9);
  assert.equal(pearsonCorrelation([[1, 1]]), null);
});

test("matures forward snapshots only after their outcome window", () => {
  const snapshot = createScoreSnapshot({ ticker: "NVDA", score: 85, researchScore: 82, price: 100, capturedAt: "2026-01-01T00:00:00Z" });
  const evaluated = evaluateSnapshots([snapshot], { NVDA: 125 }, new Date("2026-07-05T00:00:00Z"));
  const summary = summarizeForwardValidation(evaluated);

  assert.equal(evaluated[0].outcomes.threeMonth.returnPercent, 25);
  assert.equal(evaluated[0].outcomes.sixMonth.returnPercent, 25);
  assert.equal(evaluated[0].outcomes.twelveMonth, undefined);
  assert.equal(summary.threeMonth.observations, 1);
  assert.equal(summary.twelveMonth.observations, 0);
});
