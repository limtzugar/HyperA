# Contributing to HyperA

Thanks for your interest in improving HyperA! 🚀

## 🐛 Bug Reports

Open a [GitHub Issue](../../issues) with:

1. **HyperA version** (commit hash or release tag)
2. **OS** (Linux / macOS / Windows + version)
3. **Steps to reproduce**
4. **Expected vs actual behavior**
5. **Logs** — paste the relevant log lines (redact any private keys!)

## ✨ Feature Requests

Open an issue with the `enhancement` label. Describe:

- What problem does this solve?
- What's the proposed solution?
- Any alternatives you've considered?

## 🔧 Development Setup

```bash
# Clone
git clone https://github.com/<your-user>/hypera.git
cd hypera

# Full build (frontend + embed + Go binary)
./scripts/build.sh

# Or run dev mode (hot reload):
# Terminal 1 — Go agent (standalone mode, serves embedded frontend)
cd agent && go run .

# Terminal 2 — Next.js dev server (optional, for live frontend edits)
cd frontend && npm install && npm run dev   # http://localhost:3000
```

### Code Style

- **Go**: `gofmt` + `goimports`. Run `go vet ./...` before committing.
- **TypeScript**: ESLint + Prettier (config in repo). Run `npm run lint`.
- **Commits**: conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).

### Pull Request Checklist

- [ ] Code builds locally (`go build` + `npm run build`)
- [ ] Tests pass (if applicable)
- [ ] No new linting errors
- [ ] No secrets / API keys in the diff
- [ ] README updated if needed
- [ ] CHANGELOG updated if user-facing change

## 🚨 Security

**Never commit**:
- Private keys (`0x...` 64-char hex)
- API keys (OpenAI `sk-...`, Cryptopanic, Glassnode)
- Wallet addresses you don't want public
- Webhook URLs (Discord / Slack / Telegram)

If you find a security vulnerability, **do NOT open a public issue**. Email the maintainer directly.

## 📋 Project Scope

HyperA is focused on:

- Hyperliquid perpetuals trading
- Multi-timeframe technical analysis
- DCA strategies
- Paper trading with realistic fills

Out of scope:

- Spot trading
- Other DEXs / CEXs (Binance is only for market data)
- Mobile app (web only)
- Real portfolio management across multiple venues

## 📜 License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
