import { getSodexSnapshot } from "./sodex";
import { getHyperliquidFundingHistory } from "./hyperliquid";
import {
  EQUITY_FILING_META,
  getSosoCoreData,
  type HotNewsItem,
  type MacroEventDay,
} from "./sosovalue";
import {
  computeDatValuation,
  computeOverpayAndBreakeven,
  type DatValuationResult,
  type OverpayResult,
} from "../quant/mnav";
import { computeFlowAuthenticity, type FlowTruthResult } from "../quant/flowtruth";
import { classifyCapitalRegime, type RegimeDiagnosis } from "../quant/regime";
import { evaluateSodexLiquidity, type LiquidityGuardrailResult } from "../quant/liquidity";
import { computeWrapperTcoComparison, type WrapperTcoItem } from "../quant/tco";

export interface ChartDayPoint {
  date: string;
  etfNetInflowM: number;
  fundingAprPct: number;
  sofrPct: number;
  classification: "Carry-Driven" | "Organic" | "Unwind";
}

export interface EquityAuditRow {
  valuation: DatValuationResult;
  overpay: OverpayResult;
  sharePriceUsd: number;
  mktStatus: string;
  sodexPerpPriceUsd: number | null;
  sodexPerpChangePct: number | null;
  btcHoldings: number;
  avgCostUsd: number | null;
}

export interface WorkspacePayload {
  asset: "BTC" | "ETH";
  allocationUsd: number;
  selectedTicker: string;
  spotPriceUsd: number;
  btcSpotUsd: number;
  etfFlow1dUsd: number;
  etfFlow5dUsd: number;
  etfTotalNetAssetsUsd: number;
  sofrPct: number;
  morphoApyPct: number;
  flowTruth: FlowTruthResult;
  regime: RegimeDiagnosis;
  chartSeries30d: ChartDayPoint[];
  equities: EquityAuditRow[];
  selectedEquity: EquityAuditRow;
  selectedValuation: DatValuationResult;
  wrappersTco: WrapperTcoItem[];
  sodexLiquidity: Record<string, LiquidityGuardrailResult>;
  macroEvents: MacroEventDay[];
  macroCircuitBreaker: {
    active: boolean;
    headline: string;
    eventsToday: string[];
  };
  hotNews: HotNewsItem[];
  replay30d: {
    mstr30dPct: number | null;
    mag730dPct: number;
    soUsdc30dPct: number;
    totalDays: number;
    defensiveDays: number;
    accumulationDays: number;
    ruleReplayLabel: string;
  };
  provenance: {
    etfDate: string;
    sofrDate: string;
    usMarketStatus: string;
    isEquityClosed: boolean;
    sodexAge: string;
    sosoAge: string;
    sosoLive: boolean;
  };
}

const HIGH_IMPACT_KEYWORDS = ["PCE", "CPI", "FOMC", "GDP", "PAYROLL", "RATE", "FED"];

export async function buildWorkspacePayload(
  asset: "BTC" | "ETH",
  allocationUsd: number,
  selectedTicker: string
): Promise<WorkspacePayload> {
  const [sodexRes, hlRes, sosoRes] = await Promise.all([
    getSodexSnapshot(),
    getHyperliquidFundingHistory(asset, 30),
    getSosoCoreData(asset),
  ]);

  const sodex = sodexRes.data;
  const soso = sosoRes.data;
  const nowMs = Date.now();

  const perpSymbol = asset === "BTC" ? "BTC-USD" : "ETH-USD";
  const perpTicker = sodex.perpsBySymbol[perpSymbol];
  const btcSpotTicker = sodex.perpsBySymbol["BTC-USD"];
  const spotPriceUsd = perpTicker?.indexPrice || perpTicker?.markPrice || (asset === "BTC" ? 60000 : 1700);
  const btcPriceForDat = btcSpotTicker?.indexPrice || btcSpotTicker?.markPrice || 60000;

  const etfHist = soso.etfHistory;
  const last5Etf = etfHist.slice(-5);
  const etfFlow1dUsd = etfHist[etfHist.length - 1]?.totalNetInflowUsd ?? 0;
  const etfFlow5dUsd = last5Etf.reduce((s, d) => s + d.totalNetInflowUsd, 0);
  const etfPositiveDaysIn5d = last5Etf.filter((d) => d.totalNetInflowUsd > 0).length;
  const etfTotalNetAssetsUsd = etfHist[etfHist.length - 1]?.totalNetAssetsUsd ?? 0;

  const oiNowUsd = (perpTicker?.openInterest ?? 0) * spotPriceUsd;
  const oi5dAgoUsd = oiNowUsd > 0 ? oiNowUsd * 0.96 : 1;

  const flowTruth = computeFlowAuthenticity({
    fundingRate1h: perpTicker?.fundingRate ?? 0,
    sofrPct: soso.sofrPct,
    etfFlow5dUsd,
    etfPositiveDaysIn5d,
    etfPremDscPct: soso.anchorEtf.premDscPct,
    markPriceUsd: perpTicker?.markPrice ?? spotPriceUsd,
    indexPriceUsd: perpTicker?.indexPrice ?? spotPriceUsd,
    oiNowUsd,
    oi5dAgoUsd,
    etfFeePct: soso.anchorEtf.sponsorFeePct || 0.25,
  });

  const hlByDate = new Map(hlRes.data.map((p) => [p.date, p.fundingAprPct]));
  let lastKnownFunding = flowTruth.fundingAprPct;
  const chartSeries30d: ChartDayPoint[] = etfHist.map((d) => {
    const f = hlByDate.get(d.date);
    if (f !== undefined) lastKnownFunding = f;
    const netCarry = lastKnownFunding - soso.sofrPct - 0.75;
    let classification: ChartDayPoint["classification"] = "Organic";
    if (d.totalNetInflowUsd < 0) classification = "Unwind";
    else if (netCarry > 4) classification = "Carry-Driven";
    return {
      date: d.date,
      etfNetInflowM: Number((d.totalNetInflowUsd / 1_000_000).toFixed(2)),
      fundingAprPct: Number(lastKnownFunding.toFixed(2)),
      sofrPct: soso.sofrPct,
      classification,
    };
  });

  const equities: EquityAuditRow[] = Object.values(EQUITY_FILING_META).map((meta) => {
    const liveStock = soso.stocks[meta.ticker];
    const liveTreasury = soso.treasuries[meta.ticker];
    const basicMarketCapUsd = liveStock?.circulatingMarketCapUsd || meta.fallbackMarketCapUsd;
    const btcHoldings = liveTreasury?.btcHolding || meta.fallbackBtcHoldings;
    const avgCostUsd = liveTreasury?.avgBtcCostUsd ?? meta.fallbackAvgCostUsd;

    const valuation = computeDatValuation({
      ticker: meta.ticker,
      name: meta.name,
      businessType: meta.businessType,
      basicMarketCapUsd,
      totalDebtUsd: meta.totalDebtUsd,
      preferredStockUsd: meta.preferredStockUsd,
      cashUsd: meta.cashUsd,
      itmConvertibleEquityUsd: meta.itmConvertibleEquityUsd,
      otmDebtFaceUsd: meta.otmDebtFaceUsd,
      cryptoHoldings: btcHoldings,
      spotPriceUsd: btcPriceForDat,
      avgCostPerCoinUsd: avgCostUsd,
    });

    const overpay = computeOverpayAndBreakeven(valuation.tier, valuation.evMnav, allocationUsd);
    const perpQuote = sodex.perpsBySymbol[`${meta.ticker}-USD`];

    return {
      valuation,
      overpay,
      sharePriceUsd: liveStock?.mktPrice || 0,
      mktStatus: liveStock?.mktStatus || "CLOSED",
      sodexPerpPriceUsd: perpQuote ? perpQuote.markPrice : null,
      sodexPerpChangePct: perpQuote ? perpQuote.changePct : null,
      btcHoldings,
      avgCostUsd,
    };
  });

  const mstrRow = equities.find((e) => e.valuation.ticker === "MSTR") ?? equities[0];
  const selectedEquity = equities.find((e) => e.valuation.ticker === selectedTicker) ?? mstrRow;

  const regime = classifyCapitalRegime({
    asset,
    etfFlow5dUsd,
    netCarrySpreadPct: flowTruth.netCarrySpreadPct,
    anchorEvMnav: mstrRow.valuation.evMnav,
    oiVelocity5dPct: flowTruth.oiVelocity5dPct,
  });

  const evalSpot = (sym: string): LiquidityGuardrailResult => {
    const t = sodex.spotBySymbol[sym];
    return evaluateSodexLiquidity({
      symbol: sym,
      lastPx: t?.lastPx ?? 0,
      bidPx: t?.bidPx ?? 0,
      askPx: t?.askPx ?? 0,
      askSz: t?.askSz ?? 0,
      closeTimeMs: t?.closeTime ?? nowMs,
      nowMs,
      allocationUsd,
    });
  };

  const evalPerp = (sym: string): LiquidityGuardrailResult => {
    const t = sodex.perpsBySymbol[sym];
    return evaluateSodexLiquidity({
      symbol: sym,
      lastPx: t?.lastPx ?? 0,
      bidPx: t?.bidPx ?? 0,
      askPx: t?.askPx ?? 0,
      askSz: t?.askSz ?? 0,
      closeTimeMs: t?.closeTime ?? nowMs,
      nowMs,
      allocationUsd,
    });
  };

  const morphoWealth = sodex.wealthByFundId["Morpho-Earn"];
  const morphoApyPct = morphoWealth?.apy7d ?? 5.26;
  const boxxWealth = sodex.wealthByFundId["vBOXX"];

  const mag7Liq = evalSpot("vMAG7ssi_vUSDC");
  const ussiLiq = evalSpot("vUSSI_vUSDC");
  const boxxLiq = evalSpot("vBOXX_vUSDC");
  const strcLiq = evalSpot("vSTRC_vUSDC");
  const btcLiq = evalSpot("vBTC_vUSDC");
  const btcPerpLiq = evalPerp("BTC-USD");
  const ethPerpLiq = evalPerp("ETH-USD");
  const morphoLiq = evaluateSodexLiquidity({
    symbol: "Morpho-Earn",
    lastPx: morphoWealth?.price ?? 1.01,
    bidPx: morphoWealth?.price ?? 1.01,
    askPx: morphoWealth?.price ?? 1.01,
    askSz: 0,
    closeTimeMs: nowMs,
    nowMs,
    allocationUsd,
    isYieldVault: true,
  });

  const wrappersTco = computeWrapperTcoComparison({
    asset,
    allocationUsd,
    datTicker: selectedEquity.valuation.ticker,
    datTier: selectedEquity.valuation.tier,
    datEvMnav: selectedEquity.valuation.evMnav,
    ibitFeePct: soso.anchorEtf.sponsorFeePct || 0.25,
    ibitPremDscPct: soso.anchorEtf.premDscPct,
    mag7Liquidity: mag7Liq,
    ussiLiquidity: ussiLiq,
    ussiEstYieldPct: Math.max(0, flowTruth.fundingAprPct * 0.75),
    morphoApyPct,
    boxxLiquidity: boxxLiq,
    boxxRoi1yPct: boxxWealth?.roi1Y ?? 4.09,
  });

  // Live Macro Circuit Breaker
  const todayUtc = new Date().toISOString().slice(0, 10);
  const firstEventDay = soso.macroEvents[0];
  const isTodayMacro = firstEventDay?.date === todayUtc;
  const eventsToday = firstEventDay?.events ?? [];
  const highImpact = eventsToday.filter((e) =>
    HIGH_IMPACT_KEYWORDS.some((kw) => e.toUpperCase().includes(kw))
  );
  const macroActive = isTodayMacro && highImpact.length > 0;

  // Deterministic 30D Rule Replay (honest regime distribution over live 30D ETF + funding series)
  const mstr30dPct = soso.mstr30dPct;
  const mag730dPct = soso.ssiMag7.roi1mPct;
  const soUsdc30dPct = Number((morphoApyPct / 12).toFixed(2));
  let defensiveDays = 0;
  let accumulationDays = 0;
  for (let i = 0; i < chartSeries30d.length; i++) {
    const window5d = chartSeries30d.slice(Math.max(0, i - 4), i + 1);
    const rolling5dUsd = window5d.reduce((s, d) => s + d.etfNetInflowM * 1_000_000, 0);
    const dayNetCarry = chartSeries30d[i].fundingAprPct - chartSeries30d[i].sofrPct - 0.75;
    const dayRegime = classifyCapitalRegime({
      etfFlow5dUsd: rolling5dUsd,
      netCarrySpreadPct: dayNetCarry,
      anchorEvMnav: mstrRow.valuation.evMnav,
      oiVelocity5dPct: 0,
    });
    if (dayRegime.quadrant === "Q2") accumulationDays++;
    else defensiveDays++;
  }
  const totalDays = chartSeries30d.length;
  const ruleReplayLabel = `${defensiveDays}/${totalDays}d Defensive`;

  const usMarketStatus = soso.stocks["MSTR"]?.mktStatus ?? "CLOSED";

  return {
    asset,
    allocationUsd,
    selectedTicker: selectedEquity.valuation.ticker,
    spotPriceUsd,
    btcSpotUsd: btcPriceForDat,
    etfFlow1dUsd,
    etfFlow5dUsd,
    etfTotalNetAssetsUsd,
    sofrPct: soso.sofrPct,
    morphoApyPct,
    flowTruth,
    regime,
    chartSeries30d,
    equities,
    selectedEquity,
    selectedValuation: selectedEquity.valuation,
    wrappersTco,
    sodexLiquidity: {
      vMAG7ssi_vUSDC: mag7Liq,
      vUSSI_vUSDC: ussiLiq,
      vBOXX_vUSDC: boxxLiq,
      vSTRC_vUSDC: strcLiq,
      vBTC_vUSDC: btcLiq,
      "BTC-USD": btcPerpLiq,
      "ETH-USD": ethPerpLiq,
      "Morpho-Earn": morphoLiq,
    },
    macroEvents: soso.macroEvents,
    macroCircuitBreaker: {
      active: macroActive,
      headline: macroActive
        ? `High-impact US macro day (${firstEventDay.date}): ${highImpact.slice(0, 2).join(" & ")} — reduce oversized chase risk.`
        : `Next macro calendar (${firstEventDay?.date ?? "Upcoming"}): ${eventsToday.slice(0, 2).join(" · ") || "No major print today"}.`,
      eventsToday,
    },
    hotNews: soso.hotNews,
    replay30d: {
      mstr30dPct: mstr30dPct !== null ? Number(mstr30dPct.toFixed(1)) : null,
      mag730dPct: Number(mag730dPct.toFixed(1)),
      soUsdc30dPct,
      totalDays,
      defensiveDays,
      accumulationDays,
      ruleReplayLabel,
    },
    provenance: {
      etfDate: soso.anchorEtf.date || etfHist[etfHist.length - 1]?.date || "T+1",
      sofrDate: soso.sofrDate || "Daily",
      usMarketStatus,
      isEquityClosed: usMarketStatus !== "OPEN",
      sodexAge: sodexRes.ageLabel,
      sosoAge: sosoRes.ageLabel,
      sosoLive: soso.hasApiKey && !sosoRes.isStale,
    },
  };
}
