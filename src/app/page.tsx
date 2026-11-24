"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, AlertTriangle, CheckCircle2, Wallet } from "lucide-react";

interface SummaryData {
  ok: boolean;
  allocationUsd?: number;
  etfFlow1dUsd?: number;
  etfFlow5dUsd?: number;
  regime?: {
    quadrant: string;
    title: string;
    severity: string;
    headline: string;
  };
  flowTruth?: {
    authenticityScore: number;
    bandLabel: string;
    fundingAprPct: number;
    netCarrySpreadPct: number;
  };
  anchorValuation?: {
    ticker: string;
    basicMnav: number | null;
    evMnav: number | null;
  };
  wrappersTco?: Array<{
    id: string;
    label: string;
    netYear1ImpactUsd: number;
    liquidityBadge: string;
    passesLiquidityGate?: boolean;
  }>;
  morphoApyPct?: number;
  macroCircuitBreaker?: {
    active: boolean;
    headline: string;
  };
  replay30d?: {
    mstr30dPct: number | null;
    mag730dPct: number;
    soUsdc30dPct: number;
    totalDays: number;
    defensiveDays: number;
    accumulationDays: number;
    ruleReplayLabel: string;
  };
  provenance?: {
    etfDate: string;
    sodexAge: string;
    usMarketStatus: string;
  };
}

const fmtM = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n / 1_000_000).toFixed(1)}M`;

export default function LandingPage() {
  const [amount, setAmount] = useState<number>(10_000);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/summary?asset=BTC&allocation=${amount}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: SummaryData) => {
        if (!cancelled) setSummary(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [amount]);

  const eligibleWrappers =
    summary?.wrappersTco?.filter((w) => w.passesLiquidityGate !== false) ?? [];
  const pool = eligibleWrappers.length > 0 ? eligibleWrappers : summary?.wrappersTco ?? [];
  const bestWrapper =
    pool.length > 0
      ? pool.reduce((best, cur) =>
          cur.netYear1ImpactUsd > best.netYear1ImpactUsd ? cur : best
        )
      : null;

  return (
    <>
      <header className="eco-header">
        <div className="eco-header-inner">
          <Link href="/" className="brand-lockup">
            <Image src="/logo-icon.jpg" alt="VeriNAV" width={32} height={32} className="brand-mark" priority />
            <span>
              Veri<span style={{ color: "var(--accent)" }}>NAV</span>
            </span>
            <span className="eco-divider">|</span>
            <span className="eco-sub">SoSoValue &amp; SoDEX Desk</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span className="live-dot">All Feeds Operational</span>
            <Link href="/app" className="btn-accent">
              Open Workspace <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="hero-section">
          <div className="container">
            <div className="hero-split">
              {/* Left: Plain-English 3-Second Value & Verifiable 30-Day Proof */}
              <div>
                <span className="badge badge-accent" style={{ marginBottom: 14 }}>
                  Built on SoSoValue Open API + SoDEX Mainnet
                </span>
                <h1 className="display-xl">
                  Don&apos;t get trapped by ETF headlines—and don&apos;t overpay for crypto wrappers.
                </h1>
                <p className="lead">
                  Check in 3 seconds whether today&apos;s US Spot ETF inflows/outflows are real spot
                  demand or hedge-fund arbitrage, see how much extra you pay on treasury stocks like
                  MSTR vs Spot ETF or SoDEX SSI, and scan any live SoDEX wallet.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <Link href="/app" className="btn-accent">
                    Open Live Audit Desk <ArrowUpRight size={16} />
                  </Link>
                  <Link href="/app?tab=wallet" className="btn-ghost">
                    <Wallet size={15} /> Scan Any SoDEX Wallet
                  </Link>
                </div>

                {/* Verifiable 30-Day Historical Replay (Real SoSoValue Klines + SSI + SoDEX) */}
                <div className="proof-strip">
                  <div className="card-subtle">
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>MSTR 30D Return</div>
                    <strong className="tabular" style={{ fontSize: 18, color: "var(--red)" }}>
                      {summary?.replay30d?.mstr30dPct !== null &&
                      summary?.replay30d?.mstr30dPct !== undefined
                        ? `${summary.replay30d.mstr30dPct > 0 ? "+" : ""}${summary.replay30d.mstr30dPct}%`
                        : "—"}
                    </strong>
                  </div>
                  <div className="card-subtle">
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>MAG7.ssi 30D</div>
                    <strong className="tabular" style={{ fontSize: 18, color: "var(--amber)" }}>
                      {summary?.replay30d ? `${summary.replay30d.mag730dPct}%` : "—"}
                    </strong>
                  </div>
                  <div className="card-subtle">
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>soUSDC 30D Yield</div>
                    <strong className="tabular" style={{ fontSize: 18, color: "var(--green)" }}>
                      {summary?.replay30d ? `+${summary.replay30d.soUsdc30dPct}%` : "—"}
                    </strong>
                  </div>
                  <div className="card-subtle" style={{ borderColor: "rgba(16,185,129,0.35)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                      30D Rule Replay
                    </div>
                    <strong className="tabular" style={{ fontSize: 15.5, color: "var(--green)" }}>
                      {summary?.replay30d ? summary.replay30d.ruleReplayLabel : "—"}
                    </strong>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>
                      Historical Replay · Not Live PnL
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Instant Interactive Audit Widget (Live Recomputation on Landing) */}
              <div className="card" style={{ borderColor: "var(--border-strong)" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 14,
                  }}
                >
                  <strong style={{ fontSize: 16 }}>Instant Today Check</strong>
                  <div className="segmented">
                    {[1000, 10_000, 50_000].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`seg-btn tabular ${amount === v ? "is-active" : ""}`}
                        onClick={() => setAmount(v)}
                      >
                        ${(v / 1000).toFixed(0)}K
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1. Macro Circuit Breaker */}
                <div
                  className="card-subtle"
                  style={{
                    marginBottom: 12,
                    borderColor: summary?.macroCircuitBreaker?.active
                      ? "rgba(245, 158, 11, 0.45)"
                      : "var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 12.5,
                      fontWeight: 700,
                      color: summary?.macroCircuitBreaker?.active ? "var(--amber)" : "var(--muted)",
                      marginBottom: 4,
                    }}
                  >
                    <AlertTriangle size={14} />
                    <span>
                      {summary?.macroCircuitBreaker?.active
                        ? "MACRO CIRCUIT BREAKER ACTIVE"
                        : "MACRO CALENDAR"}
                    </span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.45 }}>
                    {summary?.macroCircuitBreaker?.headline ?? "Loading US macro event calendar..."}
                  </div>
                </div>

                {/* 2. Plain-English ETF Verdict */}
                <div className="card-subtle" style={{ marginBottom: 12 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
                      1. Today&apos;s US Spot ETF Flow ({summary?.provenance?.etfDate ?? "T+1"})
                    </span>
                    <span className="badge badge-warn">
                      {summary?.flowTruth
                        ? `Score ${summary.flowTruth.authenticityScore}/100`
                        : "Checking..."}
                    </span>
                  </div>
                  <strong className="tabular" style={{ fontSize: 18 }}>
                    {summary?.etfFlow1dUsd !== undefined ? fmtM(summary.etfFlow1dUsd) : "—"} today
                  </strong>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.45 }}>
                    {summary?.regime?.headline ??
                      "Checking SoSoValue ETF flows against SoDEX perp funding..."}
                  </p>
                </div>

                {/* 3. Best Wrapper Comparison */}
                <div className="card-subtle">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 600 }}>
                      2. Best Route for ${amount.toLocaleString("en-US")} Today
                    </span>
                    <span className="badge badge-ok">
                      MSTR EV mNAV {summary?.anchorValuation?.evMnav?.toFixed(2) ?? "—"}×
                    </span>
                  </div>
                  <strong style={{ fontSize: 16, color: "var(--green)" }}>
                    {bestWrapper ? bestWrapper.label : "Loading best wrapper..."}
                  </strong>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>
                    {bestWrapper
                      ? `Est. 1-Year impact: ${bestWrapper.netYear1ImpactUsd >= 0 ? "+" : ""}$${Math.round(bestWrapper.netYear1ImpactUsd).toLocaleString("en-US")} · ${bestWrapper.liquidityBadge}`
                      : "Comparing MSTR, IBIT, MAG7.ssi, USSI, and Morpho-Earn soUSDC..."}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, opacity: 0.85 }}>
                    EV mNAV = Enterprise Value ÷ BTC NAV (&lt;1.0× discount · &gt;1.0× premium).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: "44px 0" }}>
          <div className="container">
            <div className="grid-3">
              <div className="card">
                <span className="badge badge-neutral" style={{ marginBottom: 10 }}>
                  01 · Flow &amp; Macro
                </span>
                <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Real Buying vs Hedge Noise</h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
                  30-day ETF flow chart overlaid with perp funding APR and NY Fed SOFR, plus live
                  SoSoValue Hot News catalysts and Macro Circuit Breaker alerts.
                </p>
              </div>
              <div className="card">
                <span className="badge badge-neutral" style={{ marginBottom: 10 }}>
                  02 · Wrapper &amp; mNAV
                </span>
                <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Don&apos;t Overpay for Stocks</h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
                  Separates Pure-Play DATs (MSTR) from Hybrid Miners and Operating Exchanges (COIN),
                  exposes debt/preferred overhangs, and checks live SoDEX spread &amp; book depth.
                </p>
              </div>
              <div className="card">
                <span className="badge badge-neutral" style={{ marginBottom: 10 }}>
                  03 · Wallet &amp; SoDEX
                </span>
                <h3 style={{ margin: "0 0 8px", fontSize: 18 }}>Live Wallet Scan &amp; PNG Card</h3>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
                  Paste any ValueChain/SoDEX wallet address to inspect live collateral &amp; idle
                  yield, connect MetaMask for real EIP-712 signing, and export a PNG Audit Card.
                </p>
              </div>
            </div>

            {/* One-Person On-Chain Finance Business Model */}
            <div style={{ marginTop: 40 }}>
              <div style={{ marginBottom: 16 }}>
                <span className="badge badge-accent" style={{ marginBottom: 8 }}>
                  One-Person On-Chain Finance Business
                </span>
                <h2 style={{ margin: "0 0 6px", fontSize: 22 }}>
                  Built to Monetize Transparently — Zero Custody, Zero Hidden Spread
                </h2>
                <p style={{ margin: 0, fontSize: 14, color: "var(--muted)", maxWidth: 700, lineHeight: 1.5 }}>
                  VeriNAV pairs a free public audit desk for retail DAT/ETF investors with automated
                  on-chain builder-fee routing on SoDEX and a lightweight Pro Desk tier for active
                  traders &amp; independent RIAs.
                </p>
              </div>

              <div className="grid-3">
                <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span className="badge badge-ok">Acquisition Funnel</span>
                      <strong className="tabular" style={{ fontSize: 16 }}>$0 / Free</strong>
                    </div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>Public Audit Desk</h3>
                    <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
                      Full access to Flow Truth Score, 3-Tier Equity mNAV audit, live unsigned SoDEX
                      Wallet Scanner, and shareable PNG Audit Cards. Drives organic trader traffic.
                    </p>
                  </div>
                  <Link href="/app" className="btn-ghost" style={{ width: "fit-content" }}>
                    Open Free Audit Desk <ArrowUpRight size={14} />
                  </Link>
                </div>

                <div className="card" style={{ borderColor: "rgba(255,79,32,0.4)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span className="badge badge-accent">Protocol Revenue</span>
                      <strong className="tabular" style={{ fontSize: 16, color: "var(--accent)" }}>1–2 bps Fee</strong>
                    </div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>SoDEX Builder Fee Routing</h3>
                    <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
                      Users who execute Morpho-Earn soUSDC, MAG7.ssi, or BTC-USD Perps via VeriNAV
                      authorize an EIP-712 builder code (10 bps max cap) — automated on-chain revenue
                      with zero custody of user funds.
                    </p>
                  </div>
                  <Link href="/app?tab=wallet" className="btn-accent" style={{ width: "fit-content" }}>
                    Inspect EIP-712 Builder Approval <ArrowUpRight size={14} />
                  </Link>
                </div>

                <div className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 14 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <span className="badge badge-neutral">Active Traders &amp; RIAs</span>
                      <strong className="tabular" style={{ fontSize: 16 }}>$49 / mo</strong>
                    </div>
                    <h3 style={{ margin: "0 0 8px", fontSize: 17 }}>Pro Desk &amp; Alert API</h3>
                    <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
                      Real-time Macro Circuit Breaker Telegram/Webhook alerts, multi-wallet ValueChain
                      portfolio monitoring, and custom white-label PNG Audit Briefs for client decks.
                    </p>
                  </div>
                  <Link href="/app?brief=1" className="btn-ghost" style={{ width: "fit-content" }}>
                    Preview Client Brief &amp; Pro Desk <ArrowUpRight size={14} />
                  </Link>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 32,
                paddingTop: 18,
                borderTop: "1px solid var(--border)",
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                fontSize: 12.5,
                color: "var(--muted)",
              }}
            >
              <span>VeriNAV · AKINDO SoSoValue 3rd Wave</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} color="#10b981" /> Read-Only Analytical Software — Non-Custodial, Not Financial Advice
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
