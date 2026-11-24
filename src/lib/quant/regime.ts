export type RegimeQuadrant = "Q1" | "Q2" | "Q3" | "Q4";

export interface RegimeInput {
  asset?: "BTC" | "ETH";
  etfFlow5dUsd: number;
  netCarrySpreadPct: number;
  anchorEvMnav: number | null;
  oiVelocity5dPct: number;
}

export interface RegimeDiagnosis {
  quadrant: RegimeQuadrant;
  title: string;
  severity: "danger" | "positive" | "warning" | "caution";
  headline: string;
  diagnosis: string;
  recommendedAction: string;
  primaryRouteSymbol: string;
  secondaryRouteSymbol: string;
}

export function classifyCapitalRegime(input: RegimeInput): RegimeDiagnosis {
  const mnav = input.anchorEvMnav ?? 1.0;
  const spotPair = input.asset === "ETH" ? "vETH_vUSDC" : "vBTC_vUSDC";
  const etfLabel = input.asset === "ETH" ? "ETHA" : "IBIT";

  if (input.etfFlow5dUsd > 0 && input.netCarrySpreadPct > 4 && mnav > 1.65) {
    return {
      quadrant: "Q1",
      title: "Q1 · Synthetic Froth Trap",
      severity: "danger",
      headline: "High ETF inflows are heavily carry-driven while DAT premiums are stretched.",
      diagnosis:
        "Hedge funds are buying Spot ETFs and shorting perps to harvest carry above SOFR. Chasing pure-play DATs above 1.65× EV mNAV exposes you to both funding unwind and premium compression.",
      recommendedAction:
        "Avoid chasing equity premiums. Park defensive capital in Morpho-Earn soUSDC (zero CLOB slippage) or use limit-guarded vUSSI.",
      primaryRouteSymbol: "Morpho-Earn",
      secondaryRouteSymbol: "vUSSI_vUSDC",
    };
  }

  if (input.etfFlow5dUsd <= 0 && mnav > 2.0) {
    return {
      quadrant: "Q4",
      title: "Q4 · Retail Equity Mania",
      severity: "caution",
      headline: "DAT equity premiums are disconnected from flat or negative spot ETF demand.",
      diagnosis:
        "Corporate treasury stock multiples exceed 2.0× EV mNAV without backing from spot ETF inflows — indicating equity-market narrative crowding rather than broad spot accumulation.",
      recommendedAction:
        `Rotate excess equity premium into lower-cost spot exposure (${etfLabel} or ${spotPair}) or diversified vMAG7ssi.`,
      primaryRouteSymbol: spotPair,
      secondaryRouteSymbol: "vMAG7ssi_vUSDC",
    };
  }

  if (input.etfFlow5dUsd < 0 && (input.netCarrySpreadPct < 0 || mnav < 1.05)) {
    const isCarryNegative = input.netCarrySpreadPct < 0;
    return {
      quadrant: "Q3",
      title: "Q3 · Forced Carry Unwind",
      severity: "warning",
      headline: isCarryNegative
        ? "Heavy ETF outflows coincide with negative carry below SOFR and near-par DAT valuation."
        : `Heavy ETF outflows & near-par DAT valuation while perp carry remains elevated (+${input.netCarrySpreadPct.toFixed(2)}% vs SOFR).`,
      diagnosis: isCarryNegative
        ? "When funding compresses below SOFR alongside negative ETF flows, mechanical hedge-fund unwinds amplify headline selling while pure-play DAT premiums collapse near or below 1.0× EV mNAV."
        : `Spot ETF outflows are outpacing perp de-leveraging—perp funding stays +${input.netCarrySpreadPct.toFixed(2)}% above SOFR while pure-play DAT premiums sit near par. Watch for spot stabilization before deploying aggressively.`,
      recommendedAction:
        `Do not panic-sell into mechanical unwinds. Compare near-par DATs vs direct ${spotPair}, or earn defensive yield in Morpho-Earn soUSDC while waiting for OI stabilization.`,
      primaryRouteSymbol: "Morpho-Earn",
      secondaryRouteSymbol: spotPair,
    };
  }

  return {
    quadrant: "Q2",
    title: "Q2 · True Spot Accumulation",
    severity: "positive",
    headline: "Spot demand is disciplined with low carry crowding and reasonable wrapper multiples.",
    diagnosis:
      "Net carry spread remains contained relative to SOFR and pure-play DAT multiples are disciplined — favoring clean, low-friction exposure over speculative leverage.",
    recommendedAction:
      `Compare 1-Year All-In TCO across ${etfLabel} Spot ETF (0.25%/yr), direct 24/7 ${spotPair}, or auto-rebalanced vMAG7ssi on SoDEX.`,
    primaryRouteSymbol: spotPair,
    secondaryRouteSymbol: "vMAG7ssi_vUSDC",
  };
}
