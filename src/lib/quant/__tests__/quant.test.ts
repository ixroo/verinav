import { describe, expect, it } from "vitest";
import {
  classifyEquityTier,
  computeDatValuation,
  computeOverpayAndBreakeven,
  simulateIssuanceStress,
} from "../mnav";
import {
  computeFlowAuthenticity,
  computeFundingAprFrom1h,
  computeNetCarrySpread,
} from "../flowtruth";
import { classifyCapitalRegime } from "../regime";
import { evaluateSodexLiquidity } from "../liquidity";
import { computeWrapperTcoComparison } from "../tco";

describe("Quant Engine: 3-Tier Equity Taxonomy & EV mNAV", () => {
  it("excludes COIN (<15% BTC backing) from mNAV Overpay Tax", () => {
    const val = computeDatValuation({
      ticker: "COIN",
      name: "Coinbase Global",
      basicMarketCapUsd: 28_800_000_000,
      totalDebtUsd: 4_200_000_000,
      cashUsd: 8_000_000_000,
      cryptoHoldings: 9_500,
      spotPriceUsd: 60_000,
    });
    expect(val.tier).toBe("CRYPTO_EQUITY");
    const overpay = computeOverpayAndBreakeven(val.tier, val.evMnav, 10_000);
    expect(overpay.eligible).toBe(false);
    expect(overpay.overpayTaxUsd).toBe(0);
  });

  it("locks MARA with businessType MINER as HYBRID_MINER even if BTC backing >= 50%", () => {
    const tier = classifyEquityTier(3_000_000_000, 5_000_000_000, "MINER");
    expect(tier).toBe("HYBRID_MINER");
    const overpay = computeOverpayAndBreakeven(tier, 1.66, 10_000);
    expect(overpay.eligible).toBe(false);
  });

  it("computes MSTR Basic vs Full EV mNAV and Capital Stack Waterfall cleanly", () => {
    const val = computeDatValuation({
      ticker: "MSTR",
      name: "Strategy Inc.",
      basicMarketCapUsd: 34_200_000_000,
      totalDebtUsd: 8_200_000_000,
      preferredStockUsd: 10_530_000_000,
      cashUsd: 2_300_000_000,
      cryptoHoldings: 851_305,
      spotPriceUsd: 60_000,
      avgCostPerCoinUsd: 75_385,
    });
    expect(val.tier).toBe("PURE_DAT");
    expect(val.completeness).toBe("FULL_EV");
    expect(val.basicMnav).toBeCloseTo(0.67, 1);
    expect(val.evMnav).toBeCloseTo(0.99, 1);
    expect(val.capitalStack).toHaveLength(6);
  });

  it("guards divide-by-zero when crypto holdings are zero", () => {
    const val = computeDatValuation({
      ticker: "ZERO",
      name: "Zero BTC",
      basicMarketCapUsd: 1_000_000,
      cryptoHoldings: 0,
      spotPriceUsd: 60_000,
    });
    expect(val.evMnav).toBeNull();
    expect(val.basicMnav).toBeNull();
  });

  it("models 2-way issuance stress (Accretive ATM >1x vs Dilutive)", () => {
    const accretive = simulateIssuanceStress(1.8, 10, "ACCRETIVE_ATM");
    expect(accretive.btcPerShareChangePct).toBeGreaterThan(0);

    const closed = simulateIssuanceStress(0.96, 10, "ACCRETIVE_ATM");
    expect(closed.btcPerShareChangePct).toBeLessThan(0);

    const dilutive = simulateIssuanceStress(1.2, 10, "DILUTIVE");
    expect(dilutive.btcPerShareChangePct).toBeLessThan(0);
    expect(dilutive.newEvMnav).toBeGreaterThan(1.2);
  });
});

describe("Quant Engine: FlowTruth & 4-Quadrant Regime", () => {
  it("annualizes 1h SoDEX funding rate using 8760 hours", () => {
    expect(computeFundingAprFrom1h(0.0000125)).toBeCloseTo(10.95, 2);
  });

  it("computes Net Carry Spread vs SOFR and detects Synthetic vs Organic bands", () => {
    const netCarry = computeNetCarrySpread(10.95, 4.5, 0.25, 0.5);
    expect(netCarry).toBeCloseTo(5.7, 2);

    const trap = computeFlowAuthenticity({
      fundingRate1h: 0.00002, // ~17.52% APR
      sofrPct: 4.5,
      etfFlow5dUsd: 1_500_000_000,
      etfPositiveDaysIn5d: 5,
      etfPremDscPct: 0.45,
      markPriceUsd: 60_200,
      indexPriceUsd: 60_000, // +33 bps
      oiNowUsd: 125_000_000,
      oi5dAgoUsd: 100_000_000, // +25% OI
    });
    expect(trap.band).toBe("SYNTHETIC");
    expect(trap.authenticityScore).toBeLessThan(40);
  });

  it("classifies Q1 Synthetic Froth Trap and Q3 Forced Carry Unwind correctly", () => {
    const q1 = classifyCapitalRegime({
      etfFlow5dUsd: 900_000_000,
      netCarrySpreadPct: 6.2,
      anchorEvMnav: 1.85,
      oiVelocity5dPct: 12,
    });
    expect(q1.quadrant).toBe("Q1");

    const q3 = classifyCapitalRegime({
      etfFlow5dUsd: -569_740_000,
      netCarrySpreadPct: -1.2,
      anchorEvMnav: 0.96,
      oiVelocity5dPct: -8,
    });
    expect(q3.quadrant).toBe("Q3");
    expect(q3.diagnosis.toLowerCase()).toContain("below sofr");

    const q3PosCarry = classifyCapitalRegime({
      etfFlow5dUsd: -2_370_000_000,
      netCarrySpreadPct: 6.28,
      anchorEvMnav: 0.99,
      oiVelocity5dPct: 4,
    });
    expect(q3PosCarry.quadrant).toBe("Q3");
    expect(q3PosCarry.diagnosis.toLowerCase()).not.toContain("below sofr");
    expect(q3PosCarry.diagnosis).toContain("+6.28%");
  });
});

describe("Quant Engine: 3-Gate SoDEX Liquidity & 5-Wrapper TCO", () => {
  it("catches stale lastPx and 50bps wide spread on vBOXX/vSTRC", () => {
    const now = 1_795_511_281_000;
    const stale7d = now - 7.77 * 86_400_000;
    const res = evaluateSodexLiquidity({
      symbol: "vSTRC_vUSDC",
      lastPx: 99.85,
      bidPx: 97.0,
      askPx: 97.49,
      askSz: 100,
      closeTimeMs: stale7d,
      nowMs: now,
      allocationUsd: 1_000,
    });
    expect(res.isStaleLastPx).toBe(true);
    expect(res.usedBookPrice).toBe(true);
    expect(res.effectivePriceUsd).toBeCloseTo(97.245, 2);
    expect(res.spreadWarning).toBe(true);
    expect(res.orderRecommendation).toBe("LIMIT_OR_TWAP");
  });

  it("flags thin top-of-book depth on vUSSI ($360) for $10k allocation", () => {
    const now = 1_795_511_281_000;
    const res = evaluateSodexLiquidity({
      symbol: "vUSSI_vUSDC",
      lastPx: 1.01,
      bidPx: 1.008,
      askPx: 1.01,
      askSz: 357.18,
      closeTimeMs: now - 300_000,
      nowMs: now,
      allocationUsd: 10_000,
    });
    expect(res.depthWarning).toBe(true);
    expect(res.orderRecommendation).toBe("LIMIT_OR_TWAP");
  });

  it("includes live spread cost inside 5-wrapper 1Y TCO comparison", () => {
    const now = 1_795_511_281_000;
    const mag7 = evaluateSodexLiquidity({
      symbol: "vMAG7ssi_vUSDC",
      lastPx: 0.388,
      bidPx: 0.387,
      askPx: 0.389,
      askSz: 800,
      closeTimeMs: now - 60_000,
      nowMs: now,
      allocationUsd: 10_000,
    });
    const morpho = evaluateSodexLiquidity({
      symbol: "Morpho-Earn",
      lastPx: 1.01,
      bidPx: 1.01,
      askPx: 1.01,
      askSz: 0,
      closeTimeMs: now,
      nowMs: now,
      allocationUsd: 10_000,
      isYieldVault: true,
    });
    expect(morpho.orderRecommendation).toBe("VAULT_ZERO_SLIPPAGE");
    const tco = computeWrapperTcoComparison({
      allocationUsd: 10_000,
      datTicker: "MSTR",
      datTier: "PURE_DAT",
      datEvMnav: 1.5,
      ibitFeePct: 0.25,
      ibitPremDscPct: 0.02,
      mag7Liquidity: mag7,
      ussiLiquidity: mag7,
      ussiEstYieldPct: 6.5,
      morphoApyPct: 5.26,
      boxxLiquidity: { ...mag7, spreadBps: 50.3 },
      boxxRoi1yPct: 4.09,
    });
    expect(tco).toHaveLength(5);
    expect(tco[0].upfrontCostUsd).toBeCloseTo(3333.33, 1);
    expect(tco[3].passesLiquidityGate).toBe(false);
    expect(tco[4].passesLiquidityGate).toBe(true);
    expect(tco[4].netYear1ImpactUsd).toBeCloseTo(526, 0);
  });
});
