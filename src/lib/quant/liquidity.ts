export type OrderRecommendation =
  | "VAULT_ZERO_SLIPPAGE"
  | "MARKET_OK"
  | "LIMIT_OR_TWAP";

export interface LiquidityInput {
  symbol: string;
  lastPx: number;
  bidPx: number;
  askPx: number;
  askSz: number;
  closeTimeMs: number;
  nowMs: number;
  allocationUsd: number;
  isYieldVault?: boolean;
}

export interface LiquidityGuardrailResult {
  symbol: string;
  effectivePriceUsd: number;
  usedBookPrice: boolean;
  staleHours: number;
  isStaleLastPx: boolean;
  spreadBps: number;
  spreadWarning: boolean;
  topBookUsd: number;
  depthWarning: boolean;
  orderRecommendation: OrderRecommendation;
  warnings: string[];
  badgeText: string;
  badgeTone: "ok" | "warn" | "danger";
}

export function evaluateSodexLiquidity(input: LiquidityInput): LiquidityGuardrailResult {
  if (input.isYieldVault) {
    return {
      symbol: input.symbol,
      effectivePriceUsd: input.lastPx > 0 ? input.lastPx : 1,
      usedBookPrice: false,
      staleHours: 0,
      isStaleLastPx: false,
      spreadBps: 0,
      spreadWarning: false,
      topBookUsd: Number.POSITIVE_INFINITY,
      depthWarning: false,
      orderRecommendation: "VAULT_ZERO_SLIPPAGE",
      warnings: [],
      badgeText: "Bridged Vault · Zero CLOB Slippage",
      badgeTone: "ok",
    };
  }

  const staleHours =
    input.closeTimeMs > 0 ? Math.max(0, (input.nowMs - input.closeTimeMs) / 3_600_000) : 0;
  const isStaleLastPx = staleHours > 1;

  const hasValidBook = input.bidPx > 0 && input.askPx > 0 && input.askPx >= input.bidPx;
  const midPx = hasValidBook ? (input.bidPx + input.askPx) / 2 : input.lastPx;
  const effectivePriceUsd =
    isStaleLastPx && hasValidBook ? midPx : input.lastPx > 0 ? input.lastPx : midPx;

  const spreadBps = hasValidBook && midPx > 0 ? ((input.askPx - input.bidPx) / midPx) * 10_000 : 0;
  const spreadWarning = spreadBps > 25;

  const topBookUsd = hasValidBook && input.askSz > 0 ? input.askSz * input.askPx : 0;
  const depthWarning = topBookUsd > 0 && input.allocationUsd > 2 * topBookUsd;

  const warnings: string[] = [];
  if (isStaleLastPx) {
    const days = staleHours >= 24 ? `${(staleHours / 24).toFixed(1)}d` : `${staleHours.toFixed(1)}h`;
    warnings.push(
      `Last trade is ${days} stale — priced off live orderbook mid ($${effectivePriceUsd.toFixed(2)}).`
    );
  }
  if (spreadWarning) {
    warnings.push(`Wide orderbook spread (${spreadBps.toFixed(1)} bps) — use Limit order to protect entry.`);
  }
  if (depthWarning) {
    warnings.push(
      `Allocation ($${input.allocationUsd.toLocaleString("en-US")}) exceeds 2× top-of-book depth ($${topBookUsd.toFixed(0)}) — split via Limit/TWAP or use Morpho-Earn soUSDC.`
    );
  }

  const orderRecommendation: OrderRecommendation =
    depthWarning || spreadWarning ? "LIMIT_OR_TWAP" : "MARKET_OK";

  let badgeText = `Liquid Book · ${spreadBps.toFixed(1)} bps spread`;
  let badgeTone: "ok" | "warn" | "danger" = "ok";
  if (depthWarning) {
    badgeText = `Thin Depth ($${Math.round(topBookUsd)}) · Limit/TWAP Only`;
    badgeTone = "danger";
  } else if (spreadWarning || isStaleLastPx) {
    badgeText = `Book Quote · ${spreadBps.toFixed(1)} bps spread`;
    badgeTone = "warn";
  }

  return {
    symbol: input.symbol,
    effectivePriceUsd,
    usedBookPrice: isStaleLastPx && hasValidBook,
    staleHours,
    isStaleLastPx,
    spreadBps,
    spreadWarning,
    topBookUsd,
    depthWarning,
    orderRecommendation,
    warnings,
    badgeText,
    badgeTone,
  };
}
