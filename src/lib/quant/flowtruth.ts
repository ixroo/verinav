export type FlowBand = "ORGANIC" | "MIXED" | "SYNTHETIC";

export interface FlowTruthInput {
  fundingRate1h: number;
  sofrPct: number;
  etfFlow5dUsd: number;
  etfPositiveDaysIn5d: number;
  etfPremDscPct: number;
  markPriceUsd: number;
  indexPriceUsd: number;
  oiNowUsd: number;
  oi5dAgoUsd: number;
  etfFeePct?: number;
  marginHaircutPct?: number;
}

export interface FlowTruthResult {
  fundingAprPct: number;
  netCarrySpreadPct: number;
  markIndexBasisBps: number;
  oiVelocity5dPct: number;
  authenticityScore: number;
  band: FlowBand;
  bandLabel: string;
  carryDiagnosis: string;
  breakdown: {
    carryDisciplineScore: number;
    flowConsistencyScore: number;
    crowdingSanityScore: number;
  };
}

export function computeFundingAprFrom1h(fundingRate1h: number): number {
  return fundingRate1h * 24 * 365 * 100;
}

export function computeNetCarrySpread(
  fundingAprPct: number,
  sofrPct: number,
  etfFeePct = 0.25,
  marginHaircutPct = 0.5
): number {
  return fundingAprPct - sofrPct - etfFeePct - marginHaircutPct;
}

export function computeMarkIndexBasisBps(markPriceUsd: number, indexPriceUsd: number): number {
  if (indexPriceUsd <= 0) return 0;
  return ((markPriceUsd - indexPriceUsd) / indexPriceUsd) * 10_000;
}

export function computeOiVelocityPct(oiNowUsd: number, oi5dAgoUsd: number): number {
  if (oi5dAgoUsd <= 0) return 0;
  return ((oiNowUsd - oi5dAgoUsd) / oi5dAgoUsd) * 100;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function computeFlowAuthenticity(input: FlowTruthInput): FlowTruthResult {
  const fundingAprPct = computeFundingAprFrom1h(input.fundingRate1h);
  const netCarrySpreadPct = computeNetCarrySpread(
    fundingAprPct,
    input.sofrPct,
    input.etfFeePct ?? 0.25,
    input.marginHaircutPct ?? 0.5
  );
  const markIndexBasisBps = computeMarkIndexBasisBps(input.markPriceUsd, input.indexPriceUsd);
  const oiVelocity5dPct = computeOiVelocityPct(input.oiNowUsd, input.oi5dAgoUsd);

  // 45% weight: Carry Spread Discipline (100 when <= 0%, linear decay to 0 at >= +12%)
  const carryDisciplineScore =
    netCarrySpreadPct <= 0
      ? 100
      : clamp(100 - (netCarrySpreadPct / 12) * 100, 0, 100);

  // 30% weight: 5D ETF Flow Consistency & tight prem/dsc
  const consistencyBase = clamp((input.etfPositiveDaysIn5d / 5) * 75, 0, 75);
  const premStabilityBonus = Math.abs(input.etfPremDscPct) < 0.3 ? 25 : 10;
  const flowConsistencyScore = clamp(consistencyBase + premStabilityBonus, 0, 100);

  // 25% weight: Perps Crowding Sanity (penalizes basis > +15 bps or OI surge > +15%)
  const basisPenalty = markIndexBasisBps > 15 ? clamp((markIndexBasisBps - 15) * 2.5, 0, 55) : 0;
  const oiPenalty = oiVelocity5dPct > 15 ? clamp((oiVelocity5dPct - 15) * 2.2, 0, 45) : 0;
  const crowdingSanityScore = clamp(100 - basisPenalty - oiPenalty, 0, 100);

  const authenticityScore = Math.round(
    carryDisciplineScore * 0.45 + flowConsistencyScore * 0.3 + crowdingSanityScore * 0.25
  );

  let band: FlowBand = "MIXED";
  let bandLabel = "Mixed / Partial Carry";
  if (authenticityScore >= 70) {
    band = "ORGANIC";
    bandLabel = "Organic Spot Demand";
  } else if (authenticityScore < 40) {
    band = "SYNTHETIC";
    bandLabel = "Likely Carry-Arbitrage / Synthetic";
  }

  let carryDiagnosis =
    "Carry spread is marginal — ETF flows likely mix directional allocators and partial hedge-fund basis trades.";
  if (netCarrySpreadPct > 4) {
    carryDiagnosis = `Net carry (+${netCarrySpreadPct.toFixed(2)}% over SOFR) makes long-ETF / short-perp arbitrage highly profitable — treat headline inflows with caution.`;
  } else if (netCarrySpreadPct < 0) {
    carryDiagnosis =
      input.etfFlow5dUsd < 0
        ? `Carry is unprofitable (${netCarrySpreadPct.toFixed(2)}% vs SOFR), consistent with mechanical hedge-fund unwinds rather than pure spot panic.`
        : `Carry is unprofitable (${netCarrySpreadPct.toFixed(2)}% vs SOFR), meaning positive ETF inflows reflect high-conviction organic spot demand.`;
  }

  return {
    fundingAprPct,
    netCarrySpreadPct,
    markIndexBasisBps,
    oiVelocity5dPct,
    authenticityScore,
    band,
    bandLabel,
    carryDiagnosis,
    breakdown: {
      carryDisciplineScore: Math.round(carryDisciplineScore),
      flowConsistencyScore: Math.round(flowConsistencyScore),
      crowdingSanityScore: Math.round(crowdingSanityScore),
    },
  };
}
