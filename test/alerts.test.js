import test from "node:test";
import assert from "node:assert/strict";
import { alertLabel, createAlertRule, evaluateAlert } from "../alerts.js";

test("creates normalized price and Purchase Fit alert rules", () => {
  const price = createAlertRule({ ticker: " nvda ", metric: "price", operator: "below", threshold: 100 }, new Date("2026-06-15T00:00:00Z"));
  const fit = createAlertRule({ ticker: "MSFT", metric: "purchaseScore", operator: "above", threshold: 80, lens: "growth", risk: 4, horizon: "3 years" });

  assert.equal(price.ticker, "NVDA");
  assert.equal(alertLabel(price), "Price below $100.00");
  assert.equal(fit.lens, "growth");
  assert.throws(() => createAlertRule({ ticker: "AAPL", metric: "purchaseScore", operator: "above", threshold: 101 }), /cannot exceed/);
});

test("records only the first trigger time until an alert resets", () => {
  const rule = createAlertRule({ ticker: "NVDA", metric: "price", operator: "above", threshold: 125 });
  const first = evaluateAlert(rule, 126, new Date("2026-06-15T01:00:00Z"));
  const repeated = evaluateAlert(first, 130, new Date("2026-06-15T02:00:00Z"));
  const reset = evaluateAlert(repeated, 120, new Date("2026-06-15T03:00:00Z"));
  const retriggered = evaluateAlert(reset, 127, new Date("2026-06-15T04:00:00Z"));

  assert.equal(first.isTriggered, true);
  assert.equal(repeated.lastTriggeredAt, first.lastTriggeredAt);
  assert.equal(reset.isTriggered, false);
  assert.equal(retriggered.lastTriggeredAt, "2026-06-15T04:00:00.000Z");
});
