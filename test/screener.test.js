import test from "node:test";
import assert from "node:assert/strict";
import { parseMarketCap, screenStocks } from "../screener.js";

const rows = [
  { ticker: "AAA", name: "Alpha AI", sector: "Technology", growthPercent: 25, pe: 35, score: 84, purchaseScore: 88, riskLevel: 4, marketCapValue: 2_000_000_000_000 },
  { ticker: "BBB", name: "Beta Bank", sector: "Finance", growthPercent: 8, pe: 12, score: 74, purchaseScore: 70, riskLevel: 2, marketCapValue: 300_000_000_000 },
  { ticker: "CCC", name: "Core Systems", sector: "Technology", growthPercent: -3, pe: 20, score: 60, purchaseScore: 52, riskLevel: 3, marketCapValue: 20_000_000_000 }
];

test("parses abbreviated market capitalizations", () => {
  assert.equal(parseMarketCap("$2.5T"), 2_500_000_000_000);
  assert.equal(parseMarketCap("$350B"), 350_000_000_000);
  assert.equal(parseMarketCap("Not reported"), null);
});

test("filters the trusted universe across growth, valuation, sector, and risk", () => {
  const results = screenStocks(rows, { sector: "Technology", minGrowth: 10, maxPe: 40, maxRisk: 4 });
  assert.deepEqual(results.map((row) => row.ticker), ["AAA"]);
});

test("searches names and sorts low valuation first", () => {
  const results = screenStocks(rows, { query: "b", sort: "pe" });
  assert.deepEqual(results.map((row) => row.ticker), ["BBB"]);
});

test("sorts strongest purchase fit first by default", () => {
  assert.deepEqual(screenStocks(rows).map((row) => row.ticker), ["AAA", "BBB", "CCC"]);
});
