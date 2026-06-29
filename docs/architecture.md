# HyperA — Architecture

This document describes the internal architecture of HyperA: the Go agent, the
WebSocket protocol, the frontend dashboard, and the deployment model.

## High-level diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Single Go binary                            │
│                                                                      │
│  ┌────────────────────────┐    embed.FS    ┌─────────────────────┐  │
│  │  HTTP server (net/http)│ ─────────────→ │  Next.js static     │  │
│  │  :3000                 │                │  export (HTML/CSS/JS)│  │
│  └────────────────────────┘                └─────────────────────┘  │
│           │                                                          │
│           │  /ws  (WebSocket upgrade)                                │
│           ▼                                                          │
│  ┌────────────────────────┐    channels    ┌─────────────────────┐  │
│  │  WS Hub (gorilla)      │ ←────────────→ │  Trading Engine     │  │
│  │  - broadcast state     │                │  - Signal aggregator │  │
│  │  - receive config      │                │  - PaperTrader       │  │
│  └────────────────────────┘                │  - CircuitBreaker    │  │
│                                             │  - DCA strategy      │  │
│                                             └─────────────────────┘  │
│                                                       │              │
│                                                       │ HTTP/WS     │
│                                                       ▼              │
│                                             ┌─────────────────────┐  │
│                                             │  Hyperliquid / data │  │
│                                             │  Binance, Hypurrscan│  │
│                                             │  Cryptopanic, etc.  │  │
│                                             └─────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                       ▲
                       │ HTTP :3000
                       ▼
            ┌─────────────────────────┐
            │   Browser (any OS)      │
            │   http://127.0.0.1:3000 │
            └─────────────────────────┘
```

## Component breakdown

### `agent/main.go` (~6000 lines)

Holds the entire trading engine in a single file for easy embedding. Key
subsystems:

| Subsystem | Type / function | Description |
|-----------|-----------------|-------------|
| Signal aggregator | `computeSignal()` | Merges 8 indicators across 4 timeframes into one `UP` / `DOWN` / `NEUTRAL` verdict with confidence. |
| Paper trader | `PaperTrader` struct | Simulates fills at 0.035% per side, tracks balance, equity, daily PnL, recent trades, open positions. Methods: `OpenDCAPosition`, `closePosition`, `CheckSLTP`, `GetStatus`. |
| Circuit Breaker | `CircuitBreaker` struct | Monitors daily loss, consecutive losses, drawdown. Trips into HALTED + cooldown. |
| DCA strategy | `DCAGroup`, `processDCASignal()` | 3-level DCA: E1 (BB cross, 1×) → E2 (Hurst↑, 2×) → E3 (Hurst↑, 4×) → EXIT (opposite Hurst cross). |
| Sanitiser | `sanitizeJSON()`, `sanitizeReflect()` | Defense-in-depth: walks every float64 field of every struct before `json.Marshal`. Catches NaN/Inf at the boundary. |
| Config loader | `loadConfig()` | Reads env vars first, then runtime config file (`%APPDATA%/HyperA/config.json`). |

### `agent/ws.go` (~470 lines)

WebSocket hub using `gorilla/websocket`. One `Hub` struct with `register` /
`unregister` / `broadcast` channels. Each client gets a goroutine reading
config updates and a goroutine writing state broadcasts. The hub is the
single source of truth for "what the dashboard currently sees".

### `agent/secrets.go`

Loads secrets (private key, API keys) from environment variables, falling
back to the runtime config file. Never logs secrets. Used by `loadConfig()`.

### `frontend/src/app/page.tsx` (~4900 lines)

Single-page dashboard, client component. Holds `BotState` in a
`useState` and subscribes to the Go agent's WebSocket for updates.

Key UI primitives:
- **`computeDecision(state)`** — pure helper that returns
  `{ verdict: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL', reason: string }`.
  Used by both `DecisionPanel` and `StatusBar`.
- **`collectAlerts(state)`** — pure helper that returns an array of
  `{ severity: 'critical' | 'warning', message: string }`. Used by
  `AlertBanner`.
- **`SortableGrid`** (in `components/SortablePanels.tsx`) — insertion-sort
  drag-and-drop grid using FLIP (First-Last-Invert-Play) animation.
  Pure React, no DnD library dependency.
- **`GRID_PANELS`** — array of 29 panel definitions, each with a key, a
  default width, and a render function. Drives the dashboard layout.
- **`ESSENTIAL_PANELS`** — subset of `GRID_PANELS` keys shown in Focus
  mode (a stripped-down view for monitoring only).
- **`ConfigPanel`** — debounced config editor. `localRef.current` is the
  source of truth for the form; `scheduleDebouncedApply()` propagates to
  the parent 250 ms after the last keystroke.

### `frontend/src/lib/standalone-state.ts`

Adapter that lets the dashboard talk to either:
- A standalone Go agent (native WebSocket on `/ws`), or
- A cloud/dev bridge (Socket.IO on `/socket.io`).

Auto-detects mode from `window.location` and exposes a unified
`PseudoSocket` interface to the rest of the dashboard.

## Data flow

```
Hyperliquid WS  ──→  Go agent (parse, compute signal)
                          │
                          ├─→ PaperTrader (simulate fill)
                          ├─→ CircuitBreaker (check risk)
                          ├─→ DCA strategy (maybe open/close)
                          │
                          ▼
                     Hub.broadcast  ──→  every WebSocket client
                                              │
                                              ▼
                                       React setState
                                              │
                                              ▼
                                       Dashboard re-render
```

State broadcasts happen on every iteration of the main agent loop
(~1 /sec when candles arrive). Config updates flow the other way:
the dashboard sends a config patch over the same WebSocket, the agent
validates and applies it, then broadcasts the new state.

## Deployment model

HyperA is a **single-binary desktop app**. The Go binary embeds the
Next.js static export via `embed.FS`, so the user does not need
Node.js, npm, or any runtime — just the `.exe` (Windows) or `./hypera`
(Linux/macOS). The binary:

1. Listens on `http://127.0.0.1:3000` (loopback only — not exposed to
   the network).
2. Serves the embedded dashboard at `/`.
3. Upgrades WebSocket connections at `/ws`.
4. Connects to Hyperliquid (testnet by default), Binance, Hypurrscan,
   Cryptopanic, and optionally OpenAI.

For headless / server deployments, set `HYPERA_NO_BROWSER=1` and
optionally `HYPERA_LISTEN=0.0.0.0:3000` to expose the dashboard
remotely (use behind a reverse proxy with auth).

## Build pipeline

```
1. npm run build (frontend/) → out/  (Next.js static export)
2. cp -r out/* agent/frontend/
3. go build (agent/) → hypera (Linux) or HyperA.exe (Windows)
   - Windows flags: -ldflags "-s -w -H windowsgui"  (no console window)
   - Cross-compile: GOOS=windows GOARCH=amd64 CGO_ENABLED=0
```

The `scripts/build.sh` helper automates steps 1–3.

## See also

- [Troubleshooting](./troubleshooting.md) — common issues and fixes
- [Audit Roadmap](./audit-roadmap.md) — known issues, prioritised
- [CHANGELOG](../CHANGELOG.md) — release history
