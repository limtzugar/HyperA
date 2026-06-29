# HyperA

**Autonomous scalping agent for [Hyperliquid](https://hyperliquid.xyz) with DCA strategy, multi-timeframe analysis, paper trading, and real-time WebSocket dashboard.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8.svg)](https://go.dev)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-blue.svg)](#quick-start)

---

## 📋 Overview

HyperA is a real-time crypto trading system that monitors markets across multiple timeframes (5m / 15m / 1h / 4h), generates trading signals using 8 indicator types (RSI, MACD, Bollinger Bands, Hurst exponent, OBV imbalance, on-chain whale flows, funding rates, sentiment), and executes a 3-level DCA (Dollar Cost Averaging) strategy on Hyperliquid perpetuals — with a built-in Circuit Breaker for risk management and a paper-trading sandbox for safe strategy testing.

### Architecture

```
┌─────────────────┐    WebSocket     ┌──────────────────┐     HTTP/WS      ┌──────────────┐
│  Frontend (Next)│ ←─────────────→  │   Go Agent       │  ←────────────→  │ Hyperliquid  │
│  Static export  │    JSON state    │  (single binary) │                  │   API        │
│  Embedded in Go │                  │  + WS Hub        │                  │  (testnet)   │
└─────────────────┘                  └──────────────────┘                  └──────────────┘
                                            │
                                            ├─→ Binance (candles)
                                            ├─→ Hypurrscan (whales)
                                            ├─→ Fear & Greed API
                                            ├─→ Cryptopanic (news)
                                            └─→ OpenAI (AI signals, optional)
```

The Go binary embeds the Next.js static export via `embed.FS` and serves it on `http://127.0.0.1:3000`. **No Node.js runtime required in production** — the entire dashboard ships inside one ~8.7 MB Windows `.exe`.

---

## 🚀 Quick Start

### Prerequisites

- **Go** 1.25 or later — [install](https://go.dev/doc/install)
- **Node.js** 20+ and **npm** (only needed if you want to rebuild the frontend)
- A Hyperliquid **testnet** private key (recommended for first runs)

### Option A: Build the desktop binary (recommended)

```bash
# 1. Build the frontend static export
cd frontend
npm install
npm run build       # produces ./out/ directory

# 2. Copy the static export into the Go agent
mkdir -p ../agent/frontend
cp -r out/* ../agent/frontend/

# 3. Build the Go binary
cd ../agent
go mod tidy

# Linux/macOS
go build -o hypera .

# Windows (cross-compile from any OS)
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -ldflags "-s -w -H windowsgui" -o HyperA.exe .

# 4. Run
./hypera              # Linux/macOS
# or
HyperA.exe            # Windows — opens http://127.0.0.1:3000 in browser
```

### Option B: Development mode (live reload)

Run the Go agent and Next.js dev server separately:

```bash
# Terminal 1 — Go agent (standalone mode, serves embedded frontend)
cd agent
go run .

# Terminal 2 — Next.js dev server (optional, for live frontend edits)
cd frontend
npm run dev
# Open http://localhost:3000
```

### Option C: Pre-built Windows binary

Download `HyperA.exe` from the [Releases page](../../releases), drop it in any folder, and double-click. The dashboard opens in your default browser at `http://127.0.0.1:3000`. Configuration is entered through the UI and persisted to `%APPDATA%\HyperA\config.json`.

---

## ⚙️ Configuration

All configuration is entered at runtime through the web UI and persisted to:

- **Linux/macOS**: `~/.config/hypera/config.json`
- **Windows**: `%APPDATA%\HyperA\config.json`

For headless / scripted runs, you can set environment variables instead (see [`.env.example`](.env.example)):

```bash
export PRIVATE_KEY=0x...        # required
export AI_API_KEY=sk-...        # optional
./hypera
```

### Key parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `coin` | `BTC` | Trading pair (e.g. `BTC`, `ETH`, `SOL`) |
| `timeframes` | `5m,15m,1h,4h` | Multi-timeframe analysis windows |
| `dca_enabled` | `true` | Enable 3-level DCA strategy |
| `dca_e1_mult` | `1.0` | Entry 1 multiplier (BB cross) |
| `dca_e2_mult` | `2.0` | Entry 2 multiplier (Hurst ↑) |
| `dca_e3_mult` | `4.0` | Entry 3 multiplier (Hurst ↑) |
| `leverage` | `5` | Position leverage (1-50) |
| `size_usd` | `50` | Base position size in USD |
| `cb_enabled` | `true` | Circuit Breaker enabled |
| `cb_max_daily_loss_pct` | `5.0` | Daily loss limit (%) |
| `cb_max_consecutive_losses` | `5` | Consecutive losing trades limit |
| `cb_cooldown_minutes` | `60` | CB cooldown period (minutes) |

> **UX tip**: All config inputs are debounced (250 ms) — typing in a field no longer re-renders the entire dashboard per keystroke. Toggle switches apply immediately; text/number inputs apply after you stop typing or click **APPLY**.

---

## 🧠 Strategy: DCA 3-Level

The DCA strategy layers entries based on signal strength:

| Entry | Trigger | Multiplier | Cumulative Size |
|-------|---------|------------|-----------------|
| **E1** | Bollinger Band cross | 1.0× | 1.0× base |
| **E2** | Hurst exponent rising | 2.0× | 3.0× base |
| **E3** | Hurst exponent rising | 4.0× | 7.0× base |
| **EXIT** | Opposite Hurst cross | — | Closes entire group |

The entire DCA group is treated as one logical position — exit closes all entries at once. Stop-loss and take-profit apply per-entry, but a group-level SL/TP can also be set.

See `agent/main.go` → `DCAGroup`, `processDCASignal()` for the implementation.

---

## 🛡️ Risk Management

### Circuit Breaker

Built-in risk management that pauses paper trading when:

- Daily loss exceeds `cb_max_daily_loss_pct` (default 5%)
- Consecutive losses reach `cb_max_consecutive_losses` (default 5)
- Drawdown exceeds `cb_max_drawdown_pct` (default 10%)

After triggering, the CB enters a cooldown period (`cb_cooldown_minutes`) before automatically re-enabling. The CB status is visible on the dashboard with a clear **HALTED** badge, and a top-of-page **AlertBanner** appears whenever the breaker is tripped.

### Paper Trading Sandbox

HyperA ships with a built-in **paper trader** (`PaperTrader` in `agent/main.go`) that simulates order fills with realistic fees (0.035% per side) on live market data. Use the sandbox to:

- Validate strategies before risking real capital
- Replay scenarios with different `size_usd`, `leverage`, and CB parameters
- Track PnL, win rate, ROI, and equity curve in real time

Switch to live trading only after the sandbox has run profitably for at least a week of continuous operation.

---

## 📊 Multi-Timeframe Signal Engine

Signals are computed independently on each timeframe and merged using a weighted confidence score:

- **RSI** — overbought/oversold with divergences
- **MACD** — histogram cross + signal line
- **Bollinger Bands** — band cross + bandwidth squeeze
- **Hurst Exponent (HCCCO)** — trending vs mean-reverting regime detection
- **Volume Spike** — anomaly detection vs 20-period MA
- **OB Imbalance** — order book bid/ask asymmetry
- **Funding Rate** — perpetual premium/discount
- **Whale Trades** — large Hyperliquid trades via Hypurrscan

Final signal: `UP` / `DOWN` / `NEUTRAL` with a 0–100% confidence.

---

## 🖥️ Frontend Dashboard

A real-time terminal-style dashboard with 29 draggable, resizable panels arranged in an insertion-sort grid (FLIP-animated). Key panels:

### Decision Panel (NEW in v1.1)
Top-of-dashboard verdict panel that answers **"what should I do right now?"** in a single glance. Combines signal direction, circuit-breaker state, and AI decision into a clear `STRONG_BUY` / `BUY` / `HOLD` / `SELL` / `STRONG_SELL` verdict with a one-line rationale.

### Status Bar (NEW in v1.1)
Compact strip at the top of the dashboard showing: bot status · last price · daily PnL · open positions · circuit breaker state · funding countdown. Stays visible at all times so you can see the most critical metrics without scrolling.

### Alert Banner (NEW in v1.1)
High-priority banner that appears at the top of the dashboard when:
- Circuit Breaker is **HALTED**
- Daily loss exceeds 80% of the configured limit
- Connection to the agent is lost
- Paper trader balance drops below a warning threshold

### Other panels
- Live price + volume ticker
- Per-timeframe indicator panels (RSI / MACD / BB / Hurst) with mini sparklines
- Open positions with unrealized PnL and DCA-group visualization
- Trade history (last 20)
- Multi-timeframe OHLCV charts (1m / 5m / 15m / 30m)
- Config editor (no restart needed, debounced)
- Whale activity feed
- Funding rate & countdown
- AI decision log

Built with Next.js 16 + TypeScript + Tailwind CSS. Static-exported and embedded into the Go binary.

---

## 🧰 Project Structure

```
hypera/
├── agent/                          # Go trading agent
│   ├── main.go                     # Core agent (signals, DCA, paper trader, CB)
│   ├── ws.go                       # WebSocket hub + HTTP server + embed.FS
│   ├── secrets.go                  # Secret loading (env / config file)
│   ├── go.mod / go.sum
│   ├── resources/                  # App icon (.ico, .png)
│   ├── winres/                     # Windows resource manifest + icon
│   └── frontend/                   # Embedded Next.js static export (build output, gitignored)
├── frontend/                       # Next.js dashboard source
│   ├── src/
│   │   ├── app/                    # Routes (page.tsx, layout.tsx, globals.css)
│   │   ├── components/
│   │   │   ├── SortablePanels.tsx  # FLIP-animated drag-and-drop grid
│   │   │   ├── DraggablePanel.tsx  # Single panel wrapper
│   │   │   └── ui/                 # shadcn/ui (toast only)
│   │   ├── hooks/                  # use-toast, use-mobile
│   │   └── lib/
│   │       ├── utils.ts            # cn() helper
│   │       └── standalone-state.ts # Standalone mode WS adapter
│   ├── public/                     # Static assets (logo.svg, robots.txt)
│   ├── next.config.ts              # output: "export" + trailingSlash: true
│   └── package.json                # Minimal deps
├── docs/                           # Architecture, troubleshooting, audit
├── .github/                        # Issue templates, PR template, CI workflow
├── scripts/                        # Build helpers
├── .gitignore
├── .editorconfig
├── .env.example
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE                         # MIT
└── README.md                       # This file
```

---

## 🧪 Robustness

### NaN Defense (v1.1)

A class of bugs where `NaN` floats propagated from indicator computations into `PaperTrade` records caused `json.Marshal` to fail with `json: unsupported value: NaN`. The v1.1 fix is **defense in depth**:

1. **Reflection-based sanitizer** — `sanitizeJSON()` now falls back to `sanitizeReflect()` for any typed struct slice (`[]PaperTrade`, `[]PaperPosition`, …) it doesn't recognise, recursively sanitising every float field.
2. **Source-level guards** — `closePosition()`, `CheckSLTP()`, `OpenDCAPosition()` reject NaN/Inf/≤0 prices and sizes before any computation, so NaN can never enter the trade ledger.
3. **GetStatus sanitisation** — every float field returned by `PaperTrader.GetStatus()` is individually clamped (Balance, DailyStartBalance, MaxBalance, price, equity, dailyPnL, per-position unrealized PnL / entry / SL / TP / DCA mult).

After this fix, the WebSocket stream is guaranteed to be valid JSON even under adversarial market data.

---

## ⚠️ Disclaimer

This software is for **educational and research purposes only**. It is NOT financial advice. Trading cryptocurrencies involves significant risk of loss. The authors and contributors are not responsible for any financial losses incurred through the use of this software.

**Start with testnet.** Always test new strategies with paper trading before risking real capital. Never trade with money you cannot afford to lose.

---

## 🤝 Contributing

Pull requests welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide. For major changes, please open an issue first to discuss what you would like to change.

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📝 License

[MIT](LICENSE) — © 2026 HyperA
