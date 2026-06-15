import { randomUUID } from "node:crypto";

const validMetrics = new Set(["price", "purchaseScore"]);
const validOperators = new Set(["above", "below"]);
const validLenses = new Set(["balanced", "growth", "value"]);
const validHorizons = new Set(["3 months", "12 months", "3 years"]);

export function createAlertRule(input = {}, now = new Date()) {
  const ticker = String(input.ticker || "").trim().toUpperCase();
  const metric = String(input.metric || "");
  const operator = String(input.operator || "");
  const threshold = Number(input.threshold);
  const lens = input.lens || "balanced";
  const risk = Number(input.risk ?? 3);
  const horizon = input.horizon || "12 months";

  if (!/^[A-Z][A-Z0-9.-]{0,7}$/.test(ticker)) throw new Error("Enter a valid ticker.");
  if (!validMetrics.has(metric)) throw new Error("Alert metric must be price or Purchase Fit.");
  if (!validOperators.has(operator)) throw new Error("Alert condition must be above or below.");
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Alert threshold must be zero or greater.");
  if (metric === "purchaseScore" && threshold > 100) throw new Error("Purchase Fit thresholds cannot exceed 100.");
  if (!validLenses.has(lens) || !validHorizons.has(horizon) || !Number.isInteger(risk) || risk < 1 || risk > 5) {
    throw new Error("Purchase Fit alert settings are invalid.");
  }

  return {
    id: randomUUID(),
    ticker,
    metric,
    operator,
    threshold: Number(threshold.toFixed(2)),
    lens,
    risk,
    horizon,
    createdAt: now.toISOString(),
    isTriggered: false,
    lastTriggeredAt: null
  };
}

export function evaluateAlert(rule, currentValue, now = new Date()) {
  const value = Number(currentValue);
  const triggered = Number.isFinite(value) && (rule.operator === "above" ? value >= rule.threshold : value <= rule.threshold);
  return {
    ...rule,
    currentValue: Number.isFinite(value) ? Number(value.toFixed(2)) : null,
    isTriggered: triggered,
    lastTriggeredAt: triggered && !rule.isTriggered ? now.toISOString() : rule.lastTriggeredAt || null
  };
}

export function alertLabel(rule) {
  const metric = rule.metric === "price" ? "Price" : "Purchase Fit";
  const threshold = rule.metric === "price" ? `$${Number(rule.threshold).toFixed(2)}` : `${Number(rule.threshold).toFixed(0)}`;
  return `${metric} ${rule.operator} ${threshold}`;
}
