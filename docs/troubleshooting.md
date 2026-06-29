# Troubleshooting

Common issues and fixes when running or building HyperA.

## Runtime

### `json: unsupported value: NaN` in agent logs

**Fixed in v1.1.0.** If you still see this on an older build, update.
Root cause: NaN floats in `PaperTrade` records reached `json.Marshal`.
Fix is defense-in-depth — see [CHANGELOG](../CHANGELOG.md) v1.1.0.

### Dashboard shows "Connection lost" banner

1. Check that `HyperA.exe` / `./hypera` is still running.
2. Open `http://127.0.0.1:3000` directly in a browser.
3. Check the agent's stdout for errors.
4. If running in dev mode, make sure both the Go agent and the Next.js
   dev server are running.

### Circuit Breaker is stuck in HALTED

The CB enters a cooldown after tripping. Default cooldown is 60 minutes.
You can:
- Wait for the cooldown to expire (a countdown is shown in the StatusBar).
- Manually reset via the ConfigPanel (set `cb_enabled` to `false` and
  back to `true`).
- Restart the agent (clears the CB state but also clears paper-trade
  history).

### Config changes don't seem to apply

- Toggle switches apply immediately.
- Text / number inputs are debounced 250 ms — type the full value, then
  wait a quarter second, or click **APPLY** to force.
- If still not applying, check the agent's stdout for validation errors
  (e.g. `leverage` out of range, `size_usd` below minimum).

### Paper trader balance shows NaN

**Fixed in v1.1.0.** Update to the latest build. If it still happens,
file an issue with the agent's stdout log (last 100 lines) — there's
likely a new code path leaking NaN past the sanitiser.

## Build

### `go build` fails with `module requires Go 1.25`

Update Go: https://go.dev/doc/install. HyperA requires Go 1.25+.

### `npm run build` fails with TypeScript errors

The repo sets `typescript.ignoreBuildErrors: true` in `next.config.ts`
for now (tracked as HYP-010). The build should succeed regardless of
type errors. If it still fails, it's likely a real syntax error — check
the error message.

### Frontend static export is missing pages

Make sure `next.config.ts` contains `output: "export"` and
`trailingSlash: true`. Run `npm run build` from the `frontend/`
directory — output goes to `frontend/out/`.

### Embedded dashboard shows old version after rebuild

You forgot step 2 of the build pipeline:
```bash
cp -r frontend/out/* agent/frontend/
```
The Go binary embeds whatever is in `agent/frontend/` at build time.

### `HyperA.exe` opens a console window on Windows

You're missing the `-H windowsgui` linker flag. Rebuild with:
```bash
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
  go build -ldflags "-s -w -H windowsgui" -o HyperA.exe .
```

## Hyperliquid

### `invalid signature` errors

Your `PRIVATE_KEY` is malformed. It must be 64 hex chars, with or
without the `0x` prefix. Do NOT include quotes or whitespace.

### Testnet vs mainnet

By default HyperA connects to **testnet**. To switch to mainnet, set
the `HYPERA_MAINNET=1` environment variable. **Only do this after
thoroughly testing on testnet.**

### Positions not opening

Check:
1. Is `cb_enabled` true but the breaker is tripped? (StatusBar shows
   HALTED.)
2. Is `dca_enabled` true?
3. Is `size_usd` at least $10 (Hyperliquid minimum)?
4. Is the signal `UP` or `DOWN` with confidence ≥ 50%?
5. Are you on testnet with sufficient testnet USDC?

## Still stuck?

Open a [GitHub Issue](../../issues/new?template=bug_report.md) with:
- HyperA version (from the StatusBar or `HyperA.exe --version`)
- OS and version
- Steps to reproduce
- Agent stdout log (last 200 lines, redact private keys)
- A screenshot of the dashboard
