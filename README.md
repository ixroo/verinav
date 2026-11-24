# VeriNAV — Capital Structure & Flow Truth Audit Desk

Built for **AKINDO × SoSoValue "Build Your One-Person On-Chain Finance Business" (3rd Wave)**.

VeriNAV is a non-custodial institutional audit desk powered by **SoSoValue Open API v1** and **SoDEX Mainnet Public Data**. It solves two blind spots for crypto ETF, treasury stock (DAT), and on-chain traders:

1. **Flow Truth & Carry De-Noising:** Separates real US Spot BTC/ETH ETF demand from hedge-fund cash-and-carry arbitrage by comparing annualized SoDEX 1h perp funding (`× 8,760`) against **NY Fed SOFR + 0.75%** fee/margin hurdle, overlaid with a live **Macro Circuit Breaker** and cited **SoSoValue Hot Catalysts**.
2. **3-Tier Equity mNAV & Liquidity-Gated Wrapper TCO:** Audits **Enterprise Value (EV) mNAV** (including convertible debt, Digital Credit preferreds, and cash deductions), locks Hybrid Miners (`MARA`, `RIOT`, `CLSK`) and Operating Exchanges (`COIN`, `HOOD`) out of Pure-Play DAT overpay rankings, simulates 2-way share issuance dilution, and enforces a **3-Gate SoDEX Liquidity Guardrail** (`Staleness > 1h`, `Spread > 25 bps`, `Allocation > 2× Top-of-Book`) before recommending any on-chain route.
3. **Unsigned Live SoDEX Wallet Scanner & Non-Custodial EIP-712 Builder Approval:** Reads real on-chain ValueChain EVM & SoDEX Perps collateral with zero login, supports real `window.ethereum` EIP-712 `ApproveBuilderFeeAction` signing (plus a 1-click JSON payload inspector), and exports white-label **Client Audit Briefs** & **PNG Audit Cards**.

---

## One-Person On-Chain Finance Business Model

| Tier | Pricing | Target User | Value & Monetization |
| :--- | :--- | :--- | :--- |
| **Public Audit Desk** | `$0 / Free` | Retail DAT & ETF Investors | Flow Truth Score, 3-Tier EV mNAV Audit, Unsigned SoDEX Wallet Scanner, PNG Audit Card (organic acquisition funnel). |
| **SoDEX Builder Fee Routing** | `1–2 bps` (10 bps max cap) | Active On-Chain Traders | Non-custodial routing to SoDEX Mainnet (`Morpho-Earn soUSDC`, `MAG7.ssi`, `BTC/ETH-USD Perps`) via EIP-712 builder code authorization. |
| **Pro Desk & Alert API** | `$49 / mo` | Active Traders & Independent RIAs | Real-time Macro Circuit Breaker Telegram/Webhook alerts, multi-wallet ValueChain monitoring, and white-label Client Audit Briefs. |

---

## Live Data Sources & Architecture

- **SoSoValue Open API v1** (`SOSO_API_KEY` server-side only, never exposed to client):
  - `/etfs/summary-history`, `/etfs/{IBIT|ETHA}/market-snapshot`
  - `/crypto-stocks/*/market-snapshot`, `/crypto-stocks/MSTR/klines`, `/btc-treasuries/*/purchase-history`
  - `/indices/ssimag7/market-snapshot`, `/macro/rates` (NY Fed SOFR), `/macro/events`, `/news/search`
- **SoDEX Mainnet Gateway (`mainnet-gw.sodex.dev`):**
  - Live Spot & Perps order books (`BTC-USD`, `ETH-USD`, `vMAG7ssi_vUSDC`, `vUSSI_vUSDC`, `vBOXX_vUSDC`)
  - Live Wealth Vault yields (`Morpho-Earn soUSDC`)
  - Unsigned EVM & Perps Wallet Reader (`/api/wallet`)
- **Hyperliquid Info API:** 30-day 1h funding history aggregated daily for the 30D ETF Flow vs Funding APR chart overlay.

---

## Local Development

```bash
npm install
cp .env.example .env.local
# Add your free SoSoValue Developer API key to .env.local (SOSO_API_KEY=...)

npm test        # 11 pure quantitative unit tests (Vitest)
npm run lint    # ESLint (0 warnings)
npm run build   # Production Next.js Turbopack build
npm run dev     # Start local dev server
```

> **Disclaimer:** VeriNAV is non-custodial, read-only analytical software. Nothing displayed constitutes financial or investment advice.
