#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# HyperA — full build script
#
# Builds the Next.js frontend, copies the static export into the
# Go agent's embed directory, and cross-compiles the Windows .exe.
#
# Usage:
#   ./scripts/build.sh                     # full build
#   ./scripts/build.sh --frontend-only     # just the frontend
#   ./scripts/build.sh --agent-only        # just the Go binary
# ─────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FRONTEND_DIR="$ROOT/frontend"
AGENT_DIR="$ROOT/agent"
EMBED_DIR="$AGENT_DIR/frontend"
MODE="${1:-all}"

build_frontend() {
  echo "==> [1/3] Building Next.js frontend…"
  cd "$FRONTEND_DIR"
  npm install --no-audit --no-fund
  npm run build
  test -f out/index.html || { echo "ERROR: out/index.html missing"; exit 1; }
  echo "    Static export: $(du -sh out/ | cut -f1)"
}

copy_embed() {
  echo "==> [2/3] Copying static export into agent/frontend/…"
  rm -rf "$EMBED_DIR"
  mkdir -p "$EMBED_DIR"
  cp -r "$FRONTEND_DIR/out/." "$EMBED_DIR/"
}

build_agent() {
  echo "==> [3/3] Cross-compiling Go agent…"
  cd "$AGENT_DIR"
  go mod tidy
  GOOS=windows GOARCH=amd64 CGO_ENABLED=0 \
    go build -ldflags "-s -w -H windowsgui" -o HyperA.exe .
  echo "    Windows binary: $(du -h HyperA.exe | cut -f1)"

  # Also build a native binary for local dev
  if [[ "$(uname -s)" == "Linux" ]]; then
    go build -o hypera .
    echo "    Linux binary: $(du -h hypera | cut -f1)"
  fi
}

case "$MODE" in
  --frontend-only)
    build_frontend
    ;;
  --agent-only)
    build_agent
    ;;
  all|"")
    build_frontend
    copy_embed
    build_agent
    ;;
  *)
    echo "Usage: $0 [--frontend-only|--agent-only]"
    exit 1
    ;;
esac

echo "==> Done."
