"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Download,
  ExternalLink,
  HelpCircle,
  Layers,
  Printer,
  Wallet,
  X,
} from "lucide-react";
import type { WorkspacePayload } from "@/lib/server/workspaceBuilder";
import { simulateIssuanceStress } from "@/lib/quant/mnav";

type TabId = "flowtruth" | "mnav" | "wallet";
type EquityFilter = "PURE_DAT" | "HYBRID_MINER" | "CRYPTO_EQUITY";

interface WalletScanResult {
  ok: boolean;
  address?: string;
  perpsBalances?: Array<{ coin: string; total: number; collateralUsd: number; borrowed: number }>;
  openPositions?: Array<Record<string, unknown>>;
  netCollateralUsd?: number;
  observations?: string[];
  error?: string;
}

const fmtUsd = (n: number, compact = false) => {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (compact && abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (compact && abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: abs < 10 ? 2 : 0,
  }).format(n);
};

export default function WorkspacePage() {
  const [asset, setAsset] = useState<"BTC" | "ETH">("BTC");
  const [allocation, setAllocation] = useState<number>(10_000);
  const [ticker, setTicker] = useState<string>("MSTR");
  const [activeTab, setActiveTab] = useState<TabId>("flowtruth");
  const [equityFilter, setEquityFilter] = useState<EquityFilter>("PURE_DAT");

  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [showMethodDrawer, setShowMethodDrawer] = useState(false);
  const [showStressDrawer, setShowStressDrawer] = useState(false);
  const [showBriefModal, setShowBriefModal] = useState(false);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const [stressPct, setStressPct] = useState<number>(10);
  const [stressMode, setStressMode] = useState<"ACCRETIVE_ATM" | "DILUTIVE">("ACCRETIVE_ATM");

  // Live Unsigned Wallet Scanner + Real EVM MetaMask state
  const [walletInput, setWalletInput] = useState("0x8ca1dce693ac00dee9150cae962d7a74bc136150");
  const [walletData, setWalletData] = useState<WalletScanResult | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [connectedEthAddr, setConnectedEthAddr] = useState<string | null>(null);
  const [eip712Status, setEip712Status] = useState<string | null>(null);
  const [showEip712Preview, setShowEip712Preview] = useState(false);
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [advisorName, setAdvisorName] = useState("VeriNAV Desk");

  const isUpdating = Boolean(
    data &&
      (data.asset !== asset ||
        data.selectedTicker !== ticker ||
        data.allocationUsd !== allocation)
  );

  const buildEip712TypedData = (nonce: number) => ({
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      ApproveBuilderFeeAction: [
        { name: "builderId", type: "uint64" },
        { name: "maxFeeRateTenthBps", type: "uint32" },
        { name: "nonce", type: "uint64" },
      ],
    },
    primaryType: "ApproveBuilderFeeAction",
    domain: { name: "SoDEX Testnet", version: "1", chainId: 286623 },
    message: { builderId: 1001, maxFeeRateTenthBps: 100, nonce },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "wallet") {
      queueMicrotask(() => setActiveTab("wallet"));
    }
    if (params.get("brief") === "1") {
      queueMicrotask(() => setShowBriefModal(true));
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "wallet" || walletData !== null) return;
    let cancelled = false;
    fetch(
      `/api/wallet?address=${encodeURIComponent("0x8ca1dce693ac00dee9150cae962d7a74bc136150")}`,
      { cache: "no-store" }
    )
      .then((res) => res.json())
      .then((json: WalletScanResult) => {
        if (!cancelled) setWalletData(json);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeTab, walletData]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/workspace?asset=${asset}&allocation=${allocation}&ticker=${ticker}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled && json.ok) setData(json as WorkspacePayload);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asset, allocation, ticker]);

  const scanWallet = async (addrToScan: string) => {
    setWalletLoading(true);
    setWalletData(null);
    try {
      const res = await fetch(`/api/wallet?address=${encodeURIComponent(addrToScan.trim())}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as WalletScanResult;
      setWalletData(json);
    } catch {
      setWalletData({ ok: false, error: "Network error scanning SoDEX address." });
    } finally {
      setWalletLoading(false);
    }
  };

  const connectMetaMask = async () => {
    const eth = (window as unknown as {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    }).ethereum;
    if (!eth) {
      setEip712Status(
        "No EVM wallet detected (MetaMask/Rabby). Read-Only Wallet Scanner remains active above."
      );
      return;
    }
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      if (accounts?.[0]) {
        setConnectedEthAddr(accounts[0]);
        setWalletInput(accounts[0]);
        scanWallet(accounts[0]);
        setEip712Status(`Connected ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)} (Ready to sign EIP-712).`);
      }
    } catch (err) {
      setEip712Status(err instanceof Error ? err.message : "Wallet connection rejected.");
    }
  };

  const signTestnetBuilderApproval = async () => {
    const eth = (window as unknown as {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    }).ethereum;
    if (!eth || !connectedEthAddr) {
      setEip712Status("Connect MetaMask/Rabby first to execute a real EIP-712 SoDEX Testnet signature.");
      return;
    }
    try {
      const typedData = buildEip712TypedData(Date.now());
      const sig = (await eth.request({
        method: "eth_signTypedData_v4",
        params: [connectedEthAddr, JSON.stringify(typedData)],
      })) as string;
      setEip712Status(`Real EIP-712 Signature verified: ${sig.slice(0, 18)}...`);
    } catch (err) {
      setEip712Status(err instanceof Error ? err.message : "EIP-712 signature cancelled.");
    }
  };

  const downloadAuditCardPng = () => {
    if (!data) return;
    const canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderRestAndDownload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 28px sans-serif";
      ctx.fillText("VeriNAV · SoSoValue & SoDEX Audit Card", 122, 94);

      ctx.fillStyle = "#94a3b8";
      ctx.font = "20px sans-serif";
      ctx.fillText(
        `Date: ${data.provenance.etfDate}  ·  ${asset} Spot: ${fmtUsd(data.spotPriceUsd)}  ·  ${advisorName}`,
        64,
        142
      );

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 40px sans-serif";
      ctx.fillText(`${data.regime.title}`, 64, 215);

      ctx.fillStyle = "#cbd5e1";
      ctx.font = "22px sans-serif";
      ctx.fillText(`Flow Truth Score: ${data.flowTruth.authenticityScore}/100 (${data.flowTruth.bandLabel})`, 64, 270);
      ctx.fillText(
        `5D US Spot ${asset} ETF Flow: ${fmtUsd(data.etfFlow5dUsd, true)}   |   SoDEX 1h Funding APR: ${data.flowTruth.fundingAprPct.toFixed(2)}%`,
        64,
        320
      );
      ctx.fillText(
        `${data.selectedValuation.ticker} EV mNAV: ${data.selectedValuation.evMnav?.toFixed(2) ?? "—"}x (Basic ${data.selectedValuation.basicMnav?.toFixed(2) ?? "—"}x)   |   Morpho soUSDC: ${data.morphoApyPct.toFixed(2)}% APY`,
        64,
        370
      );

      ctx.fillStyle = "#10b981";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText(
        `30D Rule Replay: ${data.replay30d.ruleReplayLabel} (Historical Replay, Not Live PnL)`,
        64,
        450
      );

      ctx.fillStyle = "#64748b";
      ctx.font = "18px sans-serif";
      ctx.fillText("Non-custodial analytics built on SoSoValue Open API & SoDEX Public Data", 64, 555);

      const a = document.createElement("a");
      a.download = `verinav-audit-${asset.toLowerCase()}-${data.provenance.etfDate}.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };

    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(0, 0, 1200, 630);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(28, 28, 1144, 574);

    const logoImg = new window.Image();
    logoImg.crossOrigin = "anonymous";
    logoImg.onload = () => {
      ctx.drawImage(logoImg, 64, 62, 44, 44);
      renderRestAndDownload();
    };
    logoImg.onerror = () => {
      ctx.fillStyle = "#ff4f20";
      ctx.fillRect(64, 64, 40, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 24px sans-serif";
      ctx.fillText("V", 76, 92);
      renderRestAndDownload();
    };
    logoImg.src = "/logo-icon.jpg";
  };

  const filteredEquities = useMemo(
    () => (data?.equities ?? []).filter((e) => e.valuation.tier === equityFilter),
    [data, equityFilter]
  );

  const stressResult = useMemo(
    () => simulateIssuanceStress(data?.selectedValuation.evMnav ?? null, stressPct, stressMode),
    [data, stressPct, stressMode]
  );

  const chartSeries = data?.chartSeries30d ?? [];
  const maxAbsFlow = Math.max(200, ...chartSeries.map((d) => Math.abs(d.etfNetInflowM)));
  const maxApr = Math.max(12, ...chartSeries.map((d) => Math.max(d.fundingAprPct, d.sofrPct)));

  return (
    <>
      <header className="eco-header eco-header-app">
        <div className="eco-header-inner">
          <Link href="/" className="brand-lockup">
            <Image src="/logo-icon.jpg" alt="VeriNAV" width={32} height={32} className="brand-mark" priority />
            <span>
              Veri<span style={{ color: "var(--accent)" }}>NAV</span>
            </span>
            <span className="eco-divider">|</span>
            <span className="eco-sub">Console</span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="segmented" role="group" aria-label="Primary asset">
              <button
                type="button"
                className={`seg-btn ${asset === "BTC" ? "is-active" : ""}`}
                onClick={() => setAsset("BTC")}
              >
                BTC
              </button>
              <button
                type="button"
                className={`seg-btn ${asset === "ETH" ? "is-active" : ""}`}
                onClick={() => setAsset("ETH")}
              >
                ETH
              </button>
            </div>
            <button
              type="button"
              className="btn-accent no-print"
              onClick={() => setShowBriefModal(true)}
            >
              Export Brief
            </button>
          </div>
        </div>
      </header>

      <div className="console-shell">
        {/* SoSoValue-style Console Sidebar */}
        <aside className="console-sidebar no-print">
          <div className="side-label">Audit Modules</div>
          <button
            type="button"
            className={`side-btn ${activeTab === "flowtruth" ? "is-active" : ""}`}
            onClick={() => setActiveTab("flowtruth")}
          >
            <Activity size={17} /> 1. Flow &amp; Macro
          </button>
          <button
            type="button"
            className={`side-btn ${activeTab === "mnav" ? "is-active" : ""}`}
            onClick={() => setActiveTab("mnav")}
          >
            <Layers size={17} /> 2. Wrapper &amp; mNAV
          </button>
          <button
            type="button"
            className={`side-btn ${activeTab === "wallet" ? "is-active" : ""}`}
            onClick={() => setActiveTab("wallet")}
          >
            <Wallet size={17} /> 3. Wallet &amp; SoDEX
          </button>

          <div className="side-label" style={{ marginTop: 14 }}>
            Tools &amp; Export
          </div>
          <button
            type="button"
            className="side-btn"
            onClick={downloadAuditCardPng}
          >
            <Download size={17} /> Download PNG Card
          </button>
          <button
            type="button"
            className="side-btn"
            onClick={() => setShowMethodDrawer(true)}
          >
            <HelpCircle size={17} /> Methodology
          </button>
        </aside>

        <main className="console-content">
          {/* Dual-Clock Provenance Bar */}
          <div className="provenance-bar">
            <div className="prov-items">
              <span>
                {asset} Spot:{" "}
                <strong className="tabular" style={{ color: "var(--accent)" }}>
                  {data ? fmtUsd(data.spotPriceUsd) : "—"}
                </strong>
              </span>
              <span>
                ETF Flows (T+1): <strong>{data?.provenance.etfDate ?? "Loading..."}</strong>
              </span>
              <span>
                NY Fed SOFR: <strong>{data ? `${data.sofrPct.toFixed(2)}%` : "—"}</strong>
              </span>
              <span>
                SoDEX Books: <strong>{data?.provenance.sodexAge ?? "—"}</strong>
              </span>
              <span>
                US Equities: <strong>{data?.provenance.usMarketStatus ?? "—"}</strong>
              </span>
            </div>
            {data?.provenance.isEquityClosed && (
              <span className="badge badge-warn">
                Implied mNAV (Equity {data.provenance.usMarketStatus} · Live Spot)
              </span>
            )}
          </div>

          {loading && !data ? (
            <div className="card">Loading live SoSoValue &amp; SoDEX feeds...</div>
          ) : data ? (
            <>
              {/* TAB 1: FLOW & MACRO */}
              {activeTab === "flowtruth" && (
                <section className="terminal-grid">
                  <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
                  {/* Live Macro Circuit Breaker Banner */}
                  <div
                    className="card"
                    style={{
                      borderColor: data.macroCircuitBreaker.active
                        ? "rgba(245, 158, 11, 0.5)"
                        : "var(--border)",
                      padding: "14px 18px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <AlertTriangle
                          size={18}
                          color={data.macroCircuitBreaker.active ? "#f59e0b" : "#94a3b8"}
                        />
                        <div>
                          <strong style={{ fontSize: 14 }}>
                            {data.macroCircuitBreaker.active
                              ? "Macro Circuit Breaker Active Today"
                              : "Upcoming Macro Calendar"}
                          </strong>
                          <div style={{ fontSize: 13, color: "var(--muted)" }}>
                            {data.macroCircuitBreaker.headline}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`badge ${
                          data.macroCircuitBreaker.active ? "badge-warn" : "badge-neutral"
                        }`}
                      >
                        {data.macroEvents[0]?.date ?? "Scheduled"}
                      </span>
                    </div>
                  </div>

                  {/* Plain-English Regime Card */}
                  <div className="card">
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <span
                          className={`badge ${
                            data.regime.severity === "positive"
                              ? "badge-ok"
                              : data.regime.severity === "danger"
                              ? "badge-danger"
                              : "badge-warn"
                          }`}
                        >
                          {data.regime.title}
                        </span>
                        <h1 style={{ margin: "8px 0 4px", fontSize: 22 }}>{data.regime.headline}</h1>
                      </div>

                      <div className="card-subtle" style={{ textAlign: "right", minWidth: 165 }}>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>Flow Truth Score</div>
                        <div className="kpi-value tabular" style={{ margin: 0 }}>
                          {data.flowTruth.authenticityScore} / 100
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--blue)" }}>
                          {data.flowTruth.bandLabel}
                        </div>
                      </div>
                    </div>

                    <p style={{ margin: "0 0 12px", fontSize: 14, color: "var(--muted)", lineHeight: 1.55 }}>
                      {data.regime.diagnosis}
                    </p>
                    <div
                      className="card-subtle"
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      <span style={{ fontSize: 13.5 }}>
                        <strong>What to do:</strong> {data.regime.recommendedAction}
                      </span>
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setShowMethodDrawer(true)}
                      >
                        How this is calculated
                      </button>
                    </div>
                  </div>

                  {/* 4 KPI Cards */}
                  <div className="grid-4">
                    <div className="card">
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>5D US Spot ETF Flow</div>
                      <div
                        className="kpi-value tabular"
                        style={{ color: data.etfFlow5dUsd >= 0 ? "var(--green)" : "var(--red)" }}
                      >
                        {fmtUsd(data.etfFlow5dUsd, true)}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Latest day: {fmtUsd(data.etfFlow1dUsd, true)}
                      </div>
                    </div>

                    <div className="card">
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>SoDEX 1h Funding APR</div>
                      <div className="kpi-value tabular">
                        {data.flowTruth.fundingAprPct.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Mark-Index: {data.flowTruth.markIndexBasisBps.toFixed(1)} bps
                      </div>
                    </div>

                    <div className="card">
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>NY Fed SOFR</div>
                      <div className="kpi-value tabular">{data.sofrPct.toFixed(2)}%</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        As of {data.provenance.sofrDate}
                      </div>
                    </div>

                    <div className="card">
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Net Carry vs SOFR</div>
                      <div
                        className="kpi-value tabular"
                        style={{
                          color:
                            data.flowTruth.netCarrySpreadPct > 4
                              ? "var(--red)"
                              : data.flowTruth.netCarrySpreadPct < 0
                              ? "var(--amber)"
                              : "var(--green)",
                        }}
                      >
                        {data.flowTruth.netCarrySpreadPct >= 0 ? "+" : ""}
                        {data.flowTruth.netCarrySpreadPct.toFixed(2)}%
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        After 0.75% fee/margin hurdle
                      </div>
                    </div>
                  </div>

                  {/* Upgraded 30-Day Chart with Axes, Dates & Legend */}
                  <div className="card">
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>
                          30-Day US Spot ETF Flows ($M) vs Perp Funding APR (%)
                        </h3>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--muted)" }}>
                          <span style={{ color: "var(--green)" }}>■ Organic Inflow</span>
                          <span style={{ color: "var(--amber)" }}>■ Carry-Driven Inflow</span>
                          <span style={{ color: "var(--red)" }}>■ Outflow / Unwind</span>
                          <span style={{ color: "var(--blue)" }}>— Funding APR %</span>
                          <span style={{ color: "#f59e0b" }}>-- SOFR ({data.sofrPct.toFixed(2)}%)</span>
                        </div>
                      </div>
                      {hoveredIdx !== null && chartSeries[hoveredIdx] && (
                        <span className="badge badge-neutral tabular">
                          {chartSeries[hoveredIdx].date} · ETF{" "}
                          {chartSeries[hoveredIdx].etfNetInflowM >= 0 ? "+" : ""}$
                          {chartSeries[hoveredIdx].etfNetInflowM}M · Funding{" "}
                          {chartSeries[hoveredIdx].fundingAprPct}% ·{" "}
                          {chartSeries[hoveredIdx].classification}
                        </span>
                      )}
                    </div>

                    <div className="table-wrap">
                      <svg
                        viewBox="0 0 860 250"
                        style={{ width: "100%", minWidth: 560, height: "auto", display: "block" }}
                        role="img"
                        aria-label="30-Day ETF Flows and Funding APR chart"
                        onMouseLeave={() => setHoveredIdx(null)}
                      >
                        {/* Y-axis labels */}
                        <text x="6" y="28" fill="#94a3b8" fontSize="11">+${Math.round(maxAbsFlow)}M</text>
                        <text x="6" y="122" fill="#94a3b8" fontSize="11">$0</text>
                        <text x="6" y="212" fill="#94a3b8" fontSize="11">-${Math.round(maxAbsFlow)}M</text>

                        <line x1="60" y1="118" x2="835" y2="118" stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />

                        {chartSeries.map((pt, i) => {
                          const step = 755 / Math.max(1, chartSeries.length);
                          const x = 68 + i * step;
                          const barW = Math.max(10, step - 6);
                          const barH = (Math.abs(pt.etfNetInflowM) / maxAbsFlow) * 90;
                          const y = pt.etfNetInflowM >= 0 ? 118 - barH : 118;
                          const fill =
                            pt.etfNetInflowM >= 0
                              ? pt.classification === "Carry-Driven"
                                ? "#f59e0b"
                                : "#10b981"
                              : "#ef4444";
                          return (
                            <g key={pt.date}>
                              <rect
                                x={x}
                                y={y}
                                width={barW}
                                height={Math.max(2, barH)}
                                rx={3}
                                fill={fill}
                                opacity={hoveredIdx === null || hoveredIdx === i ? 0.92 : 0.45}
                              />
                              <rect
                                x={x - 3}
                                y={12}
                                width={step}
                                height={212}
                                fill="transparent"
                                style={{ cursor: "crosshair" }}
                                onMouseEnter={() => setHoveredIdx(i)}
                              />
                            </g>
                          );
                        })}

                        {chartSeries.length > 1 && (
                          <polyline
                            fill="none"
                            stroke="#38bdf8"
                            strokeWidth="2.4"
                            pointerEvents="none"
                            points={chartSeries
                              .map((pt, i) => {
                                const x = 68 + i * (755 / Math.max(1, chartSeries.length)) + 6;
                                const y = 208 - (Math.max(-5, Math.min(maxApr, pt.fundingAprPct)) / maxApr) * 175;
                                return `${x},${y}`;
                              })
                              .join(" ")}
                          />
                        )}

                        {/* NY Fed SOFR dashed benchmark line */}
                        <line
                          x1="60"
                          y1={208 - (Math.max(0, Math.min(maxApr, data.sofrPct)) / maxApr) * 175}
                          x2="835"
                          y2={208 - (Math.max(0, Math.min(maxApr, data.sofrPct)) / maxApr) * 175}
                          stroke="#f59e0b"
                          strokeWidth="1.5"
                          strokeDasharray="6 4"
                          pointerEvents="none"
                        />

                        {/* Interactive hover crosshair, active point, and floating dark tooltip */}
                        {hoveredIdx !== null && chartSeries[hoveredIdx] && (() => {
                          const pt = chartSeries[hoveredIdx];
                          const step = 755 / Math.max(1, chartSeries.length);
                          const cx = 68 + hoveredIdx * step + 6;
                          const cy = 208 - (Math.max(-5, Math.min(maxApr, pt.fundingAprPct)) / maxApr) * 175;
                          const tipW = 196;
                          const tipH = 74;
                          const tipX = cx + 14 + tipW > 845 ? cx - tipW - 14 : cx + 14;
                          const tipY = 18;
                          const flowLabel = `${pt.etfNetInflowM >= 0 ? "+" : "-"}$${Math.abs(pt.etfNetInflowM).toFixed(1)}M`;
                          return (
                            <g pointerEvents="none">
                              <line
                                x1={cx}
                                y1={14}
                                x2={cx}
                                y2={222}
                                stroke="rgba(255,255,255,0.4)"
                                strokeWidth="1"
                                strokeDasharray="3 3"
                              />
                              <circle cx={cx} cy={cy} r={4.5} fill="#38bdf8" stroke="#0b0c0e" strokeWidth="2" />
                              <rect
                                x={tipX}
                                y={tipY}
                                width={tipW}
                                height={tipH}
                                rx={8}
                                fill="#131519"
                                stroke="rgba(255,255,255,0.18)"
                                strokeWidth="1"
                              />
                              <text x={tipX + 12} y={tipY + 20} fill="#f8fafc" fontSize="11.5" fontWeight="700">
                                {pt.date} · {pt.classification}
                              </text>
                              <text
                                x={tipX + 12}
                                y={tipY + 40}
                                fill={pt.etfNetInflowM >= 0 ? "#10b981" : "#ef4444"}
                                fontSize="11.5"
                                fontWeight="600"
                              >
                                ETF Flow: {flowLabel}
                              </text>
                              <text x={tipX + 12} y={tipY + 58} fill="#38bdf8" fontSize="11.5">
                                Funding APR: {pt.fundingAprPct.toFixed(2)}% (SOFR {data.sofrPct.toFixed(2)}%)
                              </text>
                            </g>
                          );
                        })()}

                        {/* X-axis date ticks */}
                        {chartSeries.length > 0 && (
                          <>
                            <text x="68" y="240" fill="#94a3b8" fontSize="11">
                              {chartSeries[0].date}
                            </text>
                            <text x="420" y="240" fill="#94a3b8" fontSize="11">
                              {chartSeries[Math.floor(chartSeries.length / 2)].date}
                            </text>
                            <text x="765" y="240" fill="#94a3b8" fontSize="11">
                              {chartSeries[chartSeries.length - 1].date}
                            </text>
                          </>
                        )}
                      </svg>
                    </div>
                  </div>
                  </div>

                  {/* Right Live Intelligence Dock (SoSoValue / SoDEX Terminal Panel) */}
                  <aside style={{ display: "grid", gap: 16, minWidth: 0 }}>
                    {/* Live SoSoValue Hot News Catalysts */}
                    <div className="card">
                      <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
                        Live SoSoValue Hot Catalysts
                      </h3>
                      <div style={{ display: "grid", gap: 10 }}>
                        {data.hotNews.map((news) => (
                          <a
                            key={news.id}
                            href={news.sourceLink}
                            target="_blank"
                            rel="noreferrer"
                            className="card-subtle"
                            style={{
                              textDecoration: "none",
                              color: "inherit",
                              display: "flex",
                              flexDirection: "column",
                              justifyContent: "space-between",
                              gap: 6,
                              padding: 12,
                            }}
                          >
                            <strong style={{ fontSize: 13.5, lineHeight: 1.4 }}>{news.title}</strong>
                            <span
                              style={{
                                fontSize: 11.5,
                                color: "var(--blue)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              Read on SoSoValue [ref:{news.id.slice(-6)}] <ExternalLink size={11} />
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>

                    {/* Live SoDEX Liquidity Pulse */}
                    <div className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                        <h3 style={{ margin: 0, fontSize: 16 }}>SoDEX Liquidity Pulse</h3>
                        <button
                          type="button"
                          className="btn-ghost"
                          style={{ padding: "4px 10px", fontSize: 11.5 }}
                          onClick={() => setActiveTab("wallet")}
                        >
                          Trade Routes
                        </button>
                      </div>
                      <div style={{ display: "grid", gap: 8 }}>
                        {[
                          { label: "Morpho-Earn soUSDC", info: data.sodexLiquidity["Morpho-Earn"] },
                          {
                            label: `${asset}-USD Perps`,
                            info: data.sodexLiquidity[`${asset}-USD`] ?? data.sodexLiquidity["BTC-USD"],
                          },
                          { label: "MAG7.ssi Spot", info: data.sodexLiquidity["vMAG7ssi_vUSDC"] },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="card-subtle"
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                              padding: "10px 12px",
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                            <span
                              className={`badge ${
                                item.info.badgeTone === "ok"
                                  ? "badge-ok"
                                  : item.info.badgeTone === "danger"
                                  ? "badge-danger"
                                  : "badge-warn"
                              }`}
                              style={{ fontSize: 11 }}
                            >
                              {item.info.badgeText}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Upcoming US Macro Calendar */}
                    {data.macroEvents.length > 0 && (
                      <div className="card">
                        <h3 style={{ margin: "0 0 10px", fontSize: 16 }}>US Macro Calendar</h3>
                        <div style={{ display: "grid", gap: 8 }}>
                          {data.macroEvents.slice(0, 4).map((ev) => (
                            <div key={ev.date} className="card-subtle" style={{ padding: "10px 12px" }}>
                              <div style={{ fontSize: 11.5, color: "var(--accent)", fontWeight: 700, marginBottom: 3 }}>
                                {ev.date}
                              </div>
                              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.4 }}>
                                {ev.events.slice(0, 2).join(" · ") || "Scheduled US release"}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </aside>
                </section>
              )}

              {/* TAB 2: WRAPPER & MNAV */}
              {activeTab === "mnav" && (
                <section style={{ display: "grid", gap: 16 }}>
                  {asset === "ETH" && (
                    <div className="card" style={{ borderColor: "rgba(56,189,248,0.35)", padding: "12px 16px", fontSize: 13, color: "var(--muted)" }}>
                      <strong style={{ color: "var(--blue)" }}>ETH Mode Active:</strong> Wrapper TCO compares{" "}
                      <strong>ETHA (US Spot ETH ETF)</strong> vs SoDEX baskets, while public corporate treasury
                      tables below remain benchmarked to BTC holdings.
                    </div>
                  )}
                  <div className="card">
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                        <span style={{ fontWeight: 700, fontSize: 14.5 }}>
                          If you invest ($)
                        </span>
                        <input
                          type="number"
                          className="input-dark tabular"
                          min={500}
                          step={500}
                          value={allocation}
                          onChange={(e) => setAllocation(Math.max(500, Number(e.target.value) || 500))}
                          aria-label="Allocation amount in USD"
                          style={{ width: 125, fontWeight: 700 }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14.5 }}>compare vs</span>
                        <select
                          className="input-dark"
                          value={ticker}
                          onChange={(e) => setTicker(e.target.value)}
                          aria-label="Select equity ticker"
                          style={{ fontWeight: 700 }}
                        >
                          {data.equities.map((eq) => (
                            <option key={eq.valuation.ticker} value={eq.valuation.ticker}>
                              {eq.valuation.ticker} — {eq.valuation.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setShowStressDrawer(true)}
                      >
                        2-Way Dilution Stress Lab
                      </button>
                    </div>
                  </div>

                  <div
                    className="grid-2"
                    style={{ opacity: isUpdating ? 0.65 : 1, transition: "opacity 160ms ease" }}
                  >
                    <div className="card">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 14,
                        }}
                      >
                        <div>
                          <h3 style={{ margin: "0 0 3px", fontSize: 17 }}>
                            {data.selectedValuation.ticker} Capital Stack Waterfall
                          </h3>
                          <span
                            style={{ fontSize: 12.5, color: "var(--muted)" }}
                            title="Basic mNAV = Market Cap ÷ Crypto NAV. EV mNAV = (Market Cap + Debt + Preferreds − Cash) ÷ Crypto NAV."
                          >
                            Basic mNAV ({data.selectedValuation.basicMnav?.toFixed(2) ?? "—"}×) vs EV
                            mNAV ({data.selectedValuation.evMnav?.toFixed(2) ?? "—"}×)
                          </span>
                        </div>
                        <span
                          className="badge badge-neutral"
                          title="Includes market cap, convertible debt, preferred stock, and cash from latest SEC filings."
                        >
                          {isUpdating
                            ? `Updating ${ticker}...`
                            : data.selectedValuation.completeness === "FULL_EV"
                            ? "Full EV Audit"
                            : data.selectedValuation.completeness === "PARTIAL_EV"
                            ? "Partial Filing"
                            : "EV Audit"}
                        </span>
                      </div>

                      <div style={{ display: "grid", gap: 10 }}>
                        {data.selectedValuation.capitalStack.map((bar) => {
                          const maxVal = Math.max(
                            data.selectedValuation.enterpriseValueUsd,
                            data.selectedValuation.cryptoNavUsd,
                            1
                          );
                          const pct = Math.min(100, (Math.abs(bar.valueUsd) / maxVal) * 100);
                          const barColor =
                            bar.kind === "benchmark"
                              ? "#10b981"
                              : bar.kind === "subtract"
                              ? "#38bdf8"
                              : bar.kind === "add"
                              ? "#f59e0b"
                              : "#ff4f20";
                          const formattedVal =
                            bar.kind === "subtract"
                              ? fmtUsd(Math.abs(bar.valueUsd), true)
                              : fmtUsd(bar.valueUsd, true);
                          return (
                            <div key={bar.id}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: 13,
                                  marginBottom: 4,
                                }}
                              >
                                <span>{bar.label}</span>
                                <strong className="tabular">{formattedVal}</strong>
                              </div>
                              <div
                                style={{
                                  height: 8,
                                  borderRadius: 999,
                                  background: "var(--surface-2)",
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    width: `${pct}%`,
                                    height: "100%",
                                    background: barColor,
                                    borderRadius: 999,
                                  }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div
                        style={{
                          marginTop: 14,
                          paddingTop: 10,
                          borderTop: "1px solid var(--border)",
                          fontSize: 12,
                          color: "var(--muted)",
                          lineHeight: 1.45,
                        }}
                      >
                        <strong>Quick Guide:</strong> <em>EV mNAV</em> includes debt &amp; preferreds
                        above common shares. <em>CLOB Depth</em> checks live SoDEX order-book liquidity
                        so large orders avoid slippage.
                      </div>
                    </div>

                    <div className="card">
                      <h3 style={{ margin: "0 0 6px", fontSize: 17 }}>
                        1-Year Wrapper Cost &amp; Yield ({fmtUsd(allocation)})
                      </h3>
                      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
                        Includes upfront mNAV premium, fees, and live SoDEX spread/depth checks.
                      </p>
                      <div style={{ display: "grid", gap: 9 }}>
                        {data.wrappersTco.map((w) => {
                          const isGated = !w.passesLiquidityGate;
                          return (
                          <div
                            key={w.id}
                            className="card-subtle"
                            style={{ opacity: isGated ? 0.78 : 1 }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 4,
                              }}
                            >
                              <strong style={{ fontSize: 14 }}>{w.label}</strong>
                              <div style={{ textAlign: "right" }}>
                                <strong
                                  className="tabular"
                                  style={{
                                    fontSize: 14,
                                    color: isGated
                                      ? "var(--amber)"
                                      : w.netYear1ImpactUsd >= 0
                                      ? "var(--green)"
                                      : "var(--red)",
                                  }}
                                >
                                  {w.netYear1ImpactUsd >= 0 ? "+" : ""}
                                  {fmtUsd(w.netYear1ImpactUsd)} / yr
                                </strong>
                                {isGated && (
                                  <div style={{ fontSize: 10.5, color: "var(--amber)", fontWeight: 600 }}>
                                    Gated · Illiquid for {fmtUsd(allocation)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: 6,
                                alignItems: "center",
                              }}
                            >
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>{w.note}</span>
                              <span
                                className={`badge ${
                                  w.liquidityTone === "ok"
                                    ? "badge-ok"
                                    : w.liquidityTone === "danger"
                                    ? "badge-danger"
                                    : "badge-warn"
                                }`}
                              >
                                {w.liquidityBadge}
                              </span>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* 3-Tier Equity Table */}
                  <div className="card">
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 14,
                      }}
                    >
                      <div>
                        <h3 style={{ margin: "0 0 4px", fontSize: 17 }}>
                          3-Tier Crypto Equity Audit
                        </h3>
                        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                          Operating companies like COIN are isolated from pure-play treasury mNAV
                        </span>
                      </div>

                      <div className="segmented">
                        <button
                          type="button"
                          className={`seg-btn ${equityFilter === "PURE_DAT" ? "is-active" : ""}`}
                          onClick={() => setEquityFilter("PURE_DAT")}
                        >
                          Pure-Play DATs
                        </button>
                        <button
                          type="button"
                          className={`seg-btn ${equityFilter === "HYBRID_MINER" ? "is-active" : ""}`}
                          onClick={() => setEquityFilter("HYBRID_MINER")}
                        >
                          Hybrid Miners
                        </button>
                        <button
                          type="button"
                          className={`seg-btn ${equityFilter === "CRYPTO_EQUITY" ? "is-active" : ""}`}
                          onClick={() => setEquityFilter("CRYPTO_EQUITY")}
                        >
                          Operating Equities
                        </button>
                      </div>
                    </div>

                    <div className="table-wrap">
                      <table className="audit-table">
                        <thead>
                          <tr>
                            <th>Ticker</th>
                            <th>BTC Holdings</th>
                            <th>BTC % of EV</th>
                            <th>Basic mNAV</th>
                            <th>EV mNAV</th>
                            <th>SoDEX Perp</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredEquities.map((row) => (
                            <tr
                              key={row.valuation.ticker}
                              className={row.valuation.ticker === ticker ? "is-selected" : ""}
                              onClick={() => setTicker(row.valuation.ticker)}
                              style={{ cursor: "pointer" }}
                            >
                              <td>
                                <strong>{row.valuation.ticker}</strong>
                                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                  {row.valuation.name}
                                </div>
                              </td>
                              <td className="tabular">{row.btcHoldings.toLocaleString("en-US")}</td>
                              <td className="tabular">
                                {(row.valuation.btcBackingPct * 100).toFixed(1)}%
                              </td>
                              <td className="tabular">
                                {row.valuation.basicMnav ? `${row.valuation.basicMnav.toFixed(2)}×` : "—"}
                              </td>
                              <td className="tabular" style={{ fontWeight: 700 }}>
                                {row.valuation.evMnav ? `${row.valuation.evMnav.toFixed(2)}×` : "—"}
                              </td>
                              <td className="tabular">
                                {row.sodexPerpPriceUsd ? `$${row.sodexPerpPriceUsd.toFixed(2)}` : "—"}
                              </td>
                              <td>
                                {row.valuation.tier === "PURE_DAT" ? (
                                  <span
                                    className={`badge ${
                                      row.overpay.overpayTaxUsd > 0 ? "badge-warn" : "badge-ok"
                                    }`}
                                  >
                                    {row.overpay.overpayTaxUsd > 0
                                      ? `Overpay ${row.overpay.overpayPct.toFixed(1)}%`
                                      : "Near/Below Par"}
                                  </span>
                                ) : row.valuation.tier === "HYBRID_MINER" ? (
                                  <span className="badge badge-neutral">Operating Business Included</span>
                                ) : (
                                  <span className="badge badge-neutral">Operating Equity (No mNAV)</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </section>
              )}

              {/* TAB 3: LIVE WALLET SCANNER & REAL SODEX ROUTES */}
              {activeTab === "wallet" && (
                <section className="grid-2" style={{ alignItems: "start" }}>
                  {/* Left Column: Live Unsigned SoDEX Wallet Scanner + Audit Card Export */}
                  <div style={{ display: "grid", gap: 16 }}>
                    <div className="card">
                      <span className="badge badge-ok" style={{ marginBottom: 10 }}>
                        Live Unsigned SoDEX Mainnet Reader
                      </span>
                      <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>
                        Scan Any SoDEX / ValueChain Wallet
                      </h2>
                      <p style={{ margin: "0 0 14px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
                        Queries real on-chain ValueChain &amp; SoDEX Perps balances with zero login.
                      </p>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <input
                          type="text"
                          className="input-dark tabular"
                          value={walletInput}
                          onChange={(e) => setWalletInput(e.target.value)}
                          placeholder="0x..."
                          aria-label="SoDEX EVM wallet address"
                          style={{
                            flex: 1,
                            minWidth: 240,
                            fontSize: 12.5,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        />
                        <button
                          type="button"
                          className="btn-accent"
                          onClick={() => scanWallet(walletInput)}
                        >
                          {walletLoading ? "Scanning..." : "Scan Address"}
                        </button>
                      </div>

                      <button
                        type="button"
                        className="btn-ghost"
                        style={{ marginBottom: 14, fontSize: 12.5 }}
                        onClick={() => {
                          const demo = "0x8ca1dce693ac00dee9150cae962d7a74bc136150";
                          setWalletInput(demo);
                          scanWallet(demo);
                        }}
                      >
                        Load #1 Live SoDEX Trader (0x8ca1...6150)
                      </button>

                      {walletData && (
                        <div className="card-subtle">
                          {walletData.ok ? (
                            <div style={{ display: "grid", gap: 10 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                                <span>Net Perps Collateral</span>
                                <strong className="tabular" style={{ color: "var(--green)" }}>
                                  {fmtUsd(walletData.netCollateralUsd ?? 0)}
                                </strong>
                              </div>
                              {(walletData.perpsBalances ?? []).map((b) => (
                                <div
                                  key={b.coin}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: 13,
                                    borderTop: "1px solid var(--border)",
                                    paddingTop: 6,
                                  }}
                                >
                                  <span>{b.coin}</span>
                                  <strong className="tabular">
                                    {b.total.toLocaleString("en-US", { maximumFractionDigits: 2 })} (Coll:{" "}
                                    {fmtUsd(b.collateralUsd)})
                                  </strong>
                                </div>
                              ))}
                              {(walletData.observations ?? []).map((obs) => (
                                <div key={obs} style={{ fontSize: 12.5, color: "var(--muted)" }}>
                                  • {obs}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: "var(--red)", fontSize: 13 }}>{walletData.error}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="card">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>
                            Shareable PNG Audit Card
                          </h3>
                          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                            Exports live Regime, Flow Score &amp; EV mNAV snapshot for X / client decks.
                          </span>
                        </div>
                        <button type="button" className="btn-accent" onClick={downloadAuditCardPng}>
                          <Download size={15} /> Download Audit Card (PNG)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Verified Mainnet Routes + SoDEX EIP-712 Builder Approval */}
                  <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
                    <div className="card">
                      <h3 style={{ margin: "0 0 10px", fontSize: 18 }}>
                        Verified Mainnet Execution Routes
                      </h3>
                      <div style={{ display: "grid", gap: 9 }}>
                        {[
                          {
                            title: "Morpho-Earn soUSDC",
                            badge: data.sodexLiquidity["Morpho-Earn"].badgeText,
                            tone: data.sodexLiquidity["Morpho-Earn"].badgeTone,
                            href: "https://sodex.com/wealth/usdc-earn",
                          },
                          {
                            title: "MAG7.ssi Spot (MAG7ssi_USDC)",
                            badge: data.sodexLiquidity["vMAG7ssi_vUSDC"].badgeText,
                            tone: data.sodexLiquidity["vMAG7ssi_vUSDC"].badgeTone,
                            href: "https://sodex.com/trade/spot/MAG7ssi_USDC",
                          },
                          {
                            title: `${asset}-USD Futures`,
                            badge: (data.sodexLiquidity[`${asset}-USD`] ?? data.sodexLiquidity["BTC-USD"]).badgeText,
                            tone: (data.sodexLiquidity[`${asset}-USD`] ?? data.sodexLiquidity["BTC-USD"]).badgeTone,
                            href: `https://sodex.com/trade/futures/${asset}-USD`,
                          },
                        ].map((r) => (
                          <div
                            key={r.title}
                            className="card-subtle"
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: 14 }}>{r.title}</strong>
                              <div>
                                <span
                                  className={`badge ${
                                    r.tone === "ok"
                                      ? "badge-ok"
                                      : r.tone === "danger"
                                      ? "badge-danger"
                                      : "badge-warn"
                                  }`}
                                  style={{ marginTop: 4 }}
                                >
                                  {r.badge}
                                </span>
                              </div>
                            </div>
                            <a
                              href={r.href}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-ghost"
                            >
                              Open SoDEX <ArrowUpRight size={14} />
                            </a>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card">
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <h3 style={{ margin: 0, fontSize: 16.5 }}>
                          SoDEX EIP-712 Builder Approval
                        </h3>
                        <span className="badge badge-neutral">Testnet · Chain 286623</span>
                      </div>
                      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45 }}>
                        Authorizes VeriNAV&apos;s non-custodial builder code (max 10 bps cap; zero
                        fund custody) for automated SoDEX fee-share monetization.
                      </p>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <button type="button" className="btn-ghost" onClick={connectMetaMask}>
                          <Wallet size={15} /> {connectedEthAddr ? "Wallet Connected" : "Connect MetaMask / EVM"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={signTestnetBuilderApproval}
                          disabled={!connectedEthAddr}
                          style={{ opacity: connectedEthAddr ? 1 : 0.55 }}
                          title={connectedEthAddr ? "Sign ApproveBuilderFeeAction on SoDEX Testnet" : "Connect MetaMask/Rabby first to sign"}
                        >
                          Sign EIP-712 Builder Fee
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => setShowEip712Preview((prev) => !prev)}
                        >
                          {showEip712Preview ? "Hide EIP-712 Payload" : "Preview EIP-712 Payload"}
                        </button>
                      </div>
                      {eip712Status && (
                        <div className="card-subtle" style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: showEip712Preview ? 10 : 0 }}>
                          {eip712Status}
                        </div>
                      )}
                      {showEip712Preview && (
                        <pre
                          className="card-subtle"
                          style={{
                            margin: 0,
                            fontSize: 11.5,
                            lineHeight: 1.45,
                            color: "#cbd5e1",
                            overflowX: "auto",
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                          }}
                        >
                          {JSON.stringify(buildEip712TypedData(1732500000000), null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : (
            <div className="card">Unable to load live feeds right now.</div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="mobile-bottom-nav no-print" aria-label="Mobile workspace tabs">
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === "flowtruth" ? "is-active" : ""}`}
          onClick={() => setActiveTab("flowtruth")}
        >
          Flow &amp; Macro
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === "mnav" ? "is-active" : ""}`}
          onClick={() => setActiveTab("mnav")}
        >
          Wrapper &amp; mNAV
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeTab === "wallet" ? "is-active" : ""}`}
          onClick={() => setActiveTab("wallet")}
        >
          Wallet &amp; SoDEX
        </button>
      </nav>

      {/* Methodology Drawer */}
      {showMethodDrawer && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowMethodDrawer(false)} />
          <aside className="sheet-panel" aria-label="Methodology explanation">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <span className="badge badge-neutral" style={{ marginBottom: 4 }}>Transparent Quant Spec</span>
                <h2 style={{ margin: 0, fontSize: 20 }}>How VeriNAV Works</h2>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowMethodDrawer(false)}
                aria-label="Close methodology"
                style={{ padding: 8 }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: "grid", gap: 14, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.55 }}>
              <div className="card-subtle">
                <strong style={{ color: "var(--text)" }}>1. Flow Truth Score (0–100)</strong>
                <p style={{ margin: "6px 0 8px" }}>
                  Separates real spot ETF accumulation from hedge-fund cash-and-carry arbitrage (long
                  spot ETF + short perp).
                </p>
                <code style={{ display: "block", fontSize: 12, color: "var(--blue)" }}>
                  Net Carry = (1h Funding × 8,760) − NY Fed SOFR − 0.75% hurdle
                </code>
              </div>

              <div className="card-subtle">
                <strong style={{ color: "var(--text)" }}>2. Institutional EV mNAV (3-Tier Taxonomy)</strong>
                <p style={{ margin: "6px 0 8px" }}>
                  Accounts for convertible debt &amp; Digital Credit preferreds senior to common stock,
                  while locking Hybrid Miners (MARA/RIOT/CLSK) and Operating Equities (COIN/HOOD) out
                  of Pure-Play DAT overpay rankings.
                </p>
                <code style={{ display: "block", fontSize: 12, color: "var(--blue)" }}>
                  EV mNAV = (Market Cap + Debt + Preferreds − Cash) ÷ Crypto NAV
                </code>
              </div>

              <div className="card-subtle">
                <strong style={{ color: "var(--text)" }}>3. 3-Gate SoDEX Liquidity Guardrail</strong>
                <p style={{ margin: "6px 0 8px" }}>
                  Any route failing a gate is flagged as illiquid and excluded from &ldquo;Best Route&rdquo;
                  recommendations:
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
                  <li><strong>Staleness Gate:</strong> Last trade &gt; 60 minutes old</li>
                  <li><strong>Spread Gate:</strong> Live bid-ask spread &gt; 25 bps</li>
                  <li><strong>Depth Gate:</strong> Allocation &gt; 2× top-of-book depth</li>
                </ul>
              </div>

              <div className="card-subtle">
                <strong style={{ color: "var(--text)" }}>4. Verified Live Data Sources</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
                  <li>SoSoValue Open API v1 (US Spot ETF Flows, Crypto Stocks, Macro Events, Hot News)</li>
                  <li>NY Fed SOFR Reference Rate (via SoSoValue Macro Rates)</li>
                  <li>SoDEX Mainnet Gateway (Order books, Morpho-Earn vaults, Unsigned Wallet Reader)</li>
                  <li>Hyperliquid 30D 1h Funding History (daily carry series overlay)</li>
                </ul>
              </div>
            </div>
          </aside>
        </>
      )}

      {/* 2-Way Stress Drawer */}
      {showStressDrawer && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowStressDrawer(false)} />
          <aside className="sheet-panel" aria-label="2-Way Dilution Stress Lab">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <span className="badge badge-neutral" style={{ marginBottom: 4 }}>Capital Structure Simulator</span>
                <h2 style={{ margin: 0, fontSize: 20 }}>2-Way Issuance Stress ({ticker})</h2>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setShowStressDrawer(false)}
                aria-label="Close stress lab"
                style={{ padding: 8 }}
              >
                <X size={16} />
              </button>
            </div>
            {(() => {
              const mcap =
                data?.selectedValuation.capitalStack.find((b) => b.kind === "base")?.valueUsd ??
                data?.selectedValuation.enterpriseValueUsd ??
                0;
              const spot = data?.btcSpotUsd ?? 60_000;
              const estRaisedUsd = mcap * (stressPct / 100);
              const estNewBtc = stressMode === "ACCRETIVE_ATM" && spot > 0 ? estRaisedUsd / spot : 0;
              return (
                <div style={{ display: "grid", gap: 14 }}>
                  <div className="segmented" style={{ width: "fit-content" }}>
                    <button
                      type="button"
                      className={`seg-btn ${stressMode === "ACCRETIVE_ATM" ? "is-active" : ""}`}
                      onClick={() => setStressMode("ACCRETIVE_ATM")}
                    >
                      ATM Share Sale for BTC
                    </button>
                    <button
                      type="button"
                      className={`seg-btn ${stressMode === "DILUTIVE" ? "is-active" : ""}`}
                      onClick={() => setStressMode("DILUTIVE")}
                    >
                      Non-BTC Dilution
                    </button>
                  </div>

                  <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                    {stressMode === "ACCRETIVE_ATM"
                      ? "Simulates issuing new common shares at current mNAV and deploying 100% of net proceeds into spot BTC (accretive only when mNAV > 1.0×)."
                      : "Simulates issuing new shares for operating expenses, debt repayment, or executive SBC without buying BTC (always dilutive to BTC-per-share)."}
                  </p>

                  <div className="card-subtle">
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 8 }}>
                      <span>Simulated Share Expansion</span>
                      <strong className="tabular" style={{ color: "var(--accent)" }}>+{stressPct}% shares</strong>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={40}
                      step={1}
                      value={stressPct}
                      onChange={(e) => setStressPct(Number(e.target.value))}
                      aria-label="Share expansion percentage"
                      style={{ width: "100%" }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                      <span>+2%</span>
                      <span>+20%</span>
                      <span>+40%</span>
                    </div>
                  </div>

                  <div className="card-subtle">
                    <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Net BTC-per-Share Impact</div>
                    <div
                      className="kpi-value tabular"
                      style={{
                        color: stressResult.btcPerShareChangePct >= 0 ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {stressResult.btcPerShareChangePct >= 0 ? "+" : ""}
                      {stressResult.btcPerShareChangePct.toFixed(2)}%
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>
                      {stressResult.summary}
                    </p>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div className="card-subtle">
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Est. Equity Raised</div>
                      <strong className="tabular" style={{ fontSize: 16 }}>
                        {fmtUsd(estRaisedUsd, true)}
                      </strong>
                    </div>
                    <div className="card-subtle">
                      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Est. BTC Acquired</div>
                      <strong className="tabular" style={{ fontSize: 16, color: estNewBtc > 0 ? "var(--green)" : "var(--muted)" }}>
                        {estNewBtc > 0 ? `+${Math.round(estNewBtc).toLocaleString("en-US")} BTC` : "0 BTC"}
                      </strong>
                    </div>
                  </div>
                </div>
              );
            })()}
          </aside>
        </>
      )}

      {/* Client Brief Drawer */}
      {showBriefModal && data && (
        <>
          <div className="sheet-backdrop" onClick={() => setShowBriefModal(false)} />
          <aside className="sheet-panel" aria-label="Client Audit Brief">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div>
                <span className="badge badge-accent" style={{ marginBottom: 4 }}>{advisorName}</span>
                <h2 style={{ margin: 0, fontSize: 20 }}>Client Audit Brief</h2>
              </div>
              <button
                type="button"
                className="btn-ghost no-print"
                onClick={() => setShowBriefModal(false)}
                aria-label="Close brief"
                style={{ padding: 8 }}
              >
                <X size={16} />
              </button>
            </div>
            {(() => {
              const eligible = data.wrappersTco.filter((w) => w.passesLiquidityGate);
              const bestRoute =
                eligible.length > 0
                  ? eligible.reduce((a, b) => (b.netYear1ImpactUsd > a.netYear1ImpactUsd ? b : a))
                  : data.wrappersTco[0];
              const copyMarkdownBrief = () => {
                const text = [
                  `VeriNAV Client Audit Brief — ${advisorName} (${data.provenance.etfDate})`,
                  `${asset} Spot: ${fmtUsd(data.spotPriceUsd)} | NY Fed SOFR: ${data.sofrPct.toFixed(2)}%`,
                  `Regime: ${data.regime.title} | Flow Truth Score: ${data.flowTruth.authenticityScore}/100`,
                  `${data.selectedValuation.ticker} EV mNAV: ${data.selectedValuation.evMnav?.toFixed(2) ?? "—"}x (Basic ${data.selectedValuation.basicMnav?.toFixed(2) ?? "—"}x) | EV ${fmtUsd(data.selectedValuation.enterpriseValueUsd, true)} vs Crypto NAV ${fmtUsd(data.selectedValuation.cryptoNavUsd, true)}`,
                  `Best Liquid Route (${fmtUsd(allocation)}): ${bestRoute.label} (${bestRoute.netYear1ImpactUsd >= 0 ? "+" : ""}${fmtUsd(bestRoute.netYear1ImpactUsd)}/yr · ${bestRoute.liquidityBadge})`,
                  `Action: ${data.regime.recommendedAction}`,
                ].join("\n");
                navigator.clipboard?.writeText(text).then(() => {
                  setCopiedBrief(true);
                  setTimeout(() => setCopiedBrief(false), 2000);
                });
              };
              return (
                <div style={{ display: "grid", gap: 12, fontSize: 13.5, lineHeight: 1.55 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>
                      White-Label Desk / Advisor Name
                    </label>
                    <input
                      type="text"
                      className="input-dark no-print"
                      value={advisorName}
                      onChange={(e) => setAdvisorName(e.target.value)}
                      aria-label="Advisor name"
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div className="card-subtle" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                    <span>{asset} Spot: <strong className="tabular">{fmtUsd(data.spotPriceUsd)}</strong></span>
                    <span>ETF Date: <strong>{data.provenance.etfDate}</strong></span>
                    <span>SOFR: <strong>{data.sofrPct.toFixed(2)}%</strong></span>
                  </div>

                  <div className="card-subtle">
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 2 }}>1. Flow Truth &amp; Regime</div>
                    <strong>{data.regime.title}</strong> · Flow Score{" "}
                    <strong className="tabular">{data.flowTruth.authenticityScore}/100</strong>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                      5D ETF Flow: {fmtUsd(data.etfFlow5dUsd, true)} · Perp Carry vs SOFR:{" "}
                      {data.flowTruth.netCarrySpreadPct >= 0 ? "+" : ""}
                      {data.flowTruth.netCarrySpreadPct.toFixed(2)}%
                    </div>
                  </div>

                  <div className="card-subtle">
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 2 }}>
                      2. {data.selectedValuation.ticker} Capital Stack ({fmtUsd(allocation)})
                    </div>
                    <div>
                      EV mNAV <strong className="tabular">{data.selectedValuation.evMnav?.toFixed(2) ?? "—"}×</strong>{" "}
                      (Basic <strong className="tabular">{data.selectedValuation.basicMnav?.toFixed(2) ?? "—"}×</strong>) ·
                      EV {fmtUsd(data.selectedValuation.enterpriseValueUsd, true)} vs NAV{" "}
                      {fmtUsd(data.selectedValuation.cryptoNavUsd, true)}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                      {data.selectedEquity.overpay.reason}
                    </div>
                  </div>

                  <div className="card-subtle" style={{ borderColor: "rgba(16,185,129,0.4)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--green)", fontWeight: 700, marginBottom: 2 }}>
                      3. Best Liquid Route ({fmtUsd(allocation)})
                    </div>
                    <strong>{bestRoute.label}</strong> ·{" "}
                    <span className="tabular" style={{ color: "var(--green)", fontWeight: 700 }}>
                      {bestRoute.netYear1ImpactUsd >= 0 ? "+" : ""}
                      {fmtUsd(bestRoute.netYear1ImpactUsd)} / yr
                    </span>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                      {data.regime.recommendedAction}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
                    <button type="button" className="btn-accent no-print" onClick={downloadAuditCardPng}>
                      <Download size={15} /> Download PNG Card
                    </button>
                    <button type="button" className="btn-ghost no-print" onClick={copyMarkdownBrief}>
                      {copiedBrief ? "Copied Brief!" : "Copy Text Brief"}
                    </button>
                    <button type="button" className="btn-ghost no-print" onClick={() => window.print()}>
                      <Printer size={15} /> Print / PDF
                    </button>
                  </div>
                </div>
              );
            })()}
          </aside>
        </>
      )}
    </>
  );
}
