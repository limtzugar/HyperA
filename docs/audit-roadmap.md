# HyperA — Audit Roadmap

Internal audit findings, prioritised. This document tracks what's been
fixed and what's still outstanding. Items are tagged `HYP-NNN`.

## Status legend

- ✅ **Done** — fixed and shipped
- 🚧 **In progress** — actively being worked on
- ⏳ **Backlog** — accepted, not yet started
- ❌ **Won't fix** — out of scope or rejected

---

## ✅ Done

### HYP-001 — NaN marshal error
**Fixed in v1.1.0.** `json: unsupported value: NaN` during `paper_json`
broadcasts. Root cause: `sanitizeJSON()` didn't handle typed struct
slices like `[]PaperTrade`. Fixed with reflection fallback + source-level
NaN guards in `closePosition`, `CheckSLTP`, `OpenDCAPosition`, `GetStatus`.

### USAB-001 — DecisionPanel
**Fixed in v1.1.0.** Dashboard didn't answer "what should I do right
now?" in a single glance. Added `computeDecision(state)` pure helper +
`DecisionPanel` component at top of the grid.

### USAB-002 — StatusBar
**Fixed in v1.1.0.** Critical metrics (price, daily PnL, CB state, …)
were scattered across panels. Added always-visible compact StatusBar at
the top of the dashboard.

### USAB-003 — AlertBanner
**Fixed in v1.1.0.** Critical alerts were buried in per-panel badges.
Added top-of-page AlertBanner driven by `collectAlerts(state)`.

### USAB-004 — Config input debouncing
**Fixed in v1.1.0.** Typing in any config field caused per-keystroke
parent re-renders. Added 250 ms debounce in `ConfigPanel` via
`scheduleDebouncedApply()`.

### HYP-005 — API keys in plaintext
**Fixed in v1.0.0.** Secrets are no longer logged. Config file is
`0600` on Unix. `.gitignore` covers `.env`, `config.json`.

### HYP-006 — WebSocket CheckOrigin
**Fixed in v1.0.0.** `CheckOrigin: true` is acceptable because the
agent listens on loopback only. Documented in `ws.go`.

### HYP-007 — `stdoutMu.Lock` without `defer Unlock`
**Fixed in v1.0.0.** All `stdoutMu.Lock()` calls now have a matching
`defer stdoutMu.Unlock()`.

---

## ⏳ Backlog

### HYP-008 — Monolith split (`page.tsx` ~4900 lines)
Split `frontend/src/app/page.tsx` into per-panel components under
`frontend/src/components/panels/`. Keep `page.tsx` as the layout shell
+ state owner.

### HYP-009 — `any` types in `BotState`
Replace `any[]` fields (`whaleActivity`, `whaleTopPositions`,
`traderProfiles`, `aiDecision`, `circuitBreaker`, `marketRegime`, …)
with proper TypeScript interfaces.

### HYP-010 — `ignoreBuildErrors: true`
Remove from `next.config.ts` once HYP-009 is done. Should be a clean
TypeScript build.

### HYP-011 — Zero tests
Add unit tests, starting with the pure helpers:
- `computeDecision(state)` — easy to test, no React deps
- `collectAlerts(state)` — same
- `sanitizeJSON()` + `sanitizeReflect()` — Go side, table-driven test
- `PaperTrader.OpenDCAPosition` / `closePosition` — Go side

### HYP-012 — XSS audit
The dashboard renders some user-provided strings (config values, log
messages). Audit every `dangerouslySetInnerHTML` and replace with
proper React text rendering.

### HYP-013 — Reconnect storm
When the WebSocket disconnects, the dashboard retries every 1s. After
multiple failures, this can storm the agent. Add exponential backoff
with jitter, and a "Reconnecting in Ns…" UI affordance.

### HYP-014 — Versioning
The binary doesn't report its version. Add `-ldflags "-X main.version=v1.1.0"`
injection, expose `--version` flag, and show the version in the
StatusBar.

---

## ❌ Won't fix

(none currently)
