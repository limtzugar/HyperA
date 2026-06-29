/**
 * standalone-state.ts — Standalone desktop mode adapter.
 *
 * W trybie standalone (HyperA.exe) frontend łączy się bezpośrednio z Go serverem
 * przez raw WebSocket (endpoint /ws), zamiast przez Socket.IO. Go server wysyła
 * wiadomości w formacie:
 *
 *   { "type": "state", "prefix": "MARKET_JSON:", "payload": { ... } }
 *
 * Ten moduł:
 *   1. Wykrywa tryb standalone (localhost bez gateway).
 *   2. Untowruje prefix→state mapping (port z server.ts) — konwertuje partial
 *      payloady na aktualizacje BotState.
 *   3. Udostępnia adapter WebSocket, który imituje interfejs Socket.IO
 *      (emit/on/disconnect/connected) dla reszty aplikacji.
 */

import type { BotState } from "@/app/page";

// ─── Tryb standalone — detekcja ─────────────────────────────────────────────
// Działa, gdy otwarte bezpośrednio przez http://127.0.0.1:3000 (HyperA.exe).
// W sandbox/dev przez gateway URL zawiera XTransformPort lub inną host-name.
export function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host !== "127.0.0.1" && host !== "localhost") return false;
  // Gateway dodaje query param — jeśli go nie ma, jesteśmy w standalone
  const params = new URLSearchParams(window.location.search);
  if (params.has("XTransformPort")) return false;
  return true;
}

// ─── Prefiksy JSON wysyłane przez Go agent ──────────────────────────────────
const JSON_PARSERS: Record<string, keyof BotState | null> = {
  "SIGNAL_JSON:": "signalStates",
  "TOP_TRADERS_JSON:": null,
  "AI_DECISION_JSON:": "aiDecision",
  "CB_JSON:": "circuitBreaker",
  "BACKTEST_JSON:": "backtestResult",
  "SCALP_JSON:": "scalpStatus",
  "SCALP_BACKTEST_JSON:": "scalpBacktest",
  "LIQ_JSON:": "liquidationMap",
  "REGIME_JSON:": "marketRegime",
  "RISK_JSON:": "riskMetrics",
  "SENTIMENT_V2_JSON:": "enhancedSentiment",
  "SIGNAL_RANKING_JSON:": "signalRanking",
  "ONCHAIN_JSON:": "onchainMetrics",
  "MARKET_JSON:": null,
  "PAPER_JSON:": null,
  "OHLCV_JSON:": null,
};

const MAX_HISTORY = 200;

// ─── Apply prefix payload to BotState ───────────────────────────────────────
// Port logiki z server.ts (Node.js bridge) — musi być spójny z oryginałem.
export function applyPrefixToState(
  prefix: string,
  data: any,
  prev: BotState,
): Partial<BotState> {
  const next: Partial<BotState> = {};

  // Direct field mapping (1:1)
  const field = JSON_PARSERS[prefix];
  if (field) {
    (next as any)[field] = data;
  }

  // ── TOP_TRADERS_JSON — multiple fields ──
  if (prefix === "TOP_TRADERS_JSON:") {
    if (data.score !== undefined) next.sentimentScore = data.score;
    if (data.label !== undefined) next.sentimentLabel = data.label;
    if (data.long_ratio !== undefined) next.whaleLongRatio = data.long_ratio;
    if (data.long_count !== undefined) next.walletsLongCount = data.long_count;
    if (data.short_count !== undefined) next.walletsShortCount = data.short_count;
    if (data.neutral_count !== undefined) next.walletsNeutralCount = data.neutral_count;
    if (data.traders) {
      next.traderProfiles = data.traders;
      const positions: any[] = [];
      for (const tp of data.traders) {
        if (tp.top_positions && Array.isArray(tp.top_positions)) {
          for (const p of tp.top_positions) {
            positions.push({
              wallet: tp.wallet,
              coin: p.coin,
              side: p.side,
              size_usd: p.size_usd,
              entry_price: p.entry_price || 0,
              pnl: p.pnl,
              leverage: p.leverage,
              account_value: tp.account_value || 0,
            });
          }
        }
      }
      if (positions.length > 0) next.whaleTopPositions = positions;
      next.whaleTotalPositions = data.traders.length;
      next.whaleTotalValueUsd = data.traders.reduce(
        (s: number, t: any) => s + (t.account_value || 0),
        0,
      );
    }
  }

  // ── MARKET_JSON — multiple market fields + enrichment ──
  if (prefix === "MARKET_JSON:") {
    const merged: any = { ...prev, ...next };

    if (data.markPx !== undefined && data.markPx > 0) merged.markPx = data.markPx;
    if (data.prevDayPx !== undefined && data.prevDayPx > 0) merged.prevDayPx = data.prevDayPx;
    if (data.price !== undefined && data.price > 0) merged.price = data.price;
    if (data.volumeUsd !== undefined && data.volumeUsd > 0) merged.volume = data.volumeUsd;
    if (data.volume !== undefined && data.volume > 0) merged.volume = data.volume;
    if (data.fundingRate !== undefined) merged.fundingRate = data.fundingRate;
    if (data.openInterest !== undefined && data.openInterest > 0) merged.openInterest = data.openInterest;
    if (data.oiChangePct !== undefined) merged.oiChangePct = data.oiChangePct;
    if (data.bidDepth !== undefined && data.bidDepth > 0) merged.bidDepth = data.bidDepth;
    if (data.askDepth !== undefined && data.askDepth > 0) merged.askDepth = data.askDepth;
    if (data.obImbalance !== undefined) merged.obImbalance = data.obImbalance;
    if (data.obWallSize !== undefined && data.obWallSize > 0) merged.obWallSize = data.obWallSize;
    if (data.obWallSide !== undefined) merged.obWallSide = data.obWallSide;
    if (data.ofiNet !== undefined) merged.ofiNet = data.ofiNet;
    if (data.ofiBidDelta !== undefined) merged.ofiBidDelta = data.ofiBidDelta;
    if (data.ofiAskDelta !== undefined) merged.ofiAskDelta = data.ofiAskDelta;
    if (data.cvd !== undefined || data.cvdValue !== undefined) merged.cvd = data.cvdValue ?? data.cvd;
    if (data.cvdDivergence !== undefined) merged.cvdDivergence = data.cvdDivergence;
    if (data.volatilityRegime !== undefined) merged.volatilityRegime = data.volatilityRegime;
    if (data.volatilityPct !== undefined) merged.volatilityPct = data.volatilityPct;
    if (data.volatilityMultiplier !== undefined) merged.volatilityMultiplier = data.volatilityMultiplier;
    if (data.perpPremiumPct !== undefined) merged.perpPremiumPct = data.perpPremiumPct;
    if (data.perpPremiumLabel !== undefined) merged.perpPremiumLabel = data.perpPremiumLabel;
    if (data.priceZscore !== undefined) merged.priceZscore = data.priceZscore;
    if (data.meanReversionSignal !== undefined) merged.meanReversionSignal = data.meanReversionSignal;
    if (data.fundingCountdownMin !== undefined && data.fundingCountdownMin >= 0) merged.fundingCountdownMin = data.fundingCountdownMin;
    if (data.fundingNear !== undefined) merged.fundingNear = data.fundingNear;
    if (data.activeAddresses !== undefined) merged.activeAddresses = data.activeAddresses;
    if (data.whaleCount !== undefined) merged.whaleCount = data.whaleCount;
    if (data.coin !== undefined) merged.coin = data.coin;
    if (data.iteration !== undefined) merged.iteration = data.iteration;
    if (data.signal) merged.signal = data.signal;

    // Status: jeśli agent wysyła dane, to działa — ustaw "running"
    merged.status = "running";
    merged.lastUpdate = new Date().toISOString();

    // ── Server-side enrichment (port z server.ts) ──
    if ((!merged.fundingCountdownMin || merged.fundingCountdownMin === 0) && merged.fundingRate != null) {
      const now = new Date();
      const hours = now.getUTCHours();
      const nextFunding = hours < 8 ? 8 - hours : hours < 16 ? 16 - hours : 24 - hours;
      merged.fundingCountdownMin = nextFunding * 60 - now.getUTCMinutes();
      merged.fundingNear = (merged.fundingCountdownMin ?? 0) <= 30;
    }
    if ((!merged.obImbalance || merged.obImbalance === 0) && merged.bidDepth && merged.askDepth && merged.askDepth > 0) {
      merged.obImbalance = Math.round((merged.bidDepth / merged.askDepth) * 100) / 100;
    }
    if (merged.markPx && merged.prevDayPx && merged.prevDayPx > 0) {
      const ppPct = (merged.markPx - merged.prevDayPx) / merged.prevDayPx * 100;
      if (!merged.perpPremiumPct || merged.perpPremiumPct === 0) {
        merged.perpPremiumPct = Math.round(ppPct * 10000) / 10000;
      }
      if (merged.perpPremiumLabel === "FAIR" && Math.abs(ppPct) > 0.05) {
        merged.perpPremiumLabel = ppPct > 0.05 ? "PREMIUM" : ppPct < -0.05 ? "DISCOUNT" : "FAIR";
      }
    }
    if ((!merged.cvdDivergence || merged.cvdDivergence === 0) && merged.ofiNet != null && merged.markPx && merged.prevDayPx) {
      const priceDir = (merged.markPx - merged.prevDayPx) / merged.prevDayPx;
      const ofiDir = (merged.ofiNet ?? 0) > 0 ? 1 : -1;
      const priceSign = priceDir > 0 ? 1 : priceDir < 0 ? -1 : 0;
      if (ofiDir !== priceSign && priceSign !== 0) {
        merged.cvdDivergence = Math.round(ofiDir * Math.min(Math.abs(merged.ofiNet ?? 0) / 1_000_000, 2) * 100) / 100;
      } else {
        merged.cvdDivergence = 0;
      }
    }
    if ((!merged.volatilityPct || merged.volatilityPct === 0) && merged.markPx && merged.prevDayPx && merged.prevDayPx > 0) {
      merged.volatilityPct = Math.abs((merged.markPx - merged.prevDayPx) / merged.prevDayPx);
      if (merged.volatilityPct < 0.005) merged.volatilityRegime = "LOW";
      else if (merged.volatilityPct > 0.03) merged.volatilityRegime = "HIGH";
      else merged.volatilityRegime = "MEDIUM";
    }
    if (merged.meanReversionSignal === "NONE" && merged.markPx && merged.prevDayPx && merged.prevDayPx > 0) {
      const deviation = (merged.markPx - merged.prevDayPx) / merged.prevDayPx;
      const zscore = deviation / (merged.volatilityPct || 0.02);
      merged.priceZscore = Math.round(zscore * 100) / 100;
      if (zscore > 2) merged.meanReversionSignal = "OVERBOUGHT";
      else if (zscore < -2) merged.meanReversionSignal = "OVERSOLD";
    }

    // v0.1: OHLCV technical indicators (latest values)
    if (data.rsi !== undefined) merged.rsi = data.rsi;
    if (data.macdLine !== undefined) merged.macdLine = data.macdLine;
    if (data.macdSignal !== undefined) merged.macdSignal = data.macdSignal;
    if (data.macdHistogram !== undefined) merged.macdHistogram = data.macdHistogram;
    if (data.bbUpper !== undefined) merged.bbUpper = data.bbUpper;
    if (data.bbMiddle !== undefined) merged.bbMiddle = data.bbMiddle;
    if (data.bbLower !== undefined) merged.bbLower = data.bbLower;
    if (data.bbBandwidth !== undefined) merged.bbBandwidth = data.bbBandwidth;
    if (data.chartSource !== undefined) merged.chartSource = data.chartSource;

    // Push to chart history buffers
    const pushHist = (arr: number[] | undefined, val: number | undefined | null, max: number = MAX_HISTORY): number[] => {
      if (val === undefined || val === null) return arr ?? [];
      const nextArr = [...(arr ?? []), val];
      return nextArr.length > max ? nextArr.slice(-max) : nextArr;
    };

    if (data.rsi !== undefined && data.rsi > 0) {
      merged.rsiHistory = pushHist(prev.rsiHistory, data.rsi);
    }
    if (data.macdLine !== undefined) {
      merged.macdLineHistory = pushHist(prev.macdLineHistory, data.macdLine);
    }
    if (data.macdSignal !== undefined) {
      merged.macdSignalHistory = pushHist(prev.macdSignalHistory, data.macdSignal);
    }
    if (data.macdHistogram !== undefined) {
      merged.macdHistHistory = pushHist(prev.macdHistHistory, data.macdHistogram);
    }
    if (data.bbUpper !== undefined && data.bbUpper > 0) {
      merged.bbUpperHistory = pushHist(prev.bbUpperHistory, data.bbUpper);
    }
    if (data.bbMiddle !== undefined && data.bbMiddle > 0) {
      merged.bbMiddleHistory = pushHist(prev.bbMiddleHistory, data.bbMiddle);
    }
    if (data.bbLower !== undefined && data.bbLower > 0) {
      merged.bbLowerHistory = pushHist(prev.bbLowerHistory, data.bbLower);
    }
    if (data.price !== undefined && data.price > 0) {
      merged.priceHistory = pushHist(prev.priceHistory, data.price);
    }

    Object.assign(next, merged);
  }

  // ── PAPER_JSON — paper trading fields ──
  if (prefix === "PAPER_JSON:") {
    const merged: any = { ...prev, ...next };
    if (data.balance !== undefined) merged.paperBalance = data.balance;
    if (data.realizedPnl !== undefined) merged.paperRealizedPnl = data.realizedPnl;
    if (data.dailyPnl !== undefined) merged.paperDailyPnl = data.dailyPnl;
    if (data.winRate !== undefined) merged.paperWinRate = data.winRate;
    if (data.roi !== undefined) merged.paperRoi = data.roi;
    if (data.fees !== undefined) merged.paperFees = data.fees;
    if (data.positions !== undefined) merged.paperPositions = data.positions;
    if (data.totalTrades !== undefined) merged.paperTotalTrades = data.totalTrades;
    if (data.wins !== undefined) merged.paperWins = data.wins;
    if (data.losses !== undefined) merged.paperLosses = data.losses;
    if (data.recentTrades !== undefined) {
      merged.paperRecentTrades = (data.recentTrades ?? []).slice(-50);
    }
    if (data.openPositions !== undefined) {
      merged.paperOpenPositions = (data.openPositions ?? []).slice(-20);
    }
    if (data.balance !== undefined) {
      const hist = [...(prev.paperBalanceHistory ?? []), data.balance];
      merged.paperBalanceHistory = hist.length > 500 ? hist.slice(-500) : hist;
    }
    Object.assign(next, merged);
  }

  return next;
}

// ─── PseudoSocket — adapter imitujący Socket.IO dla reszty aplikacji ────────
export interface PseudoSocket {
  connected: boolean;
  emit: (event: string, ...args: any[]) => void;
  on: (event: string, cb: (...args: any[]) => void) => void;
  disconnect: () => void;
}

/**
 * Łączy się z raw WebSocket /ws i wywołuje onMessage(prefix, payload) dla
 * każdej wiadomości {type:"state", prefix, payload}. Adapter zwraca obiekt
 * imitujący Socket.IO (emit/on/disconnect) — reszta aplikacji nie wie o trybie
 * standalone.
 */
export function connectStandaloneWS(
  onMessage: (prefix: string, payload: any) => void,
): PseudoSocket {
  const listeners: Record<string, Array<(...args: any[]) => void>> = {
    connect: [],
    disconnect: [],
    connect_error: [],
  };

  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let mounted = true;
  let isConnected = false;

  const fireEvent = (event: string, ...args: any[]) => {
    (listeners[event] ?? []).forEach(cb => {
      try { cb(...args); } catch (e) { console.error("[standalone] listener error:", e); }
    });
  };

  const connect = () => {
    if (!mounted) return;
    const wsUrl = `ws://${window.location.host}/ws`;
    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error("[standalone] WS creation failed:", e);
      if (mounted) reconnectTimer = setTimeout(connect, 2000);
      return;
    }

    ws.onopen = () => {
      isConnected = true;
      console.log("[standalone] WS connected to", wsUrl);
      fireEvent("connect");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "state" && msg.prefix && msg.payload) {
          onMessage(msg.prefix, msg.payload);
        }
      } catch (e) {
        console.error("[standalone] WS parse error:", e);
      }
    };

    ws.onclose = () => {
      isConnected = false;
      fireEvent("disconnect");
      if (mounted) {
        reconnectTimer = setTimeout(connect, 1500);
      }
    };

    ws.onerror = (err) => {
      console.error("[standalone] WS error:", err);
    };
  };

  connect();

  const socket: PseudoSocket = {
    get connected() { return isConnected; },
    emit(event: string, ...args: any[]) {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      let type: string = event;
      let payload: any = {};
      if (event === "update_config") {
        type = "config_update";
        payload = { type, ...(args[0] ?? {}) };
      } else if (event === "reset_circuit_breaker") {
        type = "reset_circuit_breaker";
        payload = { type };
      } else if (event === "trigger_update") {
        type = "trigger_update";
        payload = { type, ...(args[0] ?? {}) };
      } else if (event === "run_backtest") {
        type = "run_backtest";
        payload = { type, ...(args[0] ?? {}) };
      } else if (event === "start" || event === "stop") {
        return;
      } else {
        payload = { type: event, ...(args[0] ?? {}) };
      }
      try {
        ws.send(JSON.stringify(payload));
      } catch (e) {
        console.error("[standalone] WS send error:", e);
      }
    },
    on(event: string, cb: (...args: any[]) => void) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(cb);
    },
    disconnect() {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
        ws = null;
      }
      isConnected = false;
    },
  };

  return socket;
}
