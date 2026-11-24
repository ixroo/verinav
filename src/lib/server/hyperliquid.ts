import { cachedFetch, type SwrResult } from "./cache";

export interface DailyFundingPoint {
  date: string; // YYYY-MM-DD
  fundingAprPct: number;
}

export async function getHyperliquidFundingHistory(
  coin: "BTC" | "ETH",
  days = 30
): Promise<SwrResult<DailyFundingPoint[]>> {
  return cachedFetch<DailyFundingPoint[]>(
    `hl:funding:${coin}:${days}`,
    15 * 60_000,
    async () => {
      const startTime = Date.now() - days * 86_400_000;
      const res = await fetch("https://api.hyperliquid.xyz/info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "fundingHistory", coin, startTime }),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Hyperliquid HTTP ${res.status}`);
      const rows = (await res.json()) as Array<{ time: number; fundingRate: string }>;

      const byDay = new Map<string, number[]>();
      for (const r of rows) {
        const rate = Number(r.fundingRate);
        if (!Number.isFinite(rate)) continue;
        const d = new Date(r.time).toISOString().slice(0, 10);
        const bucket = byDay.get(d) ?? [];
        bucket.push(rate);
        byDay.set(d, bucket);
      }

      return Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, rates]) => {
          const avg1h = rates.reduce((s, x) => s + x, 0) / rates.length;
          return {
            date,
            fundingAprPct: avg1h * 24 * 365 * 100,
          };
        });
    },
    []
  );
}
