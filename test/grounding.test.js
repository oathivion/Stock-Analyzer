import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceCatalog, citedText, relevantEvidenceIds, validateGroundedAnswer } from "../grounding.js";

const brief = {
  ticker: "NVDA",
  generatedBy: "local",
  sources: [
    { title: "SEC EDGAR Company Facts", provider: "SEC", url: "https://data.sec.gov/example", detail: "Revenue, debt, and cash flow." },
    { title: "Chart quote", provider: "Yahoo Finance", url: "https://query1.finance.yahoo.com/example", detail: "Current quote price." }
  ]
};

test("builds stable evidence IDs and a model-research source", () => {
  const catalog = buildEvidenceCatalog(brief);
  assert.deepEqual(catalog.map((source) => source.id), ["S1", "S2", "S3"]);
  assert.equal(catalog[2].provider, "Local research model");
});

test("removes invented source IDs and unsupported claims", () => {
  const catalog = buildEvidenceCatalog(brief);
  const answer = validateGroundedAnswer({
    claims: [
      { text: "Revenue is reported by the SEC.", sourceIds: ["S1", "S99"] },
      { text: "Unsupported claim.", sourceIds: ["S99"] }
    ]
  }, catalog);

  assert.deepEqual(answer.claims, [{ text: "Revenue is reported by the SEC.", sourceIds: ["S1"] }]);
  assert.equal(answer.grounded, true);
});

test("selects evidence relevant to the question and formats inline markers", () => {
  const catalog = buildEvidenceCatalog(brief);
  assert.deepEqual(relevantEvidenceIds("What is the current price?", catalog), ["S2"]);
  assert.equal(citedText([{ text: "The quote is current.", sourceIds: ["S2"] }]), "The quote is current. [S2]");
});
