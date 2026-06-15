import test from "node:test";
import assert from "node:assert/strict";
import { calculatePurchaseFit } from "../scoring.js";

const baseline = {
  researchScore: 82,
  growthPercent: 20,
  price: 100,
  fiftyTwoWeekHigh: 125,
  fiftyTwoWeekLow: 80,
  pe: 30,
  selectedRisk: 3,
  horizon: "12 months"
};

test("returns a transparent component breakdown", () => {
  const result = calculatePurchaseFit(baseline);

  assert.equal(result.methodologyVersion, "1.1");
  assert.equal(result.componentDetails.length, 4);
  assert.equal(result.componentDetails.reduce((sum, item) => sum + item.weight, 0), 1);
  assert.match(result.explanation, /confidence penalty/);
});

test("applies the 1.3x downside strictness penalty", () => {
  const result = calculatePurchaseFit(baseline);
  const expected = Math.round(result.rawScore - (100 - result.rawScore) * 0.3);

  assert.equal(result.score, expected);
  assert.ok(result.score < result.rawScore);
  assert.ok(result.strictnessPenalty > 0);
});

test("penalizes a mismatch between selected and estimated risk", () => {
  const matched = calculatePurchaseFit({ ...baseline, selectedRisk: 2 });
  const mismatched = calculatePurchaseFit({ ...baseline, selectedRisk: 5 });

  assert.ok(matched.components.riskFit > mismatched.components.riskFit);
  assert.ok(matched.score > mismatched.score);
});

test("keeps all outputs within their public bounds", () => {
  const result = calculatePurchaseFit({
    ...baseline,
    researchScore: 500,
    growthPercent: -500,
    selectedRisk: 99
  });

  assert.ok(result.score >= 0 && result.score <= 100);
  assert.ok(result.components.research >= 0 && result.components.research <= 100);
  assert.ok(result.components.growth >= 10 && result.components.growth <= 100);
  assert.equal(result.selectedRisk, 5);
});
