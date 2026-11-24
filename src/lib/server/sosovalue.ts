import { cachedFetch, type SwrResult } from "./cache";

export interface EtfSummaryDay {
  date: string;
  totalNetInflowUsd: number;
  totalValueTradedUsd: number;
  totalNetAssetsUsd: number;
  cumNetInflowUsd: number;
}

export interface EtfSnapshot {
  ticker: string;
  date: string;
  sponsorFeePct: number;
  premDscPct: number;
  netAssetsUsd: number;
  netInflowUsd: number;
}

export interface CryptoStockSnapshot {
  ticker: string;
  mktPrice: number;
  mktStatus: string;
  circulatingMarketCapUsd: number;
  totalMarketCapUsd: number;
  peTtm: number | null;
  pb: number | null;
}

export interface TreasurySnapshot {
  ticker: string;
  date: string;
  btcHolding: number;
  avgBtcCostUsd: number | null;
}

export interface SsiIndexSnapshot {
  ticker: string;
  price: number;
  changePct24h: number;
  roi7dPct: number;
  roi1mPct: number;
}

export interface MacroEventDay {
  date: string;
  events: string[];
}

export interface HotNewsItem {
  id: string;
  title: string;
  sourceLink: string;
  releaseTimeMs: number;
  summary: string;
}

export interface SosoCoreData {
  hasApiKey: boolean;
  etfHistory: EtfSummaryDay[];
  anchorEtf: EtfSnapshot;
  sofrPct: number;
  sofrDate: string;
  ssiMag7: SsiIndexSnapshot;
  stocks: Record<string, CryptoStockSnapshot>;
  treasuries: Record<string, TreasurySnapshot>;
  macroEvents: MacroEventDay[];
  hotNews: HotNewsItem[];
  mstr30dPct: number | null;
}

const num = (v: unknown, fallback = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

async function sosoGet<T>(pathAndQuery: string): Promise<T> {
  const apiKey = process.env.SOSO_API_KEY?.trim();
  if (!apiKey) throw new Error("SOSO_API_KEY not configured");

  const res = await fetch(`https://openapi.sosovalue.com/openapi/v1${pathAndQuery}`, {
    headers: {
      "x-soso-api-key": apiKey,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`SoSoValue HTTP ${res.status} on ${pathAndQuery}`);
  }
  const json = (await res.json()) as { code?: number; message?: string; data?: T };
  if (json.code !== undefined && json.code !== 0) {
    throw new Error(`SoSoValue API code ${json.code}: ${json.message ?? "error"}`);
  }
  return (json.data ?? json) as T;
}

export interface FilingBalanceSheetMeta {
  ticker: string;
  name: string;
  businessType: "TREASURY" | "MINER" | "OPERATING";
  totalDebtUsd: number;
  preferredStockUsd: number;
  cashUsd: number;
  itmConvertibleEquityUsd?: number;
  otmDebtFaceUsd?: number;
  fallbackMarketCapUsd: number;
  fallbackBtcHoldings: number;
  fallbackAvgCostUsd: number | null;
}

export const EQUITY_FILING_META: Record<string, FilingBalanceSheetMeta> = {
  MSTR: {
    ticker: "MSTR",
    name: "Strategy Inc.",
    businessType: "TREASURY",
    totalDebtUsd: 8_200_000_000,
    preferredStockUsd: 10_530_000_000,
    cashUsd: 2_300_000_000,
    itmConvertibleEquityUsd: 1_800_000_000,
    otmDebtFaceUsd: 6_400_000_000,
    fallbackMarketCapUsd: 33_908_333_422,
    fallbackBtcHoldings: 851_305,
    fallbackAvgCostUsd: 75_385,
  },
  MTPLF: {
    ticker: "MTPLF",
    name: "Metaplanet Inc.",
    businessType: "TREASURY",
    totalDebtUsd: 120_000_000,
    preferredStockUsd: 0,
    cashUsd: 45_000_000,
    fallbackMarketCapUsd: 1_240_000_000,
    fallbackBtcHoldings: 20_136,
    fallbackAvgCostUsd: 72_400,
  },
  SMLR: {
    ticker: "SMLR",
    name: "Semler Scientific",
    businessType: "TREASURY",
    totalDebtUsd: 100_000_000,
    preferredStockUsd: 0,
    cashUsd: 28_000_000,
    fallbackMarketCapUsd: 385_000_000,
    fallbackBtcHoldings: 4_850,
    fallbackAvgCostUsd: 81_200,
  },
  MARA: {
    ticker: "MARA",
    name: "MARA Holdings",
    businessType: "MINER",
    totalDebtUsd: 2_350_000_000,
    preferredStockUsd: 0,
    cashUsd: 390_000_000,
    fallbackMarketCapUsd: 4_850_000_000,
    fallbackBtcHoldings: 46_376,
    fallbackAvgCostUsd: null,
  },
  RIOT: {
    ticker: "RIOT",
    name: "Riot Platforms",
    businessType: "MINER",
    totalDebtUsd: 590_000_000,
    preferredStockUsd: 0,
    cashUsd: 280_000_000,
    fallbackMarketCapUsd: 5_990_000_000,
    fallbackBtcHoldings: 18_692,
    fallbackAvgCostUsd: null,
  },
  CLSK: {
    ticker: "CLSK",
    name: "CleanSpark Inc.",
    businessType: "MINER",
    totalDebtUsd: 650_000_000,
    preferredStockUsd: 0,
    cashUsd: 220_000_000,
    fallbackMarketCapUsd: 3_120_000_000,
    fallbackBtcHoldings: 11_177,
    fallbackAvgCostUsd: null,
  },
  COIN: {
    ticker: "COIN",
    name: "Coinbase Global",
    businessType: "OPERATING",
    totalDebtUsd: 4_200_000_000,
    preferredStockUsd: 0,
    cashUsd: 8_100_000_000,
    fallbackMarketCapUsd: 28_800_000_000,
    fallbackBtcHoldings: 9_480,
    fallbackAvgCostUsd: null,
  },
  HOOD: {
    ticker: "HOOD",
    name: "Robinhood Markets",
    businessType: "OPERATING",
    totalDebtUsd: 0,
    preferredStockUsd: 0,
    cashUsd: 4_800_000_000,
    fallbackMarketCapUsd: 60_670_000_000,
    fallbackBtcHoldings: 0,
    fallbackAvgCostUsd: null,
  },
  CRCL: {
    ticker: "CRCL",
    name: "Circle Internet Group",
    businessType: "OPERATING",
    totalDebtUsd: 0,
    preferredStockUsd: 0,
    cashUsd: 1_100_000_000,
    fallbackMarketCapUsd: 13_170_000_000,
    fallbackBtcHoldings: 0,
    fallbackAvgCostUsd: null,
  },
};

export async function getSosoCoreData(asset: "BTC" | "ETH"): Promise<SwrResult<SosoCoreData>> {
  const hasApiKey = Boolean(process.env.SOSO_API_KEY?.trim());
  const etfTicker = asset === "BTC" ? "IBIT" : "ETHA";

  return cachedFetch<SosoCoreData>(`soso:core:v4:${asset}`, 5 * 60_000, async () => {
    if (!hasApiKey) {
      throw new Error("SOSO_API_KEY missing in environment");
    }

    const searchKw = asset === "BTC" ? "Bitcoin" : "Ethereum";
    const [
      etfHistRaw,
      anchorEtfRaw,
      macroRaw,
      ssiRaw,
      macroEventsRaw,
      searchNewsRaw,
      hotNewsRaw,
      mstrKlinesRaw,
      ...stockAndTreasury
    ] = await Promise.all([
      sosoGet<Array<Record<string, unknown>>>(
        `/etfs/summary-history?symbol=${asset}&country_code=US&limit=30`
      ),
      sosoGet<Record<string, unknown>>(`/etfs/${etfTicker}/market-snapshot`).catch(
        () => ({} as Record<string, unknown>)
      ),
      sosoGet<Array<Record<string, unknown>>>(`/macro/rates`).catch(() => []),
      sosoGet<Record<string, unknown>>(`/indices/ssimag7/market-snapshot`).catch(
        () => ({} as Record<string, unknown>)
      ),
      sosoGet<Array<Record<string, unknown>>>(`/macro/events?limit=5`).catch(() => []),
      sosoGet<{ list?: Array<Record<string, unknown>> }>(
        `/news/search?keyword=${searchKw}&limit=6`
      ).catch(() => ({ list: [] as Array<Record<string, unknown>> })),
      sosoGet<{ list?: Array<Record<string, unknown>> }>(`/news/hot?limit=12`).catch(
        () => ({ list: [] as Array<Record<string, unknown>> })
      ),
      sosoGet<Array<Record<string, unknown>>>(`/crypto-stocks/MSTR/klines?interval=1d&limit=30`).catch(
        () => []
      ),
      sosoGet<Record<string, unknown>>(`/crypto-stocks/MSTR/market-snapshot`).catch(() => null),
      sosoGet<Record<string, unknown>>(`/crypto-stocks/MARA/market-snapshot`).catch(() => null),
      sosoGet<Record<string, unknown>>(`/crypto-stocks/RIOT/market-snapshot`).catch(() => null),
      sosoGet<Record<string, unknown>>(`/crypto-stocks/COIN/market-snapshot`).catch(() => null),
      sosoGet<Record<string, unknown>>(`/crypto-stocks/HOOD/market-snapshot`).catch(() => null),
      sosoGet<Array<Record<string, unknown>>>(`/btc-treasuries/MSTR/purchase-history?limit=1`).catch(
        () => []
      ),
      sosoGet<Array<Record<string, unknown>>>(`/btc-treasuries/MARA/purchase-history?limit=1`).catch(
        () => []
      ),
      sosoGet<Array<Record<string, unknown>>>(`/btc-treasuries/RIOT/purchase-history?limit=1`).catch(
        () => []
      ),
    ]);

    const etfHistory: EtfSummaryDay[] = (Array.isArray(etfHistRaw) ? etfHistRaw : [])
      .map((d) => ({
        date: String(d.date ?? ""),
        totalNetInflowUsd: num(d.total_net_inflow),
        totalValueTradedUsd: num(d.total_value_traded),
        totalNetAssetsUsd: num(d.total_net_assets),
        cumNetInflowUsd: num(d.cum_net_inflow),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const anchorEtf: EtfSnapshot = {
      ticker: etfTicker,
      date: String(anchorEtfRaw?.date ?? etfHistory[etfHistory.length - 1]?.date ?? ""),
      sponsorFeePct: num(anchorEtfRaw?.sponsor_fee, 0.0025) * 100,
      premDscPct:
        anchorEtfRaw?.prem_dsc !== null && anchorEtfRaw?.prem_dsc !== undefined
          ? num(anchorEtfRaw.prem_dsc) * 100
          : 0,
      netAssetsUsd: num(anchorEtfRaw?.net_assets),
      netInflowUsd: num(anchorEtfRaw?.net_inflow),
    };

    const sofrEntry = (Array.isArray(macroRaw) ? macroRaw : []).find(
      (r) => String(r.code ?? "").toLowerCase() === "sofr"
    );
    const sofrPct = sofrEntry ? num(sofrEntry.latest_value, 3.92) : 3.92;
    const sofrDate = sofrEntry ? String(sofrEntry.latest_date ?? "") : "";

    const ssiMag7: SsiIndexSnapshot = {
      ticker: "ssimag7",
      price: num(ssiRaw?.price, 10.61),
      changePct24h: num(ssiRaw?.change_pct_24h) * 100,
      roi7dPct: num(ssiRaw?.roi_7d) * 100,
      roi1mPct: num(ssiRaw?.roi_1m) * 100,
    };

    const macroEvents: MacroEventDay[] = (Array.isArray(macroEventsRaw) ? macroEventsRaw : []).map(
      (ev) => ({
        date: String(ev.date ?? ""),
        events: Array.isArray(ev.events) ? ev.events.map((x) => String(x).trim()).filter(Boolean) : [],
      })
    );

    const searchList = Array.isArray(searchNewsRaw?.list) ? searchNewsRaw.list : [];
    const hotRawList = Array.isArray(hotNewsRaw?.list) ? hotNewsRaw.list : [];
    const filteredHot = hotRawList.filter((n) =>
      /btc|bitcoin|eth|ethereum|etf|crypto|sec|cftc|fed|fomc|treasury/i.test(
        String(n.title ?? "")
      )
    );
    const chosenNews =
      searchList.length >= 2
        ? searchList
        : filteredHot.length >= 2
        ? filteredHot
        : hotRawList;
    const hotNews: HotNewsItem[] = chosenNews.slice(0, 4).map((n) => ({
      id: String(n.id ?? ""),
      title: String(n.title ?? "").replace(/<[^>]+>/g, "").trim(),
      sourceLink: String(n.source_link ?? "https://sosovalue.com"),
      releaseTimeMs: num(n.release_time),
      summary: String(n.content ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 180),
    }));

    const klinesSorted = (Array.isArray(mstrKlinesRaw) ? mstrKlinesRaw : [])
      .map((k) => ({ ts: num(k.timestamp), close: num(k.close) }))
      .filter((k) => k.ts > 0 && k.close > 0)
      .sort((a, b) => a.ts - b.ts);
    const mstr30dPct =
      klinesSorted.length >= 2
        ? ((klinesSorted[klinesSorted.length - 1].close - klinesSorted[0].close) /
            klinesSorted[0].close) *
          100
        : null;

    const stockTickers = ["MSTR", "MARA", "RIOT", "COIN", "HOOD"];
    const stocks: Record<string, CryptoStockSnapshot> = {};
    stockTickers.forEach((tk, i) => {
      const s = stockAndTreasury[i] as Record<string, unknown> | null;
      if (!s || !s.ticker) return;
      stocks[tk] = {
        ticker: tk,
        mktPrice: num(s.mkt_price),
        mktStatus: String(s.mkt_status ?? "CLOSED"),
        circulatingMarketCapUsd: num(s.circulating_marketcap || s.total_marketcap),
        totalMarketCapUsd: num(s.total_marketcap || s.circulating_marketcap),
        peTtm: s.pe_ttm !== null && s.pe_ttm !== undefined ? num(s.pe_ttm) : null,
        pb: s.pb !== null && s.pb !== undefined ? num(s.pb) : null,
      };
    });

    const treasuryTickers = ["MSTR", "MARA", "RIOT"];
    const treasuries: Record<string, TreasurySnapshot> = {};
    treasuryTickers.forEach((tk, i) => {
      const rows = stockAndTreasury[5 + i] as Array<Record<string, unknown>>;
      const top = Array.isArray(rows) ? rows[0] : undefined;
      if (!top) return;
      const rawAvg = num(top.avg_btc_cost, 0);
      treasuries[tk] = {
        ticker: tk,
        date: String(top.date ?? ""),
        btcHolding: num(top.btc_holding),
        avgBtcCostUsd: rawAvg >= 1000 ? rawAvg : EQUITY_FILING_META[tk]?.fallbackAvgCostUsd ?? null,
      };
    });

    return {
      hasApiKey: true,
      etfHistory,
      anchorEtf,
      sofrPct,
      sofrDate,
      ssiMag7,
      stocks,
      treasuries,
      macroEvents,
      hotNews,
      mstr30dPct,
    };
  });
}
