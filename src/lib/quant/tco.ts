import type { EquityTier } from "./mnav";
import { computeOverpayAndBreakeven } from "./mnav";
import type { LiquidityGuardrailResult } from "./liquidity";

export interface WrapperTcoItem {
  id: string;
  label: string;
  category: string;
  upfrontCostUsd: number;
  annualFeeAndSpreadUsd: number;
  estimatedAnnualYieldUsd: number;
  netYear1ImpactUsd: number;
  liquidityBadge: string;
  liquidityTone: "ok" | "warn" | "danger";
  passesLiquidityGate: boolean;
  routeUrl: string;
  note: string;
}

export interface WrapperTcoInput {
  asset?: "BTC" | "ETH";
  allocationUsd: number;
  datTicker: string;
  datTier: EquityTier;
  datEvMnav: number | null;
  ibitFeePct: number;
  ibitPremDscPct: number;
  mag7Liquidity: LiquidityGuardrailResult;
  ussiLiquidity: LiquidityGuardrailResult;
  ussiEstYieldPct: number;
  morphoApyPct: number;
  boxxLiquidity: LiquidityGuardrailResult;
  boxxRoi1yPct: number;
}

export function computeWrapperTcoComparison(input: WrapperTcoInput): WrapperTcoItem[] {
  const alloc = Math.max(100, input.allocationUsd);
  const overpay = computeOverpayAndBreakeven(input.datTier, input.datEvMnav, alloc);

  const datUpfront = overpay.eligible ? overpay.overpayTaxUsd : 0;
  const ibitPremCost = Math.max(0, input.ibitPremDscPct / 100) * alloc;
  const ibitFeeUsd = (input.ibitFeePct / 100) * alloc;

  const mag7SpreadUsd = (input.mag7Liquidity.spreadBps / 10_000) * alloc;
  const mag7MgmtUsd = 0.0365 * alloc;

  const ussiSpreadUsd = (input.ussiLiquidity.spreadBps / 10_000) * alloc;
  const ussiYieldUsd = (input.ussiEstYieldPct / 100) * alloc;

  const morphoYieldUsd = (input.morphoApyPct / 100) * alloc;
  const boxxSpreadUsd = (input.boxxLiquidity.spreadBps / 10_000) * alloc;
  const boxxNetYieldUsd = (input.boxxRoi1yPct / 100) * alloc - boxxSpreadUsd;

  const spotEtfTicker = input.asset === "ETH" ? "ETHA" : "IBIT";
  const spotEtfTitle =
    input.asset === "ETH" ? "ETHA (US Spot ETH ETF)" : "IBIT (US Spot BTC ETF)";
  const spotEtfUrl =
    input.asset === "ETH"
      ? "https://sosovalue.com/assets/etf/us-eth-spot"
      : "https://sosovalue.com/assets/etf/us-btc-spot";

  const datRoleLabel =
    input.datTier === "PURE_DAT"
      ? "Pure-Play DAT"
      : input.datTier === "HYBRID_MINER"
      ? "Hybrid BTC Miner"
      : "Operating Crypto Equity";

  return [
    {
      id: "dat",
      label: `${input.datTicker} (${datRoleLabel})`,
      category: "Equity Wrapper",
      upfrontCostUsd: datUpfront,
      annualFeeAndSpreadUsd: 0,
      estimatedAnnualYieldUsd: 0,
      netYear1ImpactUsd: -datUpfront,
      liquidityBadge:
        input.datEvMnav !== null
          ? `EV mNAV ${input.datEvMnav.toFixed(2)}× · US Market Hours`
          : "US Equity Hours",
      liquidityTone: datUpfront > alloc * 0.15 ? "danger" : datUpfront > 0 ? "warn" : "ok",
      passesLiquidityGate: true,
      routeUrl: `https://sodex.com/trade/futures/${input.datTicker}-USD`,
      note: overpay.reason,
    },
    {
      id: spotEtfTicker.toLowerCase(),
      label: spotEtfTitle,
      category: "Regulated ETF",
      upfrontCostUsd: ibitPremCost,
      annualFeeAndSpreadUsd: ibitFeeUsd,
      estimatedAnnualYieldUsd: 0,
      netYear1ImpactUsd: -(ibitPremCost + ibitFeeUsd),
      liquidityBadge: `Fee ${input.ibitFeePct.toFixed(2)}%/yr · Prem ${input.ibitPremDscPct >= 0 ? "+" : ""}${input.ibitPremDscPct.toFixed(2)}%`,
      liquidityTone: "ok",
      passesLiquidityGate: true,
      routeUrl: spotEtfUrl,
      note: "Zero corporate dilution risk; trades only during NYSE/NASDAQ hours.",
    },
    {
      id: "mag7",
      label: "MAG7.ssi (SoDEX Spot Index)",
      category: "On-Chain SSI Basket",
      upfrontCostUsd: mag7SpreadUsd,
      annualFeeAndSpreadUsd: mag7MgmtUsd,
      estimatedAnnualYieldUsd: 0,
      netYear1ImpactUsd: -(mag7SpreadUsd + mag7MgmtUsd),
      liquidityBadge: input.mag7Liquidity.badgeText,
      liquidityTone: input.mag7Liquidity.badgeTone,
      passesLiquidityGate: input.mag7Liquidity.badgeTone !== "danger",
      routeUrl: "https://sodex.com/trade/spot/MAG7ssi_USDC",
      note: "24/7 auto-rebalanced top-7 crypto index (0.01%/day SSI fee + live CLOB spread).",
    },
    {
      id: "ussi",
      label: "USSI (Delta-Neutral SSI)",
      category: "Funding-Yield Basket",
      upfrontCostUsd: ussiSpreadUsd,
      annualFeeAndSpreadUsd: 0,
      estimatedAnnualYieldUsd: ussiYieldUsd,
      netYear1ImpactUsd: ussiYieldUsd - ussiSpreadUsd,
      liquidityBadge: input.ussiLiquidity.badgeText,
      liquidityTone: input.ussiLiquidity.badgeTone,
      passesLiquidityGate: input.ussiLiquidity.badgeTone !== "danger",
      routeUrl: "https://sodex.com/trade/spot/USSI_USDC",
      note: "Captures positive perp funding carry; subject to negative-funding drag in unwinds.",
    },
    {
      id: "defensive",
      label: "Morpho-Earn soUSDC (vs vBOXX)",
      category: "Defensive Cash Yield",
      upfrontCostUsd: 0,
      annualFeeAndSpreadUsd: 0,
      estimatedAnnualYieldUsd: morphoYieldUsd,
      netYear1ImpactUsd: morphoYieldUsd,
      liquidityBadge: `soUSDC ${input.morphoApyPct.toFixed(2)}% APY · Zero CLOB Slippage`,
      liquidityTone: "ok",
      passesLiquidityGate: true,
      routeUrl: "https://sodex.com/wealth/usdc-earn",
      note: `Beats vBOXX net 1Y ($${Math.round(boxxNetYieldUsd)}) after deducting vBOXX's ${input.boxxLiquidity.spreadBps.toFixed(1)} bps CLOB spread.`,
    },
  ];
}
