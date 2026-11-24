import { cachedFetch, type SwrResult } from "./cache";

export interface SodexTicker {
  symbol: string;
  lastPx: number;
  bidPx: number;
  askPx: number;
  askSz: number;
  closeTime: number;
  quoteVolume: number;
  changePct: number;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  openInterest: number;
}

export interface SodexWealthJoined {
  fundId: string;
  symbol: string;
  name: string;
  fundType: string;
  price: number;
  nav: number;
  aum: number;
  marketStatus: string;
  apy7d: number | null; // strictly whitelisted ONLY for bridged_vault yield products
  roi1Y: number | null;
  asOf: string;
}

export interface SodexSnapshot {
  fetchedAtMs: number;
  spotBySymbol: Record<string, SodexTicker>;
  perpsBySymbol: Record<string, SodexTicker>;
  wealthByFundId: Record<string, SodexWealthJoined>;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VeriNAV/1.0" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`SoDEX HTTP ${res.status} on ${url}`);
  return (await res.json()) as T;
}

function mapTickerList(raw: unknown): Record<string, SodexTicker> {
  const out: Record<string, SodexTicker> = {};
  const arr = Array.isArray((raw as { data?: unknown })?.data)
    ? ((raw as { data: Record<string, unknown>[] }).data)
    : [];
  for (const item of arr) {
    const symbol = String(item.symbol ?? "");
    if (!symbol) continue;
    out[symbol] = {
      symbol,
      lastPx: num(item.lastPx),
      bidPx: num(item.bidPx),
      askPx: num(item.askPx),
      askSz: num(item.askSz),
      closeTime: num(item.closeTime),
      quoteVolume: num(item.quoteVolume),
      changePct: num(item.changePct),
      markPrice: num(item.markPrice || item.lastPx),
      indexPrice: num(item.indexPrice || item.lastPx),
      fundingRate: num(item.fundingRate),
      openInterest: num(item.openInterest),
    };
  }
  return out;
}

export async function getSodexSnapshot(): Promise<SwrResult<SodexSnapshot>> {
  return cachedFetch<SodexSnapshot>("sodex:mainnet:snapshot", 15_000, async () => {
    const [fundsRes, marketsRes, spotRes, perpsRes] = await Promise.all([
      fetchJson<{ data?: Array<Record<string, unknown>> }>(
        "https://mainnet-gw.sodex.dev/api/v1/wealth/funds"
      ),
      fetchJson<{ data?: { quotes?: Array<Record<string, unknown>> } }>(
        "https://mainnet-gw.sodex.dev/api/v1/wealth/markets"
      ),
      fetchJson<unknown>("https://mainnet-gw.sodex.dev/api/v1/spot/markets/tickers"),
      fetchJson<unknown>("https://mainnet-gw.sodex.dev/api/v1/perps/markets/tickers"),
    ]);

    const fundsMap = new Map<string, Record<string, unknown>>();
    for (const f of fundsRes.data ?? []) {
      const id = String(f.fundId ?? "");
      if (id) fundsMap.set(id, f);
    }

    const wealthByFundId: Record<string, SodexWealthJoined> = {};
    for (const q of marketsRes.data?.quotes ?? []) {
      const fundId = String(q.fundId ?? "");
      if (!fundId) continue;
      const fundMeta = fundsMap.get(fundId);
      const fundType = String(q.fundType || fundMeta?.fundType || "clob");
      const isYieldVault = fundType === "bridged_vault";
      wealthByFundId[fundId] = {
        fundId,
        symbol: String(q.symbol ?? fundId),
        name: String(fundMeta?.name ?? q.symbol ?? fundId),
        fundType,
        price: num(q.price || fundMeta?.nav),
        nav: num(fundMeta?.nav || q.price),
        aum: num(fundMeta?.aum),
        marketStatus: String(q.marketStatus ?? q.yieldStatus ?? "LIVE"),
        apy7d: isYieldVault ? num(q.apy7d) : null,
        roi1Y: q.roi1Y !== undefined && q.roi1Y !== null ? num(q.roi1Y) : null,
        asOf: String(q.asOf ?? fundMeta?.asOf ?? ""),
      };
    }

    return {
      fetchedAtMs: Date.now(),
      spotBySymbol: mapTickerList(spotRes),
      perpsBySymbol: mapTickerList(perpsRes),
      wealthByFundId,
    };
  });
}
