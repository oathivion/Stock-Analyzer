import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalysts, parseCsv } from "../catalysts.js";

test("parses quoted earnings calendar CSV", () => {
  const rows = parseCsv('symbol,name,reportDate,fiscalDateEnding,estimate,currency\nIBM,"International, Business Machines",2026-07-22,2026-06-30,2.45,USD\n');
  assert.equal(rows[0].symbol, "IBM");
  assert.equal(rows[0].name, "International, Business Machines");
  assert.equal(rows[0].reportDate, "2026-07-22");
});

test("orders upcoming events before recent and monitoring signals", () => {
  const events = buildCatalysts({
    checks: ["Track gross margin."],
    context: {
      nextEarningsDate: "2026-07-20",
      nextEarningsEstimate: "1.25",
      exDividendDate: "07/01/2026",
      latestFilingDate: "2026-05-10",
      latestFiscalPeriod: "2026 Q1",
      analystTargetPrice: "$150",
      latestNews: [{ title: "Product launched", publishedAt: "2026-06-01", provider: "News", sentiment: "Bullish" }]
    }
  }, new Date("2026-06-15T12:00:00Z"));

  assert.equal(events[0].title, "Ex-dividend date");
  assert.equal(events[1].title, "Expected earnings report");
  assert.equal(events.at(-1).timing, "monitor");
  assert.equal(events.find((item) => item.type === "earnings").daysAway, 35);
});

test("omits unavailable scheduled dates", () => {
  const events = buildCatalysts({ context: { exDividendDate: "No scheduled dividend", latestFilingDate: "Unavailable" } });
  assert.equal(events.length, 0);
});
