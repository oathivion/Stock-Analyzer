function sourceKey(source) {
  return [source.provider, source.title, source.url].filter(Boolean).join("|");
}

export function buildEvidenceCatalog(brief = {}) {
  const sources = [];
  const seen = new Set();
  for (const source of brief.sources || []) {
    const key = sourceKey(source);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    sources.push({
      id: `S${sources.length + 1}`,
      title: source.title || "Untitled source",
      provider: source.provider || "Unknown provider",
      url: source.url || null,
      detail: source.detail || "",
      retrievedAt: source.retrievedAt || source.updatedAt || source.publishedAt || source.filedAt || null
    });
  }
  sources.push({
    id: `S${sources.length + 1}`,
    title: `${brief.ticker || "Stock"} generated research brief`,
    provider: brief.generatedBy === "openai" ? "Research model" : "Local research model",
    url: null,
    detail: "Model-generated thesis, drivers, risks, checks, and research score derived from the supplied source-backed metrics.",
    retrievedAt: brief.refreshedAt || brief.quoteUpdatedAt || null
  });
  return sources;
}

export function relevantEvidenceIds(question, catalog) {
  const q = String(question || "").toLowerCase();
  const matches = (patterns) => catalog.filter((source) => patterns.some((pattern) => `${source.provider} ${source.title} ${source.detail}`.toLowerCase().includes(pattern))).map((source) => source.id);
  let ids = [];
  if (/price|quote|today|market cap/.test(q)) ids = matches(["yahoo", "quote summary", "alpha vantage"]);
  else if (/earn|catalyst|news|dividend|filing/.test(q)) ids = matches(["earnings", "news", "dividend", "sec edgar"]);
  else if (/valuation|multiple|p\/e| pe |target/.test(` ${q} `)) ids = matches(["overview", "target", "sec edgar", "quote summary"]);
  else if (/margin|cash|debt|revenue|profit|growth|asset|equity/.test(q)) ids = matches(["sec edgar", "overview"]);
  const modelId = catalog.at(-1)?.id;
  if (/risk|bear|driver|thesis|change|check/.test(q) && modelId) ids.push(modelId);
  if (!ids.length) ids = catalog.slice(0, 2).map((source) => source.id);
  return [...new Set(ids)].slice(0, 4);
}

export function validateGroundedAnswer(answer, catalog) {
  const allowed = new Set(catalog.map((source) => source.id));
  const claims = (Array.isArray(answer?.claims) ? answer.claims : [])
    .map((claim) => ({
      text: String(claim?.text || "").trim(),
      sourceIds: [...new Set((claim?.sourceIds || claim?.source_ids || []).filter((id) => allowed.has(id)))]
    }))
    .filter((claim) => claim.text && claim.sourceIds.length);
  return {
    claims,
    caveat: String(answer?.caveat || "").trim(),
    grounded: claims.length > 0
  };
}

export function citedText(claims = []) {
  return claims.map((claim) => `${claim.text} ${claim.sourceIds.map((id) => `[${id}]`).join("")}`).join(" ");
}
