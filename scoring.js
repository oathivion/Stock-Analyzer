export const PURCHASE_FIT_WEIGHTS = Object.freeze({
  research: 0.45,
  growth: 0.30,
  riskFit: 0.15,
  horizonFit: 0.10
});

export const PURCHASE_FIT_STRICTNESS = 1.3;

export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function parseNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function componentDetail(key, score, contribution) {
  const labels = {
    research: "Research quality",
    growth: "Revenue growth",
    riskFit: "Risk match",
    horizonFit: "Time horizon"
  };

  return {
    key,
    label: labels[key],
    score: Math.round(score),
    weight: PURCHASE_FIT_WEIGHTS[key],
    contribution: Number(contribution.toFixed(1))
  };
}

export function calculatePurchaseFit({
  researchScore,
  growthPercent = 0,
  price = 0,
  fiftyTwoWeekHigh,
  fiftyTwoWeekLow,
  pe,
  selectedRisk = 3,
  horizon = "12 months"
}) {
  const normalizedResearch = clamp(Number(researchScore) || 65, 0, 100);
  const normalizedGrowth = Number(growthPercent) || 0;
  const growthScore = clamp(50 + normalizedGrowth * 1.25, 10, 100);
  const high = parseNumber(fiftyTwoWeekHigh);
  const low = parseNumber(fiftyTwoWeekLow);
  const normalizedPrice = Number(price) || 0;
  const rangePercent = normalizedPrice > 0 && high !== null && low !== null
    ? ((high - low) / normalizedPrice) * 100
    : 50;

  let estimatedRiskLevel = rangePercent <= 25 ? 1 : rangePercent <= 45 ? 2 : rangePercent <= 70 ? 3 : rangePercent <= 100 ? 4 : 5;
  const normalizedPe = parseNumber(pe);
  if (normalizedPe !== null && normalizedPe > 45) estimatedRiskLevel = Math.min(5, estimatedRiskLevel + 1);

  const normalizedSelectedRisk = clamp(Number(selectedRisk) || 3, 1, 5);
  const riskFit = clamp(100 - Math.abs(normalizedSelectedRisk - estimatedRiskLevel) * 22, 20, 100);
  const horizonFit = horizon === "3 months"
    ? clamp(104 - estimatedRiskLevel * 14, 30, 95)
    : horizon === "3 years"
      ? clamp(62 + growthScore * 0.32 - estimatedRiskLevel * 2, 45, 96)
      : clamp(82 - Math.abs(estimatedRiskLevel - 3) * 7 + growthScore * 0.08, 45, 95);

  const componentValues = { research: normalizedResearch, growth: growthScore, riskFit, horizonFit };
  const details = Object.entries(componentValues).map(([key, value]) => (
    componentDetail(key, value, value * PURCHASE_FIT_WEIGHTS[key])
  ));
  const rawScore = details.reduce((total, component) => total + component.contribution, 0);
  const strictnessPenalty = Math.max(0, (100 - rawScore) * (PURCHASE_FIT_STRICTNESS - 1));
  const score = Math.round(clamp(rawScore - strictnessPenalty, 0, 100));
  const label = score >= 80 ? "Strong fit" : score >= 65 ? "Good fit" : score >= 50 ? "Watch closely" : "Weak fit";

  return {
    score,
    rawScore: Math.round(rawScore),
    strictnessMultiplier: PURCHASE_FIT_STRICTNESS,
    strictnessPenalty: Number(strictnessPenalty.toFixed(1)),
    label,
    growthPercent: Number(normalizedGrowth.toFixed(1)),
    estimatedRiskLevel,
    selectedRisk: normalizedSelectedRisk,
    horizon,
    methodologyVersion: "1.1",
    components: Object.fromEntries(details.map(({ key, score: componentScore }) => [key, componentScore])),
    componentDetails: details,
    explanation: `Weighted inputs produced ${Math.round(rawScore)} points before a ${strictnessPenalty.toFixed(1)}-point confidence penalty.`
  };
}
