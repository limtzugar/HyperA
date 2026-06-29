# Changelog

All notable changes to HyperA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-06-29

### Added — Dashboard usability (audit roadmap phase 1)
- **DecisionPanel** — top-of-dashboard verdict panel that combines signal
  direction, circuit-breaker state, and AI decision into a single
  `STRONG_BUY` / `BUY` / `HOLD` / `SELL` / `STRONG_SELL` verdict with a
  one-line rationale. Driven by the new pure `computeDecision(state)`
  helper — the single source of truth shared by DecisionPanel and StatusBar.
- **StatusBar** — compact always-visible strip at the top of the dashboard
  showing: bot status · last price · daily PnL · open positions ·
  circuit-breaker state · funding countdown.
- **AlertBanner** — top-of-page banner that surfaces critical alerts:
  Circuit Breaker HALTED, daily loss at 80%+ of limit, agent connection
  lost, paper-balance below warning threshold. Driven by the new
  `collectAlerts(state)` helper.
- **Config input debouncing** — typing in any ConfigPanel text/number
  field no longer re-renders the whole dashboard per keystroke. Local
  state updates instantly; debounced 250 ms before propagating to the
  parent. Toggle switches still apply immediately. Manual APPLY button
  cancels pending debounce and applies now.

### Added — Robustness
- `sanitizeReflect()` — reflection-based fallback in `sanitizeJSON()`
  that catches NaN/Inf inside ANY typed struct slice (`[]PaperTrade`,
  `[]PaperPosition`, …) or struct that the previous code didn't
  recognise. Wire format matches direct `json.Marshal` output.
- Source-level NaN/Inf/≤0 guards in `closePosition`, `CheckSLTP`,
  `OpenDCAPosition` — NaN can no longer enter the trade ledger.
- `PaperTrader.GetStatus()` now sanitises every float field
  individually (Balance, DailyStartBalance, MaxBalance, price, equity,
  dailyPnL, per-position unrealized PnL / entry / SL / TP / DCA mult).

### Fixed
- `json: unsupported value: NaN` error during `paper_json` WebSocket
  broadcasts — root cause was `[]PaperTrade` slipping past the
  `default: return v` branch in `sanitizeJSON`. Fixed by the reflection
  fallback + source-level guards above.
- NaN EntryPrice in `closePosition` — the old `<= 0` guard missed NaN
  because NaN comparisons return false in Go. New guard:
  `math.IsNaN() || math.IsInf() || <= 0`.

### Changed
- Go version bumped from 1.22.10 → 1.25.0.
- `GRID_PANELS` now contains `decisionPanel` (220 px) as the first entry.
- `ESSENTIAL_PANELS` now contains `decisionPanel` — preserved in
  Focus mode.

---

## [1.0.0] — 2026-06-24

### Added
- Initial public release.
- Go trading agent with 8 signal types (RSI, MACD, BB, Hurst, OBV,
  funding, whales, sentiment).
- 3-level DCA strategy (E1 = BB cross 1×, E2 = Hurst↑ 2×,
  E3 = Hurst↑ 4×, Exit = opposite Hurst cross).
- Multi-timeframe analysis (5m / 15m / 1h / 4h).
- Circuit Breaker (daily loss / consecutive losses / drawdown).
- Next.js 16 dashboard with real-time WebSocket updates, 29
  draggable/resizable panels in an insertion-sort FLIP-animated grid.
- Embedded static frontend (no Node.js runtime needed in production).
- Windows `.exe` build with embedded icon and DPI-aware manifest.
- Standalone mode auto-detection (no stdin pipe → standalone HTTP server).
- Config persistence to `%APPDATA%/HyperA/config.json` (Windows) or
  `~/.config/hypera/` (Linux).
- `sanitizeJSON()` defense-in-depth against NaN/Inf propagating to
  WebSocket clients.
- Paper trading with realistic fees (0.035% per side).

### Security
- No hardcoded private keys or API tokens in source or binary.
- All secrets loaded from environment or runtime config file.
- `.gitignore` covers `.env`, `config.json`, build artifacts.
