import { NextResponse } from "next/server";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function safeGet(url: string) {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "VeriNAV/1.0" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as { code?: number; data?: Record<string, unknown> };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = (searchParams.get("address") ?? "").trim();

  if (!ETH_ADDR_RE.test(address)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid 0x EVM wallet address." },
      { status: 400 }
    );
  }

  try {
    const [evmRes, perpsBalRes, perpsPosRes] = await Promise.all([
      safeGet(`https://mainnet-gw.sodex.dev/api/v1/user/${address}/evm-balances`),
      safeGet(`https://mainnet-gw.sodex.dev/api/v1/perps/accounts/${address}/balances`),
      safeGet(`https://mainnet-gw.sodex.dev/api/v1/perps/accounts/${address}/positions`),
    ]);

    const evmBalances = Array.isArray(evmRes?.data?.balances)
      ? (evmRes!.data!.balances as Array<Record<string, unknown>>)
      : [];
    const perpsBalancesRaw = Array.isArray(perpsBalRes?.data?.balances)
      ? (perpsBalRes!.data!.balances as Array<Record<string, unknown>>)
      : [];
    const openPositionsRaw = Array.isArray(perpsPosRes?.data?.positions)
      ? (perpsPosRes!.data!.positions as Array<Record<string, unknown>>)
      : [];

    const perpsBalances = perpsBalancesRaw.map((b) => ({
      coin: String(b.coin ?? ""),
      total: num(b.total),
      collateralUsd: num(b.collateral),
      borrowed: num(b.borrowed),
    }));

    const netCollateralUsd = perpsBalances.reduce((s, b) => s + b.collateralUsd, 0);
    const hasSoUsdc = perpsBalances.some((b) => b.coin === "vsoUSDC" && b.total > 0);
    const negativeUsdc = perpsBalances.find((b) => b.coin === "vUSDC" && b.total < 0);

    const observations: string[] = [];
    if (perpsBalances.length === 0 && evmBalances.length === 0) {
      observations.push(
        "No live ValueChain EVM or SoDEX Perps balances found for this address yet."
      );
    } else {
      if (hasSoUsdc) {
        observations.push(
          "Account holds yielding vsoUSDC collateral on SoDEX (~5.26% APY Morpho-Earn vault)."
        );
      }
      if (negativeUsdc) {
        observations.push(
          `Cross-margin utilization: ${Math.abs(negativeUsdc.total).toLocaleString("en-US", { maximumFractionDigits: 0 })} vUSDC net balance is covered by yielding vsoUSDC collateral.`
        );
      }
      if (openPositionsRaw.length === 0 && netCollateralUsd > 100) {
        observations.push(
          "Zero open leveraged perps positions — capital is currently shielded from funding drag."
        );
      }
    }

    return NextResponse.json({
      ok: true,
      address,
      evmBalances,
      perpsBalances,
      openPositions: openPositionsRaw,
      netCollateralUsd,
      observations,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to scan SoDEX wallet" },
      { status: 500 }
    );
  }
}
