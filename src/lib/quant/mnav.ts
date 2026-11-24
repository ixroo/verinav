export type EquityTier = "PURE_DAT" | "HYBRID_MINER" | "CRYPTO_EQUITY";
export type EvCompleteness = "FULL_EV" | "PARTIAL_EV" | "EQUITY_ONLY";

export interface DatBalanceSheetInput {
  ticker: string;
  name: string;
  businessType?: "TREASURY" | "MINER" | "OPERATING";
  basicMarketCapUsd: number;
  totalDebtUsd?: number;
  preferredStockUsd?: number;
  cashUsd?: number;
  itmConvertibleEquityUsd?: number;
  otmDebtFaceUsd?: number;
  cryptoHoldings: number;
  spotPriceUsd: number;
  avgCostPerCoinUsd?: number | null;
}

export interface CapitalStackBar {
  id: string;
  label: string;
  valueUsd: number;
  kind: "base" | "add" | "subtract" | "total" | "benchmark";
  note: string;
}

export interface DatValuationResult {
  ticker: string;
  name: string;
  tier: EquityTier;
  tierLabel: string;
  completeness: EvCompleteness;
  cryptoNavUsd: number;
  enterpriseValueUsd: number;
  btcBackingPct: number;
  basicMnav: number | null;
  evMnav: number | null;
  assumedConvertedEvMnav: number | null;
  effectiveCoinPriceUsd: number | null;
  unrealizedPnlPct: number | null;
  operatingBusinessIncluded: boolean;
  capitalStack: CapitalStackBar[];
}

export interface OverpayResult {
  eligible: boolean;
  reason: string;
  overpayTaxUsd: number;
  overpayPct: number;
  discountUsd: number;
  breakevenYears: number | null;
}

export interface IssuanceStressResult {
  mode: "ACCRETIVE_ATM" | "DILUTIVE";
  btcPerShareChangePct: number;
  newEvMnav: number | null;
  summary: string;
}

export function classifyEquityTier(
  cryptoNavUsd: number,
  enterpriseValueUsd: number,
  businessType?: "TREASURY" | "MINER" | "OPERATING"
): EquityTier {
  if (businessType === "MINER") return "HYBRID_MINER";
  if (businessType === "OPERATING") return "CRYPTO_EQUITY";
  if (enterpriseValueUsd <= 0 || cryptoNavUsd <= 0) return "CRYPTO_EQUITY";
  const backing = cryptoNavUsd / enterpriseValueUsd;
  if (backing >= 0.5) return "PURE_DAT";
  if (backing >= 0.15) return "HYBRID_MINER";
  return "CRYPTO_EQUITY";
}

export function getTierLabel(tier: EquityTier): string {
  switch (tier) {
    case "PURE_DAT":
      return "Pure-Play DAT";
    case "HYBRID_MINER":
      return "Hybrid Miner (Operating Business Included)";
    case "CRYPTO_EQUITY":
      return "Crypto Operating Equity";
  }
}

export function computeDatValuation(input: DatBalanceSheetInput): DatValuationResult {
  const debt = Math.max(0, input.totalDebtUsd ?? 0);
  const pref = Math.max(0, input.preferredStockUsd ?? 0);
  const cash = Math.max(0, input.cashUsd ?? 0);
  const cryptoNavUsd = Math.max(0, input.cryptoHoldings * input.spotPriceUsd);
  const enterpriseValueUsd = Math.max(0, input.basicMarketCapUsd + debt + pref - cash);

  let completeness: EvCompleteness = "EQUITY_ONLY";
  if (
    input.totalDebtUsd !== undefined &&
    input.preferredStockUsd !== undefined &&
    input.cashUsd !== undefined
  ) {
    completeness = "FULL_EV";
  } else if (input.totalDebtUsd !== undefined || input.cashUsd !== undefined) {
    completeness = "PARTIAL_EV";
  }

  const tier = classifyEquityTier(cryptoNavUsd, enterpriseValueUsd, input.businessType);
  const btcBackingPct = enterpriseValueUsd > 0 ? cryptoNavUsd / enterpriseValueUsd : 0;

  const basicMnav = cryptoNavUsd > 0 ? input.basicMarketCapUsd / cryptoNavUsd : null;
  const evMnav = cryptoNavUsd > 0 && enterpriseValueUsd > 0 ? enterpriseValueUsd / cryptoNavUsd : null;

  // Assumed-converted EV avoids double-counting ITM convertibles in both shares and debt
  const hasConvertSplit =
    input.itmConvertibleEquityUsd !== undefined || input.otmDebtFaceUsd !== undefined;
  const assumedConvertedEvUsd = hasConvertSplit
    ? Math.max(
        0,
        input.basicMarketCapUsd +
          Math.max(0, input.itmConvertibleEquityUsd ?? 0) +
          Math.max(0, input.otmDebtFaceUsd ?? 0) +
          pref -
          cash
      )
    : enterpriseValueUsd;
  const assumedConvertedEvMnav =
    cryptoNavUsd > 0 && assumedConvertedEvUsd > 0 ? assumedConvertedEvUsd / cryptoNavUsd : null;

  const effectiveCoinPriceUsd =
    tier !== "CRYPTO_EQUITY" && evMnav !== null ? input.spotPriceUsd * evMnav : null;

  const unrealizedPnlPct =
    input.avgCostPerCoinUsd && input.avgCostPerCoinUsd > 0
      ? ((input.spotPriceUsd - input.avgCostPerCoinUsd) / input.avgCostPerCoinUsd) * 100
      : null;

  const capitalStack: CapitalStackBar[] = [
    {
      id: "mktcap",
      label: "Basic Market Cap",
      valueUsd: input.basicMarketCapUsd,
      kind: "base",
      note: "Common equity valuation at current share price",
    },
    {
      id: "debt",
      label: "+ Convertible & Senior Debt",
      valueUsd: debt,
      kind: "add",
      note: "Senior claims sitting ahead of common shareholders",
    },
    {
      id: "preferred",
      label: "+ Digital Credit Preferreds",
      valueUsd: pref,
      kind: "add",
      note: "Preferred stack (e.g., STRC / STRD / STRF / STRK)",
    },
    {
      id: "cash",
      label: "− Cash & Equivalents",
      valueUsd: -cash,
      kind: "subtract",
      note: "Unrestricted cash reducing net enterprise value",
    },
    {
      id: "ev",
      label: "= Enterprise Value (EV)",
      valueUsd: enterpriseValueUsd,
      kind: "total",
      note: "True capital claim required to own the underlying treasury",
    },
    {
      id: "nav",
      label: "Underlying Crypto NAV",
      valueUsd: cryptoNavUsd,
      kind: "benchmark",
      note: `${input.cryptoHoldings.toLocaleString("en-US")} BTC × $${input.spotPriceUsd.toLocaleString("en-US")}`,
    },
  ];

  return {
    ticker: input.ticker,
    name: input.name,
    tier,
    tierLabel: getTierLabel(tier),
    completeness,
    cryptoNavUsd,
    enterpriseValueUsd,
    btcBackingPct,
    basicMnav,
    evMnav,
    assumedConvertedEvMnav,
    effectiveCoinPriceUsd,
    unrealizedPnlPct,
    operatingBusinessIncluded: tier !== "PURE_DAT",
    capitalStack,
  };
}

export function computeOverpayAndBreakeven(
  tier: EquityTier,
  evMnav: number | null,
  allocationUsd: number,
  expectedBtcYieldAnnual = 0.12
): OverpayResult {
  if (tier === "CRYPTO_EQUITY") {
    return {
      eligible: false,
      reason: "Operating crypto equity (<15% BTC backing) — excluded from mNAV Overpay Tax.",
      overpayTaxUsd: 0,
      overpayPct: 0,
      discountUsd: 0,
      breakevenYears: null,
    };
  }
  if (tier === "HYBRID_MINER") {
    return {
      eligible: false,
      reason: "Hybrid miner includes active mining/AI-HPC operations — evaluate BTC Backing % of EV.",
      overpayTaxUsd: 0,
      overpayPct: 0,
      discountUsd: 0,
      breakevenYears: null,
    };
  }
  if (evMnav === null || evMnav <= 0 || allocationUsd <= 0) {
    return {
      eligible: false,
      reason: "Insufficient EV mNAV data.",
      overpayTaxUsd: 0,
      overpayPct: 0,
      discountUsd: 0,
      breakevenYears: null,
    };
  }
  if (evMnav <= 1) {
    const discountPct = (1 - evMnav) * 100;
    return {
      eligible: true,
      reason: `Trading at ${discountPct.toFixed(1)}% EV discount to underlying BTC NAV.`,
      overpayTaxUsd: 0,
      overpayPct: 0,
      discountUsd: allocationUsd * (1 / evMnav - 1),
      breakevenYears: 0,
    };
  }

  const overpayFraction = 1 - 1 / evMnav;
  const overpayTaxUsd = allocationUsd * overpayFraction;
  const breakevenYears =
    expectedBtcYieldAnnual > 0 ? Math.log(evMnav) / Math.log(1 + expectedBtcYieldAnnual) : null;

  return {
    eligible: true,
    reason: `Paying ${(evMnav - 1) * 100 >= 1 ? `+${((evMnav - 1) * 100).toFixed(1)}%` : "a slight"} EV premium above spot BTC.`,
    overpayTaxUsd,
    overpayPct: overpayFraction * 100,
    discountUsd: 0,
    breakevenYears,
  };
}

export function simulateIssuanceStress(
  evMnav: number | null,
  shareExpansionPct: number,
  mode: "ACCRETIVE_ATM" | "DILUTIVE"
): IssuanceStressResult {
  const s = Math.max(0, shareExpansionPct) / 100;
  if (evMnav === null || evMnav <= 0) {
    return {
      mode,
      btcPerShareChangePct: 0,
      newEvMnav: null,
      summary: "Enter a valid EV mNAV to run issuance stress.",
    };
  }

  if (mode === "ACCRETIVE_ATM") {
    const ratio = (1 + s * evMnav) / (1 + s);
    const changePct = (ratio - 1) * 100;
    const newEvMnav = evMnav / ratio;
    return {
      mode,
      btcPerShareChangePct: changePct,
      newEvMnav,
      summary:
        evMnav > 1
          ? `Issuing +${shareExpansionPct.toFixed(0)}% shares at ${evMnav.toFixed(2)}× EV mNAV to buy BTC is accretive (+${changePct.toFixed(2)}% BTC/share).`
          : `At ${evMnav.toFixed(2)}× EV mNAV (<1.0×), ATM issuance destroys BTC/share (${changePct.toFixed(2)}%) — financing edge is closed.`,
    };
  }

  const changePct = (1 / (1 + s) - 1) * 100;
  const newEvMnav = evMnav * (1 + s);
  return {
    mode,
    btcPerShareChangePct: changePct,
    newEvMnav,
    summary: `Non-accretive dilution of +${shareExpansionPct.toFixed(0)}% cuts BTC/share by ${Math.abs(changePct).toFixed(2)}% and raises effective EV mNAV to ${newEvMnav.toFixed(2)}×.`,
  };
}
