"use client";

import { useEffect, useRef, useState, useCallback, useMemo, createContext, useContext } from "react";
import { io, Socket } from "socket.io-client";
import { SortableGrid, SortableGridItem, SortableGridController } from "@/components/SortablePanels";
import { isStandaloneMode, connectStandaloneWS, applyPrefixToState, type PseudoSocket } from "@/lib/standalone-state";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BotState {
  status: "running" | "stopped" | "error";
  iteration: number; coin: string; price: number | null; volume: number | null;
  activeAddresses: number | null; whaleCount: number | null;
  signal: { direction: string; confidence: number; reasons: string[] } | null;
  positions: number; dailyPnl: number;
  logs: { time: string; level: string; msg: string }[];
  lastUpdate: string; fundingRate: number | null; openInterest: number | null;
  oiChangePct: number | null; bidDepth: number | null; askDepth: number | null;
  obImbalance: number | null; obWallSize: number | null; obWallSide: string;
  markPx: number | null; prevDayPx: number | null; whaleActivity: any[];
  sentimentScore: number | null; sentimentLabel: string; whaleLongRatio: number | null;
  whaleTotalPositions: number | null; whaleTotalValueUsd: number | null;
  whaleTopPositions: any[]; sentimentScoreChange: number | null;
  walletsLongCount: number; walletsShortCount: number; walletsNeutralCount: number;
  traderProfiles: any[]; ofiNet: number | null; ofiBidDelta: number | null;
  ofiAskDelta: number | null; cvd: number | null; cvdDivergence: number | null;
  volatilityRegime: string; volatilityPct: number | null; volatilityMultiplier: number | null;
  perpPremiumPct: number | null; perpPremiumLabel: string; priceZscore: number | null;
  meanReversionSignal: string; fundingCountdownMin: number | null; fundingNear: boolean;
  signalStates: Record<string, { active: boolean; direction: string; value: string }> | null;
  aiDecision: any | null; circuitBreaker: any | null; marketRegime: any | null;
  riskMetrics: any | null; onchainMetrics: any | null; enhancedSentiment: any | null;
  signalRanking: any | null; liquidationMap: any | null;
  backtestResult: {
    status: string; error: string; symbol: string; interval: string; limit: number;
    candleCount: number;
    totalTrades: number; winRate: number; totalPnl: number; totalFees: number;
    maxDrawdown: number; sharpeRatio: number; profitFactor: number; avgTradePnl: number;
    bestTrade: number; worstTrade: number; durationHours: number;
    equityCurve: number[]; wins: number; losses: number;
    snapshotsUsed: number; candleInterval: string;
    initBalance: number; finalBalance: number;
    strategyReturn: number; buyHoldReturn: number;
    recentTrades: { id: number; side: string; entryPrice: number; exitPrice: number;
      sizeUsd: number; pnl: number; pnlPct: number; fees: number; netPnl: number;
      durationBars: number; exitReason: string }[];
    grossProfit: number; grossLoss: number;
    dataSource: string;
    progressPct?: number; strategy?: string; entryLogic?: string; exitLogic?: string;
  } | null;
  // v0.2: Scalping Engine
  scalpStatus: {
    activePositions: number; maxPositions: number;
    positions: { id: number; side: string; entryPrice: number; sizeUsd: number;
      stopLoss: number; takeProfit: number; leverage: number; reason: string; openedAgo: number }[];
    totalPnl: number; totalFees: number; wins: number; losses: number;
    totalTrades: number; winRate: number; maxDrawdown: number;
    balance: number; equityCurve: number[]; regime: string;
  } | null;
  scalpBacktest: {
    totalTrades: number; winRate: number; totalPnl: number; totalFees: number;
    wins: number; losses: number; maxDrawdown: number; equityCurve: number[];
    avgPnlPerTrade: number; bestTrade: number; worstTrade: number;
    avgDurationSec: number; snapshotsUsed: number;
  } | null;
  // v0.1: OHLCV technical indicators
  rsi: number | null; macdLine: number | null; macdSignal: number | null; macdHistogram: number | null;
  bbUpper: number | null; bbMiddle: number | null; bbLower: number | null; bbBandwidth: number | null;
  chartSource: string;
  tradingMode: string;
  paperBalance: number | null; paperRealizedPnl: number | null; paperDailyPnl: number | null;
  paperWinRate: number | null; paperRoi: number | null; paperFees: number | null; paperPositions: number;
  paperRecentTrades: { coin: string; side: string; entryPrice: number; exitPrice: number; sizeUsd: number; pnl: number; fee: number; time: string }[];
  paperOpenPositions: { coin: string; side: string; entryPrice: number; sizeUsd: number; unrealizedPnl: number; stopLoss: number; takeProfit: number; leverage: number; dcaEntry?: number; dcaMult?: number }[];
  paperTotalTrades: number; paperWins: number; paperLosses: number;
  // v0.1: Chart history buffers
  rsiHistory: number[];
  macdLineHistory: number[];
  macdSignalHistory: number[];
  macdHistHistory: number[];
  bbUpperHistory: number[];
  bbMiddleHistory: number[];
  bbLowerHistory: number[];
  priceHistory: number[];
  signalMarkers: { idx: number; direction: "UP" | "DOWN"; confidence: number }[];
  // v0.1: Equity curve (paper balance history)
  paperBalanceHistory: number[];
  // Multi-timeframe OHLCV data (1m, 5m, 15m, 30m)
  ohlcvMtf: Record<string, {
    rsi: number[];
    macdLine: number[];
    macdSignal: number[];
    macdHist: number[];
    bbUpper: number[];
    bbMiddle: number[];
    bbLower: number[];
    price: number[];
    rsiLatest: number | null;
    macdLatest: number | null;
    macdSignalLatest: number | null;
    macdHistLatest: number | null;
    bbUpperLatest: number | null;
    bbMiddleLatest: number | null;
    bbLowerLatest: number | null;
    bbBandwidthLatest: number | null;
    hcccoFast: number[];
    hcccoSlow: number[];
    hcccoFastLatest: number | null;
    hcccoSlowLatest: number | null;
    // Trigger signals
    hurstCrossUp: boolean;   // Hurst crossed UP through 0.0 (buy)
    hurstCrossDown: boolean; // Hurst crossed DOWN through 1.0 (sell)
    bbCrossLower: boolean;   // Price crossed below lower BB (buy)
    bbCrossUpper: boolean;   // Price crossed above upper BB (sell)
  }>;
  // v0.1: Trade configuration (editable from dashboard)
  tradeConfig: {
    orderSizeUsd: number;
    leverage: number;
    stopLossPct: number;
    takeProfitPct: number;
    minConfidence: number;
    loopIntervalSec: number;
    cooldownAfterTradeSec: number;
    signalFlipCooldownSec: number;
    aiApiKey: string;
    aiEngineEnabled: boolean;
    triggerModeEnabled: boolean;
    exitOnlyOnSltp: boolean;
    minHoldMinutes: number;
  };
}

const DEFAULT_STATE: BotState = {
  status: "stopped", iteration: 0, coin: "BTC", price: null, volume: null,
  activeAddresses: null, whaleCount: null, signal: null, positions: 0, dailyPnl: 0,
  logs: [], lastUpdate: "", fundingRate: null, openInterest: null, oiChangePct: null,
  bidDepth: null, askDepth: null, obImbalance: null, obWallSize: null, obWallSide: "",
  markPx: null, prevDayPx: null, whaleActivity: [], sentimentScore: null, sentimentLabel: "",
  whaleLongRatio: null, whaleTotalPositions: null, whaleTotalValueUsd: null,
  whaleTopPositions: [], sentimentScoreChange: null, walletsLongCount: 0,
  walletsShortCount: 0, walletsNeutralCount: 0, traderProfiles: [],
  ofiNet: null, ofiBidDelta: null, ofiAskDelta: null, cvd: null, cvdDivergence: null,
  volatilityRegime: "MEDIUM", volatilityPct: null, volatilityMultiplier: null,
  perpPremiumPct: null, perpPremiumLabel: "FAIR", priceZscore: null,
  meanReversionSignal: "NONE", fundingCountdownMin: null, fundingNear: false,
  signalStates: null, aiDecision: null, circuitBreaker: null, marketRegime: null,
  riskMetrics: null, onchainMetrics: null, enhancedSentiment: null, signalRanking: null,
  liquidationMap: null, backtestResult: null, scalpStatus: null, scalpBacktest: null,
  rsi: null, macdLine: null, macdSignal: null, macdHistogram: null,
  bbUpper: null, bbMiddle: null, bbLower: null, bbBandwidth: null, chartSource: "NONE",
  tradingMode: "PAPER",
  paperBalance: null, paperRealizedPnl: null, paperDailyPnl: null, paperWinRate: null,
  paperRoi: null, paperFees: null, paperPositions: 0,
  paperRecentTrades: [], paperOpenPositions: [], paperTotalTrades: 0, paperWins: 0, paperLosses: 0,
  rsiHistory: [], macdLineHistory: [], macdSignalHistory: [], macdHistHistory: [],
  bbUpperHistory: [], bbMiddleHistory: [], bbLowerHistory: [], priceHistory: [],
  signalMarkers: [],
  paperBalanceHistory: [],
  ohlcvMtf: {},
  tradeConfig: {
    orderSizeUsd: 10, leverage: 3, stopLossPct: 1.5, takeProfitPct: 4.5,
    minConfidence: 60, loopIntervalSec: 10, cooldownAfterTradeSec: 120, signalFlipCooldownSec: 60,
    aiApiKey: "", aiEngineEnabled: false, triggerModeEnabled: true,
    exitOnlyOnSltp: true, minHoldMinutes: 5,
  },
};

// ─── EP-133 K.O. II Color System ────────────────────────────────────────────
// Inspired by Teenage Engineering EP-133 K.O. II
// Dark industrial body + amber LED screen + signature orange accents

// EP-133 K.O. II Dark — black body, amber LED screen, orange accents
const EP_DARK = {
  bg: "#000000", panel: "#111113", panelAlt: "#1A1A1E",
  border: "#2A2A2F", borderLight: "#3A3A42",
  text: "#FF8C00", textDim: "#B86800", textMuted: "#5C3A00",
  orange: "#F05A22", green: "#00FF88", red: "#FF3366",
  cyan: "#00CCFF", yellow: "#FFCC00", purple: "#AA66FF", blue: "#4488FF",
};

// EP-133 K.O. II Light — grey housing body, dark text on white panels
const EP_LIGHT = {
  bg: "#C8CCCE", panel: "#F2F2F0", panelAlt: "#E6E6E4",
  border: "#C0C0BE", borderLight: "#D0D0CE",
  text: "#1A1A1A", textDim: "#5A5A5A", textMuted: "#8A8A8A",
  orange: "#D04A18", green: "#009955", red: "#CC2244",
  cyan: "#0088AA", yellow: "#AA8800", purple: "#7744BB", blue: "#3366BB",
};

type ThemeColors = typeof EP_DARK;
const ThemeCtx = createContext<ThemeColors>(EP_DARK);
const useTheme = () => useContext(ThemeCtx);

// EP-133 font stack: monospace industrial
const EP_FONT = "'Sarasa Mono SC', 'Liberation Mono', 'DejaVu Sans Mono', monospace";

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number | null, dec = 2): string =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtUsd = (n: number | null, dec = 2): string =>
  n == null ? "—" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPct = (n: number | null, dec = 2): string =>
  n == null ? "—" : (n > 0 ? "+" : "") + n.toFixed(dec) + "%";
const fmtBig = (n: number | null): string => {
  if (n == null) return "—";
  if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + n.toFixed(2);
};

const dirColor = (dir: string, T: ThemeColors) =>
  dir === "BULL" || dir === "LONG" || dir === "UP" ? T.green
  : dir === "BEAR" || dir === "SHORT" || dir === "DOWN" ? T.red
  : T.textDim;

const dirArrow = (dir: string) =>
  dir === "BULL" || dir === "LONG" || dir === "UP" ? "▲"
  : dir === "BEAR" || dir === "SHORT" || dir === "DOWN" ? "▼"
  : "◆";

// ─── Panel Component ────────────────────────────────────────────────────────

function Panel({ title, children, accent, style }: { title: string; children: React.ReactNode; accent?: string; style?: React.CSSProperties }) {
  const T = useTheme();
  const isDark = T.bg === "#000000";
  return (
    <div style={{
      background: T.panel, borderWidth: 1, borderStyle: "solid", borderColor: T.border, borderRadius: 2,
      overflow: "hidden", fontFamily: EP_FONT, height: "100%", display: "flex", flexDirection: "column",
      boxShadow: isDark
        ? `inset 0 1px 0 ${T.borderLight}, 0 2px 8px rgba(0,0,0,0.5)`
        : `inset 0 1px 0 ${T.borderLight}, 0 2px 6px rgba(0,0,0,0.1)`,
      ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "5px 10px",
        borderBottom: `1px solid ${T.border}`, background: T.panelAlt, flexShrink: 0,
      }}>
        {accent && <span style={{
          width: 5, height: 5, borderRadius: "50%", background: accent,
          boxShadow: `0 0 6px ${accent}`,
          animation: accent === T.red ? "pulse-led 1.5s infinite" : undefined,
        }} />}
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.2, color: accent || T.textDim, textTransform: "uppercase", fontFamily: EP_FONT }}>
          {title}
        </span>
      </div>
      <div style={{ padding: 8, flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ─── Mini sub-components ────────────────────────────────────────────────────

function StatRow({ label, value, color, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1px 0", fontFamily: EP_FONT }}>
      <span style={{ fontSize: 9, color: T.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 11, color: color || T.text, fontFamily: EP_FONT, fontWeight: 700, letterSpacing: 0.5 }}>{value}</span>
    </div>
  );
}

function ProgressBar({ value, max, color, height = 4 }: { value: number; max: number; color: string; height?: number }) {
  const T = useTheme();
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div style={{ width: "100%", height, background: T.border, borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.5s" }} />
    </div>
  );
}

function Badge({ children, color, bg }: { children: React.ReactNode; color: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: 1, padding: "2px 7px",
      borderRadius: 9, color, background: bg || color + "22", border: `1px solid ${color}55`,
      fontFamily: EP_FONT, textTransform: "uppercase",
      boxShadow: `inset 0 1px 0 ${color}33, 0 1px 3px rgba(0,0,0,0.3)`,
    }}>
      {children}
    </span>
  );
}

const waiting = (T: ThemeColors) => <span style={{ fontSize: 9, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>AWAITING DATA...</span>;

// ─── Focus Panel Wrapper (smooth hide/show with animation) ──────────────────
function FocusPanel({ shouldHide, children }: { shouldHide: boolean; children: React.ReactNode }) {
  const [phase, setPhase] = useState<"visible" | "fading" | "gone">("visible");
  const prevHideRef = useRef(false);
  const [justReturned, setJustReturned] = useState(false);

  useEffect(() => {
    if (shouldHide) {
      setPhase("fading");
      const t = setTimeout(() => setPhase("gone"), 380);
      return () => clearTimeout(t);
    } else {
      // Always ensure we're visible when shouldHide is false
      setPhase("visible");
      // If we were previously hidden, animate back in
      if (prevHideRef.current) {
        setJustReturned(true);
        const t = setTimeout(() => setJustReturned(false), 450);
        return () => clearTimeout(t);
      }
    }
  }, [shouldHide]);

  useEffect(() => {
    prevHideRef.current = shouldHide;
  }, [shouldHide]);

  if (phase === "gone") return null;

  return (
    <div style={{
      opacity: phase === "fading" ? 0 : 1,
      transform: phase === "fading" ? "scale(0.96)" : "scale(1)",
      transition: "opacity 0.35s ease, transform 0.35s ease",
      height: "100%",
      ...(justReturned ? { animation: "panelIn 0.4s ease" } : {}),
    }}>
      {children}
    </div>
  );
}

// ─── Panel Implementations ──────────────────────────────────────────────────

function HeaderPanel({ state, dark, onThemeToggle, onStart, onStop, triggerFocus, onToggleFocus }: { state: BotState; dark: boolean; onThemeToggle: () => void; onStart: () => void; onStop: () => void; triggerFocus: boolean; onToggleFocus: () => void }) {
  const T = useTheme();
  const statusColor = state.status === "running" ? T.green : state.status === "error" ? T.red : T.textDim;
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
      padding: "8px 12px", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 2,
      fontFamily: EP_FONT,
      boxShadow: dark
        ? `inset 0 1px 0 ${T.borderLight}, 0 2px 12px rgba(0,0,0,0.5)`
        : `inset 0 1px 0 ${T.borderLight}, 0 2px 8px rgba(0,0,0,0.1)`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 3, color: T.orange, fontFamily: EP_FONT, textShadow: dark ? `0 0 10px ${T.orange}66` : "none" }}>HYPERA</span>
        <span style={{ fontSize: 9, color: T.textDim, letterSpacing: 1.5, fontFamily: EP_FONT }}>v0.1</span>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: statusColor, boxShadow: `0 0 8px ${statusColor}` }} />
        <span style={{ fontSize: 9, color: statusColor, fontWeight: 700, textTransform: "uppercase", fontFamily: EP_FONT, letterSpacing: 1 }}>{state.status}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, fontFamily: EP_FONT }}>
        <span style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1 }}>ITER</span>
        <span style={{ fontSize: 12, color: T.text, fontFamily: EP_FONT, fontWeight: 700 }}>{state.iteration}</span>
        <span style={{ fontSize: 10, color: T.textMuted }}>│</span>
        <span style={{ fontSize: 12, color: T.cyan, fontWeight: 700, fontFamily: EP_FONT }}>{state.coin}</span>
        <Badge color={T.orange}>{state.tradingMode}</Badge>
        <Badge color={T.green}>MAINNET</Badge>
        {state.lastUpdate && <span style={{ fontSize: 8, color: T.textMuted, fontFamily: EP_FONT }}>{new Date(state.lastUpdate).toLocaleTimeString()}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {state.status !== "running" ? (
          <button onClick={onStart} style={{
            fontSize: 9, padding: "3px 12px", background: T.green + "22", color: T.green,
            border: `1px solid ${T.green}55`, borderRadius: 9, cursor: "pointer", fontWeight: 700,
            fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase",
            boxShadow: `inset 0 1px 0 ${T.green}33, 0 1px 4px rgba(0,0,0,0.15)`,
          }}>▶ START</button>
        ) : (
          <button onClick={onStop} style={{
            fontSize: 9, padding: "3px 12px", background: T.red + "22", color: T.red,
            border: `1px solid ${T.red}55`, borderRadius: 9, cursor: "pointer", fontWeight: 700,
            fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase",
            boxShadow: `inset 0 1px 0 ${T.red}33, 0 1px 4px rgba(0,0,0,0.15)`,
          }}>■ STOP</button>
        )}
        <button onClick={onThemeToggle} style={{
          fontSize: 10, padding: "3px 8px", background: T.panelAlt, color: T.textDim,
          border: `1px solid ${T.border}`, borderRadius: 9, cursor: "pointer",
          fontFamily: EP_FONT, boxShadow: `inset 0 1px 0 ${T.borderLight}`,
          lineHeight: 1,
        }}>
          {dark ? "☀" : "☾"}
        </button>
        <button onClick={onToggleFocus} title="Trigger Focus: dim non-Hurst+BB panels" style={{
          fontSize: 8, padding: "3px 8px",
          background: triggerFocus ? T.cyan + "33" : T.panelAlt,
          color: triggerFocus ? T.cyan : T.textDim,
          border: `1px solid ${triggerFocus ? T.cyan + "66" : T.border}`,
          borderRadius: 9, cursor: "pointer", fontWeight: 700,
          fontFamily: EP_FONT, letterSpacing: 0.5,
          boxShadow: triggerFocus ? `0 0 6px ${T.cyan}22` : "none",
          transition: "all 0.2s",
        }}>
          {triggerFocus ? "◉ FOCUS" : "○ FOCUS"}
        </button>
      </div>
    </div>
  );
}

function MarketPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const chgPct = state.markPx && state.prevDayPx && state.prevDayPx > 0 ? ((state.markPx - state.prevDayPx) / state.prevDayPx) * 100 : null;
  return (
    <Panel title="Market" accent={state.price ? T.cyan : undefined}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: T.text, fontFamily: EP_FONT, letterSpacing: 1, textShadow: `0 0 12px ${T.text}44`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          {state.price ? fmtUsd(state.price) : "—"}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 7, color: T.green, fontWeight: 700, padding: "1px 5px", background: T.green + "15", borderRadius: 2, border: `1px solid ${T.green}33` }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: T.green, boxShadow: `0 0 4px ${T.green}`, animation: "pulse-live 1.5s infinite" }} />
            LIVE
          </span>
        </div>
        {chgPct != null && (
          <span style={{ fontSize: 11, color: chgPct >= 0 ? T.green : T.red, fontWeight: 700, fontFamily: EP_FONT }}>
            {fmtPct(chgPct)}
          </span>
        )}
      </div>
      <StatRow label="24h Volume" value={fmtBig(state.volume)} />
      <StatRow label="Mark Px" value={state.markPx ? fmtUsd(state.markPx) : "—"} />
      <StatRow label="Funding" value={state.fundingRate != null ? (state.fundingRate * 100).toFixed(4) + "%" : "—"} color={state.fundingRate != null && state.fundingRate > 0 ? T.green : T.red} />
      <StatRow label="OI" value={state.openInterest != null ? state.openInterest.toLocaleString("en-US", {maximumFractionDigits: 1}) + " BTC" : "—"} />
      <StatRow label="OI USD" value={state.openInterest != null && state.price != null ? fmtBig(state.openInterest * state.price) : "—"} />
      <StatRow label="OI Δ" value={fmtPct(state.oiChangePct)} color={state.oiChangePct != null ? (state.oiChangePct > 0 ? T.green : T.red) : undefined} />
      <StatRow label="Bid Depth" value={fmtBig(state.bidDepth)} color={T.green} />
      <StatRow label="Ask Depth" value={fmtBig(state.askDepth)} color={T.red} />
      <StatRow label="OB Imbalance" value={state.obImbalance != null ? state.obImbalance.toFixed(2) + ":1" : "—"} />
      <StatRow label="OB Wall" value={state.obWallSize ? fmtBig(state.obWallSize) + " " + state.obWallSide : "—"} />
      {state.fundingCountdownMin != null && (
        <StatRow label="Funding In" value={Math.round(state.fundingCountdownMin) + "min"} color={state.fundingNear ? T.orange : undefined} />
      )}
    </Panel>
  );
}

const SIGNAL_DESCRIPTIONS: Record<string, { what: string; direction: string }> = {
  funding_rate: {
    what: "Funding Rate to koszt utrzymania pozycji na rynku perpetual — wysoki FR oznacza przewagę longów, niski/ujemny przewagę shortów.",
    direction: "Gdy FR jest ekstremalnie dodatni → presja na zamknięcie longów = spadek. Gdy ujemny → presja na zamknięcie shortów = wzrost.",
  },
  oi_spike: {
    what: "OI Spike wykrywa nagły wzrost lub spadek Open Interest — duży napływ kapitału do pozycji oznacza budujące się napięcie kierunkowe.",
    direction: "OI rosnące z ceną = trend się wzmacnia → kontynuacja ruchu. OI spadające przy cenie = pozycje zamykane = możliwy odwrót.",
  },
  ob_imbalance: {
    what: "OB Imbalance porównuje głębokość bid vs ask w order booku — przewaga jednej strony oznacza presję kupna lub sprzedaży.",
    direction: "Imbalance > 1 (bid dominuje) → presja zakupowa = wzrost. Imbalance < 1 (ask dominuje) → presja sprzedażowa = spadek.",
  },
  whale_tracking: {
    what: "Whale Tracking monitoruje aktywność dużych portfeli — wieloryby często poprzedzają znaczące ruchy cenowe swoimi transakcjami.",
    direction: "Wieloryby akumulują → prawdopodobny wzrost. Wieloryby dystrybuują → prawdopodobny spadek.",
  },
  liquidation_cascade: {
    what: "Liquidation Cascade wykrywa masowe likwidacje pozycji — kaskada likwidacji często powoduje gwałtowne, krótkotrwałe ruchy cenowe.",
    direction: "Likwidacje longów → nagły spadek (dump). Likwidacje shortów → nagły wzrost (short squeeze). Po kaskadzie często następuje odbicie.",
  },
  cvd_divergence: {
    what: "CVD Divergence porównuje kierunek Cumulative Volume Delta z kierunkiem ceny — rozbieżność sygnalizuje osłabienie obecnego trendu.",
    direction: "Cena rośnie ale CVD spada → dywergencja niedźwiedzia = spadek. Cena spada ale CVD rośnie → dywergencja bycza = wzrost.",
  },
  large_limit_orders: {
    what: "Large Limit Orders wykrywa duże ściany zleceń w order booku — ściana działa jak magnes cenowy i poziom wsparcia/oporu.",
    direction: "Duży wall na bid → wsparcie = cena dąży w dół do ściany i odbija w górę. Duży wall na ask → opór = cena dąży w górę do ściany i odbija w dół.",
  },
  momentum_shift: {
    what: "Momentum Shift agreguje kierunek i siłę wszystkich sygnałów — zmiana kierunku momentum oznacza potencjalny zwrot na rynku.",
    direction: "Momentum UP → dominują sygnały bycze = kontynuacja wzrostu. Momentum DOWN → dominują sygnały niedźwiedzie = kontynuacja spadku.",
  },
  ofi: {
    what: "Order Flow Imbalance (OFI) mierzy netto napływ zleceń rynkowych — dodatni OFI oznacza agresywnych kupujących, ujemny agresywnych sprzedających.",
    direction: "OFI dodatni → presja zakupowa = wzrost. OFI ujemny → presja sprzedażowa = spadek. Silny OFI w jednym kierunku = kontynuacja.",
  },
  perp_premium: {
    what: "Perp Premium mierzy odchylenie ceny perpetual od ceny indeksu — duży premium oznacza przegrzanie, discount oznacza panikę.",
    direction: "Ekstremalny premium → rynek przegrzany = korekta w dół. Głęboki discount → rynek w panice = odbicie w górę.",
  },
  mean_reversion: {
    what: "Mean Reversion mierzy jak daleko cena odbiegła od średniej (z-score) — skrajne odchylenia statystycznie powracają do średniej.",
    direction: "Cena znacznie powyżej średniej (z > 2) → oczekiwany powrót w dół. Cena znacznie poniżej średniej (z < -2) → oczekiwany powrót w górę.",
  },
  funding_countdown: {
    what: "Funding Countdown śledzi czas do kolejnej raty funding — przed fundingiem traderzy często zamykają pozycje by uniknąć opłaty.",
    direction: "Przed fundingiem z wysokim FR → longowie zamykają pozycje = presja spadkowa. Przed ujemnym FR → shortowie zamykają = presja wzrostowa.",
  },
  volatility_regime: {
    what: "Volatility Regime klasyfikuje zmienność na LOW/MEDIUM/HIGH — w niskiej volatilności sygnały są słabsze, w wysokiej częstsze fałszywe wybicia.",
    direction: "LOW vol → rynek w konsolidacji = oczekuj wybicia. HIGH vol → rynek chaotyczny = ostrożność, ruchy mogą być w obie strony.",
  },
  sentiment: {
    what: "Sentiment agreguje zachowanie wielorybów i traderów w jeden wynik — skrajny optymizm często poprzedza szczyt, skrajny pesymizm dno.",
    direction: "Skrajny sentyment byczy → możliwe dno saturacji = spadek. Skrajny sentyment niedźwiedzi → możliwe dno paniki = wzrost.",
  },
  cvd: {
    what: "Cumulative Volume Delta sumuje różnicę wolumenu kupna i sprzedaży — rosnące CVD oznacza przewagę kupujących, spadające sprzedających.",
    direction: "CVD rośnie → kupujący dominują = presja wzrostowa. CVD spada → sprzedający dominują = presja spadkowa.",
  },
  volume_spike: {
    what: "Volume Spike wykrywa nienaturalnie duży wolumen — spike często towarzyszy ważnym ruchom cenowym lub zmianom trendu.",
    direction: "Wolumen przy wzrostach → silny trend wzrostowy. Wolumen przy spadkach → silny trend spadkowy. Wolumen bez ruchu ceny = dystrybucja.",
  },
  active_addresses: {
    what: "Active Addresses mierzy liczbę aktywnych uczestników na rynku — rosnąca aktywność potwierdza zainteresowanie i płynność kierunku.",
    direction: "Aktywne adresy rosną z ceną = zdrowy trend wzrostowy. Aktywne adresy spadają przy wzroście = słabe bounce = możliwy spadek.",
  },
  rsi: {
    what: "RSI (Relative Strength Index) mierzy prędkość i zmianę ruchów cenowych — powyżej 70 oznacza wykupienie, poniżej 30 wyprzedanie.",
    direction: "RSI > 70 → rynek wykupiony = oczekiwana korekta w dół. RSI < 30 → rynek wyprzedany = oczekiwane odbicie w górę.",
  },
  macd: {
    what: "MACD (Moving Average Convergence Divergence) pokazuje relację dwóch średnich kroczących — histogram powyżej zera = momentum bycze, poniżej = niedźwiedzie.",
    direction: "Histogram zmienia znak z minusa na plus → sygnał kupna = wzrost. Histogram zmienia z plusa na minus → sygnał sprzedaży = spadek.",
  },
  bollinger: {
    what: "Bollinger Bands mierzą zmienność jako pasma wokół średniej — cena przy górnej band = wykupienie, przy dolnej = wyprzedanie.",
    direction: "Cena przebija dolną bandę → wyprzedanie = odbicie w górę. Cena przebija górną bandę → wykupienie = korekta w dół.",
  },
};

function SignalMatrixPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const signals = state.signalStates;
  const [tooltip, setTooltip] = useState<{ name: string; x: number; y: number } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  if (!signals) return <Panel title="Signal Matrix">{waiting(T)}</Panel>;
  const entries = Object.entries(signals);
  return (
    <Panel title="Signal Matrix" accent={T.yellow} style={{ position: "relative" }}>
      <div style={{ display: "grid", gap: 3 }}>
        {entries.map(([name, s]) => (
          <div
            key={name}
            ref={el => { rowRefs.current[name] = el; }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 4px", borderBottom: `1px solid ${T.borderLight}`, cursor: "pointer", borderRadius: 3, transition: "background 0.15s" }}
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const parentRect = (e.currentTarget as HTMLElement).closest("[data-panel]")?.getBoundingClientRect() || rect;
              setTooltip({ name, x: rect.right + 8, y: rect.top });
              (e.currentTarget as HTMLElement).style.background = T.borderLight;
            }}
            onMouseLeave={(e) => {
              setTooltip(null);
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: s.active ? dirColor(s.direction, T) : T.textMuted,
              boxShadow: s.active ? `0 0 6px ${dirColor(s.direction, T)}` : "none",
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: s.active ? T.text : T.textMuted, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: s.active ? 600 : 400 }}>{name}</span>
            <span style={{ fontSize: 12, color: dirColor(s.direction, T), fontWeight: 800, flexShrink: 0, width: 18, textAlign: "center" }}>
              {s.active ? dirArrow(s.direction) : "—"}
            </span>
            <span style={{ fontSize: 10, color: s.active ? T.text : T.textDim, fontFamily: EP_FONT, maxWidth: 90, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{s.value}</span>
          </div>
        ))}
      </div>
      {tooltip && SIGNAL_DESCRIPTIONS[tooltip.name] && (() => {
        const desc = SIGNAL_DESCRIPTIONS[tooltip.name];
        const s = signals[tooltip.name];
        return (
          <div style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y - 4,
            zIndex: 9999,
            maxWidth: 300,
            padding: "8px 10px",
            background: T.bg,
            border: `1px solid ${T.borderLight}`,
            borderRadius: 6,
            boxShadow: `0 4px 20px ${T.bg}cc`,
            pointerEvents: "none",
            fontSize: 10,
            lineHeight: 1.5,
            color: T.text,
          }}>
            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: dirColor(s?.direction || "NEUTRAL", T), fontFamily: EP_FONT, letterSpacing: 0.5 }}>
              {tooltip.name.toUpperCase().replace(/_/g, " ")}
              {s?.active && <span style={{ marginLeft: 6, fontWeight: 600, fontSize: 10 }}>▲ {s.direction}</span>}
            </div>
            <div style={{ color: T.textDim, marginBottom: 4 }}>{desc.what}</div>
            <div style={{ color: T.yellow, fontWeight: 600 }}>{desc.direction}</div>
          </div>
        );
      })()}
    </Panel>
  );
}

function AIDecisionPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const ai = state.aiDecision;
  const [expanded, setExpanded] = useState(false);
  if (!ai) return null;
  const dColor = dirColor(ai.direction, T);
  const riskColor = ai.riskAssessment === "HIGH" ? T.red : ai.riskAssessment === "MEDIUM" ? T.orange : T.green;
  return (
    <Panel title="AI Engine" accent={T.blue}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 16, color: dColor, fontWeight: 800, fontFamily: EP_FONT, textShadow: `0 0 8px ${dColor}44` }}>{dirArrow(ai.direction)}</span>
        <span style={{ fontSize: 13, color: dColor, fontWeight: 700, fontFamily: EP_FONT, letterSpacing: 1 }}>{ai.direction}</span>
        <Badge color={T.cyan}>{ai.strategy}</Badge>
        <Badge color={riskColor}>{ai.riskAssessment} RISK</Badge>
      </div>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 8, color: T.textMuted, marginBottom: 2, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>Confidence</div>
        <ProgressBar value={ai.confidence} max={100} color={dColor} height={6} />
        <div style={{ fontSize: 9, color: T.textDim, textAlign: "right", fontFamily: EP_FONT }}>{ai.confidence}%</div>
      </div>
      {ai.keyFactors && ai.keyFactors.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {ai.keyFactors.map((f: string, i: number) => (
            <div key={i} style={{ fontSize: 8, color: T.textDim, paddingLeft: 6, marginBottom: 1, fontFamily: EP_FONT }}>▸ {f}</div>
          ))}
        </div>
      )}
      {ai.reasoning && (
        <div>
          <div style={{ fontSize: 8, color: T.textMuted, marginBottom: 2, cursor: "pointer", fontFamily: EP_FONT, letterSpacing: 0.5 }} onClick={() => setExpanded(!expanded)}>
            AI REASONING {expanded ? "▲" : "▼"}
          </div>
          <div style={{ fontSize: 9, color: T.textDim, maxHeight: expanded ? 80 : 24, overflow: "hidden", transition: "max-height 0.3s", fontFamily: EP_FONT }}>
            {ai.reasoning}
          </div>
        </div>
      )}
    </Panel>
  );
}

function CircuitBreakerPanel({ state, onResetCB }: { state: BotState; onResetCB: () => void }) {
  const T = useTheme();
  const cb = state.circuitBreaker;
  if (!cb) return <Panel title="Circuit Breaker">{waiting(T)}</Panel>;
  const active = cb.active;
  return (
    <Panel title="Circuit Breaker" accent={active ? T.red : T.green} style={active ? { border: `1px solid ${T.red}`, animation: "pulse-border 1.5s infinite" } : undefined}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: active ? T.red : T.green, boxShadow: `0 0 8px ${active ? T.red : T.green}` }} />
        <span style={{ fontSize: 14, fontWeight: 800, color: active ? T.red : T.green, fontFamily: EP_FONT, letterSpacing: 2 }}>{active ? "HALTED" : "SAFE"}</span>
        {active && <Badge color={T.red}>COOLDOWN {cb.cooldownRemaining}min</Badge>}
      </div>
      {active && cb.reason && <StatRow label="Reason" value={cb.reason} color={T.red} />}
      <StatRow label="Daily Loss" value={(cb.dailyLossPct ?? 0).toFixed(2) + "%"} color={(cb.dailyLossPct ?? 0) > 3 ? T.red : T.text} />
      <ProgressBar value={cb.dailyLossPct ?? 0} max={cb.thresholds?.maxDailyLossPct ?? 5} color={(cb.dailyLossPct ?? 0) > 3 ? T.red : T.orange} />
      <StatRow label="Consec. Losses" value={String(cb.consecutiveLosses ?? 0)} color={(cb.consecutiveLosses ?? 0) >= 4 ? T.red : T.text} />
      <ProgressBar value={cb.consecutiveLosses ?? 0} max={cb.thresholds?.maxConsecutiveLosses ?? 5} color={(cb.consecutiveLosses ?? 0) >= 4 ? T.red : T.orange} />
      <StatRow label="Drawdown" value={(cb.drawdownPct ?? 0).toFixed(2) + "%"} color={(cb.drawdownPct ?? 0) > 7 ? T.red : T.text} />
      <ProgressBar value={cb.drawdownPct ?? 0} max={cb.thresholds?.maxDrawdownPct ?? 10} color={(cb.drawdownPct ?? 0) > 7 ? T.red : T.orange} />
      {cb.history && cb.history.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 8, color: T.textMuted, marginBottom: 2, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>Recent Breaks</div>
          {cb.history.slice(0, 3).map((h: any, i: number) => (
            <div key={i} style={{ fontSize: 8, color: T.textMuted, fontFamily: EP_FONT }}>▸ {new Date(h.time).toLocaleTimeString()}: {h.reason}</div>
          ))}
        </div>
      )}
      {/* Reset button */}
      {active && (
        <button
          onClick={onResetCB}
          style={{
            marginTop: 6, width: "100%", padding: "5px 0", fontSize: 9, fontWeight: 700, fontFamily: EP_FONT,
            color: T.bg, background: T.orange, border: "none", borderRadius: 3, cursor: "pointer",
            letterSpacing: 1, textTransform: "uppercase",
          }}
        >
          RESET CIRCUIT BREAKER
        </button>
      )}
    </Panel>
  );
}

function MarketRegimePanel({ state }: { state: BotState }) {
  const T = useTheme();
  const mr = state.marketRegime;
  if (!mr) return <Panel title="Market Regime">{waiting(T)}</Panel>;
  const regimeColors: Record<string, string> = { TRENDING: T.cyan, RANGING: T.yellow, VOLATILE: T.red, BREAKOUT: T.purple };
  const color = regimeColors[mr.regime] || T.text;
  return (
    <Panel title="Market Regime" accent={color}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color, letterSpacing: 3, fontFamily: EP_FONT, textShadow: `0 0 8px ${color}44` }}>{mr.regime}</span>
      </div>
      <StatRow label="Confidence" value={mr.confidence + "%"} />
      <ProgressBar value={mr.confidence} max={100} color={color} height={5} />
      <StatRow label="ADX" value={mr.adx?.toFixed(1)} color={mr.adx > 25 ? T.green : T.textDim} />
      <StatRow label="ATR%" value={mr.atrPct != null ? (mr.atrPct * 100).toFixed(3) + "%" : "—"} />
      <StatRow label="Strategy" value={mr.recommendedStrategy} color={color} />
      <StatRow label="Pos. Multiplier" value={"×" + (mr.positionMultiplier ?? 1).toFixed(1)} />
      <StatRow label="SL Multiplier" value={"×" + (mr.stopLossMultiplier ?? 1).toFixed(1)} />
    </Panel>
  );
}

function RiskMetricsPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const rm = state.riskMetrics;
  if (!rm) return <Panel title="Risk Metrics">{waiting(T)}</Panel>;
  const riskColor = rm.compositeRiskScore > 70 ? T.red : rm.compositeRiskScore > 40 ? T.orange : T.green;
  return (
    <Panel title="Risk Metrics" accent={riskColor}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: T.textMuted, marginBottom: 2, letterSpacing: 1, textTransform: "uppercase", fontFamily: EP_FONT }}>Composite Risk</div>
        <span style={{ fontSize: 22, fontWeight: 800, color: riskColor, fontFamily: EP_FONT, textShadow: `0 0 10px ${riskColor}44` }}>{rm.compositeRiskScore}</span>
        <span style={{ fontSize: 10, color: T.textDim, fontFamily: EP_FONT }}>/100</span>
      </div>
      <ProgressBar value={rm.compositeRiskScore} max={100} color={riskColor} height={6} />
      <StatRow label="VaR 95%" value={fmtUsd(rm.var95)} />
      <StatRow label="Kelly Criterion" value={(rm.kellyCriterion ?? 0).toFixed(2) + "%"} />
      <StatRow label="Leverage" value={(rm.currentLeverage ?? 0).toFixed(1) + "×"} color={rm.currentLeverage > 3 ? T.orange : T.text} />
      <StatRow label="Concentration" value={(rm.positionConcentration ?? 0).toFixed(1) + "%"} />
      <StatRow label="VaR Usage" value={(rm.dailyVarUsage ?? 0).toFixed(1) + "%"} color={rm.dailyVarUsage > 60 ? T.red : T.text} />
    </Panel>
  );
}

function OnChainPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const oc = state.onchainMetrics;
  if (!oc) return <Panel title="On-Chain Analytics">{waiting(T)}</Panel>;
  const signalColor = oc.overallSignal === "BULLISH" ? T.green : oc.overallSignal === "BEARISH" ? T.red : T.yellow;
  const flowDir = (oc.exchangeNetFlow ?? 0) > 0 ? "inflow (bearish)" : "outflow (bullish)";
  const flowColor = (oc.exchangeNetFlow ?? 0) > 0 ? T.red : T.green;
  const mvrvColor = (oc.mvrvZScore ?? 0) < -1 ? T.green : (oc.mvrvZScore ?? 0) > 7 ? T.red : T.yellow;
  const hasHL = (oc.hlOpenInterestUsd ?? 0) > 0;
  const oiColor = oc.oiSignal === "RISING_OI" ? T.green : oc.oiSignal === "FALLING_OI" ? T.red : T.textDim;
  const fundColor = (oc.fundingSignal ?? "").includes("EXTREME") ? T.red : (oc.fundingSignal ?? "").includes("HIGH") ? T.orange : T.textDim;
  const liqColor = oc.liquidationSignal === "LIQUIDATION_RISK" ? T.red : T.textDim;

  return (
    <Panel title="On-Chain Analytics" accent={signalColor}>
      {/* Overall signal */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
        <Badge color={signalColor}>{oc.overallSignal}</Badge>
        {oc.dataSource && (
          <span style={{ fontSize: 6, color: T.purple, fontFamily: EP_FONT, padding: "1px 3px", background: T.purple + "22", border: `1px solid ${T.purple}44`, borderRadius: 2, marginLeft: 4, letterSpacing: 0.5 }}>
            {oc.dataSource}
          </span>
        )}
      </div>

      {/* Hyperliquid On-Chain Data */}
      {hasHL && (
        <div style={{ marginBottom: 4, padding: "3px 4px", background: T.purple + "08", borderRadius: 2, border: `1px solid ${T.purple}22` }}>
          <div style={{ fontSize: 6, color: T.purple, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", marginBottom: 2 }}>Hyperliquid Perp Data</div>
          <StatRow label="Open Interest" value={"$" + ((oc.hlOpenInterestUsd ?? 0) / 1e6).toFixed(1) + "M"} />
          <StatRow label="Funding Rate" value={((oc.hlFundingRate ?? 0) * 100).toFixed(4) + "%"} color={fundColor} />
          <StatRow label="Funding Signal" value={oc.fundingSignal || "NEUTRAL"} color={fundColor} />
          <StatRow label="OI Signal" value={oc.oiSignal || "NEUTRAL"} color={oiColor} />
          <StatRow label="Premium" value={((oc.hlPremiumIndex ?? 0) * 100).toFixed(3) + "%"} color={liqColor} />
          {oc.liquidationSignal && oc.liquidationSignal !== "NEUTRAL" && (
            <StatRow label="Liq. Risk" value={oc.liquidationSignal} color={T.red} />
          )}
        </div>
      )}

      {/* Traditional on-chain estimates */}
      <StatRow label="MVRV Z-Score" value={(oc.mvrvZScore ?? 0).toFixed(2)} color={mvrvColor} />
      <StatRow label="NUPL" value={(oc.nupl ?? 0).toFixed(4)} color={(oc.nupl ?? 0) > 0.75 ? T.red : (oc.nupl ?? 0) < 0 ? T.green : T.text} />
      <StatRow label="Whale Trend" value={oc.whaleHodlingTrend} color={oc.whaleHodlingTrend === "ACCUMULATING" ? T.green : T.red} />
      {(oc.exchangeNetFlow ?? 0) !== 0 && (
        <StatRow label="Exchange Flow" value={(oc.exchangeNetFlow ?? 0) + " BTC " + flowDir} color={flowColor} />
      )}
      {(oc.transactionVolumeUsd ?? 0) > 0 && (
        <StatRow label="24h Volume" value={"$" + ((oc.transactionVolumeUsd ?? 0) / 1e6).toFixed(1) + "M"} />
      )}
    </Panel>
  );
}

function EnhancedSentimentPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const es = state.enhancedSentiment;
  if (!es) return <Panel title="Enhanced Sentiment">{waiting(T)}</Panel>;
  const fgColor = es.fearGreedIndex <= 25 ? T.red : es.fearGreedIndex <= 40 ? T.orange : es.fearGreedIndex <= 60 ? T.yellow : es.fearGreedIndex <= 75 ? T.green : T.cyan;
  return (
    <Panel title="Enhanced Sentiment" accent={fgColor}>
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: fgColor, fontFamily: EP_FONT, textShadow: `0 0 10px ${fgColor}44` }}>{es.fearGreedIndex}</div>
        <div style={{ fontSize: 9, color: T.textDim, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>{es.fearGreedLabel}</div>
        <ProgressBar value={es.fearGreedIndex} max={100} color={fgColor} height={5} />
      </div>
      <StatRow label="News Sentiment" value={(es.newsSentiment ?? 0).toFixed(2)} color={(es.newsSentiment ?? 0) > 0 ? T.green : T.red} />
      <StatRow label="News Bull/Bear" value={`${es.newsBullishCount}B / ${es.newsBearishCount}S`} />
      <StatRow label="Combined" value={(es.combinedScore ?? 0).toFixed(1)} color={(es.combinedScore ?? 0) > 0 ? T.green : T.red} />
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
        {(es.sources || []).map((s: string) => (
          <span key={s} style={{ fontSize: 7, color: T.textMuted, background: T.panelAlt, padding: "1px 5px", borderRadius: 9, border: `1px solid ${T.border}`, fontFamily: EP_FONT, letterSpacing: 0.5 }}>{s}</span>
        ))}
      </div>
    </Panel>
  );
}

function SignalRankingPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const sr = state.signalRanking;
  const [showAll, setShowAll] = useState(false);
  const [activeTf, setActiveTf] = useState("24h");
  const TF_KEYS = ["30m", "1h", "2h", "4h", "12h", "24h"];
  if (!sr) return <Panel title="Signal Ranking">{waiting(T)}</Panel>;
  const entries = sr.entries || [];

  // Get signal data for active timeframe
  const getTfData = (e: any, tf: string) => {
    if (e.timeframes && e.timeframes[tf]) return e.timeframes[tf];
    // Fallback for entries without timeframes
    return { priceChangePct: e.priceChangePct ?? 0, volume: e.volume24h ?? 0, signal: e.signal, signalStrength: e.signalStrength, signalReason: e.signalReason };
  };

  // Re-sort by signal strength for active timeframe (strongest first, LONG > SHORT > NEUTRAL)
  const sortedEntries = [...entries].sort((a: any, b: any) => {
    const aTf = getTfData(a, activeTf);
    const bTf = getTfData(b, activeTf);
    // Sort: LONG first, then SHORT, then NEUTRAL; within group by strength desc
    const sigOrder: Record<string, number> = { LONG: 3, SHORT: 2, NEUTRAL: 1 };
    const aOrder = sigOrder[aTf.signal] || 0;
    const bOrder = sigOrder[bTf.signal] || 0;
    if (aOrder !== bOrder) return bOrder - aOrder;
    return (bTf.signalStrength || 0) - (aTf.signalStrength || 0);
  });

  // Assign rank based on sorted position
  const ranked = sortedEntries.map((e: any, i: number) => ({ ...e, rank: i + 1 }));
  const displayed = showAll ? ranked : ranked.slice(0, 12);

  // Compute summary for active timeframe
  const tfSignals = entries.map((e: any) => getTfData(e, activeTf));
  const longCount = tfSignals.filter((s: any) => s.signal === "LONG").length;
  const shortCount = tfSignals.filter((s: any) => s.signal === "SHORT").length;
  const neutralCount = tfSignals.filter((s: any) => s.signal === "NEUTRAL").length;
  const dominantSignal = longCount > shortCount ? "LONG" : shortCount > longCount ? "SHORT" : "NEUTRAL";
  const accentColor = dominantSignal === "LONG" ? T.green : dominantSignal === "SHORT" ? T.red : T.textDim;

  // Volume label for active timeframe
  const tfVolLabel = activeTf === "24h" ? "24hVOL" : `${activeTf.toUpperCase()}VOL`;

  // RSI color helper
  const rsiColor = (rsi: number) => rsi < 30 ? T.green : rsi > 70 ? T.red : T.cyan;

  return (
    <Panel title="Signal Ranking" accent={accentColor} style={{ position: "relative" }}>
      {/* Timeframe tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 4, background: T.panelAlt, borderRadius: 3, overflow: "hidden", border: `1px solid ${T.borderLight}` }}>
        {TF_KEYS.map(tf => {
          const isActive = tf === activeTf;
          // Get consensus signal for this TF
          const tfSig = entries.map((e: any) => getTfData(e, tf));
          const tfLong = tfSig.filter((s: any) => s.signal === "LONG").length;
          const tfShort = tfSig.filter((s: any) => s.signal === "SHORT").length;
          const tfDot = tfLong > tfShort ? T.green : tfShort > tfLong ? T.red : T.textMuted;
          return (
            <div key={tf} onClick={() => setActiveTf(tf)}
              style={{
                flex: 1, textAlign: "center", padding: "2px 2px", cursor: "pointer",
                background: isActive ? `${accentColor}20` : "transparent",
                borderRight: tf !== "24h" ? `1px solid ${T.borderLight}` : "none",
                transition: "background 0.15s",
              }}
              onMouseEnter={(ev) => { if (!isActive) (ev.currentTarget as HTMLElement).style.background = `${T.borderLight}`; }}
              onMouseLeave={(ev) => { if (!isActive) (ev.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{ fontSize: 7, fontWeight: isActive ? 800 : 500, color: isActive ? T.text : T.textDim, fontFamily: EP_FONT, letterSpacing: 0.3 }}>{tf}</div>
              <span style={{ display: "inline-block", width: 3, height: 3, borderRadius: "50%", background: tfDot, marginTop: 1 }} />
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div style={{ display: "flex", gap: 5, marginBottom: 4, padding: "2px 4px", background: T.panelAlt, borderRadius: 2 }}>
        <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT, letterSpacing: 0.5 }}>COINS: {sr.totalCoins || entries.length}</span>
        <span style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT, fontWeight: 700 }}>▲{longCount}</span>
        <span style={{ fontSize: 7, color: T.red, fontFamily: EP_FONT, fontWeight: 700 }}>▼{shortCount}</span>
        <span style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT }}>━{neutralCount}</span>
        <span style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, marginLeft: "auto" }}>{sr.updatedAt || ""}</span>
      </div>

      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: "16px 34px 1fr 28px 28px 34px 30px", gap: 1, padding: "1px 3px", borderBottom: `1px solid ${T.border}`, marginBottom: 1 }}>
        <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>#</span>
        <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>COIN</span>
        <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>SIGNAL</span>
        <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT, textAlign: "center" }}>RSI</span>
        <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT, textAlign: "center" }}>BB</span>
        <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT, textAlign: "right" }}>{tfVolLabel}</span>
        <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT, textAlign: "right" }}>CHG</span>
      </div>

      {/* Rows */}
      <div style={{ display: "grid", gap: 0, maxHeight: showAll ? 420 : 280, overflowY: "auto" }}>
        {displayed.map((e: any) => {
          const tfData = getTfData(e, activeTf);
          const sig = tfData.signal || "NEUTRAL";
          const strength = tfData.signalStrength || 0;
          const chg = tfData.priceChangePct ?? 0;
          const vol = tfData.volume ?? 0;
          const rsi = tfData.rsi ?? 0;
          const bbPos = tfData.bbPosition ?? -1;
          const sigColor = sig === "LONG" ? T.green : sig === "SHORT" ? T.red : T.textDim;
          const chgColor = chg > 0 ? T.green : chg < 0 ? T.red : T.textDim;
          const barWidth = Math.min(strength, 100);
          const volStr = vol >= 1e9 ? (vol / 1e9).toFixed(1) + "B" : vol >= 1e6 ? (vol / 1e6).toFixed(0) + "M" : vol >= 1e3 ? (vol / 1e3).toFixed(0) + "K" : "—";

          // Multi-TF signal consensus indicator (show dots for each TF)
          const consensusDots = TF_KEYS.map(tf2 => {
            const tf2Data = getTfData(e, tf2);
            const tf2Sig = tf2Data.signal || "NEUTRAL";
            return { tf: tf2, sig: tf2Sig, color: tf2Sig === "LONG" ? T.green : tf2Sig === "SHORT" ? T.red : T.textMuted };
          });

          return (
            <div key={e.coin} style={{ display: "grid", gridTemplateColumns: "16px 34px 1fr 28px 28px 34px 30px", gap: 1, padding: "2px 3px", borderRadius: 1, background: sig !== "NEUTRAL" ? `${sigColor}06` : "transparent", borderBottom: `1px solid ${T.borderLight}22`, cursor: "pointer", transition: "background 0.15s" }}
              onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = `${sigColor}12`; }}
              onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = sig !== "NEUTRAL" ? `${sigColor}06` : "transparent"; }}
              title={tfData.signalReason || ""}
            >
              {/* Rank */}
              <span style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, alignSelf: "center" }}>{e.rank}</span>
              {/* Coin */}
              <span style={{ fontSize: 8, fontWeight: 700, color: T.text, fontFamily: EP_FONT, alignSelf: "center", letterSpacing: 0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.coin}</span>
              {/* Signal bar */}
              <div style={{ display: "flex", flexDirection: "column", gap: 0, justifyContent: "center", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: sigColor, boxShadow: sig !== "NEUTRAL" ? `0 0 3px ${sigColor}` : "none", flexShrink: 0 }} />
                  <span style={{ fontSize: 6, fontWeight: 700, color: sigColor, fontFamily: EP_FONT, letterSpacing: 0.2 }}>{sig === "LONG" ? "▲L" : sig === "SHORT" ? "▼S" : "━N"}</span>
                  <span style={{ fontSize: 5, color: T.textMuted, fontFamily: EP_FONT }}>{strength}%</span>
                  {/* Multi-TF consensus dots */}
                  <div style={{ display: "flex", gap: 0.5, marginLeft: 1 }}>
                    {consensusDots.map(cd => (
                      <span key={cd.tf} style={{ width: 2.5, height: 2.5, borderRadius: "50%", background: cd.color, opacity: cd.tf === activeTf ? 1 : 0.35 }} title={`${cd.tf}: ${cd.sig}`} />
                    ))}
                  </div>
                </div>
                {/* Strength bar */}
                <div style={{ height: 1.5, background: T.borderLight, borderRadius: 1, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${barWidth}%`, background: sigColor, borderRadius: 1, transition: "width 0.3s" }} />
                </div>
              </div>
              {/* RSI */}
              <span style={{ fontSize: 6, fontWeight: 600, color: rsi > 0 ? rsiColor(rsi) : T.textDim, fontFamily: EP_FONT, textAlign: "center", alignSelf: "center" }}>
                {rsi > 0 ? rsi.toFixed(0) : "—"}
              </span>
              {/* BB Position */}
              <span style={{ fontSize: 6, fontWeight: 600, color: bbPos >= 0 ? (bbPos < 25 ? T.green : bbPos > 75 ? T.red : T.cyan) : T.textDim, fontFamily: EP_FONT, textAlign: "center", alignSelf: "center" }}>
                {bbPos >= 0 ? bbPos.toFixed(0) : "—"}
              </span>
              {/* Volume */}
              <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT, textAlign: "right", alignSelf: "center" }}>${volStr}</span>
              {/* Change */}
              <span style={{ fontSize: 6, fontWeight: 600, color: chgColor, fontFamily: EP_FONT, textAlign: "right", alignSelf: "center" }}>
                {chg > 0 ? "+" : ""}{chg.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Funding/OI summary for top 3 */}
      {entries.length > 0 && (
        <div style={{ marginTop: 3, padding: "2px 3px", background: T.panelAlt, borderRadius: 2 }}>
          <div style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT, letterSpacing: 0.5, marginBottom: 1 }}>FUNDING / OI</div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {ranked.slice(0, 6).map((e: any) => {
              const frAnn = e.fundingAnnual ?? (e.fundingRate != null ? e.fundingRate * 3 * 365 * 100 : 0);
              const oiChg = e.oiChangePct ?? 0;
              const frColor = frAnn > 20 ? T.red : frAnn < -20 ? T.green : T.textDim;
              const oiColor = oiChg > 5 ? T.green : oiChg < -5 ? T.red : T.textDim;
              return (
                <div key={e.coin} style={{ display: "flex", gap: 3, alignItems: "center", padding: "0 2px" }}>
                  <span style={{ fontSize: 6, fontWeight: 700, color: T.text, fontFamily: EP_FONT }}>{e.coin}</span>
                  <span style={{ fontSize: 5, color: frColor, fontFamily: EP_FONT }}>{frAnn > 0 ? "+" : ""}{frAnn.toFixed(0)}%</span>
                  <span style={{ fontSize: 5, color: oiColor, fontFamily: EP_FONT }}>OI{oiChg > 0 ? "+" : ""}{oiChg.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Show more / less */}
      {entries.length > 12 && (
        <div style={{ textAlign: "center", marginTop: 3, cursor: "pointer" }} onClick={() => setShowAll(!showAll)}>
          <span style={{ fontSize: 7, color: T.yellow, fontFamily: EP_FONT, letterSpacing: 0.5, borderBottom: `1px dashed ${T.yellow}` }}>
            {showAll ? "▲ LESS" : `▼ ALL (${entries.length})`}
          </span>
        </div>
      )}
    </Panel>
  );
}

function WhaleActivityPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const tops = state.whaleTopPositions || [];
  const traders = state.traderProfiles || [];
  const hasAny = tops.length > 0 || traders.length > 0;

  // Summary stats
  const longCount = state.walletsLongCount || 0;
  const shortCount = state.walletsShortCount || 0;
  const neutralCount = state.walletsNeutralCount || 0;
  const totalVal = state.whaleTotalValueUsd;
  const longRatio = state.whaleLongRatio;
  const score = state.sentimentScore;
  const label = state.sentimentLabel;

  // Computed stats
  const totalPositions = tops.length;
  const totalPnl = tops.reduce((s: number, w: any) => s + (w.pnl || 0), 0);
  const longPositions = tops.filter((w: any) => w.side === "LONG");
  const shortPositions = tops.filter((w: any) => w.side === "SHORT");
  const avgLeverage = totalPositions > 0 ? tops.reduce((s: number, w: any) => s + (w.leverage || 0), 0) / totalPositions : 0;
  const largestPos = tops.length > 0 ? tops.reduce((max: any, w: any) => (w.size_usd || 0) > (max.size_usd || 0) ? w : max, tops[0]) : null;
  const totalAccountValue = traders.reduce((s: number, t: any) => s + (t.account_value || 0), 0);

  // Per-coin aggregation
  const coinMap: Record<string, { long: number; short: number; pnl: number; count: number }> = {};
  for (const w of tops) {
    const c = w.coin || "UNKNOWN";
    if (!coinMap[c]) coinMap[c] = { long: 0, short: 0, pnl: 0, count: 0 };
    coinMap[c].count++;
    coinMap[c].pnl += w.pnl || 0;
    if (w.side === "LONG") coinMap[c].long += w.size_usd || 0;
    else coinMap[c].short += w.size_usd || 0;
  }
  const coinEntries = Object.entries(coinMap).sort((a, b) => (b[1].long + b[1].short) - (a[1].long + a[1].short));

  return (
    <Panel title="Whale Activity" accent={T.purple}>
      {/* Data source badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Badge color={T.cyan}>HYPURRSCAN + HYPERLIQUID</Badge>
        {score != null && (
          <span style={{ fontSize: 10, color: score > 20 ? T.green : score < -20 ? T.red : T.textDim, fontFamily: EP_FONT, fontWeight: 700 }}>
            {label} ({score > 0 ? "+" : ""}{score.toFixed(0)})
          </span>
        )}
      </div>

      {/* L/S ratio bar */}
      {longRatio != null && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>
            <span>LONG {(longRatio * 100).toFixed(0)}%</span>
            <span>SHORT {((1 - longRatio) * 100).toFixed(0)}%</span>
          </div>
          <div style={{ width: "100%", height: 8, background: T.red + "44", borderRadius: 2, overflow: "hidden", position: "relative" }}>
            <div style={{ width: `${longRatio * 100}%`, height: "100%", background: `linear-gradient(90deg, ${T.green}, ${T.green}88)`, borderRadius: 2, transition: "width 0.5s" }} />
          </div>
        </div>
      )}

      {/* Summary stats grid */}
      {hasAny && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 6 }}>
          <div style={{ textAlign: "center", padding: "3px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.borderLight}` }}>
            <div style={{ fontSize: 8, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.5, textTransform: "uppercase" }}>Traders</div>
            <div style={{ fontSize: 12, color: T.text, fontFamily: EP_FONT, fontWeight: 700 }}>{traders.length || state.whaleTotalPositions || 0}</div>
          </div>
          <div style={{ textAlign: "center", padding: "3px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.borderLight}` }}>
            <div style={{ fontSize: 8, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.5, textTransform: "uppercase" }}>Positions</div>
            <div style={{ fontSize: 12, color: T.text, fontFamily: EP_FONT, fontWeight: 700 }}>{totalPositions}</div>
            <div style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT }}>{longPositions.length}L / <span style={{ color: T.red }}>{shortPositions.length}S</span></div>
          </div>
          <div style={{ textAlign: "center", padding: "3px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.borderLight}` }}>
            <div style={{ fontSize: 8, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.5, textTransform: "uppercase" }}>Total Val</div>
            <div style={{ fontSize: 12, color: T.purple, fontFamily: EP_FONT, fontWeight: 700 }}>{fmtBig(totalVal || totalAccountValue)}</div>
          </div>
        </div>
      )}

      {/* Key metrics row */}
      {hasAny && (
        <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: T.green, fontWeight: 700, fontFamily: EP_FONT }}>{longCount}L</span>
            <span style={{ fontSize: 10, color: T.textMuted }}>/</span>
            <span style={{ fontSize: 12, color: T.red, fontWeight: 700, fontFamily: EP_FONT }}>{shortCount}S</span>
            <span style={{ fontSize: 10, color: T.textMuted }}>/</span>
            <span style={{ fontSize: 12, color: T.textDim, fontWeight: 700, fontFamily: EP_FONT }}>{neutralCount}N</span>
          </div>
          <span style={{ fontSize: 9, color: T.borderLight }}>│</span>
          <span style={{ fontSize: 9, color: T.textDim, fontFamily: EP_FONT }}>Avg Lev <span style={{ color: T.orange, fontWeight: 700 }}>×{avgLeverage.toFixed(1)}</span></span>
          <span style={{ fontSize: 9, color: T.borderLight }}>│</span>
          <span style={{ fontSize: 9, color: T.textDim, fontFamily: EP_FONT }}>PnL <span style={{ color: totalPnl >= 0 ? T.green : T.red, fontWeight: 700 }}>{totalPnl >= 0 ? "+" : ""}{fmtBig(totalPnl)}</span></span>
          {largestPos && (
            <>
              <span style={{ fontSize: 9, color: T.borderLight }}>│</span>
              <span style={{ fontSize: 9, color: T.textDim, fontFamily: EP_FONT }}>Biggest <span style={{ color: T.cyan, fontWeight: 700 }}>{fmtBig(largestPos.size_usd)}</span></span>
            </>
          )}
        </div>
      )}

      {/* Per-coin breakdown */}
      {coinEntries.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, color: T.cyan, fontWeight: 700, letterSpacing: 1, paddingBottom: 3, borderBottom: `1px solid ${T.border}`, fontFamily: EP_FONT, textTransform: "uppercase" }}>Coin Breakdown</div>
          <div style={{ display: "grid", gap: 2, maxHeight: 120, overflowY: "auto", marginTop: 2 }}>
            {coinEntries.slice(0, 8).map(([coin, d]) => {
              const total = d.long + d.short;
              const longPct = total > 0 ? (d.long / total) * 100 : 50;
              return (
                <div key={`cb-${coin}`} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, padding: "2px 0" }}>
                  <span style={{ color: T.cyan, fontFamily: EP_FONT, fontWeight: 700, width: 42, flexShrink: 0 }}>{coin}</span>
                  <div style={{ flex: 1, height: 6, background: T.red + "33", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${longPct}%`, height: "100%", background: T.green + "88", borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                  <span style={{ color: d.pnl >= 0 ? T.green : T.red, fontFamily: EP_FONT, width: 44, textAlign: "right", flexShrink: 0 }}>{d.pnl >= 0 ? "+" : ""}{fmtBig(d.pnl)}</span>
                  <span style={{ color: T.textDim, fontFamily: EP_FONT, width: 16, textAlign: "right", flexShrink: 0 }}>{d.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trader profiles — show top traders with net bias bar */}
      {traders.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 9, color: T.textMuted, fontWeight: 700, letterSpacing: 1, paddingBottom: 3, borderBottom: `1px solid ${T.border}`, fontFamily: EP_FONT, marginBottom: 3, textTransform: "uppercase" }}>Top Traders</div>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 50px 50px 24px", gap: 2, fontSize: 7, color: T.textMuted, fontWeight: 700, letterSpacing: 0.8, paddingBottom: 2, borderBottom: `1px solid ${T.border}`, fontFamily: EP_FONT, whiteSpace: "nowrap" }}>
            <span>WALLET</span><span>BIAS</span><span style={{ textAlign: "right" }}>VALUE</span><span style={{ textAlign: "right" }}>PnL</span><span style={{ textAlign: "center" }}>L/S</span>
          </div>
          <div style={{ display: "grid", gap: 2, maxHeight: 240, overflowY: "auto" }}>
            {traders.slice(0, 25).map((tp: any, i: number) => {
              const biasColor = tp.dominant_side === "LONG" ? T.green : tp.dominant_side === "SHORT" ? T.red : T.textDim;
              const pnlTotal = (tp.top_positions || []).reduce((s: number, p: any) => s + (p.pnl || 0), 0);
              const netBias = tp.net_bias || 0; // -1 to +1
              const biasBarPct = ((netBias + 1) / 2) * 100; // 0=full short, 100=full long
              return (
                <div key={`tp-${i}`} style={{ padding: "2px 0", borderBottom: `1px solid ${T.borderLight}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 32px 50px 50px 24px", gap: 2, fontSize: 9, whiteSpace: "nowrap" }}>
                    <span style={{ color: T.textDim, fontFamily: EP_FONT, overflow: "hidden", textOverflow: "ellipsis" }}>{tp.wallet}</span>
                    <span style={{ color: biasColor, fontWeight: 700, fontSize: 8, letterSpacing: 0.5, textAlign: "center" }}>{tp.dominant_side === "LONG" ? "L" : tp.dominant_side === "SHORT" ? "S" : "—"}</span>
                    <span style={{ color: T.text, fontFamily: EP_FONT, textAlign: "right" }}>{fmtBig(tp.total_usd)}</span>
                    <span style={{ color: pnlTotal >= 0 ? T.green : T.red, fontFamily: EP_FONT, textAlign: "right" }}>{pnlTotal >= 0 ? "+" : ""}{fmtBig(pnlTotal)}</span>
                    <span style={{ fontSize: 8, color: T.textDim, fontFamily: EP_FONT, textAlign: "center" }}>{tp.long_count}/{tp.short_count}</span>
                  </div>
                  {/* Net bias micro-bar */}
                  <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 1 }}>
                    <div style={{ flex: 1, height: 3, background: T.red + "33", borderRadius: 1, overflow: "hidden", position: "relative" }}>
                      <div style={{ position: "absolute", left: `${biasBarPct - 1}%`, width: 2, height: "100%", background: biasColor, borderRadius: 1, transition: "left 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, width: 28, textAlign: "right" }}>
                      {tp.account_value ? fmtBig(tp.account_value) : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top positions from whales */}
      {tops.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: T.purple, fontWeight: 700, letterSpacing: 1, paddingBottom: 3, borderBottom: `1px solid ${T.border}`, fontFamily: EP_FONT, margin: "4px 0 3px", textTransform: "uppercase" }}>Top Positions ({tops.length})</div>
          <div style={{ display: "grid", gap: 2, maxHeight: 300, overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 38px 38px 56px 56px 24px", gap: 2, fontSize: 7, color: T.textMuted, fontWeight: 700, letterSpacing: 0.8, paddingBottom: 2, borderBottom: `1px solid ${T.border}`, fontFamily: EP_FONT, whiteSpace: "nowrap" }}>
              <span>WALLET</span><span>COIN</span><span>SIDE</span><span style={{ textAlign: "right" }}>SIZE</span><span style={{ textAlign: "right" }}>PnL</span><span style={{ textAlign: "center" }}>LEV</span>
            </div>
            {tops.slice(0, 25).map((w: any, i: number) => (
              <div key={`wp-${i}`} style={{ display: "grid", gridTemplateColumns: "1fr 38px 38px 56px 56px 24px", gap: 2, fontSize: 9, padding: "1px 0", whiteSpace: "nowrap" }}>
                <span style={{ color: T.textDim, fontFamily: EP_FONT, overflow: "hidden", textOverflow: "ellipsis" }}>{w.wallet}</span>
                <span style={{ color: T.cyan, fontFamily: EP_FONT, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{w.coin || "-"}</span>
                <span style={{ color: w.side === "LONG" ? T.green : T.red, fontWeight: 700, textAlign: "center" }}>{w.side === "LONG" ? "L" : "S"}</span>
                <span style={{ color: T.text, fontFamily: EP_FONT, textAlign: "right" }}>{fmtBig(w.size_usd)}</span>
                <span style={{ color: w.pnl >= 0 ? T.green : T.red, fontFamily: EP_FONT, textAlign: "right" }}>{w.pnl >= 0 ? "+" : ""}{fmtBig(w.pnl)}</span>
                <span style={{ color: T.orange, fontFamily: EP_FONT, textAlign: "center" }}>×{w.leverage}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account values summary */}
      {traders.length > 0 && (
        <div style={{ marginTop: 4, padding: "3px 6px", background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.borderLight}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, fontFamily: EP_FONT }}>
            <span style={{ color: T.textMuted, letterSpacing: 0.5, textTransform: "uppercase" }}>Σ Account Value</span>
            <span style={{ color: T.purple, fontWeight: 700 }}>{fmtBig(totalAccountValue)}</span>
          </div>
        </div>
      )}

      {!hasAny && waiting(T)}
    </Panel>
  );
}

function OrderFlowPanel({ state }: { state: BotState }) {
  const T = useTheme();
  return (
    <Panel title="Order Flow" accent={state.ofiNet != null ? (state.ofiNet > 0 ? T.green : T.red) : undefined}>
      <StatRow label="OFI Net" value={state.ofiNet != null ? fmtBig(state.ofiNet) : "—"} color={state.ofiNet != null ? (state.ofiNet > 0 ? T.green : T.red) : undefined} />
      <StatRow label="OFI Bid Δ" value={state.ofiBidDelta != null ? fmtBig(state.ofiBidDelta) : "—"} color={T.green} />
      <StatRow label="OFI Ask Δ" value={state.ofiAskDelta != null ? fmtBig(state.ofiAskDelta) : "—"} color={T.red} />
      <StatRow label="CVD" value={state.cvd != null ? fmtBig(state.cvd) : "—"} color={state.cvd != null ? (state.cvd > 0 ? T.green : T.red) : undefined} />
      <StatRow label="CVD Divergence" value={state.cvdDivergence != null ? state.cvdDivergence.toFixed(2) : "—"} color={state.cvdDivergence != null ? (Math.abs(state.cvdDivergence) > 0.3 ? T.orange : T.text) : undefined} />
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 8, color: T.textMuted, marginBottom: 2, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>TRADERS L/S/N</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>{state.walletsLongCount}</span>
          <span style={{ fontSize: 9, color: T.textMuted }}>/</span>
          <span style={{ fontSize: 11, color: T.red, fontWeight: 700 }}>{state.walletsShortCount}</span>
          <span style={{ fontSize: 9, color: T.textMuted }}>/</span>
          <span style={{ fontSize: 11, color: T.textDim, fontWeight: 700 }}>{state.walletsNeutralCount}</span>
        </div>
      </div>
    </Panel>
  );
}

function LiquidationMapPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const lm = state.liquidationMap;
  if (!lm) return <Panel title="Liquidation Map">{waiting(T)}</Panel>;
  const intensityColor = (intensity: string) => {
    if (intensity === "EXTREME") return T.red;
    if (intensity === "HIGH") return T.orange;
    if (intensity === "MEDIUM") return T.yellow;
    return T.textDim;
  };
  return (
    <Panel title="Liquidation Map" accent={lm.cascadeDetected ? T.red : T.textDim}>
      {lm.cascadeDetected && (
        <div style={{ textAlign: "center", marginBottom: 4 }}>
          <Badge color={T.red}>⚠ CASCADE DETECTED</Badge>
        </div>
      )}
      <div style={{ display: "grid", gap: 3, maxHeight: 120, overflowY: "auto" }}>
        {(lm.clusters || []).map((c: any, i: number) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px", background: T.panelAlt, borderRadius: 2, borderLeft: `3px solid ${intensityColor(c.intensity)}`, boxShadow: `inset 0 1px 0 ${T.borderLight}` }}>
            <span style={{ fontSize: 9, fontFamily: EP_FONT, color: T.text }}>{fmtUsd(c.price, 0)}</span>
            <span style={{ fontSize: 8, color: c.side === "LONG" ? T.green : T.red, fontWeight: 700 }}>{c.side} LIQ</span>
            <span style={{ fontSize: 8, color: T.textDim }}>{fmtBig(c.totalUsd)}</span>
            <Badge color={intensityColor(c.intensity)}>{c.intensity}</Badge>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TechnicalIndicatorsPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const rsiOversoldExtreme = state.rsi != null && state.rsi < 27;
  const rsiColor = state.rsi != null
    ? (state.rsi > 70 ? T.red : state.rsi < 27 ? T.green : state.rsi < 30 ? T.green : T.text)
    : T.textDim;
  const macdColor = state.macdHistogram != null
    ? (state.macdHistogram > 0 ? T.green : state.macdHistogram < 0 ? T.red : T.text)
    : T.textDim;
  const bbPosition = state.price != null && state.bbUpper != null && state.bbLower != null && (state.bbUpper - state.bbLower) > 0
    ? ((state.price - state.bbLower) / (state.bbUpper - state.bbLower)) * 100
    : null;
  const bbColor = bbPosition != null
    ? (bbPosition > 90 ? T.red : bbPosition < 10 ? T.green : T.text)
    : T.textDim;
  return (
    <Panel title="Technical Indicators" accent={rsiOversoldExtreme ? T.green : state.rsi != null ? T.cyan : undefined} style={rsiOversoldExtreme ? { animation: "rsi-extreme-os 0.8s infinite", borderColor: T.green } : undefined}>
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 8, color: T.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 2, fontFamily: EP_FONT, textTransform: "uppercase" }}>RSI (14)</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: rsiColor, fontFamily: EP_FONT, textShadow: `0 0 10px ${rsiColor}44` }}>{state.rsi != null ? state.rsi.toFixed(1) : "—"}</span>
          {state.rsi != null && <Badge color={rsiColor}>{state.rsi > 70 ? "OVERBOUGHT" : state.rsi < 27 ? "EXTREME OS" : state.rsi < 30 ? "OVERSOLD" : "NEUTRAL"}</Badge>}
        </div>
        {rsiOversoldExtreme && (
          <style>{`
            @keyframes rsi-extreme-os {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.3; }
            }
          `}</style>
        )}
        {state.rsi != null && (
          <div style={{ position: "relative", height: 4, background: T.border, borderRadius: 1, marginTop: 3 }}>
            <div style={{ position: "absolute", left: "27%", top: 0, bottom: 0, width: 1, background: T.green, opacity: 0.3 }} />
            <div style={{ position: "absolute", left: "30%", top: 0, bottom: 0, width: 1, background: T.green, opacity: 0.5 }} />
            <div style={{ position: "absolute", left: "70%", top: 0, bottom: 0, width: 1, background: T.red, opacity: 0.5 }} />
            <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, state.rsi))}%`, top: -3, width: 8, height: 10, background: rsiColor, transform: "translateX(-50%)", borderRadius: 1, boxShadow: `0 0 6px ${rsiColor}`, ...(rsiOversoldExtreme ? { animation: "rsi-extreme-os 0.8s infinite" } : {}) }} />
          </div>
        )}
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
      <StatRow label="MACD Line" value={state.macdLine != null ? state.macdLine.toFixed(2) : "—"} color={macdColor} />
      <StatRow label="MACD Signal" value={state.macdSignal != null ? state.macdSignal.toFixed(2) : "—"} color={macdColor} />
      <StatRow label="MACD Hist" value={state.macdHistogram != null ? (state.macdHistogram > 0 ? "+" : "") + state.macdHistogram.toFixed(2) : "—"} color={macdColor} />
      <div style={{ borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
      <StatRow label="BB Upper" value={state.bbUpper != null ? fmtUsd(state.bbUpper, 0) : "—"} color={T.red} />
      <StatRow label="BB Middle" value={state.bbMiddle != null ? fmtUsd(state.bbMiddle, 0) : "—"} color={T.text} />
      <StatRow label="BB Lower" value={state.bbLower != null ? fmtUsd(state.bbLower, 0) : "—"} color={T.green} />
      <StatRow label="BB Width" value={state.bbBandwidth != null ? state.bbBandwidth.toFixed(2) + "%" : "—"} color={T.textDim} />
      {bbPosition != null && (
        <div style={{ position: "relative", height: 4, background: T.border, borderRadius: 1, marginTop: 3 }}>
          <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, bbPosition))}%`, top: -3, width: 8, height: 10, background: bbColor, transform: "translateX(-50%)", borderRadius: 1, boxShadow: `0 0 6px ${bbColor}` }} />
        </div>
      )}
    </Panel>
  );
}

// ─── SVG Chart Helpers ─────────────────────────────────────────────────────

const CHART_W = 300;
const CHART_H = 110;
const CHART_PAD = 2;

// ─── Binance Kline Indicator Calculator ─────────────────────────────────────

function calcEMA(data: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const ema: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { ema.push(data[i]); continue; }
    ema.push(data[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

function calcRSI(closes: number[], period = 14): number[] {
  const rsi: number[] = [];
  if (closes.length < period + 1) return rsi;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = 0; i < period; i++) rsi.push(NaN);
  rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? Math.abs(diff) : 0)) / period;
    rsi.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return rsi.filter(v => !isNaN(v));
}

function calcMACD(closes: number[]) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < 25) continue;
    macdLine.push(ema12[i] - ema26[i]);
  }
  const signalLine = calcEMA(macdLine, 9);
  const startIdx = macdLine.length - signalLine.length;
  const hist: number[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    hist.push(macdLine[startIdx + i] - signalLine[i]);
  }
  const alignedMacd = macdLine.slice(startIdx);
  return { macdLine: alignedMacd, signalLine, histogram: hist };
}

function calcBB(closes: number[], period = 20, mult = 2) {
  const upper: number[] = [], middle: number[] = [], lower: number[] = [];
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    upper.push(mean + mult * std);
    middle.push(mean);
    lower.push(mean - mult * std);
  }
  return { upper, middle, lower };
}

/** HURST — Hurst Cycle Channel Clone (LazyBear) Oscillator
 *  Computes FastOsc (red) and SlowOsc (green) from OHLCV data.
 *  FastOsc = (src - mcb) / (mct - mcb)   — normalized price within medium cycle band
 *  SlowOsc = (scmm - mcb) / (mct - mcb)  — normalized short-cycle mid within medium cycle band
 *  Reference lines at 0 (lower), 0.5 (mid), 1.0 (upper)
 *  OB > 1.0, OS < 0.0
 */
function calcHCCCO(
  closes: number[], highs: number[], lows: number[],
  scl_t = 10, mcl_t = 30, scm = 1.0, mcm = 3.0,
): { fastOsc: number[]; slowOsc: number[]; fastLatest: number; slowLatest: number } {
  const n = closes.length;
  if (n < mcl_t + 5) return { fastOsc: [], slowOsc: [], fastLatest: 0.5, slowLatest: 0.5 };

  const scl = Math.floor(scl_t / 2);   // short cycle lookback
  const mcl = Math.floor(mcl_t / 2);   // medium cycle lookback
  const scl2 = Math.floor(scl / 2);     // offset for short cycle
  const mcl2 = Math.floor(mcl / 2);     // offset for medium cycle

  // RMA (Running Moving Average, same as PineScript rma)
  function rma(src: number[], len: number): number[] {
    const out: number[] = new Array(src.length).fill(NaN);
    if (src.length < len) return out;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += src[i];
    out[len - 1] = sum / len;
    const alpha = 1 / len;
    for (let i = len; i < src.length; i++) {
      out[i] = alpha * src[i] + (1 - alpha) * out[i - 1];
    }
    return out;
  }

  // ATR using RMA of true range
  const tr: number[] = [];
  tr[0] = highs[0] - lows[0];
  for (let i = 1; i < n; i++) {
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  const atrScl = rma(tr, scl);
  const atrMcl = rma(tr, mcl);

  // RMA of source (close)
  const maScl = rma(closes, scl);
  const maMcl = rma(closes, mcl);

  // Cycle bands
  const fastOsc: number[] = [];
  const slowOsc: number[] = [];

  for (let i = 0; i < n; i++) {
    // Short cycle top/bottom (offset by scl2)
    const sRef = i >= scl2 ? (isNaN(maScl[i - scl2]) ? closes[i] : maScl[i - scl2]) : closes[i];
    const scOff = isNaN(atrScl[i]) ? 0 : scm * atrScl[i];
    const sct = sRef + scOff;
    const scb = sRef - scOff;
    const scmm = (sct + scb) / 2;

    // Medium cycle top/bottom (offset by mcl2)
    const mRef = i >= mcl2 ? (isNaN(maMcl[i - mcl2]) ? closes[i] : maMcl[i - mcl2]) : closes[i];
    const mcOff = isNaN(atrMcl[i]) ? 0 : mcm * atrMcl[i];
    const mct = mRef + mcOff;
    const mcb = mRef - mcOff;

    // Normalized oscillators (within medium cycle band)
    const denom = mct - mcb;
    if (denom !== 0 && !isNaN(denom)) {
      slowOsc.push((scmm - mcb) / denom);
      fastOsc.push((closes[i] - mcb) / denom);
    } else {
      slowOsc.push(0.5);
      fastOsc.push(0.5);
    }
  }

  // Skip initial NaN region (need mcl bars to warm up RMA)
  const warmup = mcl;
  const validFast = fastOsc.slice(warmup);
  const validSlow = slowOsc.slice(warmup);

  const fastLatest = validFast.length > 0 ? validFast[validFast.length - 1] : 0.5;
  const slowLatest = validSlow.length > 0 ? validSlow[validSlow.length - 1] : 0.5;

  return { fastOsc: validFast, slowOsc: validSlow, fastLatest, slowLatest };
}

interface BinanceKline {
  openTime: number; open: string; high: string; low: string;
  close: string; volume: string; closeTime: number;
}

async function fetchBinanceKlines(symbol = "BTCUSDT", interval = "1h", limit = 120): Promise<BinanceKline[]> {
  const endpoints = [
    `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://api.binance.us/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const raw: any[][] = await res.json();
      // Binance error responses are objects, not arrays
      if (!Array.isArray(raw) || raw.length === 0) continue;
      return raw.map(k => ({
        openTime: k[0], open: k[1], high: k[2], low: k[3],
        close: k[4], volume: k[5], closeTime: k[6],
      }));
    } catch (e) {
      continue;
    }
  }
  console.warn(`[HyperA] All Binance endpoints failed for ${interval}`);
  return [];
}

/** Fetch multi-timeframe indicators (1m, 5m, 15m, 30m) from Binance and compute RSI/MACD/BB client-side */
async function fetchMtfIndicators(symbol = "BTCUSDT"): Promise<BotState["ohlcvMtf"]> {
  const intervals = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"] as const;
  const mtfData: BotState["ohlcvMtf"] = {};

  const results = await Promise.allSettled(
    intervals.map(async (iv) => {
      // Fetch more candles for longer lookback (especially for MACD which needs 26+ periods)
      const limit = 200;
      const klines = await fetchBinanceKlines(symbol, iv, limit);
      if (klines.length < 30) return;
      const closes = klines.map(k => parseFloat(k.close));
      const highs = klines.map(k => parseFloat(k.high));
      const lows = klines.map(k => parseFloat(k.low));

      // RSI
      const rsiSeries = calcRSI(closes, 14);
      const rsiLatest = rsiSeries.length > 0 ? rsiSeries[rsiSeries.length - 1] : null;

      // MACD
      const macdResult = calcMACD(closes);
      const macdLatest = macdResult.macdLine.length > 0 ? macdResult.macdLine[macdResult.macdLine.length - 1] : null;
      const macdSignalLatest = macdResult.signalLine.length > 0 ? macdResult.signalLine[macdResult.signalLine.length - 1] : null;
      const macdHistLatest = macdResult.histogram.length > 0 ? macdResult.histogram[macdResult.histogram.length - 1] : null;

      // Bollinger Bands
      const bbResult = calcBB(closes, 20, 2);
      const bbUpperLatest = bbResult.upper.length > 0 ? bbResult.upper[bbResult.upper.length - 1] : null;
      const bbMiddleLatest = bbResult.middle.length > 0 ? bbResult.middle[bbResult.middle.length - 1] : null;
      const bbLowerLatest = bbResult.lower.length > 0 ? bbResult.lower[bbResult.lower.length - 1] : null;
      const bbBandwidthLatest = (bbUpperLatest && bbMiddleLatest && bbLowerLatest && bbMiddleLatest > 0)
        ? ((bbUpperLatest - bbLowerLatest) / bbMiddleLatest) * 100 : null;

      // Aligned price series for BB chart (same length as BB series)
      const bbLen = bbResult.upper.length;
      const priceForBb = closes.slice(-bbLen);

      // HURST — Hurst Cycle Channel Clone Oscillator
      const hcccoResult = calcHCCCO(closes, highs, lows);

      // ── Trigger detection ────────────────────────────────
      // Trigger 1: Hurst crosses UP through 0.0 (BUY) or DOWN through 1.0 (SELL)
      let hurstCrossUp = false;
      let hurstCrossDown = false;
      if (hcccoResult.fastOsc.length >= 2) {
        const hPrev = hcccoResult.fastOsc[hcccoResult.fastOsc.length - 2];
        const hCurr = hcccoResult.fastOsc[hcccoResult.fastOsc.length - 1];
        // Cross UP through 0.0: previous ≤ 0.0 AND current > 0.0
        if (hPrev <= 0.0 && hCurr > 0.0) hurstCrossUp = true;
        // Cross DOWN through 1.0: previous ≥ 1.0 AND current < 1.0
        if (hPrev >= 1.0 && hCurr < 1.0) hurstCrossDown = true;
      }

      // Trigger 2: Price crosses below lower BB (BUY) or above upper BB (SELL)
      let bbCrossLower = false;
      let bbCrossUpper = false;
      if (bbResult.upper.length >= 2 && bbLen >= 2) {
        const pPrev = closes[closes.length - 2];
        const pCurr = closes[closes.length - 1];
        const bbUPrev = bbResult.upper[bbResult.upper.length - 2];
        const bbUCurr = bbResult.upper[bbResult.upper.length - 1];
        const bbLPrev = bbResult.lower[bbResult.lower.length - 2];
        const bbLCurr = bbResult.lower[bbResult.lower.length - 1];
        // Price crosses BELOW lower BB: previous ≥ lower BB AND current < lower BB
        if (pPrev >= bbLPrev && pCurr < bbLCurr) bbCrossLower = true;
        // Price crosses ABOVE upper BB: previous ≤ upper BB AND current > upper BB
        if (pPrev <= bbUPrev && pCurr > bbUCurr) bbCrossUpper = true;
      }

      // Trim all series to last 120 points
      const trim = (arr: number[], max = 120) => arr.length > max ? arr.slice(-max) : arr;

      mtfData[iv] = {
        rsi: trim(rsiSeries),
        macdLine: trim(macdResult.macdLine),
        macdSignal: trim(macdResult.signalLine),
        macdHist: trim(macdResult.histogram),
        bbUpper: trim(bbResult.upper),
        bbMiddle: trim(bbResult.middle),
        bbLower: trim(bbResult.lower),
        price: trim(priceForBb),
        rsiLatest, macdLatest, macdSignalLatest, macdHistLatest,
        bbUpperLatest, bbMiddleLatest, bbLowerLatest, bbBandwidthLatest,
        hcccoFast: trim(hcccoResult.fastOsc),
        hcccoSlow: trim(hcccoResult.slowOsc),
        hcccoFastLatest: hcccoResult.fastLatest,
        hcccoSlowLatest: hcccoResult.slowLatest,
        hurstCrossUp, hurstCrossDown, bbCrossLower, bbCrossUpper,
      };
    })
  );

  // Log any failures
  results.forEach((r, i) => {
    if (r.status === "rejected") console.warn(`[HyperA] MTF ${intervals[i]} fetch failed:`, r.reason);
  });

  return mtfData;
}

function svgPolyline(data: number[], min: number, max: number, color: string, strokeWidth = 1.5, chartH = CHART_H) {
  if (data.length < 2) return null;
  const range = max - min || 1;
  const step = (CHART_W - CHART_PAD * 2) / (data.length - 1);
  const points = data.map((v, i) =>
    `${CHART_PAD + i * step},${chartH - CHART_PAD - ((v - min) / range) * (chartH - CHART_PAD * 2)}`
  ).join(" ");
  return <polyline fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" points={points} />;
}

function svgArea(data: number[], min: number, max: number, color: string, opacity = 0.12) {
  if (data.length < 2) return null;
  const range = max - min || 1;
  const step = (CHART_W - CHART_PAD * 2) / (data.length - 1);
  const baseline = CHART_H - CHART_PAD;
  const topPoints = data.map((v, i) =>
    `${CHART_PAD + i * step},${CHART_H - CHART_PAD - ((v - min) / range) * (CHART_H - CHART_PAD * 2)}`
  ).join(" ");
  const fillPoints = `${CHART_PAD},${baseline} ${topPoints} ${CHART_PAD + (data.length - 1) * step},${baseline}`;
  return <polygon fill={color} fillOpacity={opacity} points={fillPoints} />;
}

function svgHLine(y: number, min: number, max: number, color: string, dash = "4,3") {
  const range = max - min || 1;
  const py = CHART_H - CHART_PAD - ((y - min) / range) * (CHART_H - CHART_PAD * 2);
  if (py < CHART_PAD || py > CHART_H - CHART_PAD) return null;
  return <line x1={CHART_PAD} y1={py} x2={CHART_W - CHART_PAD} y2={py} stroke={color} strokeWidth={0.3} strokeDasharray={dash} />;
}

/**
 * Hook: tracks mouse position over an SVG chart and returns the nearest data index + value tooltip.
 * Usage: const { hoverIdx, hoverX, hoverY, hoverValue, onMove, onLeave } = useChartHover(data, minV, maxV);
 */
function useChartHover(data: number[], minV: number, maxV: number) {
  const [hoverIdx, setHoverIdx] = useState(-1);
  const range = maxV - minV || 1;
  const step = (CHART_W - CHART_PAD * 2) / (data.length - 1 || 1);

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = CHART_W / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const idx = Math.round((mx - CHART_PAD) / step);
    if (idx >= 0 && idx < data.length) setHoverIdx(idx);
    else setHoverIdx(-1);
  }, [data.length, step]);

  const onLeave = useCallback(() => setHoverIdx(-1), []);

  const hoverX = hoverIdx >= 0 ? CHART_PAD + hoverIdx * step : -1;
  const hoverY = hoverIdx >= 0 ? CHART_H - CHART_PAD - ((data[hoverIdx] - minV) / range) * (CHART_H - CHART_PAD * 2) : -1;
  const hoverValue = hoverIdx >= 0 ? data[hoverIdx] : null;

  return { hoverIdx, hoverX, hoverY, hoverValue, onMove, onLeave };
}

/** Render hover crosshair + dot + value label inside an SVG chart */
function svgHoverOverlay(
  hoverX: number,
  hoverY: number,
  hoverValue: number | null,
  color: string,
  T: typeof EP_DARK,
  decimals = 1,
) {
  if (hoverX < 0 || hoverValue === null) return null;
  return (
    <g style={{ pointerEvents: "none" }}>
      {/* Vertical crosshair */}
      <line x1={hoverX} y1={CHART_PAD} x2={hoverX} y2={CHART_H - CHART_PAD} stroke={T.textMuted} strokeWidth={0.4} strokeDasharray="2,2" />
      {/* Horizontal crosshair */}
      <line x1={CHART_PAD} y1={hoverY} x2={CHART_W - CHART_PAD} y2={hoverY} stroke={T.textMuted} strokeWidth={0.4} strokeDasharray="2,2" />
      {/* Glow ring */}
      <circle cx={hoverX} cy={hoverY} r={5} fill={color} fillOpacity={0.15} />
      {/* Dot */}
      <circle cx={hoverX} cy={hoverY} r={2.5} fill={color} stroke={T.bg} strokeWidth={0.8} />
      {/* Value label */}
      <rect
        x={hoverX + 4}
        y={hoverY - 7}
        width={decimals >= 2 ? 38 : 30}
        height={10}
        rx={1.5}
        fill={T.bg}
        fillOpacity={0.9}
        stroke={color}
        strokeWidth={0.4}
      />
      <text
        x={hoverX + 6}
        y={hoverY - 0.5}
        fill={color}
        fontSize={6.5}
        fontFamily={EP_FONT}
        fontWeight={700}
      >
        {hoverValue.toFixed(decimals)}
      </text>
    </g>
  );
}

/** Render vertical signal markers (BUY=green, SELL=red) on a chart */
function svgSignalMarkers(
  markers: { idx: number; direction: "UP" | "DOWN"; confidence: number }[],
  dataLen: number,
  T: typeof EP_DARK,
) {
  return markers
    .filter(m => m.idx >= 0 && m.idx < dataLen)
    .map((m, i) => {
      const step = (CHART_W - CHART_PAD * 2) / (dataLen - 1 || 1);
      const x = CHART_PAD + m.idx * step;
      const isUp = m.direction === "UP";
      const color = isUp ? T.green : T.red;
      return (
        <g key={`sig-${i}`}>
          <line x1={x} y1={CHART_PAD} x2={x} y2={CHART_H - CHART_PAD} stroke={color} strokeWidth={0.6} strokeOpacity={0.5} />
          <text x={x} y={CHART_PAD + 7} fill={color} fontSize={6} fontFamily={EP_FONT} textAnchor="middle" fontWeight={700}>
            {isUp ? "▲" : "▼"}
          </text>
        </g>
      );
    });
}

// ─── Timeframe Toggle ──────────────────────────────────────────────────────

type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d";
const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"];

function TimeframeToggle({ value, onChange, accent }: { value: Timeframe; onChange: (tf: Timeframe) => void; accent?: string }) {
  const T = useTheme();
  return (
    <div style={{ display: "flex", gap: 2, marginLeft: "auto" }}>
      {TIMEFRAMES.map(tf => {
        const active = tf === value;
        return (
          <button key={tf} onClick={() => onChange(tf)} style={{
            background: active ? (accent || T.orange) : T.panel,
            color: active ? "#000" : T.textDim,
            border: `1px solid ${active ? (accent || T.orange) : T.border}`,
            borderRadius: 2, padding: "1px 5px", fontSize: 7, fontFamily: EP_FONT,
            fontWeight: active ? 800 : 500, cursor: "pointer", letterSpacing: 0.5,
            transition: "all 0.15s",
          }}>{tf}</button>
        );
      })}
    </div>
  );
}

// ─── RSI Chart Panel ────────────────────────────────────────────────────────

function RSIChartPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const [tf, setTf] = useState<Timeframe>("5m");
  // Use multi-timeframe data if available, otherwise fall back to legacy 1H history
  const mtf = state.ohlcvMtf?.[tf];
  const data = mtf?.rsi?.length ? mtf.rsi : state.rsiHistory ?? [];
  const latestRsi = mtf?.rsiLatest ?? state.rsi;
  const minV = 0;
  const maxV = 100;
  const { hoverIdx, hoverX, hoverY, hoverValue, onMove, onLeave } = useChartHover(data, minV, maxV);

  if (data.length < 2) return <Panel title="RSI Chart">{waiting(T)}</Panel>;

  const lastRsi = data[data.length - 1];
  const rsiExtremeOS = lastRsi < 27;
  const rsiColor = lastRsi > 70 ? T.red : lastRsi < 27 ? T.green : lastRsi < 30 ? T.green : T.text;
  const hoverRsiColor = hoverIdx >= 0 ? (data[hoverIdx] > 70 ? T.red : data[hoverIdx] < 27 ? T.green : data[hoverIdx] < 30 ? T.green : T.text) : rsiColor;
  const tfLabel = mtf?.rsi?.length ? tf.toUpperCase() : "1H";

  return (
    <Panel title={`RSI (14) ${tfLabel}`} accent={rsiColor} style={rsiExtremeOS ? { animation: "rsi-chart-alert 0.8s infinite", borderColor: T.green } : undefined}>
      {rsiExtremeOS && (
        <style>{`
          @keyframes rsi-chart-alert {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.35; }
          }
        `}</style>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: T.textDim, letterSpacing: 0.5 }}>RELATIVE STRENGTH INDEX</span>
        <TimeframeToggle value={tf} onChange={setTf} accent={rsiColor} />
      </div>
      <svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={onLeave}>
        {/* Overbought zone (70-100) */}
        <rect x={CHART_PAD} y={CHART_H - CHART_PAD - ((100 - 70) / 100) * (CHART_H - CHART_PAD * 2)} width={CHART_W - CHART_PAD * 2} height={((100 - 70) / 100) * (CHART_H - CHART_PAD * 2)} fill={T.red} fillOpacity={0.06} />
        {/* Oversold zone (0-30) */}
        <rect x={CHART_PAD} y={CHART_H - CHART_PAD - ((30 - 0) / 100) * (CHART_H - CHART_PAD * 2)} width={CHART_W - CHART_PAD * 2} height={((30 - 0) / 100) * (CHART_H - CHART_PAD * 2)} fill={T.green} fillOpacity={0.06} />
        {/* Extreme oversold zone (0-27) */}
        <rect x={CHART_PAD} y={CHART_H - CHART_PAD - ((27 - 0) / 100) * (CHART_H - CHART_PAD * 2)} width={CHART_W - CHART_PAD * 2} height={((27 - 0) / 100) * (CHART_H - CHART_PAD * 2)} fill={T.green} fillOpacity={0.08} />
        {/* Horizontal lines at 27, 30, 50, 70 */}
        {svgHLine(70, minV, maxV, T.red, "3,3")}
        {svgHLine(50, minV, maxV, T.textMuted, "2,4")}
        {svgHLine(30, minV, maxV, T.green, "3,3")}
        {svgHLine(27, minV, maxV, T.green, "2,2")}
        {/* RSI line */}
        {svgPolyline(data, minV, maxV, rsiColor, 1)}
        {svgArea(data, minV, maxV, rsiColor, 0.05)}
        {/* Current value dot */}
        {(() => {
          const range = maxV - minV || 1;
          const cx = CHART_W - CHART_PAD;
          const cy = CHART_H - CHART_PAD - ((lastRsi - minV) / range) * (CHART_H - CHART_PAD * 2);
          return <circle cx={cx} cy={cy} r={3} fill={rsiColor} />;
        })()}
        {/* Hover overlay */}
        {svgHoverOverlay(hoverX, hoverY, hoverValue, hoverRsiColor, T, 1)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: EP_FONT }}>
        <span style={{ fontSize: 7, color: T.green, letterSpacing: 0.5 }}>OVERSOLD &lt;30{rsiExtremeOS ? " ⚡" : ""}</span>
        <span style={{ fontSize: 10, color: rsiColor, fontWeight: 800, fontFamily: EP_FONT, textShadow: `0 0 8px ${rsiColor}${rsiExtremeOS ? "88" : "44"}`, ...(rsiExtremeOS ? { animation: "rsi-chart-alert 0.8s infinite" } : {}) }}>{lastRsi.toFixed(1)}</span>
        <span style={{ fontSize: 7, color: T.red, letterSpacing: 0.5 }}>OVERBOUGHT &gt;70</span>
      </div>
    </Panel>
  );
}

// ─── MACD Chart Panel ───────────────────────────────────────────────────────

function MACDChartPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const [tf, setTf] = useState<Timeframe>("5m");
  // Use multi-timeframe data if available, otherwise fall back to legacy 1H history
  const mtf = state.ohlcvMtf?.[tf];
  const macdLine = mtf?.macdLine?.length ? mtf.macdLine : state.macdLineHistory ?? [];
  const signalLine = mtf?.macdSignal?.length ? mtf.macdSignal : state.macdSignalHistory ?? [];
  const histogram = mtf?.macdHist?.length ? mtf.macdHist : state.macdHistHistory ?? [];

  // Find range across all series
  const allVals = [...macdLine, ...signalLine, ...histogram];
  let minV = Math.min(...allVals, 0);
  let maxV = Math.max(...allVals, 0);
  const padding = (maxV - minV) * 0.1 || 1;
  minV -= padding;
  maxV += padding;

  const { hoverIdx, hoverX, hoverY, hoverValue, onMove, onLeave } = useChartHover(macdLine, minV, maxV);

  if (macdLine.length < 2) return <Panel title="MACD Chart">{waiting(T)}</Panel>;

  const step = (CHART_W - CHART_PAD * 2) / (histogram.length - 1 || 1);
  const barW = Math.max(1, step * 0.6);
  const tfLabel = mtf?.macdLine?.length ? tf.toUpperCase() : "1H";

  return (
    <Panel title={`MACD (12,26,9) ${tfLabel}`} accent={T.cyan}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: T.textDim, letterSpacing: 0.5 }}>MOVING AVERAGE CONVERGENCE</span>
        <TimeframeToggle value={tf} onChange={setTf} accent={T.cyan} />
      </div>
      <svg width="100%" height={CHART_H + 15} viewBox={`0 0 ${CHART_W} ${CHART_H + 15}`} preserveAspectRatio="none" style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={onLeave}>
        {/* Zero line */}
        {svgHLine(0, minV, maxV, T.textMuted, "2,3")}
        {/* Histogram bars */}
        {histogram.map((v, i) => {
          const range = maxV - minV || 1;
          const x = CHART_PAD + i * step - barW / 2;
          const zeroY = CHART_H - CHART_PAD - ((0 - minV) / range) * (CHART_H - CHART_PAD * 2);
          const valY = CHART_H - CHART_PAD - ((v - minV) / range) * (CHART_H - CHART_PAD * 2);
          const h = Math.abs(zeroY - valY);
          const y = Math.min(zeroY, valY);
          return <rect key={i} x={x} y={y} width={barW} height={h} fill={v >= 0 ? T.green : T.red} fillOpacity={0.5} />;
        })}
        {/* MACD line */}
        {svgPolyline(macdLine, minV, maxV, T.cyan, 1.5)}
        {/* Signal line */}
        {signalLine.length >= 2 && svgPolyline(signalLine, minV, maxV, T.orange, 1.2)}
        {/* Latest dot on MACD line */}
        {(() => {
          const range = maxV - minV || 1;
          const lastMacd = macdLine[macdLine.length - 1];
          const cx = CHART_W - CHART_PAD;
          const cy = CHART_H - CHART_PAD - ((lastMacd - minV) / range) * (CHART_H - CHART_PAD * 2);
          return <circle cx={cx} cy={cy} r={2.5} fill={T.cyan} />;
        })()}
        {/* Hover overlay — shows MACD line value */}
        {svgHoverOverlay(hoverX, hoverY, hoverValue, T.cyan, T, 2)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: EP_FONT }}>
        <span style={{ fontSize: 7, color: T.cyan, letterSpacing: 0.5 }}>MACD: {macdLine[macdLine.length - 1]?.toFixed(1)}</span>
        <span style={{ fontSize: 7, color: T.orange, letterSpacing: 0.5 }}>SIG: {signalLine[signalLine.length - 1]?.toFixed(1)}</span>
        <span style={{ fontSize: 7, color: histogram[histogram.length - 1] >= 0 ? T.green : T.red, letterSpacing: 0.5 }}>HIST: {histogram[histogram.length - 1]?.toFixed(2)}</span>
      </div>
    </Panel>
  );
}

// ─── HURST (Hurst Cycle Channel Clone) Chart Panel ────────────────────────

function HurstPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const [tf, setTf] = useState<Timeframe>("5m");
  const [hoverIdx, setHoverIdx] = useState(-1);
  const mtf = state.ohlcvMtf?.[tf];
  const fastData = mtf?.hcccoFast?.length ? mtf.hcccoFast : [];
  const fastLatest = mtf?.hcccoFastLatest ?? 0.5;

  const HH = 210;
  const minV = -0.5;  // extended range to prevent clipping extreme OS values
  const maxV = 1.5;   // extended range to prevent clipping extreme OB values
  const range = maxV - minV;
  const step = fastData.length > 1 ? (CHART_W - CHART_PAD * 2) / (fastData.length - 1) : 1;
  const len = fastData.length;

  // Hover handlers — must be before any early return (Rules of Hooks)
  const onSvgMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = CHART_W / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const idx = Math.round((mx - CHART_PAD) / step);
    if (idx >= 0 && idx < len) setHoverIdx(idx);
    else setHoverIdx(-1);
  }, [len, step]);
  const onSvgLeave = useCallback(() => setHoverIdx(-1), []);

  if (fastData.length < 2) return <Panel title="HURST">{waiting(T)}</Panel>;

  const tfLabel = mtf?.hcccoFast?.length ? tf.toUpperCase() : "5M";

  // Regime: overbought > 1, oversold < 0, trending up > 0.5, trending down < 0.5
  const isOB = fastLatest > 1.0;
  const isOS = fastLatest < 0.0;
  const regimeLabel = isOB ? "OVERBOUGHT" : isOS ? "BUY SIGNAL" : fastLatest > 0.5 ? "BULLISH" : "BEARISH";
  const regimeColor = isOB ? T.purple : isOS ? T.green : fastLatest > 0.5 ? T.green : T.red;
  const accentColor = isOB ? T.purple : isOS ? T.green : fastLatest > 0.5 ? T.green : T.red;

  // Trigger: Hurst cross detection for current timeframe
  const hurstTrigBuy = mtf?.hurstCrossUp ?? false;
  const hurstTrigSell = mtf?.hurstCrossDown ?? false;
  const hurstTrigger = hurstTrigBuy || hurstTrigSell;

  // Y-coordinate helper
  const yOf = (v: number) => HH - CHART_PAD - ((v - minV) / range) * (HH - CHART_PAD * 2);

  const hoverX = hoverIdx >= 0 ? CHART_PAD + hoverIdx * step : -1;
  const hoverY = hoverIdx >= 0 ? yOf(fastData[hoverIdx]) : -1;
  const hoverValue = hoverIdx >= 0 ? fastData[hoverIdx] : null;

  return (
    <Panel title={`HURST ${tfLabel}`} accent={accentColor} style={isOS ? { animation: "hurst-alert 0.8s infinite", borderColor: T.green } : isOB ? { animation: "hurst-alert 0.8s infinite", borderColor: T.purple } : undefined}>
      {/* Blinking animation keyframes */}
      <style>{`
        @keyframes hurst-alert {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: T.textDim, letterSpacing: 0.5 }}>HURST CYCLE CHANNEL</span>
        <TimeframeToggle value={tf} onChange={setTf} accent={accentColor} />
      </div>

      {/* Latest oscillator values + regime badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "3px 6px", background: T.panelAlt, borderRadius: 2, border: `1px solid ${accentColor}33` }}>
        <div>
          <span style={{ fontSize: 22, fontWeight: 800, color: T.red, fontFamily: EP_FONT, textShadow: `0 0 8px ${T.red}44` }}>{fastLatest.toFixed(3)}</span>
          {isOS && <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 900, color: T.green, fontFamily: EP_FONT, letterSpacing: 2, textShadow: `0 0 12px ${T.green}`, animation: "hurst-alert 0.8s infinite" }}>BUY ⚡</span>}
          {isOB && <span style={{ marginLeft: 8, fontSize: 14, fontWeight: 900, color: T.purple, fontFamily: EP_FONT, letterSpacing: 2, textShadow: `0 0 12px ${T.purple}`, animation: "hurst-alert 0.8s infinite" }}>OVERBOUGHT</span>}
          {hurstTrigger && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 900, color: hurstTrigBuy ? T.green : T.red, fontFamily: EP_FONT, letterSpacing: 1, textShadow: `0 0 10px ${hurstTrigBuy ? T.green : T.red}`, animation: "hurst-alert 0.6s infinite" }}>TRIGGER {hurstTrigBuy ? "▲BUY" : "▼SHORT"}</span>}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: regimeColor, fontFamily: EP_FONT, letterSpacing: 1, padding: "3px 6px", background: regimeColor + "22", border: `1px solid ${regimeColor}44`, borderRadius: 2 }}>
          {regimeLabel}
        </span>
      </div>

      <svg width="100%" height={HH + 20} viewBox={`0 0 ${CHART_W} ${HH + 20}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }} onMouseMove={onSvgMove} onMouseLeave={onSvgLeave}>
        {/* Reference zones: green fill 0.5-1.0, red fill 0-0.5 */}
        {(() => {
          const yUpper = yOf(1.0);
          const yMid = yOf(0.5);
          const yLower = yOf(0.0);
          return (
            <g>
              {/* Green zone: 0.5 → 1.0 */}
              <rect x={CHART_PAD} y={yUpper} width={CHART_W - CHART_PAD * 2} height={yMid - yUpper} fill={T.green} fillOpacity={0.04} />
              {/* Red zone: 0.0 → 0.5 */}
              <rect x={CHART_PAD} y={yMid} width={CHART_W - CHART_PAD * 2} height={yLower - yMid} fill={T.red} fillOpacity={0.04} />
              {/* OB zone above 1.0 */}
              <rect x={CHART_PAD} y={CHART_PAD} width={CHART_W - CHART_PAD * 2} height={yUpper - CHART_PAD} fill={T.red} fillOpacity={0.06} />
              {/* OS zone below 0.0 — green as buy signal */}
              <rect x={CHART_PAD} y={yLower} width={CHART_W - CHART_PAD * 2} height={HH - CHART_PAD - yLower} fill={T.green} fillOpacity={0.06} />

              {/* Reference line: 1.0 (upper) */}
              <line x1={CHART_PAD} y1={yUpper} x2={CHART_W - CHART_PAD} y2={yUpper} stroke={T.textMuted} strokeWidth={0.5} strokeDasharray="4,3" />
              {/* Reference line: 0.5 (mid) */}
              <line x1={CHART_PAD} y1={yMid} x2={CHART_W - CHART_PAD} y2={yMid} stroke={T.textMuted} strokeWidth={0.4} strokeDasharray="2,3" />
              {/* Reference line: 0.0 (lower) */}
              <line x1={CHART_PAD} y1={yLower} x2={CHART_W - CHART_PAD} y2={yLower} stroke={T.textMuted} strokeWidth={0.5} strokeDasharray="4,3" />

              {/* Labels */}
              <text x={CHART_W - CHART_PAD - 22} y={CHART_PAD + 9} fill={T.textDim} fontSize={7} fontFamily={EP_FONT}>{maxV.toFixed(1)}</text>
              <text x={CHART_W - CHART_PAD - 22} y={yUpper - 2} fill={T.textMuted} fontSize={9} fontFamily={EP_FONT}>1.00</text>
              <text x={CHART_W - CHART_PAD - 22} y={yMid - 2} fill={T.textDim} fontSize={8} fontFamily={EP_FONT}>0.50</text>
              <text x={CHART_W - CHART_PAD - 22} y={yLower - 2} fill={T.textMuted} fontSize={9} fontFamily={EP_FONT}>0.00</text>
              <text x={CHART_W - CHART_PAD - 22} y={HH - CHART_PAD + 1} fill={T.textDim} fontSize={7} fontFamily={EP_FONT}>{minV.toFixed(1)}</text>
            </g>
          );
        })()}

        {/* OB/OS histogram bars */}
        {(() => {
          const bars: JSX.Element[] = [];
          for (let i = 0; i < len; i++) {
            const v = fastData[i];
            const x = CHART_PAD + i * step;
            if (v >= 1.0) {
              const y1 = yOf(v);
              const y2 = yOf(1.0);
              bars.push(<rect key={`ob${i}`} x={x - step * 0.3} y={y1} width={step * 0.6} height={y2 - y1} fill={T.red} fillOpacity={0.4} />);
            } else if (v <= 0.0) {
              const y1 = yOf(0.0);
              const y2 = yOf(v);
              bars.push(<rect key={`os${i}`} x={x - step * 0.3} y={y1} width={step * 0.6} height={y2 - y1} fill={T.green} fillOpacity={0.4} />);
            }
          }
          return <g>{bars}</g>;
        })()}

        {/* FastOsc line (red) */}
        {svgPolyline(fastData, minV, maxV, T.red, 1.0, HH + 20)}

        {/* Latest dots */}
        {(() => {
          const cx = CHART_PAD + (len - 1) * step;
          return (
            <g>
              <circle cx={cx} cy={yOf(fastData[len - 1])} r={4} fill={T.red} fillOpacity={0.2} />
              <circle cx={cx} cy={yOf(fastData[len - 1])} r={2} fill={T.red} stroke={T.bg} strokeWidth={0.5} />
            </g>
          );
        })()}

        {/* Hover crosshair + dot + value */}
        {hoverIdx >= 0 && hoverValue !== null && (
          <g style={{ pointerEvents: "none" }}>
            <line x1={hoverX} y1={CHART_PAD} x2={hoverX} y2={HH - CHART_PAD} stroke={T.textMuted} strokeWidth={0.4} strokeDasharray="2,2" />
            <line x1={CHART_PAD} y1={hoverY} x2={CHART_W - CHART_PAD} y2={hoverY} stroke={T.textMuted} strokeWidth={0.4} strokeDasharray="2,2" />
            <circle cx={hoverX} cy={hoverY} r={5} fill={T.red} fillOpacity={0.15} />
            <circle cx={hoverX} cy={hoverY} r={2.5} fill={T.red} stroke={T.bg} strokeWidth={0.8} />
            <rect x={hoverX + 4} y={hoverY - 7} width={38} height={10} rx={1.5} fill={T.bg} fillOpacity={0.9} stroke={T.red} strokeWidth={0.4} />
            <text x={hoverX + 6} y={hoverY - 0.5} fill={T.red} fontSize={6.5} fontFamily={EP_FONT} fontWeight={700}>{hoverValue.toFixed(3)}</text>
          </g>
        )}
      </svg>

      {/* Bottom labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: EP_FONT }}>
        <span style={{ fontSize: 10, color: T.red, letterSpacing: 0.5 }}>OB &gt;1.0</span>
        <span style={{ fontSize: 10, color: T.red, letterSpacing: 0.5 }}>FAST OSC</span>
        <span style={{ fontSize: 10, color: T.green, letterSpacing: 0.5 }}>BUY &lt;0.0</span>
      </div>
    </Panel>
  );
}

// ─── Trigger Signals Panel ────────────────────────────────────────────────

function TriggerPanel({ state }: { state: BotState }) {
  const T = useTheme();
  // Scan all timeframes for active triggers — prioritize 15m as primary
  const priorityTf = "15m";
  const allTfs = Object.keys(state.ohlcvMtf || {}).sort((a, b) => {
    if (a === priorityTf) return -1;
    if (b === priorityTf) return 1;
    return a.localeCompare(b);
  });

  // ── DCA STRATEGY: Entry and exit signals ──
  // LONG: E1=BB<lower | E2=Hurst↑0.0 (2x) | E3=Hurst↑0.0 (4x) | Exit=Hurst↓1.0
  // SHORT: E1=BB>upper | E2=Hurst↓1.0 (2x) | E3=Hurst↓1.0 (4x) | Exit=Hurst↑0.0
  const entrySignals: { tf: string; direction: "BUY" | "SHORT"; type: string }[] = [];
  const pendingTriggers: { tf: string; type: string; direction: "BUY" | "SHORT"; source: string; role: string }[] = [];

  for (const tf of allTfs) {
    const d = state.ohlcvMtf?.[tf];
    if (!d) continue;

    // DCA Entry 1 triggers (BB cross alone)
    if (d.bbCrossLower) entrySignals.push({ tf, direction: "BUY", type: "E1:BB<lower" });
    if (d.bbCrossUpper) entrySignals.push({ tf, direction: "SHORT", type: "E1:BB>upper" });

    // DCA Entry 2/3 triggers (Hurst cross alone — adds to existing position)
    if (d.hurstCrossUp) entrySignals.push({ tf, direction: "BUY", type: "E2/E3:Hurst↑0.0" });
    if (d.hurstCrossDown) entrySignals.push({ tf, direction: "SHORT", type: "E2/E3:Hurst↓1.0" });

    // Track all individual triggers
    if (d.bbCrossLower) pendingTriggers.push({ tf, type: "BB <LOWER", direction: "BUY", source: "BB", role: "E1" });
    if (d.bbCrossUpper) pendingTriggers.push({ tf, type: "BB >UPPER", direction: "SHORT", source: "BB", role: "E1" });
    if (d.hurstCrossUp) pendingTriggers.push({ tf, type: "HURST \u21910.0", direction: "BUY", source: "HURST", role: "E2/E3" });
    if (d.hurstCrossDown) pendingTriggers.push({ tf, type: "HURST \u21931.0", direction: "SHORT", source: "HURST", role: "E2/E3" });
  }

  const hasEntry = entrySignals.length > 0;
  const hasPending = pendingTriggers.length > 0;
  const hasAnyTrigger = hasEntry || hasPending;

  const entryBuyTfs = entrySignals.filter(s => s.direction === "BUY").map(s => s.tf);
  const entryShortTfs = entrySignals.filter(s => s.direction === "SHORT").map(s => s.tf);
  const hasBuyEntry = entryBuyTfs.length > 0;
  const hasShortEntry = entryShortTfs.length > 0;

  // Entry signal color and direction
  const entryDir = hasBuyEntry && hasShortEntry ? "MIXED" : hasBuyEntry ? "BUY" : hasShortEntry ? "SHORT" : "NONE";
  const entryColor = entryDir === "BUY" ? T.green : entryDir === "SHORT" ? T.red : entryDir === "MIXED" ? T.yellow : T.textDim;

  // Blink animations
  const blinkFast = "trigger-blink-fast";
  const blinkSlow = "trigger-blink-slow";

  // DCA group state from paper positions
  const openPositions = state.paperOpenPositions || [];
  const dcaLongs = openPositions.filter(p => p.side === "LONG" && p.dcaEntry);
  const dcaShorts = openPositions.filter(p => p.side === "SHORT" && p.dcaEntry);
  const hasDcaLong = dcaLongs.length > 0;
  const hasDcaShort = dcaShorts.length > 0;
  const dcaLongEntries = dcaLongs.map(p => p.dcaEntry || 0);
  const dcaShortEntries = dcaShorts.map(p => p.dcaEntry || 0);
  const dcaLongTotalUsd = dcaLongs.reduce((s, p) => s + p.sizeUsd, 0);
  const dcaShortTotalUsd = dcaShorts.reduce((s, p) => s + p.sizeUsd, 0);

  return (
    <Panel
      title="DCA ENTRY SIGNALS"
      accent={hasEntry ? entryColor : hasPending ? T.yellow : undefined}
      style={hasEntry ? { animation: `${blinkFast} 0.5s infinite`, borderColor: entryColor } : undefined}
    >
      <style>{`
        @keyframes ${blinkFast} {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes ${blinkSlow} {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* ═══ ACTIVE DCA GROUP STATUS ═══ */}
      {(hasDcaLong || hasDcaShort) && (
        <div style={{
          marginBottom: 6, padding: "5px 8px",
          background: (hasDcaLong ? T.green : T.red) + "10",
          borderRadius: 3, border: `1px solid ${(hasDcaLong ? T.green : T.red)}44`,
        }}>
          <div style={{ fontSize: 7, color: hasDcaLong ? T.green : T.red, fontFamily: EP_FONT, fontWeight: 700, letterSpacing: 1 }}>
            DCA GROUP ACTIVE — {hasDcaLong ? "LONG" : "SHORT"}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
            {(hasDcaLong ? dcaLongs : dcaShorts).map((p, i) => (
              <div key={i} style={{
                padding: "2px 5px", background: T.panel, borderRadius: 2,
                border: `1px solid ${p.dcaEntry === 1 ? T.green : p.dcaEntry === 2 ? T.orange : T.purple}44`,
              }}>
                <div style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>E{p.dcaEntry}</div>
                <div style={{ fontSize: 8, fontWeight: 700, color: p.dcaEntry === 1 ? T.green : p.dcaEntry === 2 ? T.orange : T.purple, fontFamily: EP_FONT }}>
                  {p.dcaMult}x ${p.sizeUsd.toFixed(0)}
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT, marginTop: 2 }}>
            Total: ${(hasDcaLong ? dcaLongTotalUsd : dcaShortTotalUsd).toFixed(0)} | Next: {hasDcaLong ? (dcaLongEntries.length < 3 ? `E${dcaLongEntries.length+1} Hurst\u21910.0 (${[1,2,4][dcaLongEntries.length]}x)` : "EXIT Hurst\u21931.0") : (dcaShortEntries.length < 3 ? `E${dcaShortEntries.length+1} Hurst\u21931.0 (${[1,2,4][dcaShortEntries.length]}x)` : "EXIT Hurst\u21910.0")}
          </div>
        </div>
      )}

      {/* ═══ ENTRY SIGNAL — DCA LOGIC ═══ */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 6, padding: "5px 8px",
        background: hasEntry ? entryColor + "18" : T.panelAlt,
        borderRadius: 3,
        border: `2px solid ${hasEntry ? entryColor : T.border}`,
        ...(hasEntry ? { animation: `${blinkFast} 0.5s infinite` } : {}),
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            fontSize: 18, fontWeight: 900, fontFamily: EP_FONT,
            color: hasEntry ? entryColor : T.textMuted,
            textShadow: hasEntry ? `0 0 16px ${entryColor}88` : "none",
            ...(hasEntry ? { animation: `${blinkFast} 0.5s infinite` } : {}),
          }}>
            {hasEntry
              ? (entryDir === "BUY" ? "\u25B2 BUY TRIGGER" : entryDir === "SHORT" ? "\u25BC SHORT TRIGGER" : "\u26A1 MIXED TRIGGER")
              : "SCANNING..."}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: T.cyan, fontFamily: EP_FONT, padding: "2px 5px", background: T.cyan + "15", borderRadius: 2, border: `1px solid ${T.cyan}44` }}>
            DCA
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, color: T.textDim, fontFamily: EP_FONT, padding: "2px 6px", background: T.panel, borderRadius: 2, border: `1px solid ${T.border}` }}>
            15M \u2605
          </span>
        </div>
      </div>

      {/* Entry signal details — which TFs have triggers */}
      {hasEntry && (
        <div style={{ marginBottom: 6, display: "flex", gap: 3, flexWrap: "wrap" }}>
          {entrySignals.map((s, i) => (
            <div key={i} style={{
              padding: "3px 7px",
              background: (s.direction === "BUY" ? T.green : T.red) + "18",
              border: `1px solid ${s.direction === "BUY" ? T.green : T.red}55`,
              borderRadius: 2, fontFamily: EP_FONT,
              animation: `${blinkFast} 0.5s infinite`,
            }}>
              <span style={{ fontSize: 8, fontWeight: 900, color: s.direction === "BUY" ? T.green : T.red }}>
                {s.direction === "BUY" ? "\u25B2" : "\u25BC"} {s.type}
              </span>
              <span style={{ fontSize: 7, color: T.textDim, marginLeft: 4 }}>{s.tf.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ DCA STRATEGY RULES ═══ */}
      <div style={{ marginBottom: 6, padding: "4px 6px", background: T.panel, borderRadius: 2, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 7, color: T.cyan, fontWeight: 700, letterSpacing: 0.5, fontFamily: EP_FONT, marginBottom: 3 }}>
          DCA STRATEGY — 3 LEVELS
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <div style={{ flex: 1, padding: "2px 5px", background: T.green + "0A", border: `1px solid ${T.green}22`, borderRadius: 2 }}>
            <div style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT, fontWeight: 700 }}>\u25B2 LONG</div>
            <div style={{ fontSize: 5.5, color: T.textDim, fontFamily: EP_FONT, lineHeight: 1.4 }}>
              E1:BB&lt;Lower 1x<br/>
              E2:Hurst\u21910.0 2x<br/>
              E3:Hurst\u21910.0 4x<br/>
              EXIT:Hurst\u21931.0
            </div>
          </div>
          <div style={{ flex: 1, padding: "2px 5px", background: T.red + "0A", border: `1px solid ${T.red}22`, borderRadius: 2 }}>
            <div style={{ fontSize: 7, color: T.red, fontFamily: EP_FONT, fontWeight: 700 }}>\u25BC SHORT</div>
            <div style={{ fontSize: 5.5, color: T.textDim, fontFamily: EP_FONT, lineHeight: 1.4 }}>
              E1:BB&gt;Upper 1x<br/>
              E2:Hurst\u21931.0 2x<br/>
              E3:Hurst\u21931.0 4x<br/>
              EXIT:Hurst\u21910.0
            </div>
          </div>
        </div>
      </div>

      {/* ═══ INDIVIDUAL TRIGGERS (pending confirmations) ═══ */}
      <div style={{ borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
      <div style={{ fontSize: 7, color: T.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 3, fontFamily: EP_FONT }}>
        INDIVIDUAL TRIGGERS {hasPending ? `(${pendingTriggers.length})` : ""}
      </div>
      {!hasPending ? (
        <div style={{ fontSize: 8, color: T.textDim, fontFamily: EP_FONT, textAlign: "center", padding: "6px 0" }}>NO CROSS DETECTED \u2014 MONITORING</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 100, overflowY: "auto" }}>
          {pendingTriggers.map((t, i) => {
            const trigColor = t.direction === "BUY" ? T.green : T.red;
            return (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "2px 6px",
                background: trigColor + "10",
                borderLeft: `2px solid ${trigColor}`,
                borderRadius: 1, fontFamily: EP_FONT,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 7, fontWeight: 800, color: trigColor }}>
                    {t.direction === "BUY" ? "\u25B2" : "\u25BC"} {t.direction}
                  </span>
                  <span style={{ fontSize: 7, color: T.textMuted }}>{t.type}</span>
                  <span style={{ fontSize: 6, fontWeight: 700, color: t.role === "E1" ? T.cyan : T.orange, padding: "0px 3px", background: (t.role === "E1" ? T.cyan : T.orange) + "22", borderRadius: 1 }}>{t.role}</span>
                </div>
                <span style={{ fontSize: 7, color: T.textDim, fontWeight: 700, padding: "1px 4px", background: T.panel, borderRadius: 1, border: `1px solid ${T.border}` }}>{t.tf.toUpperCase()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ TF MATRIX — shows triggers per TF ═══ */}
      {allTfs.length > 0 && (
        <>
          <div style={{ borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
          <div style={{ fontSize: 7, color: T.textMuted, fontWeight: 700, letterSpacing: 1, marginBottom: 3, fontFamily: EP_FONT }}>TF MATRIX (DCA)</div>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
            {allTfs.map(tf => {
              const d = state.ohlcvMtf?.[tf];
              const hasBBLow = d?.bbCrossLower ?? false;
              const hasBBUp = d?.bbCrossUpper ?? false;
              const hasHurstUp = d?.hurstCrossUp ?? false;
              const hasHurstDown = d?.hurstCrossDown ?? false;
              const anyBuy = hasBBLow || hasHurstUp;
              const anyShort = hasBBUp || hasHurstDown;
              const anyTrigger = anyBuy || anyShort;
              const dotColor = anyBuy ? T.green : anyShort ? T.red : T.textDim;
              const isPriority = tf === priorityTf;
              return (
                <div key={tf} style={{
                  display: "flex", alignItems: "center", gap: 2,
                  padding: "2px 5px",
                  background: anyTrigger ? dotColor + "15" : T.panel,
                  border: `1px solid ${anyTrigger ? dotColor + "44" : T.border}`,
                  borderRadius: 2, fontFamily: EP_FONT,
                  ...(anyTrigger ? { animation: `${blinkSlow} 1.2s infinite` } : {}),
                }}>
                  <span style={{
                    width: anyTrigger ? 7 : 5, height: anyTrigger ? 7 : 5, borderRadius: "50%",
                    background: dotColor,
                    boxShadow: anyTrigger ? `0 0 6px ${dotColor}` : "none",
                  }} />
                  <span style={{ fontSize: 7, fontWeight: anyTrigger ? 900 : 500, color: anyTrigger ? dotColor : T.textDim }}>
                    {tf.toUpperCase()}{isPriority ? "\u2605" : ""}
                  </span>
                  {anyTrigger && (
                    <span style={{ fontSize: 5, fontWeight: 900, color: dotColor }}>
                      {anyBuy ? "\u25B2" : "\u25BC"}{hasBBLow ? "E1" : ""}{hasHurstUp ? "E2+" : ""}{hasBBUp ? "E1" : ""}{hasHurstDown ? "E2+" : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 8, marginTop: 3, justifyContent: "center" }}>
            <span style={{ fontSize: 5.5, color: T.green, fontFamily: EP_FONT }}>\u25CF BUY TRIGGER</span>
            <span style={{ fontSize: 5.5, color: T.red, fontFamily: EP_FONT }}>\u25CF SHORT TRIGGER</span>
            <span style={{ fontSize: 5.5, color: T.textDim, fontFamily: EP_FONT }}>\u25CB NO TRIGGER</span>
          </div>
        </>
      )}
    </Panel>
  );
}

// ─── Bollinger Bands Chart Panel ────────────────────────────────────────────

function BBChartPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const [tf, setTf] = useState<Timeframe>("5m");
  // Use multi-timeframe data if available, otherwise fall back to legacy 1H history
  const mtf = state.ohlcvMtf?.[tf];
  const upper = mtf?.bbUpper?.length ? mtf.bbUpper : state.bbUpperHistory ?? [];
  const middle = mtf?.bbMiddle?.length ? mtf.bbMiddle : state.bbMiddleHistory ?? [];
  const lower = mtf?.bbLower?.length ? mtf.bbLower : state.bbLowerHistory ?? [];
  const prices = mtf?.price?.length ? mtf.price : state.priceHistory ?? [];

  // Align lengths — use the shortest series
  const len = Math.min(upper.length, middle.length, lower.length, prices.length);
  const u = upper.slice(-len);
  const m = middle.slice(-len);
  const l = lower.slice(-len);
  const p = prices.slice(-len);

  const allVals = [...u, ...m, ...l, ...p];
  let minV = Math.min(...allVals);
  let maxV = Math.max(...allVals);
  const pad = (maxV - minV) * 0.08 || 1;
  minV -= pad;
  maxV += pad;

  const { hoverIdx, hoverX, hoverY, hoverValue, onMove, onLeave } = useChartHover(p, minV, maxV);

  if (upper.length < 2 || prices.length < 2) return <Panel title="Bollinger Bands Chart">{waiting(T)}</Panel>;

  const step = (CHART_W - CHART_PAD * 2) / (len - 1);

  // Fill area between upper and lower bands
  const bandFill = (() => {
    const range = maxV - minV || 1;
    const topPts = u.map((v, i) =>
      `${CHART_PAD + i * step},${CHART_H - CHART_PAD - ((v - minV) / range) * (CHART_H - CHART_PAD * 2)}`
    ).join(" ");
    const bottomPts = l.map((v, i) =>
      `${CHART_PAD + (len - 1 - i) * step},${CHART_H - CHART_PAD - ((l[len - 1 - i] - minV) / range) * (CHART_H - CHART_PAD * 2)}`
    ).join(" ");
    return <polygon fill={T.cyan} fillOpacity={0.07} points={`${topPts} ${bottomPts}`} />;
  })();

  const lastPrice = p[p.length - 1];
  const bbPos = (u[u.length - 1] - l[l.length - 1]) > 0
    ? ((lastPrice - l[l.length - 1]) / (u[u.length - 1] - l[l.length - 1])) * 100
    : 50;
  const priceColor = bbPos > 90 ? T.red : bbPos < 10 ? T.green : T.text;
  const tfLabel = mtf?.bbUpper?.length ? tf.toUpperCase() : "1H";

  // Trigger: BB breach detection for current timeframe
  const bbTrigBuy = mtf?.bbCrossLower ?? false;
  const bbTrigSell = mtf?.bbCrossUpper ?? false;
  const bbTrigger = bbTrigBuy || bbTrigSell;
  const trigColor = bbTrigBuy ? T.green : T.red;

  return (
    <Panel title={`Bollinger Bands (20) ${tfLabel}`} accent={bbTrigger ? trigColor : T.purple} style={bbTrigger ? { animation: "bb-trigger 0.8s infinite", borderColor: trigColor } : undefined}>
      {bbTrigger && (
        <style>{`
          @keyframes bb-trigger {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: T.textDim, letterSpacing: 0.5 }}>BOLLINGER BANDS</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {bbTrigger && <span style={{ fontSize: 9, fontWeight: 900, color: trigColor, fontFamily: EP_FONT, letterSpacing: 1, textShadow: `0 0 10px ${trigColor}`, animation: "bb-trigger 0.6s infinite" }}>TRIGGER {bbTrigBuy ? "▲BUY" : "▼SHORT"}</span>}
          <TimeframeToggle value={tf} onChange={setTf} accent={bbTrigger ? trigColor : T.purple} />
        </div>
      </div>
      <svg width="100%" height={CHART_H} viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={onLeave}>
        {/* Band fill area */}
        {bandFill}
        {/* Upper band */}
        {svgPolyline(u, minV, maxV, T.red, 1)}
        {/* Middle band (SMA) */}
        {svgPolyline(m, minV, maxV, T.textDim, 0.8)}
        {/* Lower band */}
        {svgPolyline(l, minV, maxV, T.green, 1)}
        {/* Price line */}
        {svgPolyline(p, minV, maxV, priceColor, 1)}
        {svgArea(p, minV, maxV, priceColor, 0.04)}
        {/* Current price dot */}
        {(() => {
          const range = maxV - minV || 1;
          const cx = CHART_W - CHART_PAD;
          const cy = CHART_H - CHART_PAD - ((lastPrice - minV) / range) * (CHART_H - CHART_PAD * 2);
          return <circle cx={cx} cy={cy} r={3} fill={priceColor} />;
        })()}
        {/* Hover overlay — shows price value */}
        {svgHoverOverlay(hoverX, hoverY, hoverValue, priceColor, T, 1)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontFamily: EP_FONT }}>
        <span style={{ fontSize: 7, color: T.red, letterSpacing: 0.5 }}>UPR: {fmtUsd(u[u.length - 1], 0)}</span>
        <span style={{ fontSize: 8, color: priceColor, fontWeight: 700, textShadow: `0 0 6px ${priceColor}44` }}>PX: {fmtUsd(lastPrice, 0)}</span>
        <span style={{ fontSize: 7, color: T.green, letterSpacing: 0.5 }}>LWR: {fmtUsd(l[l.length - 1], 0)}</span>
      </div>
    </Panel>
  );
}

function VolatilityPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const volColor = state.volatilityRegime === "HIGH" ? T.red : state.volatilityRegime === "LOW" ? T.green : T.yellow;
  return (
    <Panel title="Volatility" accent={volColor}>
      <div style={{ textAlign: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: volColor, letterSpacing: 3, fontFamily: EP_FONT, textShadow: `0 0 8px ${volColor}44` }}>{state.volatilityRegime}</span>
      </div>
      <StatRow label="ATR%" value={state.volatilityPct != null ? (state.volatilityPct * 100).toFixed(3) + "%" : "—"} />
      <StatRow label="Multiplier" value={state.volatilityMultiplier != null ? "×" + state.volatilityMultiplier.toFixed(1) : "—"} />
    </Panel>
  );
}

function PerpPremiumPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const ppColor = state.perpPremiumPct != null
    ? (state.perpPremiumPct > 0 ? T.red : state.perpPremiumPct < -0.05 ? T.green : T.text)
    : T.textDim;
  const mrColor = state.meanReversionSignal === "OVERBOUGHT" ? T.red : state.meanReversionSignal === "OVERSOLD" ? T.green : T.textDim;
  return (
    <Panel title="Perp Premium / Mean Rev." accent={ppColor}>
      <StatRow label="Perp Premium" value={state.perpPremiumPct != null ? fmtPct(state.perpPremiumPct) : "—"} color={ppColor} />
      <StatRow label="Label" value={state.perpPremiumLabel} color={ppColor} />
      <div style={{ borderTop: `1px solid ${T.border}`, margin: "4px 0" }} />
      <StatRow label="Z-Score" value={state.priceZscore != null ? state.priceZscore.toFixed(2) + "σ" : "—"} color={mrColor} />
      <StatRow label="Signal" value={state.meanReversionSignal} color={mrColor} />
    </Panel>
  );
}

function SentimentGaugePanel({ state }: { state: BotState }) {
  const T = useTheme();
  const score = state.sentimentScore ?? 0;
  const R2 = (n: number) => Math.round(n * 100) / 100; // round to 2dp — prevents hydration mismatch
  // Normalize score (-100..+100) → angle (0°=left/bearish, 180°=right/bullish)
  const angle = ((score + 100) / 200) * 180;
  const scoreColor = score > 20 ? T.green : score < -20 ? T.red : T.yellow;

  // Arc parameters
  const cx = 100, cy = 80, r = 65;
  const arcStart = { x: cx - r, y: cy };
  const arcEnd = { x: cx + r, y: cy };

  // Build SVG arc path (semicircle from left to right)
  const arcPath = `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;

  // Needle endpoint — angle in radians (π = left, 0 = right)
  const needleAngleRad = (Math.PI * (1 - (score + 100) / 200));
  const needleLen = r - 8;
  const needleX = R2(cx + needleLen * Math.cos(needleAngleRad));
  const needleY = R2(cy - needleLen * Math.sin(needleAngleRad));

  // Colored arc segment (from left to needle position)
  const coloredArcEnd = {
    x: R2(cx + r * Math.cos(needleAngleRad)),
    y: R2(cy - r * Math.sin(needleAngleRad)),
  };
  const coloredArcLarge = angle > 180 ? 1 : 0;
  const coloredArcPath = `M ${arcStart.x} ${arcStart.y} A ${r} ${r} 0 ${coloredArcLarge} 1 ${coloredArcEnd.x} ${coloredArcEnd.y}`;

  // Tick marks
  const ticks = [-100, -50, 0, 50, 100];
  const tickMarks = ticks.map(t => {
    const a = (Math.PI * (1 - (t + 100) / 200));
    const inner = r - 6;
    const outer = r + 3;
    return {
      x1: R2(cx + inner * Math.cos(a)), y1: R2(cy - inner * Math.sin(a)),
      x2: R2(cx + outer * Math.cos(a)), y2: R2(cy - outer * Math.sin(a)),
      lx: R2(cx + (r + 14) * Math.cos(a)), ly: R2(cy - (r + 14) * Math.sin(a)),
      label: t === 0 ? "0" : t > 0 ? `+${t}` : `${t}`,
    };
  });

  // Pre-compute arrowhead (avoids IIFE + hydration drift)
  const headLen = 8, headW = 4;
  const a = needleAngleRad;
  const tipX = R2(cx + (needleLen + headLen) * Math.cos(a));
  const tipY = R2(cy - (needleLen + headLen) * Math.sin(a));
  const perpX = Math.cos(a + Math.PI / 2);
  const perpY = -Math.sin(a + Math.PI / 2);
  const base1X = R2(needleX + perpX * headW);
  const base1Y = R2(needleY + perpY * headW);
  const base2X = R2(needleX - perpX * headW);
  const base2Y = R2(needleY - perpY * headW);

  return (
    <Panel title="Sentiment" accent={state.sentimentScore != null ? scoreColor : undefined}>
      {/* Gauge SVG */}
      <div style={{ textAlign: "center", marginBottom: 2 }}>
        <svg width="100%" height="95" viewBox="0 0 200 95" style={{ display: "block" }}>
          {/* Background arc */}
          <path d={arcPath} fill="none" stroke={T.border} strokeWidth={6} strokeLinecap="round" />

          {/* Colored arc segment */}
          {score !== 0 && (
            <path d={coloredArcPath} fill="none" stroke={scoreColor} strokeWidth={6} strokeLinecap="round" />
          )}

          {/* Tick marks */}
          {tickMarks.map((tk, i) => (
            <g key={i}>
              <line x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke={T.textDim} strokeWidth={0.8} />
              <text x={tk.lx} y={R2(tk.ly + 2)} fill={T.textDim} fontSize={6} fontFamily={EP_FONT} textAnchor="middle" fontWeight={600}>{tk.label}</text>
            </g>
          ))}

          {/* Needle — triangle arrow */}
          <g>
            <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={scoreColor} strokeWidth={2} strokeLinecap="round" />
            <polygon
              points={`${tipX},${tipY} ${base1X},${base1Y} ${base2X},${base2Y}`}
              fill={scoreColor}
            />
            <circle cx={cx} cy={cy} r={4} fill={T.bg} stroke={scoreColor} strokeWidth={1.5} />
            <circle cx={cx} cy={cy} r={1.5} fill={scoreColor} />
          </g>

          {/* Labels at arc ends */}
          <text x={arcStart.x - 2} y={arcStart.y + 10} fill={T.red} fontSize={7} fontFamily={EP_FONT} fontWeight={700} textAnchor="middle">BEAR</text>
          <text x={arcEnd.x + 2} y={arcEnd.y + 10} fill={T.green} fontSize={7} fontFamily={EP_FONT} fontWeight={700} textAnchor="middle">BULL</text>
        </svg>
      </div>

      {/* Score + label */}
      <div style={{ textAlign: "center", marginBottom: 4, marginTop: -4 }}>
        <span style={{ fontSize: 24, fontWeight: 800, color: scoreColor, fontFamily: EP_FONT, textShadow: `0 0 12px ${scoreColor}44` }}>{score.toFixed(1)}</span>
        <Badge color={scoreColor}>{state.sentimentLabel || "—"}</Badge>
      </div>

      {state.sentimentScoreChange != null && (
        <StatRow label="Change" value={fmtPct(state.sentimentScoreChange)} color={state.sentimentScoreChange > 0 ? T.green : T.red} />
      )}
      <StatRow label="Whale Long%" value={state.whaleLongRatio != null ? (state.whaleLongRatio * 100).toFixed(1) + "%" : "—"} color={T.green} />
      <StatRow label="Whale Positions" value={state.whaleTotalPositions?.toString() ?? "—"} />
      <StatRow label="Whale Value" value={fmtBig(state.whaleTotalValueUsd)} />
    </Panel>
  );
}

function PaperTradingPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const balance = state.paperBalance ?? 1000;
  const roi = state.paperRoi ?? 0;
  const dailyPnl = state.paperDailyPnl ?? 0;
  const winRate = state.paperWinRate ?? 0;
  const isActive = balance !== 1000 || state.paperPositions > 0;
  const trades = state.paperRecentTrades || [];
  const openPos = state.paperOpenPositions || [];

  return (
    <Panel title={`PAPER — $${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} accent={T.orange}>
      <StatRow label="Balance" value={fmtUsd(state.paperBalance)} color={T.text} />
      <StatRow label="Daily PnL" value={state.paperDailyPnl != null ? fmtUsd(state.paperDailyPnl) : "—"} color={dailyPnl >= 0 ? T.green : T.red} />
      <StatRow label="Realized PnL" value={state.paperRealizedPnl != null ? fmtUsd(state.paperRealizedPnl) : "—"} color={(state.paperRealizedPnl ?? 0) >= 0 ? T.green : T.red} />
      <StatRow label="ROI" value={state.paperRoi != null ? fmtPct(state.paperRoi) : "—"} color={roi >= 0 ? T.green : T.red} />
      <StatRow label="Win Rate" value={state.paperWinRate != null ? `${state.paperWins}W / ${state.paperLosses}L (${winRate.toFixed(1)}%)` : "—"} color={winRate >= 50 ? T.green : T.red} />
      <StatRow label="Total Trades" value={String(state.paperTotalTrades)} color={state.paperTotalTrades > 0 ? T.text : T.textDim} />
      <StatRow label="Fees" value={state.paperFees != null ? fmtUsd(state.paperFees) : "—"} color={T.red} />
      <StatRow label="Open Positions" value={String(state.paperPositions)} color={state.paperPositions > 0 ? T.orange : T.textDim} />

      {/* Open Positions Detail */}
      {openPos.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 7, color: T.orange, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", marginBottom: 3, borderBottom: `1px solid ${T.orange}33`, paddingBottom: 2 }}>OPEN POSITIONS</div>
          {openPos.map((p, i) => {
            const sideColor = p.side === "LONG" ? T.green : T.red;
            const pnlColor = (p.unrealizedPnl ?? 0) >= 0 ? T.green : T.red;
            const dcaBadge = p.dcaEntry ? ` E${p.dcaEntry}` : "";
            const dcaBadgeColor = p.dcaEntry === 1 ? T.green : p.dcaEntry === 2 ? T.orange : p.dcaEntry === 3 ? T.purple : T.textDim;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 6px", padding: "3px 4px", marginBottom: 2, background: T.panelAlt, borderRadius: 2, border: `1px solid ${p.dcaEntry ? dcaBadgeColor + "44" : T.border}` }}>
                <span style={{ fontSize: 8, color: sideColor, fontFamily: EP_FONT, fontWeight: 700 }}>{p.coin} {p.side} ×{p.leverage}{dcaBadge && <span style={{ color: dcaBadgeColor, fontSize: 7, marginLeft: 3 }}>DCA{dcaBadge} {p.dcaMult}x</span>}</span>
                <span style={{ fontSize: 8, color: pnlColor, fontFamily: EP_FONT, textAlign: "right" }}>{(p.unrealizedPnl ?? 0) >= 0 ? "+" : ""}{(p.unrealizedPnl ?? 0).toFixed(2)}</span>
                <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>Entry: ${p.entryPrice?.toFixed(2)}</span>
                <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT, textAlign: "right" }}>Size: ${p.sizeUsd?.toFixed(0)}</span>
                <span style={{ fontSize: 7, color: T.red, fontFamily: EP_FONT }}>SL: ${(p.stopLoss ?? 0).toFixed(2)}</span>
                <span style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT, textAlign: "right" }}>TP: ${(p.takeProfit ?? 0).toFixed(2)}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Trade History */}
      {trades.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 7, color: T.cyan, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", marginBottom: 3, borderBottom: `1px solid ${T.cyan}33`, paddingBottom: 2 }}>TRADE HISTORY</div>
          {/* Header row */}
          <div style={{ display: "grid", gridTemplateColumns: "28px 36px 1fr 1fr 50px 44px", gap: 2, marginBottom: 2, padding: "0 3px" }}>
            <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>SIDE</span>
            <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>SIZE</span>
            <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>ENTRY</span>
            <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>EXIT</span>
            <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>PnL</span>
            <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>TIME</span>
          </div>
          {trades.slice().reverse().map((t, i) => {
            const sideColor = t.side === "LONG" ? T.green : T.red;
            const pnlColor = t.pnl >= 0 ? T.green : T.red;
            const pnlPct = t.entryPrice > 0 ? ((t.exitPrice - t.entryPrice) / t.entryPrice * 100 * (t.side === "SHORT" ? -1 : 1)) : 0;
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 36px 1fr 1fr 50px 44px", gap: 2, padding: "2px 3px", marginBottom: 1, background: i % 2 === 0 ? "transparent" : T.panelAlt + "44", borderRadius: 1 }}>
                <span style={{ fontSize: 7, color: sideColor, fontFamily: EP_FONT, fontWeight: 700 }}>{t.side === "LONG" ? "▲" : "▼"} {t.side.slice(0, 1)}</span>
                <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>${(t.sizeUsd ?? 0).toFixed(0)}</span>
                <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>${(t.entryPrice ?? 0).toFixed(2)}</span>
                <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>${(t.exitPrice ?? 0).toFixed(2)}</span>
                <span style={{ fontSize: 7, color: pnlColor, fontFamily: EP_FONT, fontWeight: 700 }}>{t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}</span>
                <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>{t.time ? t.time.split(" ").pop()?.slice(0, 5) || t.time.slice(-8) : "—"}</span>
              </div>
            );
          })}
        </div>
      )}

      {!isActive && trades.length === 0 && (
        <div style={{ marginTop: 4, fontSize: 8, color: T.textMuted, textAlign: "center" as const, fontFamily: EP_FONT, letterSpacing: 0.5 }}>
          AWAITING SIGNAL (≥{state.tradeConfig.minConfidence}% CONFIDENCE)...
        </div>
      )}
    </Panel>
  );
}

function BacktestPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const bt = state.backtestResult;
  const [btInterval, setBtInterval] = useState("1h");
  const [btLimit, setBtLimit] = useState(1500);
  const [btSource, setBtSource] = useState<"binance" | "hyperliquid">("binance");
  const [btSL, setBtSL] = useState(1.5);
  const [btTP, setBtTP] = useState(4.5);
  const [showSetup, setShowSetup] = useState(false);

  // Show setup form if no result yet OR user clicked BACK
  if (!bt || showSetup) return (
    <Panel title="Backtest DCA (Hurst+BB)" accent={T.cyan}>
      {bt && showSetup && (
        <button
          onClick={() => setShowSetup(false)}
          style={{
            width: "100%", padding: "3px 8px", fontSize: 7, fontFamily: EP_FONT, fontWeight: 700,
            background: T.cyan + "11", color: T.cyan,
            border: `1px solid ${T.cyan}33`, borderRadius: 2, cursor: "pointer",
            letterSpacing: 1, textTransform: "uppercase", marginBottom: 6,
          }}>
          ← BACK TO RESULTS
        </button>
      )}
      <div style={{ fontSize: 7, color: T.textDim, letterSpacing: 0.5, marginBottom: 6 }}>DCA: E1=BB CROSS | E2/E3=HURST CROSS (2x→4x) · EXIT=OPP HURST CROSS · LONG+SHORT</div>

      {/* Data source selector */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 6, color: T.textMuted, letterSpacing: 1, marginBottom: 2, fontFamily: EP_FONT, textTransform: "uppercase" }}>Data Source</div>
        <div style={{ display: "flex", gap: 3 }}>
          {(["binance", "hyperliquid"] as const).map(src => (
            <button key={src} onClick={() => setBtSource(src)}
              style={{
                flex: 1, padding: "3px 4px", fontSize: 7, fontFamily: EP_FONT,
                background: btSource === src ? (src === "binance" ? T.cyan : T.purple) + "22" : T.panelAlt,
                color: btSource === src ? (src === "binance" ? T.cyan : T.purple) : T.textDim,
                border: `1px solid ${btSource === src ? (src === "binance" ? T.cyan : T.purple) : T.border}`,
                borderRadius: 2, cursor: "pointer", textAlign: "center",
              }}>
              {src === "binance" ? "BINANCE" : "HYPERLIQUID"}
            </button>
          ))}
        </div>
      </div>

      {/* Interval selector */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 6, color: T.textMuted, letterSpacing: 1, marginBottom: 2, fontFamily: EP_FONT, textTransform: "uppercase" }}>Interval</div>
        <div style={{ display: "flex", gap: 2 }}>
          {["5m", "15m", "1h", "4h", "1d"].map(iv => (
            <button key={iv} onClick={() => setBtInterval(iv)}
              style={{
                flex: 1, padding: "2px 4px", fontSize: 7, fontFamily: EP_FONT,
                background: btInterval === iv ? T.cyan + "33" : T.panelAlt,
                color: btInterval === iv ? T.cyan : T.textDim,
                border: `1px solid ${btInterval === iv ? T.cyan : T.border}`,
                borderRadius: 2, cursor: "pointer",
              }}>
              {iv}
            </button>
          ))}
        </div>
      </div>

      {/* Limit selector */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 6, color: T.textMuted, letterSpacing: 1, marginBottom: 2, fontFamily: EP_FONT, textTransform: "uppercase" }}>Candles</div>
        <div style={{ display: "flex", gap: 2 }}>
          {[1000, 1500, 2000, 3000, 5000].map(lim => (
            <button key={lim} onClick={() => setBtLimit(lim)}
              style={{
                flex: 1, padding: "2px 2px", fontSize: 7, fontFamily: EP_FONT,
                background: btLimit === lim ? T.cyan + "33" : T.panelAlt,
                color: btLimit === lim ? T.cyan : T.textDim,
                border: `1px solid ${btLimit === lim ? T.cyan : T.border}`,
                borderRadius: 2, cursor: "pointer",
              }}>
              {lim >= 1000 ? `${lim / 1000}k` : lim}
            </button>
          ))}
        </div>
      </div>

      {/* SL / TP inputs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 6, color: T.textMuted, letterSpacing: 1, marginBottom: 1, fontFamily: EP_FONT }}>SL %</div>
          <input type="number" value={btSL} onChange={e => setBtSL(parseFloat(e.target.value) || 1.5)} step={0.5} min={0.5} max={20}
            style={{ width: "100%", padding: "2px 4px", fontSize: 8, fontFamily: EP_FONT,
              background: T.panelAlt, color: T.red, border: `1px solid ${T.border}`, borderRadius: 2, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 6, color: T.textMuted, letterSpacing: 1, marginBottom: 1, fontFamily: EP_FONT }}>TP %</div>
          <input type="number" value={btTP} onChange={e => setBtTP(parseFloat(e.target.value) || 4.5)} step={0.5} min={0.5} max={50}
            style={{ width: "100%", padding: "2px 4px", fontSize: 8, fontFamily: EP_FONT,
              background: T.panelAlt, color: T.green, border: `1px solid ${T.border}`, borderRadius: 2, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>

      {/* Run button */}
      <button
        onClick={() => {
          const s = (window as any).__hyperSocket;
          if (s) s.emit("run_backtest", { interval: btInterval, limit: btLimit, sl_pct: btSL, tp_pct: btTP, data_source: btSource, trigger_mode: true });
        }}
        style={{
          width: "100%", padding: "6px 16px", fontSize: 9, fontFamily: EP_FONT, fontWeight: 800,
          background: T.cyan + "22", color: T.cyan,
          border: `1px solid ${T.cyan}`, borderRadius: 3, cursor: "pointer",
          letterSpacing: 1.5, textTransform: "uppercase",
        }}>
        RUN TRIGGER BACKTEST
      </button>
      <div style={{ fontSize: 6, color: T.textMuted, textAlign: "center", marginTop: 3, fontFamily: EP_FONT }}>
        Hurst+BB DCA · E1=BB cross | E2=Hurst↑0.0 (2x) | E3=Hurst↑0.0 (4x) · Exit=Hurst opp cross
      </div>
    </Panel>
  );

  // Status: importing or running
  if (bt.status === "importing" || bt.status === "running") return (
    <Panel title="Backtest DCA (Hurst+BB)" accent={T.cyan}>
      <div style={{ fontSize: 7, color: T.textDim, letterSpacing: 0.5, marginBottom: 8 }}>DCA: E1=BB CROSS | E2/E3=HURST CROSS (2x→4x) · EXIT=OPP HURST CROSS · LONG+SHORT</div>
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 10, color: T.cyan, fontFamily: EP_FONT, marginBottom: 4 }}>
          {bt.status === "importing" ? "Importowanie świec..." : "Uruchamianie backtestu..."}
        </div>
        {bt.candleCount > 0 && (
          <div style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>
            {bt.candleCount} świec ({bt.interval || btInterval}) [{bt.dataSource || btSource}]
          </div>
        )}
        {/* Progress bar */}
        <div style={{ width: "100%", height: 4, background: T.panelAlt, borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: bt.status === "importing" ? "30%" : `${Math.max(30, bt.progressPct || 70)}%`, height: "100%",
            background: T.cyan, borderRadius: 2, transition: "width 0.5s" }} />
        </div>
        {bt.progressPct > 0 && (
          <div style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT, marginTop: 2 }}>
            {Math.round(bt.progressPct)}%
          </div>
        )}
      </div>
    </Panel>
  );

  // Status: error
  if (bt.status === "error") return (
    <Panel title="Backtest DCA (Hurst+BB)" accent={T.red}>
      <div style={{ textAlign: "center", padding: "12px 0" }}>
        <div style={{ fontSize: 8, color: T.red, fontFamily: EP_FONT, letterSpacing: 1 }}>ERROR</div>
        <div style={{ fontSize: 7, color: T.textDim, marginTop: 4, lineHeight: 1.4 }}>{bt.error || "Nieznany błąd"}</div>
        {bt.error?.includes("Bot nie jest uruchomiony") && (
          <div style={{ fontSize: 7, color: T.orange, marginTop: 6, fontFamily: EP_FONT }}>
            Kliknij START BOT na górze panelu!
          </div>
        )}
      </div>
    </Panel>
  );

  // Status: completed — show full results
  const curve: number[] = bt.equityCurve || [];
  const totalTrades = bt.totalTrades ?? 0;
  const winRate = bt.winRate ?? 0;
  const totalPnl = bt.totalPnl ?? 0;
  const maxDrawdown = bt.maxDrawdown ?? 0;
  const sharpeRatio = bt.sharpeRatio ?? 0;
  const profitFactor = bt.profitFactor ?? 0;
  const avgTradePnl = bt.avgTradePnl ?? 0;
  const bestTrade = bt.bestTrade ?? 0;
  const worstTrade = bt.worstTrade ?? 0;
  const durationHours = bt.durationHours ?? 0;
  const strategyReturn = bt.strategyReturn ?? 0;
  const buyHoldReturn = bt.buyHoldReturn ?? 0;
  const candleCount = bt.candleCount ?? bt.snapshotsUsed ?? 0;
  const candleInterval = bt.candleInterval || btInterval;
  const recentTrades = bt.recentTrades || [];
  const btDataSource = bt.dataSource || "binance";

  const pnlColor = totalPnl >= 0 ? T.green : T.red;
  const winRateColor = winRate > 50 ? T.green : winRate > 40 ? T.orange : T.red;
  const sharpeColor = sharpeRatio > 1 ? T.green : sharpeRatio > 0 ? T.orange : T.red;
  const pfColor = profitFactor > 1 ? T.green : profitFactor > 0.5 ? T.orange : T.red;
  const retColor = strategyReturn >= 0 ? T.green : T.red;
  const bhColor = buyHoldReturn >= 0 ? T.green : T.red;
  const srcColor = btDataSource === "hyperliquid" ? T.purple : T.cyan;

  // Equity curve SVG chart
  const CW = CHART_W, CH = 120, CP = CHART_PAD;
  const curveMin = curve.length > 0 ? Math.min(...curve) : 0;
  const curveMax = curve.length > 0 ? Math.max(...curve) : 1;
  const curveRange = curveMax - curveMin || 1;
  const curveStep = curve.length > 1 ? (CW - CP * 2) / (curve.length - 1) : 0;

  return (
    <Panel title="Backtest DCA (Hurst+BB)" accent={T.cyan}>
      {/* Header with candle info + data source badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: T.textDim, letterSpacing: 0.5 }}>DCA: E1=BB CROSS | E2/E3=HURST CROSS (2x→4x) · EXIT=OPP HURST CROSS · LONG+SHORT</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 6, color: srcColor, fontFamily: EP_FONT, padding: "1px 3px", background: srcColor + "22", border: `1px solid ${srcColor}44`, borderRadius: 2, letterSpacing: 0.5 }}>
            {btDataSource.toUpperCase()}
          </span>
          <span style={{ fontSize: 7, color: T.cyan, fontFamily: EP_FONT }}>{candleCount} {candleInterval}</span>
          {durationHours > 0 && (
            <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>{durationHours.toFixed(0)}h</span>
          )}
        </div>
      </div>

      {/* Big PnL display */}
      <div style={{ textAlign: "center", marginBottom: 6, padding: "4px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 7, color: T.textDim, letterSpacing: 1, fontFamily: EP_FONT }}>TOTAL PNL</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: pnlColor, fontFamily: EP_FONT, textShadow: `0 0 10px ${pnlColor}44` }}>
          {totalPnl >= 0 ? "+" : ""}{fmtUsd(totalPnl)}
        </div>
      </div>

      {/* Strategy vs Buy-Hold comparison */}
      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
        <div style={{ flex: 1, textAlign: "center", padding: "2px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${retColor}33` }}>
          <div style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>STRATEGY</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: retColor, fontFamily: EP_FONT }}>
            {strategyReturn >= 0 ? "+" : ""}{strategyReturn.toFixed(1)}%
          </div>
        </div>
        <div style={{ flex: 1, textAlign: "center", padding: "2px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${bhColor}33` }}>
          <div style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>BUY & HOLD</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: bhColor, fontFamily: EP_FONT }}>
            {buyHoldReturn >= 0 ? "+" : ""}{buyHoldReturn.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Key metrics grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
        <StatRow label="Trades" value={String(totalTrades)} />
        <StatRow label="Win Rate" value={winRate.toFixed(1) + "%"} color={winRateColor} />
        <StatRow label="Sharpe" value={sharpeRatio.toFixed(2)} color={sharpeColor} />
        <StatRow label="PF" value={profitFactor.toFixed(2)} color={pfColor} />
        <StatRow label="Max DD" value={maxDrawdown.toFixed(2) + "%"} color={T.red} />
        <StatRow label="Avg Trade" value={fmtUsd(avgTradePnl)} color={avgTradePnl >= 0 ? T.green : T.red} />
        <StatRow label="Best" value={fmtUsd(bestTrade)} color={T.green} />
        <StatRow label="Worst" value={fmtUsd(worstTrade)} color={T.red} />
        <StatRow label="Fees" value={fmtUsd(bt.totalFees ?? 0)} color={T.red} />
        <StatRow label="Gross W/L" value={`$${bt.grossProfit?.toFixed(0) ?? 0} / $${bt.grossLoss?.toFixed(0) ?? 0}`} />
      </div>

      {/* Equity curve chart */}
      {curve.length > 1 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontSize: 7, color: T.textDim, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase" }}>Equity Curve</span>
            <span style={{ fontSize: 7, color: pnlColor, fontFamily: EP_FONT }}>{curve.length} pts</span>
          </div>
          <svg width="100%" height={CH} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ display: "block" }}>
            {/* Zero line if curve crosses zero */}
            {curveMin < 0 && curveMax > 0 && (() => {
              const zeroY = CH - CP - ((0 - curveMin) / curveRange) * (CH - CP * 2);
              return <line x1={CP} y1={zeroY} x2={CW - CP} y2={zeroY} stroke={T.textMuted} strokeWidth={0.3} strokeDasharray="2,3" />;
            })()}
            {/* Area fill */}
            {(() => {
              const topPts = curve.map((v, i) =>
                `${CP + i * curveStep},${CH - CP - ((v - curveMin) / curveRange) * (CH - CP * 2)}`
              ).join(" ");
              const baseline = CH - CP;
              const lastX = CP + (curve.length - 1) * curveStep;
              return <polygon fill={pnlColor} fillOpacity={0.08} points={`${CP},${baseline} ${topPts} ${lastX},${baseline}`} />;
            })()}
            {/* Line */}
            {svgPolyline(curve, curveMin, curveMax, pnlColor, 1.2)}
            {/* End dot */}
            {(() => {
              const lastVal = curve[curve.length - 1];
              const cx = CW - CP;
              const cy = CH - CP - ((lastVal - curveMin) / curveRange) * (CH - CP * 2);
              return <circle cx={cx} cy={cy} r={2.5} fill={pnlColor} />;
            })()}
          </svg>
          {/* Curve range labels */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 1 }}>
            <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>{fmtUsd(curveMin)}</span>
            <span style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>{fmtUsd(curveMax)}</span>
          </div>
        </div>
      )}

      {/* Win/Loss bar */}
      {totalTrades > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT }}>WINS {bt.wins ?? Math.round(winRate / 100 * totalTrades)}</span>
            <span style={{ fontSize: 7, color: T.red, fontFamily: EP_FONT }}>LOSSES {bt.losses ?? Math.round((1 - winRate / 100) * totalTrades)}</span>
          </div>
          <div style={{ width: "100%", height: 4, background: T.red, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: `${winRate}%`, height: "100%", background: T.green, borderRadius: 2, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {/* Recent trades */}
      {recentTrades.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 7, color: T.textDim, letterSpacing: 1, fontFamily: EP_FONT, marginBottom: 2, textTransform: "uppercase" }}>Recent Trades</div>
          {recentTrades.slice(-8).map((t, i) => (
            <div key={t.id ?? i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1px 0", borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 7, fontWeight: 700, color: t.side === "LONG" ? T.green : T.red, fontFamily: EP_FONT }}>
                {t.side} {t.entryPrice?.toFixed(0)}→{t.exitPrice?.toFixed(0)}
              </span>
              <span style={{ fontSize: 7, color: t.netPnl >= 0 ? T.green : T.red, fontFamily: EP_FONT }}>
                ${t.netPnl?.toFixed(2)} ({t.exitReason})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        <button
          onClick={() => {
            const s = (window as any).__hyperSocket;
            if (s) s.emit("run_backtest", { interval: btInterval, limit: btLimit, sl_pct: btSL, tp_pct: btTP, data_source: btSource, trigger_mode: true });
          }}
          style={{
            flex: 1, padding: "3px 8px", fontSize: 7, fontFamily: EP_FONT, fontWeight: 700,
            background: T.cyan + "22", color: T.cyan,
            border: `1px solid ${T.cyan}44`, borderRadius: 2, cursor: "pointer",
            letterSpacing: 0.5,
          }}>
          RERUN TRIGGER
        </button>
        <button
          onClick={() => setShowSetup(true)}
          style={{
            flex: 1, padding: "3px 8px", fontSize: 7, fontFamily: EP_FONT, fontWeight: 700,
            background: T.orange + "22", color: T.orange,
            border: `1px solid ${T.orange}44`, borderRadius: 2, cursor: "pointer",
            letterSpacing: 0.5,
          }}>
          NEW BACKTEST
        </button>
      </div>
    </Panel>
  );
}

// ─── Scalping Engine Panel ────────────────────────────────────────────────

function ScalpingPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const sc = state.scalpStatus;
  if (!sc) return <Panel title="Scalping Engine">{waiting(T)}</Panel>;

  const pnlColor = sc.totalPnl >= 0 ? T.green : T.red;
  const winRateColor = sc.winRate > 60 ? T.green : sc.winRate > 45 ? T.orange : T.red;

  return (
    <Panel title={`Scalping Engine (${sc.activePositions}/${sc.maxPositions})`} accent={T.orange}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontSize: 7, color: T.textDim, letterSpacing: 0.5 }}>MICRO-TRADE ENGINE</span>
        <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>Regime: {sc.regime}</span>
      </div>

      {/* PnL display */}
      <div style={{ textAlign: "center", marginBottom: 4, padding: "3px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 6, color: T.textDim, letterSpacing: 1, fontFamily: EP_FONT }}>SCALP PNL</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: pnlColor, fontFamily: EP_FONT, textShadow: `0 0 8px ${pnlColor}44` }}>
          {sc.totalPnl >= 0 ? "+" : ""}${sc.totalPnl.toFixed(4)}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <StatRow label="Trades" value={String(sc.totalTrades)} />
        <StatRow label="Win Rate" value={sc.winRate.toFixed(1) + "%"} color={winRateColor} />
        <StatRow label="Wins" value={String(sc.wins)} color={T.green} />
        <StatRow label="Losses" value={String(sc.losses)} color={T.red} />
        <StatRow label="Fees" value={"$" + sc.totalFees.toFixed(4)} color={T.red} />
        <StatRow label="Max DD" value={sc.maxDrawdown.toFixed(2) + "%"} color={T.red} />
      </div>

      {/* Active positions */}
      {sc.positions.length > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 7, color: T.textDim, letterSpacing: 1, fontFamily: EP_FONT, marginBottom: 2, textTransform: "uppercase" }}>Active Positions</div>
          {sc.positions.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1px 0", borderTop: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 8, fontWeight: 700, color: p.side === "LONG" ? T.green : T.red, fontFamily: EP_FONT }}>
                #{p.id} {p.side}
              </span>
              <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>
                ${p.entryPrice.toFixed(0)} | SL ${p.stopLoss.toFixed(0)} TP ${p.takeProfit.toFixed(0)}
              </span>
              <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>
                {p.openedAgo.toFixed(0)}s
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Win/Loss bar */}
      {sc.totalTrades > 0 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ width: "100%", height: 3, background: T.red, borderRadius: 1, overflow: "hidden" }}>
            <div style={{ width: `${sc.winRate}%`, height: "100%", background: T.green, borderRadius: 1, transition: "width 0.3s" }} />
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Scalping Backtest Panel ──────────────────────────────────────────────

function ScalpBacktestPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const bt = state.scalpBacktest;
  if (!bt) return <Panel title="Scalp Backtest">{waiting(T)}</Panel>;

  const pnlColor = bt.totalPnl >= 0 ? T.green : T.red;
  const winRateColor = bt.winRate > 60 ? T.green : bt.winRate > 45 ? T.orange : T.red;

  const curve = bt.equityCurve || [];
  const curveMin = curve.length > 0 ? Math.min(...curve) : 0;
  const curveMax = curve.length > 0 ? Math.max(...curve) : 1;
  const curveRange = curveMax - curveMin || 1;
  const curveStep = curve.length > 1 ? (CHART_W - CHART_PAD * 2) / (curve.length - 1) : 0;
  const CW = CHART_W, CH = 90, CP = CHART_PAD;

  return (
    <Panel title="Scalp Backtest" accent={T.orange}>
      {/* PnL display */}
      <div style={{ textAlign: "center", marginBottom: 4, padding: "3px 0", background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 6, color: T.textDim, letterSpacing: 1, fontFamily: EP_FONT }}>BACKTEST PNL</div>
        <div style={{ fontSize: 14, fontWeight: 800, color: pnlColor, fontFamily: EP_FONT, textShadow: `0 0 8px ${pnlColor}44` }}>
          {bt.totalPnl >= 0 ? "+" : ""}${bt.totalPnl.toFixed(4)}
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <StatRow label="Trades" value={String(bt.totalTrades)} />
        <StatRow label="Win Rate" value={bt.winRate.toFixed(1) + "%"} color={winRateColor} />
        <StatRow label="Avg PnL" value={"$" + bt.avgPnlPerTrade.toFixed(4)} color={bt.avgPnlPerTrade >= 0 ? T.green : T.red} />
        <StatRow label="Avg Dur" value={bt.avgDurationSec.toFixed(0) + "s"} />
        <StatRow label="Best" value={"$" + bt.bestTrade.toFixed(4)} color={T.green} />
        <StatRow label="Worst" value={"$" + bt.worstTrade.toFixed(4)} color={T.red} />
        <StatRow label="Fees" value={"$" + bt.totalFees.toFixed(4)} color={T.red} />
        <StatRow label="Max DD" value={bt.maxDrawdown.toFixed(2) + "%"} color={T.red} />
      </div>

      {/* Equity curve */}
      {curve.length > 1 && (
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 7, color: T.textDim, letterSpacing: 1, fontFamily: EP_FONT, marginBottom: 2, textTransform: "uppercase" }}>Equity Curve</div>
          <svg width="100%" height={CH} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ display: "block" }}>
            {(() => {
              const topPts = curve.map((v, i) =>
                `${CP + i * curveStep},${CH - CP - ((v - curveMin) / curveRange) * (CH - CP * 2)}`
              ).join(" ");
              const baseline = CH - CP;
              const lastX = CP + (curve.length - 1) * curveStep;
              return <polygon fill={pnlColor} fillOpacity={0.08} points={`${CP},${baseline} ${topPts} ${lastX},${baseline}`} />;
            })()}
            {svgPolyline(curve, curveMin, curveMax, pnlColor, 1)}
            {(() => {
              const lastVal = curve[curve.length - 1];
              const cx = CW - CP;
              const cy = CH - CP - ((lastVal - curveMin) / curveRange) * (CH - CP * 2);
              return <circle cx={cx} cy={cy} r={2} fill={pnlColor} />;
            })()}
          </svg>
        </div>
      )}

      {/* Win/Loss bar */}
      {bt.totalTrades > 0 && (
        <div style={{ marginTop: 3 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
            <span style={{ fontSize: 6, color: T.green, fontFamily: EP_FONT }}>W {bt.wins}</span>
            <span style={{ fontSize: 6, color: T.red, fontFamily: EP_FONT }}>L {bt.losses}</span>
          </div>
          <div style={{ width: "100%", height: 3, background: T.red, borderRadius: 1, overflow: "hidden" }}>
            <div style={{ width: `${bt.winRate}%`, height: "100%", background: T.green, borderRadius: 1, transition: "width 0.3s" }} />
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Net Equity Curve Panel ────────────────────────────────────────────────

function EquityCurvePanel({ state }: { state: BotState }) {
  const T = useTheme();
  const data = state.paperBalanceHistory;
  const balance = state.paperBalance;
  const roi = state.paperRoi ?? 0;
  const realizedPnl = state.paperRealizedPnl ?? 0;
  const dailyPnl = state.paperDailyPnl ?? 0;

  // Chart dimensions
  const CW = 300, CH = 90, CP = 2;

  // Draw even with no history — show current balance as a point
  const displayData = data.length > 0 ? data : (balance != null ? [balance] : []);
  const hasData = displayData.length > 0;

  const minV = hasData ? Math.min(...displayData) * 0.998 : 0;
  const maxV = hasData ? Math.max(...displayData) * 1.002 : 1;
  const range = maxV - minV || 1;
  const step = hasData && displayData.length > 1 ? (CW - CP * 2) / (displayData.length - 1) : 0;

  // Hover hook
  const [hoverIdx, setHoverIdx] = useState(-1);
  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (displayData.length < 2) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const scaleX = CW / rect.width;
    const mx = (e.clientX - rect.left) * scaleX;
    const idx = Math.round((mx - CP) / step);
    if (idx >= 0 && idx < displayData.length) setHoverIdx(idx);
    else setHoverIdx(-1);
  }, [displayData.length, step]);
  const onLeave = useCallback(() => setHoverIdx(-1), []);

  const hoverX = hoverIdx >= 0 ? CP + hoverIdx * step : -1;
  const hoverY = hoverIdx >= 0 ? CH - CP - ((displayData[hoverIdx] - minV) / range) * (CH - CP * 2) : -1;
  const hoverValue = hoverIdx >= 0 ? displayData[hoverIdx] : null;

  const lineColor = realizedPnl >= 0 ? T.green : T.red;
  const accentColor = dailyPnl >= 0 ? T.green : T.red;

  // Compute PnL from curve
  const startBal = displayData.length > 0 ? displayData[0] : 1000;
  const endBal = displayData.length > 0 ? displayData[displayData.length - 1] : 1000;
  const curvePnl = endBal - startBal;
  const maxDrawdown = (() => {
    if (displayData.length < 2) return 0;
    let peak = displayData[0];
    let maxDD = 0;
    for (const v of displayData) {
      if (v > peak) peak = v;
      const dd = (peak - v) / peak * 100;
      if (dd > maxDD) maxDD = dd;
    }
    return maxDD;
  })();

  return (
    <Panel title="Net Equity Curve" accent={accentColor}>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.text, fontFamily: EP_FONT }}>
          ${balance != null ? balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        </span>
        <span style={{ fontSize: 9, color: accentColor, fontWeight: 700, fontFamily: EP_FONT }}>
          {dailyPnl >= 0 ? "+" : ""}{fmtUsd(dailyPnl)}
        </span>
      </div>

      {/* Mini stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 4 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>ROI</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: roi >= 0 ? T.green : T.red, fontFamily: EP_FONT }}>{roi >= 0 ? "+" : ""}{roi.toFixed(2)}%</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>PnL</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: curvePnl >= 0 ? T.green : T.red, fontFamily: EP_FONT }}>{curvePnl >= 0 ? "+" : ""}{fmtUsd(curvePnl)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>Max DD</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.red, fontFamily: EP_FONT }}>{maxDrawdown.toFixed(1)}%</div>
        </div>
      </div>

      {/* SVG chart */}
      {hasData ? (
        <svg width="100%" height={CH} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" style={{ display: "block" }} onMouseMove={onMove} onMouseLeave={onLeave}>
          {/* Starting balance reference line */}
          {(() => {
            const refY = CH - CP - ((startBal - minV) / range) * (CH - CP * 2);
            if (refY < CP || refY > CH - CP) return null;
            return <line x1={CP} y1={refY} x2={CW - CP} y2={refY} stroke={T.textMuted} strokeWidth={0.3} strokeDasharray="3,3" />;
          })()}
          {/* Area fill */}
          {displayData.length > 1 && (() => {
            const pts = displayData.map((v, i) =>
              `${CP + i * step},${CH - CP - ((v - minV) / range) * (CH - CP * 2)}`
            ).join(" ");
            const baseline = CH - CP;
            return <polygon fill={lineColor} fillOpacity={0.08} points={`${CP},${baseline} ${pts} ${CP + (displayData.length - 1) * step},${baseline}`} />;
          })()}
          {/* Line */}
          {displayData.length > 1 && (
            <polyline
              fill="none"
              stroke={lineColor}
              strokeWidth={1.5}
              strokeLinejoin="round"
              points={displayData.map((v, i) =>
                `${CP + i * step},${CH - CP - ((v - minV) / range) * (CH - CP * 2)}`
              ).join(" ")}
            />
          )}
          {/* Current value dot */}
          {displayData.length > 0 && (() => {
            const lastV = displayData[displayData.length - 1];
            const cx = displayData.length > 1 ? CP + (displayData.length - 1) * step : CW / 2;
            const cy = CH - CP - ((lastV - minV) / range) * (CH - CP * 2);
            return (
              <g>
                <circle cx={cx} cy={cy} r={4} fill={lineColor} fillOpacity={0.2} />
                <circle cx={cx} cy={cy} r={2} fill={lineColor} stroke={T.bg} strokeWidth={0.6} />
              </g>
            );
          })()}
          {/* Hover overlay */}
          {hoverX >= 0 && hoverValue !== null && (
            <g style={{ pointerEvents: "none" }}>
              <line x1={hoverX} y1={CP} x2={hoverX} y2={CH - CP} stroke={T.textMuted} strokeWidth={0.4} strokeDasharray="2,2" />
              <line x1={CP} y1={hoverY} x2={CW - CP} y2={hoverY} stroke={T.textMuted} strokeWidth={0.4} strokeDasharray="2,2" />
              <circle cx={hoverX} cy={hoverY} r={5} fill={lineColor} fillOpacity={0.15} />
              <circle cx={hoverX} cy={hoverY} r={2.5} fill={lineColor} stroke={T.bg} strokeWidth={0.8} />
              <rect x={hoverX + 4} y={hoverY - 8} width={44} height={11} rx={1.5} fill={T.bg} fillOpacity={0.92} stroke={lineColor} strokeWidth={0.4} />
              <text x={hoverX + 6} y={hoverY - 1} fill={lineColor} fontSize={7} fontFamily={EP_FONT} fontWeight={700}>${hoverValue.toFixed(2)}</text>
            </g>
          )}
          {/* Y-axis labels */}
          <text x={CP} y={CP + 6} fill={T.textDim} fontSize={5.5} fontFamily={EP_FONT}>{fmtUsd(maxV)}</text>
          <text x={CP} y={CH - CP} fill={T.textDim} fontSize={5.5} fontFamily={EP_FONT}>{fmtUsd(minV)}</text>
        </svg>
      ) : (
        <div style={{ height: CH, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {waiting(T)}
        </div>
      )}

      {/* Trade History Table */}
      {(() => {
        const trades = state.paperRecentTrades || [];
        const openPos = state.paperOpenPositions || [];
        if (trades.length === 0 && openPos.length === 0) return null;

        return (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 7, color: T.cyan, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", marginBottom: 3, paddingBottom: 2, borderBottom: `1px solid ${T.cyan}44` }}>TRADE HISTORY</div>

            {/* Open positions */}
            {openPos.length > 0 && (
              <div style={{ marginBottom: 4 }}>
                <div style={{ fontSize: 6, color: T.orange, fontFamily: EP_FONT, letterSpacing: 0.5, marginBottom: 2, textTransform: "uppercase" }}>OPEN</div>
                {openPos.map((p, i) => {
                  const sideColor = p.side === "LONG" ? T.green : T.red;
                  const pnlColor = (p.unrealizedPnl ?? 0) >= 0 ? T.green : T.red;
                  return (
                    <div key={`op-${i}`} style={{ display: "grid", gridTemplateColumns: "24px 1fr 1fr 48px 48px", gap: 2, padding: "2px 3px", marginBottom: 1, background: T.panelAlt + "66", borderRadius: 1, borderLeft: `2px solid ${sideColor}` }}>
                      <span style={{ fontSize: 7, color: sideColor, fontFamily: EP_FONT, fontWeight: 700 }}>{p.side === "LONG" ? "L" : "S"}</span>
                      <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>E ${p.entryPrice?.toFixed(2)}</span>
                      <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>${p.sizeUsd?.toFixed(0)}</span>
                      <span style={{ fontSize: 7, color: T.red, fontFamily: EP_FONT }}>SL ${p.stopLoss?.toFixed(2)}</span>
                      <span style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT }}>TP ${p.takeProfit?.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Closed trades */}
            {trades.length > 0 && (
              <div>
                {openPos.length > 0 && (
                  <div style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.5, marginBottom: 2, textTransform: "uppercase" }}>CLOSED ({trades.length})</div>
                )}
                {/* Header */}
                <div style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 1fr 48px 40px", gap: 2, marginBottom: 1, padding: "0 3px" }}>
                  <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>S</span>
                  <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>ENTRY</span>
                  <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>EXIT</span>
                  <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>SIZE</span>
                  <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT, textAlign: "right" }}>PnL</span>
                  <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT, textAlign: "right" }}>TIME</span>
                </div>
                <div style={{ maxHeight: 140, overflowY: "auto" }}>
                  {trades.slice().reverse().slice(0, 20).map((t, i) => {
                    const sideColor = t.side === "LONG" ? T.green : T.red;
                    const pnlColor = t.pnl >= 0 ? T.green : T.red;
                    const pnlPct = t.entryPrice > 0 ? ((t.exitPrice - t.entryPrice) / t.entryPrice * 100 * (t.side === "SHORT" ? -1 : 1)) : 0;
                    return (
                      <div key={`ct-${i}`} style={{ display: "grid", gridTemplateColumns: "20px 1fr 1fr 1fr 48px 40px", gap: 2, padding: "2px 3px", marginBottom: 1, background: i % 2 === 0 ? "transparent" : T.panelAlt + "33", borderRadius: 1, borderLeft: `2px solid ${pnlColor}` }}>
                        <span style={{ fontSize: 7, color: sideColor, fontFamily: EP_FONT, fontWeight: 700 }}>{t.side === "LONG" ? "▲" : "▼"}</span>
                        <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>${t.entryPrice?.toFixed(2)}</span>
                        <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>${t.exitPrice?.toFixed(2)}</span>
                        <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT }}>${t.sizeUsd?.toFixed(0)}</span>
                        <span style={{ fontSize: 7, color: pnlColor, fontFamily: EP_FONT, fontWeight: 700, textAlign: "right" }}>{t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(2)}</span>
                        <span style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT, textAlign: "right" }}>{t.time ? t.time.split(" ").pop()?.slice(0, 5) || t.time.slice(-5) : "—"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* No trades message */}
      {state.paperRecentTrades?.length === 0 && state.paperOpenPositions?.length === 0 && state.paperBalanceHistory?.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 8, color: T.textMuted, textAlign: "center", fontFamily: EP_FONT, letterSpacing: 0.5, padding: "4px 0" }}>
          AWAITING TRADES...
        </div>
      )}
    </Panel>
  );
}

function ConfigPanel({ state, onUpdateConfig }: { state: BotState; onUpdateConfig: (cfg: BotState["tradeConfig"]) => void }) {
  const T = useTheme();
  const cfg = state.tradeConfig;
  const [local, setLocal] = useState(cfg);
  const [dirty, setDirty] = useState(false);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);

  // Sync from server state when it changes — but preserve local boolean toggles if recently changed
  const localRef = useRef(cfg);
  const lastToggleTime = useRef<Record<string, number>>({});
  localRef.current = local;

  // USAB-004 — Debounce timer ref. Numeric/string inputs update `local` immediately
  // for responsive typing, but propagation to onUpdateConfig is debounced 250ms
  // so we don't trigger render thrash across the whole dashboard on each keystroke.
  const debounceRef = useRef<number | null>(null);
  const DEBOUNCE_MS = 250;

  useEffect(() => {
    const now = Date.now();
    setLocal(prev => {
      const next = { ...DEFAULT_STATE.tradeConfig, ...cfg };
      // Preserve locally-toggled booleans for 3 seconds after toggle
      // (prevents server's stale echo from overwriting our just-applied change)
      const boolKeys: (keyof BotState["tradeConfig"])[] = ["triggerModeEnabled", "aiEngineEnabled", "exitOnlyOnSltp"];
      for (const key of boolKeys) {
        const toggleTime = lastToggleTime.current[key] || 0;
        if (now - toggleTime < 3000) {
          (next as any)[key] = (prev as any)[key];
        }
      }
      return next;
    });
    setDirty(false);
  }, [cfg]);

  // Cleanup pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const inputStyle: React.CSSProperties = {
    width: 52, fontSize: 9, fontFamily: EP_FONT, color: T.text, background: T.panelAlt,
    border: `1px solid ${T.border}`, borderRadius: 2, padding: "2px 4px", textAlign: "right",
    outline: "none",
  };

  // Schedule a debounced auto-apply. Each keystroke resets the timer so only
  // the LAST value within DEBOUNCE_MS is propagated. The APPLY button still
  // works for explicit application (bypasses the timer).
  const scheduleDebouncedApply = () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      onUpdateConfig(localRef.current);
      setDirty(false);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
  };

  const update = (key: keyof BotState["tradeConfig"], val: number) => {
    setLocal(prev => {
      const next = { ...prev, [key]: val };
      localRef.current = next;
      return next;
    });
    setDirty(true);
    scheduleDebouncedApply();
  };

  const updateStr = (key: keyof BotState["tradeConfig"], val: string) => {
    setLocal(prev => {
      const next = { ...prev, [key]: val };
      localRef.current = next;
      return next;
    });
    setDirty(true);
    scheduleDebouncedApply();
  };

  const updateBool = (key: keyof BotState["tradeConfig"], val: boolean) => {
    lastToggleTime.current[key] = Date.now();
    // Cancel any pending debounce — bool toggles apply immediately
    if (debounceRef.current) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
    setLocal(prev => {
      const next = { ...prev, [key]: val };
      localRef.current = next;
      // Auto-apply boolean toggles immediately (no need to click APPLY)
      onUpdateConfig(next);
      return next;
    });
    setDirty(false);
  };

  const apply = () => {
    // Cancel pending debounce — explicit apply takes over
    if (debounceRef.current) { window.clearTimeout(debounceRef.current); debounceRef.current = null; }
    onUpdateConfig(localRef.current);
    setDirty(false);
  };

  // Consistent row: label (fixed width) | input + unit (fixed width right-aligned)
  const cfgRow = (label: string, color: string, key: keyof BotState["tradeConfig"], unit: string, step: number, min: number, max?: number, parseInt_: boolean = false) => (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 16px", gap: 0, alignItems: "center" }}>
      <span style={{ fontSize: 9, color, fontFamily: EP_FONT }}>{label}</span>
      <input type="number" value={(local as any)[key] ?? min} onChange={e => update(key, parseInt_ ? parseInt(e.target.value) || min : parseFloat(e.target.value) || min)} style={{ ...inputStyle, width: "100%", textAlign: "right" }} step={step} min={min} max={max} />
      <span style={{ fontSize: 8, color: T.textDim, fontFamily: EP_FONT, textAlign: "left", paddingLeft: 2 }}>{unit}</span>
    </div>
  );

  const aiEnabled = local.aiEngineEnabled;
  const hasKey = (local.aiApiKey || "").length > 0;
  const aiStatusColor = aiEnabled && hasKey ? T.green : hasKey ? T.orange : T.textDim;
  const aiStatusText = aiEnabled && hasKey ? "ACTIVE" : hasKey ? "STANDBY" : "NO KEY";

  return (
    <Panel title="Configuration" accent={T.textDim}>
      {/* System info */}
      <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", marginBottom: 4, borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>SYSTEM</div>
      <StatRow label="Trading Mode" value={state.tradingMode} color={T.orange} />
      <StatRow label="Network" value="MAINNET" color={T.green} />
      <StatRow label="Coin" value={state.coin} color={T.cyan} />
      <StatRow label="Chart Data" value={state.chartSource !== "NONE" ? `${state.chartSource} 1H` : "Awaiting..."} color={T.orange} />
      <StatRow label="Risk Engine" value="v0.1 Active" color={T.green} />
      <StatRow label="AI Engine" value={aiStatusText} color={aiStatusColor} />
      <StatRow label="DCA Trigger Mode" value={state.tradeConfig.triggerModeEnabled ? "ACTIVE" : "OFF"} color={state.tradeConfig.triggerModeEnabled ? T.green : T.textDim} />

      {/* AI Engine Configuration */}
      <div style={{ fontSize: 8, color: T.blue, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", margin: "6px 0 4px", borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>AI DECISION ENGINE</div>

      <div style={{ display: "grid", gap: 3 }}>
        {/* Enable/Disable toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: T.text, fontFamily: EP_FONT }}>AI Engine</span>
          <button
            onClick={() => updateBool("aiEngineEnabled", !local.aiEngineEnabled)}
            style={{
              fontSize: 8, fontFamily: EP_FONT, padding: "2px 8px", cursor: "pointer",
              background: aiEnabled ? T.green + "22" : T.panelAlt,
              color: aiEnabled ? T.green : T.textDim,
              border: `1px solid ${aiEnabled ? T.green + "55" : T.border}`,
              borderRadius: 2, fontWeight: 700, letterSpacing: 1,
            }}
          >
            {aiEnabled ? "ON" : "OFF"}
          </button>
        </div>

        {/* API Key input */}
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: 4, alignItems: "center" }}>
          <span style={{ fontSize: 9, color: T.text, fontFamily: EP_FONT }}>API Key</span>
          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            <input
              type={apiKeyVisible ? "text" : "password"}
              value={local.aiApiKey || ""}
              onChange={e => updateStr("aiApiKey", e.target.value)}
              placeholder="sk-..."
              style={{
                ...inputStyle, width: "100%", textAlign: "left",
                fontFamily: "monospace", fontSize: 8, letterSpacing: 0.5,
                color: hasKey ? T.green : T.textDim,
                borderColor: hasKey ? T.green + "44" : T.border,
              }}
            />
            <button
              onClick={() => setApiKeyVisible(!apiKeyVisible)}
              style={{
                fontSize: 7, padding: "2px 4px", cursor: "pointer",
                background: T.panelAlt, color: T.textDim,
                border: `1px solid ${T.border}`, borderRadius: 2,
                fontFamily: EP_FONT, whiteSpace: "nowrap",
              }}
            >
              {apiKeyVisible ? "HIDE" : "SHOW"}
            </button>
          </div>
        </div>

        {/* Key status indicator */}
        {hasKey && (
          <div style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT, letterSpacing: 0.5, paddingLeft: 94 }}>
            KEY SET — {local.aiApiKey!.slice(0, 7)}...{local.aiApiKey!.slice(-4)}
          </div>
        )}
        {!hasKey && (
          <div style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.5, paddingLeft: 94 }}>
            Enter OpenAI API key to enable AI decisions
          </div>
        )}
      </div>

      {/* Trigger Mode — primary entry signals */}
      <div style={{ fontSize: 8, color: T.orange, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", margin: "6px 0 4px", borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>TRIGGER MODE</div>

      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: T.text, fontFamily: EP_FONT }}>Trigger Mode</span>
          <button
            onClick={() => updateBool("triggerModeEnabled", !local.triggerModeEnabled)}
            style={{
              fontSize: 8, fontFamily: EP_FONT, padding: "2px 8px", cursor: "pointer",
              background: local.triggerModeEnabled ? T.green + "22" : T.panelAlt,
              color: local.triggerModeEnabled ? T.green : T.textDim,
              border: `1px solid ${local.triggerModeEnabled ? T.green + "55" : T.border}`,
              borderRadius: 2, fontWeight: 700, letterSpacing: 1,
            }}
          >
            {local.triggerModeEnabled ? "ON" : "OFF"}
          </button>
          {local.triggerModeEnabled && (
            <span style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT, letterSpacing: 0.5, animation: "trigger-blink 0.8s infinite" }}>ACTIVE</span>
          )}
        </div>
        <div style={{ fontSize: 7, color: local.triggerModeEnabled ? T.green : T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.3, lineHeight: 1.5, padding: "3px 4px", background: local.triggerModeEnabled ? T.green + "08" : "transparent", border: `1px solid ${local.triggerModeEnabled ? T.green + "22" : "transparent"}`, borderRadius: 2 }}>
          {local.triggerModeEnabled
            ? "DCA: E1=BB cross → E2/E3=Hurst cross (2x→4x) | EXIT=opposite Hurst zamyka WSZYSTKO"
            : "Włącz by używać DCA strategii Hurst + BB"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3, marginTop: 2 }}>
          <div style={{ padding: "2px 4px", background: T.green + "0A", border: `1px solid ${T.green}22`, borderRadius: 2, textAlign: "center" }}>
            <div style={{ fontSize: 7, color: T.green, fontFamily: EP_FONT, fontWeight: 700 }}>LONG DCA</div>
            <div style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>E1:BB&lt;L 1x | E2:H↑0 2x | E3:H↑0 4x</div>
          </div>
          <div style={{ padding: "2px 4px", background: T.red + "0A", border: `1px solid ${T.red}22`, borderRadius: 2, textAlign: "center" }}>
            <div style={{ fontSize: 7, color: T.red, fontFamily: EP_FONT, fontWeight: 700 }}>SHORT DCA</div>
            <div style={{ fontSize: 6, color: T.textDim, fontFamily: EP_FONT }}>E1:BB&gt;U 1x | E2:H↓1 2x | E3:H↓1 4x</div>
          </div>
        </div>
      </div>

      {/* Exit Protection — prevent premature closes */}
      <div style={{ fontSize: 8, color: T.red, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", margin: "6px 0 4px", borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>EXIT PROTECTION</div>

      <div style={{ display: "grid", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, color: T.text, fontFamily: EP_FONT }}>Exit Only SL/TP</span>
          <button
            onClick={() => updateBool("exitOnlyOnSltp", !local.exitOnlyOnSltp)}
            style={{
              fontSize: 8, fontFamily: EP_FONT, padding: "2px 8px", cursor: "pointer",
              background: local.exitOnlyOnSltp ? T.green + "22" : T.panelAlt,
              color: local.exitOnlyOnSltp ? T.green : T.textDim,
              border: `1px solid ${local.exitOnlyOnSltp ? T.green + "55" : T.border}`,
              borderRadius: 2, fontWeight: 700, letterSpacing: 1,
            }}
          >
            {local.exitOnlyOnSltp ? "ON" : "OFF"}
          </button>
        </div>
        <div style={{ fontSize: 7, color: local.exitOnlyOnSltp ? T.green : T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.3, lineHeight: 1.5, padding: "3px 4px", background: local.exitOnlyOnSltp ? T.green + "08" : "transparent", border: `1px solid ${local.exitOnlyOnSltp ? T.green + "22" : "transparent"}`, borderRadius: 2 }}>
          {local.exitOnlyOnSltp
            ? "Pozycja zamykana TYLKO przez SL/TP — ignoruje odwrotny sygnał"
            : "Odwrotny sygnał zamknie pozycję przed SL/TP"}
        </div>
        {cfgRow("Min Hold Time", T.text, "minHoldMinutes", "min", 1, 0, 60, false)}
        <div style={{ fontSize: 6, color: T.textMuted, fontFamily: EP_FONT }}>Min. czas trzymania przed zamknięciem przez sygnał odwrotny (0 = wyłączone)</div>
      </div>

      {/* Per-trade settings — grid rows with fixed widths for alignment */}
      <div style={{ fontSize: 8, color: T.yellow, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", margin: "6px 0 4px", borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>PER-TRADE</div>

      <div style={{ display: "grid", gap: 3 }}>
        {cfgRow("Order Size", T.text, "orderSizeUsd", "USD", 1, 1, undefined, false)}
        {cfgRow("Leverage", T.text, "leverage", "×", 1, 1, 50, true)}
        {cfgRow("Stop Loss", T.red, "stopLossPct", "%", 0.1, 0.1)}
        {cfgRow("Take Profit", T.green, "takeProfitPct", "%", 0.1, 0.1)}
        {cfgRow("Min Confidence", T.text, "minConfidence", "%", 5, 10, 100, true)}
      </div>

      {/* Timing settings */}
      <div style={{ fontSize: 8, color: T.cyan, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", margin: "6px 0 4px", borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>TIMING</div>

      <div style={{ display: "grid", gap: 3 }}>
        {cfgRow("Loop Interval", T.text, "loopIntervalSec", "sec", 5, 5, undefined, true)}
        {cfgRow("Trade Cooldown", T.text, "cooldownAfterTradeSec", "sec", 10, 0, undefined, true)}
        {cfgRow("Signal Flip Block", T.text, "signalFlipCooldownSec", "sec", 10, 0, undefined, true)}
      </div>

      {/* Apply button */}
      {dirty && (
        <button onClick={apply} style={{
          marginTop: 8, width: "100%", fontSize: 9, padding: "5px 0",
          background: T.orange + "22", color: T.orange,
          border: `1px solid ${T.orange}55`, borderRadius: 2, cursor: "pointer",
          fontWeight: 700, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase",
          boxShadow: `0 0 8px ${T.orange}22`,
        }}>
          APPLY CONFIG
        </button>
      )}
    </Panel>
  );
}

// ─── Strategy Presets Panel ────────────────────────────────────────────────

type TradeConfig = BotState["tradeConfig"];

interface StrategyPreset {
  name: string;
  desc: string;
  mode: "PAPER" | "BACKTEST" | "LIVE";
  risk: "LOW" | "MED" | "HIGH";
  cfg: TradeConfig;
}

const STRATEGY_PRESETS: StrategyPreset[] = [
  {
    name: "CONSERVATIVE",
    desc: "Small size, tight SL, high confidence threshold",
    mode: "PAPER",
    risk: "LOW",
    cfg: { orderSizeUsd: 5, leverage: 1, stopLossPct: 1.0, takeProfitPct: 3.0, minConfidence: 75, loopIntervalSec: 15, cooldownAfterTradeSec: 300, signalFlipCooldownSec: 120, aiApiKey: "", aiEngineEnabled: false, triggerModeEnabled: true, exitOnlyOnSltp: true, minHoldMinutes: 5 },
  },
  {
    name: "MODERATE",
    desc: "Balanced risk/reward for stable returns",
    mode: "PAPER",
    risk: "MED",
    cfg: { orderSizeUsd: 10, leverage: 3, stopLossPct: 1.5, takeProfitPct: 4.5, minConfidence: 60, loopIntervalSec: 10, cooldownAfterTradeSec: 120, signalFlipCooldownSec: 60, aiApiKey: "", aiEngineEnabled: false, triggerModeEnabled: true, exitOnlyOnSltp: true, minHoldMinutes: 5 },
  },
  {
    name: "AGGRESSIVE",
    desc: "Larger size, wider SL, lower confidence threshold",
    mode: "PAPER",
    risk: "HIGH",
    cfg: { orderSizeUsd: 25, leverage: 5, stopLossPct: 2.5, takeProfitPct: 7.0, minConfidence: 45, loopIntervalSec: 10, cooldownAfterTradeSec: 60, signalFlipCooldownSec: 30, aiApiKey: "", aiEngineEnabled: false, triggerModeEnabled: true, exitOnlyOnSltp: true, minHoldMinutes: 3 },
  },
  {
    name: "SCALPER",
    desc: "Fast in/out, tiny profits, high frequency",
    mode: "PAPER",
    risk: "HIGH",
    cfg: { orderSizeUsd: 15, leverage: 3, stopLossPct: 0.5, takeProfitPct: 1.5, minConfidence: 50, loopIntervalSec: 5, cooldownAfterTradeSec: 30, signalFlipCooldownSec: 15, aiApiKey: "", aiEngineEnabled: false, triggerModeEnabled: true, exitOnlyOnSltp: true, minHoldMinutes: 2 },
  },
  {
    name: "SWING",
    desc: "Hold longer, wider stops, higher targets",
    mode: "BACKTEST",
    risk: "MED",
    cfg: { orderSizeUsd: 20, leverage: 2, stopLossPct: 3.0, takeProfitPct: 9.0, minConfidence: 65, loopIntervalSec: 30, cooldownAfterTradeSec: 600, signalFlipCooldownSec: 300, aiApiKey: "", aiEngineEnabled: false, triggerModeEnabled: true, exitOnlyOnSltp: true, minHoldMinutes: 10 },
  },
];

function StrategyPresetsPanel({ state, onApplyPreset, onSaveCustom }: { state: BotState; onApplyPreset: (cfg: TradeConfig, mode: string) => void; onSaveCustom: (name: string) => void }) {
  const T = useTheme();
  const [customName, setCustomName] = useState("");

  // Load saved presets from localStorage
  const [savedPresets, setSavedPresets] = useState<StrategyPreset[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("hypera-presets");
      if (raw) setSavedPresets(JSON.parse(raw));
    } catch {}
  }, []);

  const savePreset = (name: string) => {
    if (!name.trim()) return;
    const newPreset: StrategyPreset = {
      name: name.trim().toUpperCase(),
      desc: `Custom — ${new Date().toLocaleDateString()}`,
      mode: state.tradingMode as any,
      risk: "MED",
      cfg: { ...state.tradeConfig },
    };
    const updated = [...savedPresets.filter(p => p.name !== newPreset.name), newPreset];
    setSavedPresets(updated);
    localStorage.setItem("hypera-presets", JSON.stringify(updated));
    setCustomName("");
    if (onSaveCustom) onSaveCustom(newPreset.name);
  };

  const deletePreset = (name: string) => {
    const updated = savedPresets.filter(p => p.name !== name);
    setSavedPresets(updated);
    localStorage.setItem("hypera-presets", JSON.stringify(updated));
  };

  const riskColor = (r: string) => r === "HIGH" ? T.red : r === "LOW" ? T.green : T.yellow;
  const modeColor = (m: string) => m === "LIVE" ? T.red : m === "BACKTEST" ? T.cyan : T.orange;

  const presetRow = (p: StrategyPreset, i: number, deletable: boolean) => (
    <div key={i} style={{
      display: "flex", alignItems: "center", gap: 4, padding: "3px 4px",
      background: T.panelAlt, borderRadius: 2, borderLeft: `3px solid ${riskColor(p.risk)}`,
      boxShadow: `inset 0 1px 0 ${T.borderLight}`,
    }}>
      <span style={{ fontSize: 8, color: T.text, fontWeight: 700, fontFamily: EP_FONT, width: 64, flexShrink: 0, letterSpacing: 0.5 }}>{p.name}</span>
      <Badge color={riskColor(p.risk)}>{p.risk}</Badge>
      <Badge color={modeColor(p.mode)}>{p.mode}</Badge>
      <span style={{ fontSize: 7, color: T.textDim, fontFamily: EP_FONT, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>${p.cfg.orderSizeUsd} ×{p.cfg.leverage} SL:{p.cfg.stopLossPct}%</span>
      <button onClick={() => onApplyPreset(p.cfg, p.mode)} style={{
        fontSize: 7, padding: "1px 5px", background: T.green + "22", color: T.green,
        border: `1px solid ${T.green}44`, borderRadius: 2, cursor: "pointer", fontFamily: EP_FONT, fontWeight: 700,
      }}>LOAD</button>
      {deletable && (
        <button onClick={() => deletePreset(p.name)} style={{
          fontSize: 7, padding: "1px 4px", background: T.red + "22", color: T.red,
          border: `1px solid ${T.red}44`, borderRadius: 2, cursor: "pointer", fontFamily: EP_FONT,
        }}>×</button>
      )}
    </div>
  );

  return (
    <Panel title="Strategy Presets" accent={T.purple}>
      {/* Built-in presets */}
      <div style={{ fontSize: 8, color: T.textMuted, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", marginBottom: 4, borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>BUILT-IN</div>
      <div style={{ display: "grid", gap: 3, maxHeight: 140, overflowY: "auto" }}>
        {STRATEGY_PRESETS.map((p, i) => presetRow(p, i, false))}
      </div>

      {/* Saved custom presets */}
      {savedPresets.length > 0 && (
        <>
          <div style={{ fontSize: 8, color: T.cyan, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", margin: "6px 0 4px", borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>SAVED</div>
          <div style={{ display: "grid", gap: 3, maxHeight: 80, overflowY: "auto" }}>
            {savedPresets.map((p, i) => presetRow(p, i, true))}
          </div>
        </>
      )}

      {/* Save current config as preset */}
      <div style={{ fontSize: 8, color: T.green, letterSpacing: 1, fontFamily: EP_FONT, textTransform: "uppercase", margin: "6px 0 4px", borderBottom: `1px solid ${T.border}`, paddingBottom: 3 }}>SAVE CURRENT</div>
      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
        <input
          type="text" value={customName} onChange={e => setCustomName(e.target.value)}
          placeholder="Preset name..."
          style={{
            flex: 1, fontSize: 9, fontFamily: EP_FONT, color: T.text, background: T.panelAlt,
            border: `1px solid ${T.border}`, borderRadius: 2, padding: "3px 6px", outline: "none",
          }}
          onKeyDown={e => { if (e.key === "Enter") savePreset(customName); }}
        />
        <button onClick={() => savePreset(customName)} disabled={!customName.trim()} style={{
          fontSize: 8, padding: "3px 8px", background: customName.trim() ? T.green + "22" : T.panelAlt,
          color: customName.trim() ? T.green : T.textDim,
          border: `1px solid ${customName.trim() ? T.green + "44" : T.border}`, borderRadius: 2,
          cursor: customName.trim() ? "pointer" : "default", fontFamily: EP_FONT, fontWeight: 700,
        }}>SAVE</button>
      </div>
    </Panel>
  );
}

function LogConsole({ state }: { state: BotState }) {
  const T = useTheme();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.logs.length]);
  return (
    <Panel title="Log Console" accent={state.status === "running" ? T.green : T.textDim}>
      <div ref={ref} style={{ maxHeight: 180, overflowY: "auto", fontFamily: EP_FONT, fontSize: 9 }}>
        {state.logs.length === 0 ? (
          <span style={{ color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 0.5 }}>NO LOGS YET...</span>
        ) : (
          state.logs.slice(-80).map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 6, padding: "1px 0" }}>
              <span style={{ color: T.textMuted, flexShrink: 0 }}>{l.time}</span>
              <span style={{
                color: l.level === "ERROR" ? T.red : l.level === "WARN" ? T.orange : T.textDim,
                fontWeight: 600, flexShrink: 0, width: 36,
              }}>{l.level}</span>
              <span style={{ color: l.level === "ERROR" ? T.red : T.text, wordBreak: "break-all" }}>{l.msg}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function HyperADashboard() {
  const [state, setState] = useState<BotState>(DEFAULT_STATE);
  const [dark, setDark] = useState(true); // Always start dark for SSR consistency
  const [mounted, setMounted] = useState(false);
  const socketRef = useRef<Socket | PseudoSocket | null>(null);

  // Read persisted theme after mount to avoid hydration mismatch
  useEffect(() => {
    const saved = localStorage.getItem("hypera-theme");
    if (saved === "light") setDark(false);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted) localStorage.setItem("hypera-theme", dark ? "dark" : "light");
  }, [dark, mounted]);

  // ── Binance kline fetcher — populates chart history independently of bot ──
  const binanceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const loadBinance = async () => {
      const klines = await fetchBinanceKlines("BTCUSDT", "1h", 120);
      if (klines.length < 30) return;
      const closes = klines.map(k => parseFloat(k.close));

      const rsiHist = calcRSI(closes, 14);
      const macd = calcMACD(closes);
      const bb = calcBB(closes, 20, 2);
      const prices = closes.slice(-bb.upper.length);

      // Trim to last 120 points for chart display
      const trim = (arr: number[], max = 120) => arr.length > max ? arr.slice(-max) : arr;

      setState(prev => ({
        ...prev,
        rsiHistory: trim(rsiHist),
        macdLineHistory: trim(macd.macdLine),
        macdSignalHistory: trim(macd.signalLine),
        macdHistHistory: trim(macd.histogram),
        bbUpperHistory: trim(bb.upper),
        bbMiddleHistory: trim(bb.middle),
        bbLowerHistory: trim(bb.lower),
        priceHistory: trim(prices),
        // Also populate the latest indicator values for the panel
        rsi: rsiHist.length > 0 ? rsiHist[rsiHist.length - 1] : prev.rsi,
        macdLine: macd.macdLine.length > 0 ? macd.macdLine[macd.macdLine.length - 1] : prev.macdLine,
        macdSignal: macd.signalLine.length > 0 ? macd.signalLine[macd.signalLine.length - 1] : prev.macdSignal,
        macdHistogram: macd.histogram.length > 0 ? macd.histogram[macd.histogram.length - 1] : prev.macdHistogram,
        bbUpper: bb.upper.length > 0 ? bb.upper[bb.upper.length - 1] : prev.bbUpper,
        bbMiddle: bb.middle.length > 0 ? bb.middle[bb.middle.length - 1] : prev.bbMiddle,
        bbLower: bb.lower.length > 0 ? bb.lower[bb.lower.length - 1] : prev.bbLower,
        bbBandwidth: bb.upper.length > 0 ? ((bb.upper[bb.upper.length - 1] - bb.lower[bb.lower.length - 1]) / bb.middle[bb.middle.length - 1]) * 100 : prev.bbBandwidth,
        price: closes[closes.length - 1],
      }));
      console.log("[HyperA] Binance klines loaded:", klines.length, "candles");
    };

    loadBinance();
    binanceRef.current = setInterval(loadBinance, 60000); // refresh every 60s
    return () => { if (binanceRef.current) clearInterval(binanceRef.current); };
  }, []);

  // ── Binance WebSocket — live BTC price ──
  const binanceWsRef = useRef<WebSocket | null>(null);
  const binanceMountedRef = useRef(true);
  const binanceReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    binanceMountedRef.current = true;
    const connectBinanceWs = () => {
      if (!binanceMountedRef.current) return; // Don't reconnect after unmount
      // Binance combined stream: miniTicker for live price + 24h stats
      const coin = state.coin || "BTC";
      const wsUrl = `wss://stream.binance.com:9443/ws/${coin.toLowerCase()}usdt@miniTicker`;
      try {
        const ws = new WebSocket(wsUrl);
        binanceWsRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.c) {
              // c = last price, v = volume, h = high, l = low, P = price change pct
              const livePrice = parseFloat(data.c);
              const liveVolume = parseFloat(data.q); // quote volume (USD)
              setState(prev => ({
                ...prev,
                price: livePrice,
                volume: liveVolume,
                // Update priceHistory for charts if we have history
                priceHistory: prev.priceHistory.length > 0
                  ? [...prev.priceHistory.slice(0, -1), livePrice]
                  : [livePrice],
              }));
            }
          } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
          // Reconnect after 3s, but only if still mounted
          if (binanceMountedRef.current) {
            binanceReconnectRef.current = setTimeout(connectBinanceWs, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch { /* WebSocket not available */ }
    };

    connectBinanceWs();
    return () => {
      binanceMountedRef.current = false;
      if (binanceReconnectRef.current) clearTimeout(binanceReconnectRef.current);
      binanceWsRef.current?.close();
    };
  }, []);

  // ── Multi-timeframe indicator fetcher — populates ohlcvMtf for 1m/5m/15m/30m ──
  const mtfRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentTriggersRef = useRef<Set<string>>(new Set()); // deduplicate triggers within same candle
  useEffect(() => {
    const loadMtf = async () => {
      const mtfData = await fetchMtfIndicators("BTCUSDT");
      if (Object.keys(mtfData).length > 0) {
        setState(prev => {
          const newState = { ...prev, ohlcvMtf: { ...prev.ohlcvMtf, ...mtfData } };

          // ── Send ENTRY signals to Go agent via Socket.IO ──
          // DCA STRATEGY: send ALL individual triggers (not AND-only)
          // Go agent handles DCA logic: E1=BB cross, E2/3=Hurst cross, Exit=opposite Hurst
          // Also: server-side Hurst triggers are computed in fetchIndicators()
          const tfs = ["1m", "5m", "15m", "30m", "1h", "2h", "4h", "1d"];
          for (const tf of tfs) {
            const d = mtfData[tf];
            if (!d) continue;
            const anyTrigger = d.hurstCrossUp || d.hurstCrossDown || d.bbCrossLower || d.bbCrossUpper;

            if (anyTrigger) {
              // Build a unique trigger signature from TF + triggers + last candle open time
              // This prevents re-sending the same trigger across multiple 30s fetches
              const lastCandleTime = d.candleOpenTimes?.length ? d.candleOpenTimes[d.candleOpenTimes.length - 1] : 0;
              const triggerSig = `${tf}:${lastCandleTime}:${d.hurstCrossUp ? "H↑" : ""}${d.hurstCrossDown ? "H↓" : ""}${d.bbCrossLower ? "BB<" : ""}${d.bbCrossUpper ? "BB>" : ""}`;
              const alreadySent = sentTriggersRef.current.has(triggerSig);

              const socket = (window as any).__hyperSocket;
              if (socket && socket.connected && prev.tradeConfig.triggerModeEnabled && !alreadySent) {
                socket.emit("trigger_update", {
                  hurstCrossUp: d.hurstCrossUp ?? false,
                  hurstCrossDown: d.hurstCrossDown ?? false,
                  bbCrossLower: d.bbCrossLower ?? false,
                  bbCrossUpper: d.bbCrossUpper ?? false,
                  timeframe: tf,
                });
                sentTriggersRef.current.add(triggerSig);
                // Clear old signatures after 5 minutes (new candle boundary)
                setTimeout(() => sentTriggersRef.current.delete(triggerSig), 300000);
                // DCA role labels
                const roles: string[] = [];
                if (d.bbCrossLower) roles.push("E1:BB<");
                if (d.bbCrossUpper) roles.push("E1:BB>");
                if (d.hurstCrossUp) roles.push("E2/E3:H↑0");
                if (d.hurstCrossDown) roles.push("Exit:H↓1");
                console.log(`[HyperA] 🎯 DCA Trigger sent (${tf}): ${roles.join(" | ")}`);
              }
              // NOTE: Do NOT break — send triggers for ALL timeframes
            }
          }

          return newState;
        });
        console.log("[HyperA] MTF indicators loaded:", Object.keys(mtfData).join(", "),
          Object.entries(mtfData).map(([k, v]) => `${k}: rsi=${v.rsi.length} macd=${v.macdLine.length} bb=${v.bbUpper.length}`).join(" | "));
      }
    };

    loadMtf();
    mtfRef.current = setInterval(loadMtf, 30000); // refresh every 30s (shorter interval = more responsive)
    return () => { if (mtfRef.current) clearInterval(mtfRef.current); };
  }, []);

  useEffect(() => {
    // Socket.IO runs on the same port as Next.js (3000)
    // XTransformPort=3000 query param tells Caddy gateway to route to localhost:3000
    const s = io({
      path: "/socket.io",
      transports: ["polling", "websocket"],  // polling first — more reliable through reverse proxy, then upgrade
      query: { XTransformPort: "3000" },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 100,
      timeout: 45000,
      upgrade: true,
    });
    socketRef.current = s;
    (window as any).__hyperSocket = s;

    s.on("state", (newState: BotState) => {
      // State update received from server — merge into local state
      setState(prev => {
        // Merge ohlcvMtf: server data supplements client data, but client MTF data takes priority
        // (prevents server's empty {} from wiping out client-side fetched indicators)
        const mergedMtf = { ...prev.ohlcvMtf };
        if (newState.ohlcvMtf && Object.keys(newState.ohlcvMtf).length > 0) {
          // If server has data for a timeframe, merge it (server data as supplement)
          for (const [tf, tfData] of Object.entries(newState.ohlcvMtf)) {
            if (tfData && (tfData as any).rsi?.length > 0) {
              // Only use server data if client doesn't already have it for this tf
              if (!mergedMtf[tf] || !(mergedMtf[tf] as any).rsi?.length) {
                mergedMtf[tf] = tfData as any;
              }
            }
          }
        }
        // Merge tradeConfig: preserve client-side boolean toggles that were just applied
        // (server may send stale false before processing our update_config)
        const getBool = (key: string, serverVal: boolean | undefined, localVal: boolean): boolean => {
          // ConfigPanel tracks its own toggle timestamps and prevents stale overwrites locally.
          // Here we simply prefer server value if present, otherwise keep local.
          return serverVal ?? localVal;
        };
        // Merge tradeConfig: start from prev as base so all keys are always defined
        // (server may send partial tradeConfig missing keys like minHoldMinutes)
        const mergedTradeConfig = {
          ...prev.tradeConfig,
          ...newState.tradeConfig,
          triggerModeEnabled: getBool("triggerModeEnabled", newState.tradeConfig?.triggerModeEnabled, prev.tradeConfig.triggerModeEnabled),
          aiEngineEnabled: getBool("aiEngineEnabled", newState.tradeConfig?.aiEngineEnabled, prev.tradeConfig.aiEngineEnabled),
          exitOnlyOnSltp: newState.tradeConfig?.exitOnlyOnSltp ?? prev.tradeConfig.exitOnlyOnSltp,
          minHoldMinutes: newState.tradeConfig?.minHoldMinutes ?? prev.tradeConfig.minHoldMinutes,
        };

        // Preserve Binance WebSocket live price if it's more recent than server's price
        // (WS updates every ~100ms, server every 10s — prevents price flickering)
        const mergedPrice = (newState.price != null && prev.price != null)
          ? prev.price  // Keep the WS live price (it's always more recent)
          : (newState.price ?? prev.price);

        // Cap unbounded arrays to prevent OOM in long-running sessions
        const mergedLogs = (newState.logs ?? prev.logs).slice(-200);
        const mergedBalanceHistory = (newState.paperBalanceHistory ?? prev.paperBalanceHistory).slice(-500);
        const mergedSignalMarkers = (newState.signalMarkers ?? prev.signalMarkers).slice(-100);
        const mergedWhaleActivity = (newState.whaleActivity ?? prev.whaleActivity).slice(-50);
        const mergedWhaleTopPositions = (newState.whaleTopPositions ?? prev.whaleTopPositions).slice(-30);
        const mergedTraderProfiles = (newState.traderProfiles ?? prev.traderProfiles).slice(-30);
        const mergedPaperRecentTrades = (newState.paperRecentTrades ?? prev.paperRecentTrades).slice(-50);
        const mergedPaperOpenPositions = (newState.paperOpenPositions ?? prev.paperOpenPositions).slice(-20);

        return {
          ...prev, ...newState,
          ohlcvMtf: mergedMtf, tradeConfig: mergedTradeConfig, price: mergedPrice,
          logs: mergedLogs, paperBalanceHistory: mergedBalanceHistory,
          signalMarkers: mergedSignalMarkers, whaleActivity: mergedWhaleActivity,
          whaleTopPositions: mergedWhaleTopPositions, traderProfiles: mergedTraderProfiles,
          paperRecentTrades: mergedPaperRecentTrades, paperOpenPositions: mergedPaperOpenPositions,
        };
      });
    });
    s.on("connect", () => console.log("[HyperA] Socket connected"));
    s.on("disconnect", () => console.log("[HyperA] Socket disconnected"));
    s.on("connect_error", (err: Error) => {
      // "xhr poll error" is expected when connecting through proxy before upgrade — suppress noise
      if (err.message === "xhr poll error") return;
      console.error("[HyperA] Socket error:", err.message);
    });

    return () => { s.disconnect(); };
  }, []);

  const handleStart = useCallback(() => { socketRef.current?.emit("start"); }, []);
  const handleStop = useCallback(() => { socketRef.current?.emit("stop"); }, []);
  const handleUpdateConfig = useCallback((cfg: BotState["tradeConfig"]) => {
    socketRef.current?.emit("update_config", cfg);
  }, []);
  const handleApplyPreset = useCallback((cfg: TradeConfig, _mode: string) => {
    socketRef.current?.emit("update_config", cfg);
  }, []);
  const handleSaveCustomPreset = useCallback((_name: string) => {
    // Preset saved to localStorage — no server action needed
  }, []);
  const handleResetCB = useCallback(() => {
    socketRef.current?.emit("reset_circuit_breaker");
  }, []);

  // ── Trigger Focus Mode — hides non-essential panels for Hurst+BB trading ──
  const [triggerFocus, setTriggerFocus] = useState(false);

  // Panels essential for Hurst+BB trigger strategy
  const ESSENTIAL_PANELS = useMemo(() => new Set([
    "decisionPanel", "market", "techIndicators", "triggers", "rsiChart", "hurstChart", "bbChart",
    "paperTrading", "equityCurve", "backtest", "config", "logConsole",
    "orderFlow", // OFI/CVD useful for entry confirmation
  ]), []);

  const T = dark ? EP_DARK : EP_LIGHT;

  return (
    <ThemeCtx.Provider value={T}>
      <DashboardInner
        state={state}
        dark={dark}
        T={T}
        onThemeToggle={() => setDark(d => !d)}
        onStart={handleStart}
        onStop={handleStop}
        triggerFocus={triggerFocus}
        onToggleFocus={() => setTriggerFocus(f => !f)}
        onResetCB={handleResetCB}
        onUpdateConfig={handleUpdateConfig}
        onApplyPreset={handleApplyPreset}
        onSaveCustomPreset={handleSaveCustomPreset}
        ESSENTIAL_PANELS={ESSENTIAL_PANELS}
      />
    </ThemeCtx.Provider>
  );
}

// ─── Phase 1: USAB-001 DecisionPanel + USAB-002 StatusBar + USAB-003 AlertBanner ─
// Audit roadmap: P0 critical items for the "panel podglądowy" (monitoring dashboard).
// Goal: glanceable, actionable, no hunting across 28 panels for the current verdict.

// ─── computeDecision ─────────────────────────────────────────────────────────
// Single source of truth for the BUY/HOLD/SELL verdict. Pure function of state.
// Used by DecisionPanel AND StatusBar so they always agree.
interface DecisionResult {
  verdict: "STRONG_BUY" | "BUY" | "HOLD" | "SELL" | "STRONG_SELL" | "BLOCKED";
  confidence: number;            // 0-100
  direction: "BUY" | "SHORT" | "NEUTRAL";
  reasons: string[];             // top contributors (max 4 shown)
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  recommendedSizeUsd: number;
  recommendedSlPct: number;
  recommendedTpPct: number;
  recommendedLeverage: number;
  actionLabel: string;           // what the operator should do RIGHT NOW
}

function computeDecision(state: BotState): DecisionResult {
  const cfg = state.tradeConfig;
  const cb = state.circuitBreaker;

  // ── Hard block: circuit breaker active or status errored ──
  if (cb?.active) {
    return {
      verdict: "BLOCKED",
      confidence: 0,
      direction: "NEUTRAL",
      reasons: [`Circuit breaker HALTED — ${cb.reason || "threshold breached"}`, `Cooldown ${cb.cooldownRemaining ?? 0}min remaining`],
      riskLevel: "HIGH",
      recommendedSizeUsd: 0,
      recommendedSlPct: cfg.stopLossPct,
      recommendedTpPct: cfg.takeProfitPct,
      recommendedLeverage: 1,
      actionLabel: "WAIT — reset circuit breaker before resuming",
    };
  }
  if (state.status === "error") {
    return {
      verdict: "BLOCKED",
      confidence: 0,
      direction: "NEUTRAL",
      reasons: ["Agent status: ERROR — check logs"],
      riskLevel: "HIGH",
      recommendedSizeUsd: 0,
      recommendedSlPct: cfg.stopLossPct,
      recommendedTpPct: cfg.takeProfitPct,
      recommendedLeverage: 1,
      actionLabel: "Investigate error before trading",
    };
  }

  // ── Aggregate DCA triggers across all timeframes ──
  let buyTriggers = 0;
  let shortTriggers = 0;
  const reasons: string[] = [];
  const priorityTf = "15m";

  for (const [tf, d] of Object.entries(state.ohlcvMtf || {})) {
    if (d.bbCrossLower)  { buyTriggers++;   reasons.push(`${tf}: BB<lower (E1 BUY)`); }
    if (d.bbCrossUpper)  { shortTriggers++; reasons.push(`${tf}: BB>upper (E1 SHORT)`); }
    if (d.hurstCrossUp)  { buyTriggers++;   reasons.push(`${tf}: Hurst↑0.0 (E2/E3 BUY)`); }
    if (d.hurstCrossDown){ shortTriggers++; reasons.push(`${tf}: Hurst↓1.0 (E2/E3 SHORT)`); }
  }

  // ── DCA group state — if a position is open, the verdict leans toward continuation ──
  const openPos = state.paperOpenPositions || [];
  const dcaLongs = openPos.filter(p => p.side === "LONG" && p.dcaEntry);
  const dcaShorts = openPos.filter(p => p.side === "SHORT" && p.dcaEntry);
  if (dcaLongs.length > 0) {
    buyTriggers += 1;
    reasons.unshift(`DCA LONG open — E${dcaLongs.length}/3 (next: ${dcaLongs.length < 3 ? `Hurst↑0.0 ${[1,2,4][dcaLongs.length]}x` : "EXIT Hurst↓1.0"})`);
  }
  if (dcaShorts.length > 0) {
    shortTriggers += 1;
    reasons.unshift(`DCA SHORT open — E${dcaShorts.length}/3 (next: ${dcaShorts.length < 3 ? `Hurst↓1.0 ${[1,2,4][dcaShorts.length]}x` : "EXIT Hurst↑0.0"})`);
  }

  // ── AI decision (if present) — adds weight but doesn't override triggers ──
  const ai = state.aiDecision;
  if (ai && ai.confidence > 50) {
    if (ai.direction === "BULL" || ai.direction === "LONG" || ai.direction === "UP") {
      buyTriggers += 0.5;
      reasons.push(`AI: ${ai.direction} ${ai.confidence}% (${ai.strategy})`);
    } else if (ai.direction === "BEAR" || ai.direction === "SHORT" || ai.direction === "DOWN") {
      shortTriggers += 0.5;
      reasons.push(`AI: ${ai.direction} ${ai.confidence}% (${ai.strategy})`);
    }
  }

  // ── Funding proximity warning — dampens verdict if extreme funding is near ──
  let fundingDampener = 0;
  if (state.fundingNear && state.fundingRate != null) {
    const frPct = state.fundingRate * 100;
    if (Math.abs(frPct) > 0.05) {
      fundingDampener = 15;
      reasons.push(`Funding near: ${frPct.toFixed(4)}% — closing pressure`);
    }
  }

  // ── RSI extremes — light confirmation ──
  if (state.rsi != null) {
    if (state.rsi < 30) { buyTriggers += 0.3; reasons.push(`RSI ${state.rsi.toFixed(0)} oversold`); }
    if (state.rsi > 70) { shortTriggers += 0.3; reasons.push(`RSI ${state.rsi.toFixed(0)} overbought`); }
  }

  // ── Compute net direction & confidence ──
  const net = buyTriggers - shortTriggers;
  let direction: "BUY" | "SHORT" | "NEUTRAL" = "NEUTRAL";
  if (net > 0.5) direction = "BUY";
  else if (net < -0.5) direction = "SHORT";

  const totalTriggers = buyTriggers + shortTriggers;
  let confidence = Math.min(95, 25 + Math.abs(net) * 20 + Math.min(totalTriggers, 4) * 8 - fundingDampener);
  if (totalTriggers === 0) confidence = 20;

  // ── Risk adjustment from volatility regime ──
  const vol = state.volatilityRegime || "MEDIUM";
  let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "MEDIUM";
  let sizeMult = 1;
  let levMult = 1;
  if (vol === "LOW")      { riskLevel = "LOW";    sizeMult = 1.25; levMult = 1.0; }
  else if (vol === "HIGH"){ riskLevel = "HIGH";   sizeMult = 0.5;  levMult = 0.6; }
  if (state.perpPremiumPct != null && Math.abs(state.perpPremiumPct) > 0.3) {
    riskLevel = "HIGH";
    sizeMult = Math.min(sizeMult, 0.5);
  }

  // ── Verdict mapping ──
  let verdict: DecisionResult["verdict"] = "HOLD";
  if (direction === "BUY" && confidence >= 75) verdict = "STRONG_BUY";
  else if (direction === "BUY") verdict = "BUY";
  else if (direction === "SHORT" && confidence >= 75) verdict = "STRONG_SELL";
  else if (direction === "SHORT") verdict = "SELL";

  // ── Recommended params (apply risk multiplier) ──
  const recommendedSizeUsd = Math.max(10, Math.round(cfg.orderSizeUsd * sizeMult));
  const recommendedLeverage = Math.max(1, Math.round(cfg.leverage * levMult));
  const recommendedSlPct = cfg.stopLossPct * (riskLevel === "HIGH" ? 1.25 : riskLevel === "LOW" ? 0.85 : 1);
  const recommendedTpPct = cfg.takeProfitPct * (riskLevel === "HIGH" ? 1.5 : 1);

  // ── Action label ──
  let actionLabel: string;
  if (verdict === "BLOCKED") actionLabel = "WAIT — reset circuit breaker";
  else if (verdict === "STRONG_BUY") actionLabel = `OPEN LONG DCA — E1 size $${recommendedSizeUsd}`;
  else if (verdict === "BUY") actionLabel = `MONITOR LONG — wait for E2 Hurst↑0.0`;
  else if (verdict === "STRONG_SELL") actionLabel = `OPEN SHORT DCA — E1 size $${recommendedSizeUsd}`;
  else if (verdict === "SELL") actionLabel = `MONITOR SHORT — wait for E2 Hurst↓1.0`;
  else actionLabel = "HOLD — no actionable trigger";

  // Trim reasons to 4
  const trimmedReasons = reasons.slice(0, 4);

  return {
    verdict, confidence, direction, reasons: trimmedReasons,
    riskLevel, recommendedSizeUsd, recommendedSlPct, recommendedTpPct, recommendedLeverage,
    actionLabel,
  };
}

// ─── USAB-001 DecisionPanel ──────────────────────────────────────────────────
// The single most impactful addition per the usability audit. Replaces the need
// to scan 6+ panels (Triggers, RSI, BB, Hurst, AI, CircuitBreaker, Risk) to
// answer "what should I do right now?".
function DecisionPanel({ state }: { state: BotState }) {
  const T = useTheme();
  const d = computeDecision(state);

  const verdictColor =
    d.verdict === "STRONG_BUY" ? T.green :
    d.verdict === "BUY"        ? T.green :
    d.verdict === "STRONG_SELL"? T.red :
    d.verdict === "SELL"       ? T.red :
    d.verdict === "BLOCKED"    ? T.red :
    T.textDim;

  const verdictBg =
    d.verdict === "BLOCKED" ? T.red + "18" :
    d.direction === "BUY"   ? T.green + "12" :
    d.direction === "SHORT" ? T.red + "12" :
    T.panelAlt;

  const verdictLabel =
    d.verdict === "STRONG_BUY"  ? "▲ STRONG BUY" :
    d.verdict === "BUY"         ? "▲ BUY" :
    d.verdict === "STRONG_SELL" ? "▼ STRONG SELL" :
    d.verdict === "SELL"        ? "▼ SELL" :
    d.verdict === "BLOCKED"     ? "■ BLOCKED" :
    "◆ HOLD";

  const riskColor = d.riskLevel === "HIGH" ? T.red : d.riskLevel === "LOW" ? T.green : T.orange;

  return (
    <Panel title="Decision" accent={verdictColor} style={{ borderColor: verdictColor + "66" }}>
      {/* Verdict block — single glance */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 8px", marginBottom: 6, background: verdictBg,
        borderRadius: 3, border: `1px solid ${verdictColor}44`,
      }}>
        <span style={{
          fontSize: 16, fontWeight: 800, letterSpacing: 2, fontFamily: EP_FONT,
          color: verdictColor, textShadow: `0 0 10px ${verdictColor}55`,
        }}>{verdictLabel}</span>
        <span style={{ fontSize: 9, color: T.textDim, fontFamily: EP_FONT, letterSpacing: 0.5 }}>
          {d.confidence.toFixed(0)}% conf
        </span>
      </div>

      {/* Confidence bar */}
      <ProgressBar value={d.confidence} max={100} color={verdictColor} height={5} />

      {/* Action label — what to do RIGHT NOW */}
      <div style={{
        marginTop: 6, padding: "5px 8px",
        background: T.panelAlt, borderRadius: 2, border: `1px solid ${T.border}`,
        fontSize: 10, fontWeight: 700, color: verdictColor, fontFamily: EP_FONT,
        letterSpacing: 0.5, lineHeight: 1.4,
      }}>
        {d.actionLabel}
      </div>

      {/* Reasons — top contributors */}
      {d.reasons.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 8, color: T.textMuted, marginBottom: 3, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>Signals</div>
          {d.reasons.map((r, i) => (
            <div key={i} style={{ fontSize: 9, color: T.textDim, paddingLeft: 6, marginBottom: 1, fontFamily: EP_FONT, lineHeight: 1.4 }}>▸ {r}</div>
          ))}
        </div>
      )}

      {/* Recommended params — risk-adjusted */}
      <div style={{
        marginTop: 6, padding: "5px 6px", background: T.panelAlt,
        borderRadius: 2, border: `1px solid ${T.border}`,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 8px",
      }}>
        <StatRow label="Risk"     value={d.riskLevel}                  color={riskColor} />
        <StatRow label="Size"     value={"$" + d.recommendedSizeUsd}   color={T.text} />
        <StatRow label="Leverage" value={d.recommendedLeverage + "×"}  color={d.recommendedLeverage > 3 ? T.orange : T.text} />
        <StatRow label="SL"       value={d.recommendedSlPct.toFixed(1) + "%"}  color={T.red} />
        <StatRow label="TP"       value={d.recommendedTpPct.toFixed(1) + "%"}  color={T.green} />
        <StatRow label="Dir"      value={d.direction}                  color={dirColor(d.direction, T)} />
      </div>
    </Panel>
  );
}

// ─── USAB-002 StatusBar ──────────────────────────────────────────────────────
// Thin full-width strip below the header — every metric the operator needs to
// know "is the bot healthy and what is the market doing" in a single glance.
function StatusBar({ state }: { state: BotState }) {
  const T = useTheme();
  const d = computeDecision(state);

  const statusColor = state.status === "running" ? T.green : state.status === "error" ? T.red : T.textDim;
  const statusLabel = state.status.toUpperCase();

  const chgPct = state.markPx && state.prevDayPx && state.prevDayPx > 0
    ? ((state.markPx - state.prevDayPx) / state.prevDayPx) * 100 : null;

  const rsiColor = state.rsi == null ? T.textMuted
    : state.rsi > 70 ? T.red : state.rsi < 30 ? T.green : T.text;

  const verdictColor =
    d.verdict === "STRONG_BUY" || d.verdict === "BUY" ? T.green :
    d.verdict === "STRONG_SELL" || d.verdict === "SELL" ? T.red :
    d.verdict === "BLOCKED" ? T.red : T.textDim;

  const cbActive = state.circuitBreaker?.active === true;
  const volColor = state.volatilityRegime === "HIGH" ? T.red : state.volatilityRegime === "LOW" ? T.green : T.yellow;

  const cell = (label: string, value: React.ReactNode, color: string = T.text, glow: boolean = false): React.ReactNode => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, minWidth: 0, padding: "0 8px", borderLeft: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 7, color: T.textMuted, fontFamily: EP_FONT, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      <span style={{
        fontSize: 11, color, fontFamily: EP_FONT, fontWeight: 700, letterSpacing: 0.5,
        textShadow: glow ? `0 0 6px ${color}66` : "none",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>{value}</span>
    </div>
  );

  return (
    <div style={{
      display: "flex", alignItems: "stretch", gap: 0,
      padding: "4px 0", background: T.panel, border: `1px solid ${T.border}`, borderRadius: 2,
      fontFamily: EP_FONT, overflow: "hidden",
    }}>
      {/* Status LED + label */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "0 10px" }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", background: statusColor,
          boxShadow: `0 0 6px ${statusColor}`, animation: state.status === "running" ? "pulse-live 1.5s infinite" : "none",
        }} />
        <span style={{ fontSize: 10, color: statusColor, fontWeight: 700, fontFamily: EP_FONT, letterSpacing: 1 }}>{statusLabel}</span>
      </div>

      {/* Price */}
      {cell("BTC", state.price ? fmtUsd(state.price) : "—", T.text, true)}
      {/* 24h change */}
      {cell("24H", chgPct != null ? fmtPct(chgPct) : "—", chgPct == null ? T.textMuted : chgPct >= 0 ? T.green : T.red)}
      {/* RSI */}
      {cell("RSI", state.rsi != null ? state.rsi.toFixed(1) : "—", rsiColor)}
      {/* Verdict */}
      {cell("VERDICT", d.verdict.replace(/_/g, " "), verdictColor, true)}
      {/* Vol regime */}
      {cell("VOL", state.volatilityRegime || "—", volColor)}
      {/* Funding */}
      {cell("FUND", state.fundingRate != null ? (state.fundingRate * 100).toFixed(4) + "%" : "—",
        state.fundingRate != null && state.fundingRate > 0 ? T.green : state.fundingRate != null ? T.red : T.textMuted)}
      {/* Paper PnL today */}
      {cell("P&L D", fmtUsd(state.paperDailyPnl),
        state.paperDailyPnl == null ? T.textMuted : state.paperDailyPnl >= 0 ? T.green : T.red)}
      {/* Circuit breaker */}
      {cell("CB", cbActive ? "HALTED" : "SAFE", cbActive ? T.red : T.green, cbActive)}
      {/* Clock */}
      {cell("TIME", state.lastUpdate ? new Date(state.lastUpdate).toLocaleTimeString("en-GB") : "—", T.textDim)}
    </div>
  );
}

// ─── USAB-003 AlertBanner ────────────────────────────────────────────────────
// Dismissible inline banner shown ABOVE the grid when an operator-visible
// condition requires attention. P0 triggers: circuit breaker HALTED, agent
// ERROR, funding near + extreme, large drawdown.
type AlertLevel = "critical" | "warning" | "info";
interface AlertItem { id: string; level: AlertLevel; title: string; detail?: string; }

function collectAlerts(state: BotState): AlertItem[] {
  const out: AlertItem[] = [];
  const cb = state.circuitBreaker;
  if (cb?.active) {
    out.push({
      id: "cb-active",
      level: "critical",
      title: "CIRCUIT BREAKER HALTED",
      detail: cb.reason ? `${cb.reason} · cooldown ${cb.cooldownRemaining ?? 0}min` : `cooldown ${cb.cooldownRemaining ?? 0}min`,
    });
  }
  if (state.status === "error") {
    out.push({ id: "agent-error", level: "critical", title: "AGENT ERROR", detail: "Check LOG panel for traceback" });
  }
  if ((cb?.drawdownPct ?? 0) > 7) {
    out.push({ id: "drawdown", level: "warning", title: "DRAWDOWN " + (cb!.drawdownPct ?? 0).toFixed(2) + "%", detail: "Approaching max drawdown threshold" });
  }
  if (state.fundingNear && state.fundingRate != null) {
    const frPct = state.fundingRate * 100;
    if (Math.abs(frPct) > 0.05) {
      out.push({
        id: "funding-extreme",
        level: "warning",
        title: "FUNDING NEAR · " + frPct.toFixed(4) + "%",
        detail: frPct > 0 ? "Longs pay shorts — closing pressure on longs" : "Shorts pay longs — closing pressure on shorts",
      });
    }
  }
  if (state.perpPremiumPct != null && Math.abs(state.perpPremiumPct) > 0.3) {
    out.push({
      id: "perp-premium",
      level: "warning",
      title: "PERP PREMIUM " + state.perpPremiumPct.toFixed(2) + "%",
      detail: state.perpPremiumPct > 0 ? "Market overheated — correction risk" : "Discount / panic — bounce risk",
    });
  }
  if (state.volatilityRegime === "HIGH") {
    out.push({ id: "vol-high", level: "info", title: "HIGH VOLATILITY REGIME", detail: "Reduce position size · expect whipsaw" });
  }
  return out;
}

function AlertBanner({ state }: { state: BotState }) {
  const T = useTheme();
  const alerts = collectAlerts(state);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});

  // Auto-reset dismissal after 60s so a re-triggering alert reappears
  useEffect(() => {
    const now = Date.now();
    const fresh: Record<string, number> = {};
    let changed = false;
    for (const [id, ts] of Object.entries(dismissed)) {
      if (now - ts < 60_000) fresh[id] = ts;
      else changed = true;
    }
    if (changed) setDismissed(fresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(alerts.map(a => a.id))]);

  const visible = alerts.filter(a => !dismissed[a.id]);
  if (visible.length === 0) return null;

  const colorFor = (lvl: AlertLevel) => lvl === "critical" ? T.red : lvl === "warning" ? T.orange : T.cyan;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 4 }}>
      {visible.map(a => {
        const c = colorFor(a.level);
        return (
          <div key={a.id} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
            padding: "5px 10px", background: c + "12", border: `1px solid ${c}66`,
            borderRadius: 2, fontFamily: EP_FONT,
            boxShadow: a.level === "critical" ? `0 0 8px ${c}33` : "none",
            animation: a.level === "critical" ? "pulse-border 1.5s infinite" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
              <span style={{
                fontSize: 12, fontWeight: 800, color: c, letterSpacing: 1.5,
                textShadow: `0 0 6px ${c}55`, flexShrink: 0,
              }}>{a.level === "critical" ? "■" : a.level === "warning" ? "▲" : "◆"}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: c, letterSpacing: 1, flexShrink: 0 }}>{a.title}</span>
              {a.detail && <span style={{ fontSize: 9, color: T.textDim, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {a.detail}</span>}
            </div>
            <button
              onClick={() => setDismissed(prev => ({ ...prev, [a.id]: Date.now() }))}
              style={{
                fontSize: 8, padding: "2px 6px", background: "transparent",
                color: T.textDim, border: `1px solid ${T.border}`, borderRadius: 2,
                fontFamily: EP_FONT, cursor: "pointer", letterSpacing: 0.5, flexShrink: 0,
              }}
              title="Dismiss for 60 seconds"
            >
              ✕ DISMISS
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Sortable grid configuration ────────────────────────────────────────────
// Each entry: [id, defaultHeight] — width is constant (columnWidth).
// Order determines initial column distribution (index % COLS).
const GRID_PANELS: [string, number][] = [
  ["decisionPanel",  220],  // USAB-001: top-left, first thing operator sees
  ["market",         200],
  ["onchain",        240],
  ["ai",             220],
  ["sentiment",      260],
  ["regime",         200],
  ["risk",           220],
  ["enhSentiment",   240],
  ["signalMatrix",   200],
  ["signalRanking",  220],
  ["whale",          340],
  ["orderFlow",      220],
  ["liquidation",    240],
  ["techIndicators", 300],
  ["equityCurve",    260],
  ["paperTrading",   300],
  ["backtest",       340],
  ["scalping",       220],
  ["scalpBt",        260],
  ["triggers",       400],
  ["rsiChart",       300],
  ["macdChart",      300],
  ["hurstChart",     340],
  ["bbChart",        300],
  ["volatility",     200],
  ["perpPremium",    200],
  ["config",         380],
  ["presets",        240],
  ["circuitBreaker", 220],
  ["logConsole",     220],
];

const GRID_COLS = 3;
const GRID_GAP = 6;
const GRID_START_Y = 60; // below header
const GRID_PANEL_W = 460;
const GRID_STORAGE_KEY = "hypera-sortgrid-v1";

// ─── Dashboard Inner (uses layout context) ──────────────────────────────────

interface DashboardInnerProps {
  state: BotState;
  dark: boolean;
  T: typeof EP_DARK;
  onThemeToggle: () => void;
  onStart: () => void;
  onStop: () => void;
  triggerFocus: boolean;
  onToggleFocus: () => void;
  onResetCB: () => void;
  onUpdateConfig: (cfg: BotState["tradeConfig"]) => void;
  onApplyPreset: (cfg: TradeConfig, mode: string) => void;
  onSaveCustomPreset: (name: string) => void;
  ESSENTIAL_PANELS: Set<string>;
}

function DashboardInner({
  state, dark, T, onThemeToggle, onStart, onStop, triggerFocus, onToggleFocus,
  onResetCB, onUpdateConfig, onApplyPreset, onSaveCustomPreset, ESSENTIAL_PANELS,
}: DashboardInnerProps) {
  // Controller ref — exposes reset/undo from SortableGrid
  const gridControllerRef = useRef<SortableGridController | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  // Poll canUndo state (controller doesn't trigger re-render)
  useEffect(() => {
    const t = setInterval(() => {
      if (gridControllerRef.current) {
        const next = gridControllerRef.current.canUndo();
        if (next !== canUndo) setCanUndo(next);
      }
    }, 300);
    return () => clearInterval(t);
  }, [canUndo]);

  // Build list of panel items with their renderers.
  // Filter out panels that should be hidden (focus mode) or conditionally absent (AI).
  const shouldHide = (id: string) => triggerFocus && !ESSENTIAL_PANELS.has(id);

  const renderers: Record<string, () => React.ReactNode> = {
    decisionPanel:  () => <DecisionPanel state={state} />,
    market:         () => <MarketPanel state={state} />,
    onchain:        () => <OnChainPanel state={state} />,
    ai:             () => state.aiDecision ? <AIDecisionPanel state={state} /> : null,
    sentiment:      () => <SentimentGaugePanel state={state} />,
    regime:         () => <MarketRegimePanel state={state} />,
    risk:           () => <RiskMetricsPanel state={state} />,
    enhSentiment:   () => <EnhancedSentimentPanel state={state} />,
    signalMatrix:   () => <SignalMatrixPanel state={state} />,
    signalRanking:  () => <SignalRankingPanel state={state} />,
    whale:          () => <WhaleActivityPanel state={state} />,
    orderFlow:      () => <OrderFlowPanel state={state} />,
    liquidation:    () => <LiquidationMapPanel state={state} />,
    techIndicators: () => <TechnicalIndicatorsPanel state={state} />,
    equityCurve:    () => <EquityCurvePanel state={state} />,
    paperTrading:   () => <PaperTradingPanel state={state} />,
    backtest:       () => <BacktestPanel state={state} />,
    scalping:       () => <ScalpingPanel state={state} />,
    scalpBt:        () => <ScalpBacktestPanel state={state} />,
    triggers:       () => <TriggerPanel state={state} />,
    rsiChart:       () => <RSIChartPanel state={state} />,
    macdChart:      () => <MACDChartPanel state={state} />,
    hurstChart:     () => <HurstPanel state={state} />,
    bbChart:        () => <BBChartPanel state={state} />,
    volatility:     () => <VolatilityPanel state={state} />,
    perpPremium:    () => <PerpPremiumPanel state={state} />,
    config:         () => <ConfigPanel state={state} onUpdateConfig={onUpdateConfig} />,
    presets:        () => <StrategyPresetsPanel state={state} onApplyPreset={onApplyPreset} onSaveCustom={onSaveCustomPreset} />,
    circuitBreaker: () => <CircuitBreakerPanel state={state} onResetCB={onResetCB} />,
    logConsole:     () => <LogConsole state={state} />,
  };

  // Visible items only — those with a renderer AND not hidden.
  // 'ai' is hidden when state.aiDecision is null.
  const visibleItems: SortableGridItem[] = GRID_PANELS
    .filter(([id]) => {
      if (!renderers[id]) return false;
      if (shouldHide(id)) return false;
      if (id === "ai" && !state.aiDecision) return false;
      return true;
    })
    .map(([id, height]) => ({ id, height }));

  // Wrapper that respects hide state per panel — used inside SortableGrid's renderItem.
  const renderItem = (id: string, isDragging: boolean) => {
    const renderer = renderers[id];
    if (!renderer) return null;
    return (
      <div style={{
        opacity: isDragging ? 0.5 : 1,
        height: "100%",
        transition: "opacity 180ms ease",
      }}>
        <FocusPanel shouldHide={false}>
          {renderer()}
        </FocusPanel>
      </div>
    );
  };

  // Human-readable label for the drag handle
  const headerLabel = (id: string) => {
    const labels: Record<string, string> = {
      decisionPanel: "DECISION",
      market: "MARKET", onchain: "ON-CHAIN", ai: "AI",
      sentiment: "SENTIMENT", regime: "REGIME", risk: "RISK",
      enhSentiment: "ENH.SENT", signalMatrix: "SIG.MATRIX", signalRanking: "SIG.RANK",
      whale: "WHALE", orderFlow: "ORDERFLOW", liquidation: "LIQUIDATION",
      techIndicators: "TECH", equityCurve: "EQUITY", paperTrading: "PAPER",
      backtest: "BACKTEST", scalping: "SCALP", scalpBt: "SCALP.BT",
      triggers: "TRIGGERS", rsiChart: "RSI", macdChart: "MACD",
      hurstChart: "HURST", bbChart: "BB", volatility: "VOLAT",
      perpPremium: "PERP.PREM", config: "CONFIG", presets: "PRESETS",
      circuitBreaker: "CIRCUIT", logConsole: "LOG",
    };
    return labels[id] ?? id.toUpperCase();
  };

  return (
    <>
      <style suppressHydrationWarning>{`
        @keyframes pulse-led { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes pulse-border { 0%,100%{border-color:${T.red}} 50%{border-color:transparent} }
        @keyframes pulse-live { 0%,100%{opacity:1;box-shadow:0 0 4px ${T.green}} 50%{opacity:0.5;box-shadow:0 0 1px ${T.green}} }
        @keyframes panelIn { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
        *{scrollbar-width:thin;scrollbar-color:${T.border} transparent}
        *::-webkit-scrollbar{width:3px}
        *::-webkit-scrollbar-track{background:transparent}
        *::-webkit-scrollbar-thumb{background:${T.orange}55;border-radius:1px}
        body{background:${T.bg};margin:0}
      `}</style>
      <div style={{ background: T.bg, minHeight: "100vh", padding: 8, color: T.text, fontFamily: EP_FONT }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", position: "relative" }}>
          {/* Header — full width, not draggable */}
          <div style={{ marginBottom: 6 }}>
            <HeaderPanel state={state} dark={dark} onThemeToggle={onThemeToggle} onStart={onStart} onStop={onStop} triggerFocus={triggerFocus} onToggleFocus={onToggleFocus} />
          </div>

          {/* USAB-003 AlertBanner — dismissible critical alerts above everything else */}
          <AlertBanner state={state} />

          {/* USAB-002 StatusBar — single-glance status strip (price, RSI, verdict, CB, clock) */}
          <div style={{ marginBottom: 6 }}>
            <StatusBar state={state} />
          </div>

          {/* Layout controls row — flex, no overlap with header.
              Replaces previous absolute-positioned buttons that collided with header's right side. */}
          <div style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: 6,
            marginBottom: 6,
            padding: "4px 0",
          }}>
            <button
              onClick={() => gridControllerRef.current?.undo()}
              disabled={!canUndo}
              style={{
                padding: "4px 10px",
                background: canUndo ? T.panel : T.panelAlt,
                color: canUndo ? T.orange : T.textMuted,
                border: `1px solid ${canUndo ? T.orange + "55" : T.border}`,
                borderRadius: 2,
                fontFamily: EP_FONT,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: canUndo ? "pointer" : "default",
                textTransform: "uppercase",
                opacity: canUndo ? 1 : 0.5,
              }}
              title={canUndo ? "Undo last panel move (Ctrl+Z)" : "No actions to undo"}
            >
              ↶ Undo
            </button>

            <button
              onClick={() => {
                if (confirm("Reset all panels to default order and heights?")) {
                  gridControllerRef.current?.reset();
                  gridControllerRef.current?.resetHeights();
                }
              }}
              style={{
                padding: "4px 10px",
                background: T.panel,
                color: T.textDim,
                border: `1px solid ${T.border}`,
                borderRadius: 2,
                fontFamily: EP_FONT,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
              title="Reset panel order AND heights to defaults"
            >
              ⠿ Reset Layout
            </button>

            <button
              onClick={() => {
                if (confirm("Quit HyperA? This will close the application.")) {
                  fetch("/api/quit", { method: "POST" }).catch(() => {});
                  setTimeout(() => {
                    document.body.innerHTML = `
                      <div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#000;color:#F05A22;font-family:monospace;flex-direction:column;gap:16px">
                        <div style="font-size:24px;font-weight:700;letter-spacing:2px">HYPERA SHUTDOWN</div>
                        <div style="font-size:12px;color:#B86800">You can close this tab.</div>
                      </div>`;
                  }, 500);
                }
              }}
              style={{
                padding: "4px 10px",
                background: T.panel,
                color: T.red,
                border: `1px solid ${T.red}55`,
                borderRadius: 2,
                fontFamily: EP_FONT,
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 1,
                cursor: "pointer",
                textTransform: "uppercase",
              }}
              title="Quit HyperA application"
            >
              ⏻ Quit
            </button>
          </div>

          {/* Sortable grid container — insertion/reordering drag & drop */}
          <div>
            <SortableGrid
              items={visibleItems}
              columns={GRID_COLS}
              columnWidth={GRID_PANEL_W}
              gap={GRID_GAP}
              startY={0}
              storageKey={GRID_STORAGE_KEY}
              renderItem={renderItem}
              renderHeaderLabel={headerLabel}
              theme={{
                accent: T.orange,
                border: T.border,
                borderLight: T.borderLight,
                panel: T.panel,
                panelAlt: T.panelAlt,
                text: T.text,
                textMuted: T.textMuted,
                bg: T.bg,
              }}
              showHeader={true}
              headerHeight={22}
              enableUndo={true}
              controllerRef={gridControllerRef}
              flipDuration={280}
            />
          </div>
        </div>
      </div>
    </>
  );
}
