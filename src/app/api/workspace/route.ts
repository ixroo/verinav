import { NextResponse } from "next/server";
import { buildWorkspacePayload } from "@/lib/server/workspaceBuilder";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const asset = searchParams.get("asset") === "ETH" ? "ETH" : "BTC";
    const allocation = Math.max(100, Number(searchParams.get("allocation") ?? 10_000) || 10_000);
    const ticker = (searchParams.get("ticker") || "MSTR").toUpperCase();

    const payload = await buildWorkspacePayload(asset, allocation, ticker);
    return NextResponse.json({ ok: true, ...payload });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load workspace" },
      { status: 500 }
    );
  }
}
