import { NextResponse } from "next/server";
import { buildWorkspacePayload } from "@/lib/server/workspaceBuilder";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get("asset") === "ETH" ? "ETH" : "BTC";
    const allocation = Math.max(500, Number(searchParams.get("allocation") ?? 10_000) || 10_000);
    const data = await buildWorkspacePayload(asset, allocation, "MSTR");
    return NextResponse.json({
      ok: true,
      asset,
      allocationUsd: allocation,
      etfFlow1dUsd: data.etfFlow1dUsd,
      etfFlow5dUsd: data.etfFlow5dUsd,
      regime: data.regime,
      flowTruth: data.flowTruth,
      anchorValuation: data.selectedValuation,
      wrappersTco: data.wrappersTco,
      morphoApyPct: data.morphoApyPct,
      macroCircuitBreaker: data.macroCircuitBreaker,
      replay30d: data.replay30d,
      provenance: data.provenance,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load summary" },
      { status: 500 }
    );
  }
}
