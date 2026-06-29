"use client";

import React, { useRef, useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PanelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type LayoutState = Record<string, PanelRect>;

interface LayoutCtx {
  layout: LayoutState;
  setRect: (id: string, rect: PanelRect) => void;
  reset: () => void;
  registerPanel: (id: string, defaultRect: PanelRect) => void;
  getAllRects: () => LayoutState;
  commitHistory: (id: string, prevRect: PanelRect) => void;
  undo: () => void;
  canUndo: boolean;
}

const Ctx = createContext<LayoutCtx | null>(null);

export function useLayout() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLayout must be used within LayoutProvider");
  return c;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SNAP_THRESHOLD = 20; // px — magnetic snap distance
const MIN_W = 200;
const MIN_H = 100;
const HEADER_H = 26;  // matches Panel header height
const STORAGE_KEY = "hypera-layout-v2";
const HISTORY_LIMIT = 50; // max undo steps

// ─── Layout Provider ────────────────────────────────────────────────────────

export function LayoutProvider({ children }: { children: React.ReactNode }) {
  const [layout, setLayout] = useState<LayoutState>({});
  const defaultsRef = useRef<LayoutState>({});
  const loadedRef = useRef(false);

  // Undo history — array of {id, prevRect} snapshots taken before each drag/resize action.
  const historyRef = useRef<Array<{ id: string; prevRect: PanelRect }>>([]);
  // Bump version to trigger re-render when history changes (refs don't trigger re-renders).
  const [, setHistoryVersion] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setLayout(parsed);
        }
      }
    } catch { /* ignore corrupt storage */ }
    loadedRef.current = true;
  }, []);

  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch { /* storage full or disabled */ }
  }, [layout]);

  // Global Ctrl+Z listener — undo last panel move/resize
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey && !e.altKey) {
        // Don't trigger when typing in input/textarea
        const target = e.target as HTMLElement;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        if (historyRef.current.length > 0) {
          const last = historyRef.current.pop()!;
          setLayout(prev => ({ ...prev, [last.id]: last.prevRect }));
          setHistoryVersion(v => v + 1);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const registerPanel = useCallback((id: string, defaultRect: PanelRect) => {
    defaultsRef.current[id] = defaultRect;
    setLayout(prev => {
      if (prev[id]) return prev;
      return { ...prev, [id]: defaultRect };
    });
  }, []);

  const setRect = useCallback((id: string, rect: PanelRect) => {
    setLayout(prev => ({ ...prev, [id]: rect }));
  }, []);

  // Push a history entry — called by DraggablePanel on pointer up if the rect changed.
  const commitHistory = useCallback((id: string, prevRect: PanelRect) => {
    historyRef.current.push({ id, prevRect: { ...prevRect } });
    if (historyRef.current.length > HISTORY_LIMIT) {
      historyRef.current.shift();
    }
    setHistoryVersion(v => v + 1);
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const last = historyRef.current.pop()!;
    setLayout(prev => ({ ...prev, [last.id]: last.prevRect }));
    setHistoryVersion(v => v + 1);
  }, []);

  const reset = useCallback(() => {
    setLayout({ ...defaultsRef.current });
    historyRef.current = [];
    setHistoryVersion(v => v + 1);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const getAllRects = useCallback(() => layout, [layout]);

  const canUndo = historyRef.current.length > 0;

  const value = useMemo<LayoutCtx>(() => ({
    layout, setRect, reset, registerPanel, getAllRects,
    commitHistory, undo, canUndo,
  }), [layout, setRect, reset, registerPanel, getAllRects, commitHistory, undo, canUndo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// ─── Collision Resolution Logic ─────────────────────────────────────────────
// Combines magnetic snapping + hard collision prevention.
// Panels NEVER overlap — they slide along each other's edges.

interface ResolveResult {
  x: number;
  y: number;
  snappedX: boolean;
  snappedY: boolean;
  blocked: boolean; // true if collision prevented the move
}

const EPS = 0.5; // half-pixel epsilon — touching edges are NOT overlap

function rectsOverlap(a: PanelRect, b: PanelRect): boolean {
  return !(
    a.x + a.w <= b.x + EPS ||
    a.x >= b.x + b.w - EPS ||
    a.y + a.h <= b.y + EPS ||
    a.y >= b.y + b.h - EPS
  );
}

/**
 * Resolve a move operation with axis-separated collision response.
 * X is resolved first (with projected Y for vOverlap check), then Y.
 * This allows panels to "slide" along each other's edges.
 */
function resolveMove(
  start: PanelRect,
  dx: number,
  dy: number,
  others: LayoutState,
  selfId: string
): ResolveResult {
  const w = start.w;
  const h = start.h;
  let blocked = false;

  // ── X axis ──────────────────────────────────────────────────────────────
  // Use projected Y (start.y + dy) for vertical overlap check — this is what
  // the user intends the new position to be vertically.
  let newX = start.x + dx;
  let snappedX = false;
  const projTop = start.y + dy;
  const projBottom = projTop + h;

  for (const [id, r] of Object.entries(others)) {
    if (id === selfId) continue;
    // Vertical overlap with projected Y
    const vOverlap = projTop < r.y + r.h - EPS && projBottom > r.y + EPS;
    if (!vOverlap) continue;

    if (dx > 0) {
      // Moving right — check right edge vs other's left
      const newRight = newX + w;
      // Magnetic snap zone: just before other's left edge
      if (newRight >= r.x - SNAP_THRESHOLD && newRight <= r.x) {
        newX = r.x - w;
        snappedX = true;
      }
      // Hard collision: would enter other — clamp to touch
      else if (newRight > r.x && newX < r.x) {
        newX = r.x - w;
        snappedX = true;
        blocked = true;
      }
      // Already overlapping (e.g. teleported in) — push out to left
      else if (newX < r.x + r.w && newRight > r.x) {
        newX = r.x - w;
        snappedX = true;
        blocked = true;
      }
    } else if (dx < 0) {
      // Moving left — check left edge vs other's right
      if (newX <= r.x + r.w + SNAP_THRESHOLD && newX >= r.x + r.w) {
        newX = r.x + r.w;
        snappedX = true;
      } else if (newX < r.x + r.w && newX + w > r.x + r.w) {
        newX = r.x + r.w;
        snappedX = true;
        blocked = true;
      } else if (newX < r.x + r.w && newX + w > r.x) {
        newX = r.x + r.w;
        snappedX = true;
        blocked = true;
      }
    }
  }

  // ── Y axis ──────────────────────────────────────────────────────────────
  // Use clamped newX for horizontal overlap check.
  let newY = start.y + dy;
  let snappedY = false;
  const finalLeft = newX;
  const finalRight = newX + w;

  for (const [id, r] of Object.entries(others)) {
    if (id === selfId) continue;
    // Horizontal overlap with clamped X
    const hOverlap = finalLeft < r.x + r.w - EPS && finalRight > r.x + EPS;
    if (!hOverlap) continue;

    if (dy > 0) {
      // Moving down
      const newBottom = newY + h;
      if (newBottom >= r.y - SNAP_THRESHOLD && newBottom <= r.y) {
        newY = r.y - h;
        snappedY = true;
      } else if (newBottom > r.y && newY < r.y) {
        newY = r.y - h;
        snappedY = true;
        blocked = true;
      } else if (newY < r.y + r.h && newBottom > r.y) {
        newY = r.y - h;
        snappedY = true;
        blocked = true;
      }
    } else if (dy < 0) {
      // Moving up
      if (newY <= r.y + r.h + SNAP_THRESHOLD && newY >= r.y + r.h) {
        newY = r.y + r.h;
        snappedY = true;
      } else if (newY < r.y + r.h && newY + h > r.y + r.h) {
        newY = r.y + r.h;
        snappedY = true;
        blocked = true;
      } else if (newY < r.y + r.h && newY + h > r.y) {
        newY = r.y + r.h;
        snappedY = true;
        blocked = true;
      }
    }
  }

  // Snap to viewport left/top edges
  if (newX <= SNAP_THRESHOLD && newX >= -SNAP_THRESHOLD) {
    newX = 0;
    snappedX = true;
  }
  if (newY <= SNAP_THRESHOLD && newY >= -SNAP_THRESHOLD) {
    newY = 0;
    snappedY = true;
  }

  return { x: newX, y: newY, snappedX, snappedY, blocked };
}

/**
 * Resolve a resize operation — clamp the moving edge(s) so they never
 * cross into another panel. Iterates up to 8 passes to converge.
 */
function resolveResize(
  candidate: PanelRect,
  mode: DragMode,
  others: LayoutState,
  selfId: string
): PanelRect {
  let result = { ...candidate };

  for (let pass = 0; pass < 8; pass++) {
    let overlapper: PanelRect | null = null;
    for (const [id, r] of Object.entries(others)) {
      if (id === selfId) continue;
      if (rectsOverlap(result, r)) { overlapper = r; break; }
    }
    if (!overlapper) break;

    const r = overlapper;
    const newResult = { ...result };

    // X-axis clamps (only for modes that move the X edges)
    const movesRightEdge = mode === "resize-e" || mode === "resize-ne" || mode === "resize-se";
    const movesLeftEdge  = mode === "resize-w" || mode === "resize-nw" || mode === "resize-sw";

    if (movesRightEdge) {
      // Right edge moving — clamp to r.x (other's left)
      const clampedW = r.x - result.x;
      if (clampedW >= MIN_W) {
        newResult.w = clampedW;
      }
    }
    if (movesLeftEdge) {
      // Left edge moving — clamp to r.x + r.w (other's right)
      const clampedX = r.x + r.w;
      const clampedW = result.w - (clampedX - result.x);
      if (clampedW >= MIN_W) {
        newResult.x = clampedX;
        newResult.w = clampedW;
      }
    }

    // Y-axis clamps
    const movesBottomEdge = mode === "resize-s" || mode === "resize-se" || mode === "resize-sw";
    const movesTopEdge    = mode === "resize-n" || mode === "resize-ne" || mode === "resize-nw";

    if (movesBottomEdge) {
      const clampedH = r.y - result.y;
      if (clampedH >= MIN_H) {
        newResult.h = clampedH;
      }
    }
    if (movesTopEdge) {
      const clampedY = r.y + r.h;
      const clampedH = result.h - (clampedY - result.y);
      if (clampedH >= MIN_H) {
        newResult.y = clampedY;
        newResult.h = clampedH;
      }
    }

    // If nothing changed but still overlapping, break to avoid infinite loop
    if (
      newResult.x === result.x &&
      newResult.y === result.y &&
      newResult.w === result.w &&
      newResult.h === result.h
    ) break;

    result = newResult;
  }

  return result;
}

// ─── DraggablePanel Component ───────────────────────────────────────────────

interface DraggablePanelProps {
  id: string;
  defaultRect: PanelRect;
  children: React.ReactNode;
  accentColor: string;
  borderColor: string;
}

type DragMode = "move" | "resize-n" | "resize-s" | "resize-e" | "resize-w" | "resize-ne" | "resize-nw" | "resize-se" | "resize-sw" | null;

export function DraggablePanel({
  id, defaultRect, children, accentColor, borderColor,
}: DraggablePanelProps) {
  const { layout, setRect, registerPanel, getAllRects, commitHistory } = useLayout();
  const rect = layout[id] ?? defaultRect;

  // Keep a ref to the latest rect so onPointerUp (which has empty deps) can read it.
  const rectRef = useRef(rect);
  useEffect(() => { rectRef.current = rect; }, [rect]);

  useEffect(() => {
    registerPanel(id, defaultRect);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dragMode = useRef<DragMode>(null);
  const dragStart = useRef<{ mouseX: number; mouseY: number; rect: PanelRect }>({ mouseX: 0, mouseY: 0, rect });
  const [snapped, setSnapped] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Keep commitHistory in a ref so onPointerUp (empty deps) always calls the latest.
  const commitHistoryRef = useRef(commitHistory);
  useEffect(() => { commitHistoryRef.current = commitHistory; }, [commitHistory]);

  const onPointerDown = useCallback((mode: DragMode) => (e: React.PointerEvent) => {
    if (!mode) return;
    e.preventDefault();
    e.stopPropagation();
    dragMode.current = mode;
    dragStart.current = { mouseX: e.clientX, mouseY: e.clientY, rect: { ...rect } };
    setIsDragging(true);
    setBlocked(false);
    setSnapped(false);
    try { (e.target as Element).setPointerCapture(e.pointerId); } catch {}
  }, [rect]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragMode.current) return;
    e.preventDefault();

    const dx = e.clientX - dragStart.current.mouseX;
    const dy = e.clientY - dragStart.current.mouseY;
    const start = dragStart.current.rect;
    let newRect: PanelRect = { ...start };
    let isBlocked = false;
    let isSnapped = false;

    switch (dragMode.current) {
      case "move": {
        const res = resolveMove(start, dx, dy, getAllRects(), id);
        newRect.x = res.x;
        newRect.y = res.y;
        isSnapped = res.snappedX || res.snappedY;
        isBlocked = res.blocked;
        break;
      }
      case "resize-n": {
        newRect.y = start.y + dy;
        newRect.h = start.h - dy;
        if (newRect.h < MIN_H) { newRect.y = start.y + start.h - MIN_H; newRect.h = MIN_H; }
        newRect = resolveResize(newRect, "resize-n", getAllRects(), id);
        break;
      }
      case "resize-s": {
        newRect.h = Math.max(MIN_H, start.h + dy);
        newRect = resolveResize(newRect, "resize-s", getAllRects(), id);
        break;
      }
      case "resize-e": {
        newRect.w = Math.max(MIN_W, start.w + dx);
        newRect = resolveResize(newRect, "resize-e", getAllRects(), id);
        break;
      }
      case "resize-w": {
        newRect.x = start.x + dx;
        newRect.w = start.w - dx;
        if (newRect.w < MIN_W) { newRect.x = start.x + start.w - MIN_W; newRect.w = MIN_W; }
        newRect = resolveResize(newRect, "resize-w", getAllRects(), id);
        break;
      }
      case "resize-ne": {
        newRect.y = start.y + dy;
        newRect.h = start.h - dy;
        newRect.w = Math.max(MIN_W, start.w + dx);
        if (newRect.h < MIN_H) { newRect.y = start.y + start.h - MIN_H; newRect.h = MIN_H; }
        newRect = resolveResize(newRect, "resize-ne", getAllRects(), id);
        break;
      }
      case "resize-nw": {
        newRect.y = start.y + dy;
        newRect.h = start.h - dy;
        newRect.x = start.x + dx;
        newRect.w = start.w - dx;
        if (newRect.h < MIN_H) { newRect.y = start.y + start.h - MIN_H; newRect.h = MIN_H; }
        if (newRect.w < MIN_W) { newRect.x = start.x + start.w - MIN_W; newRect.w = MIN_W; }
        newRect = resolveResize(newRect, "resize-nw", getAllRects(), id);
        break;
      }
      case "resize-se": {
        newRect.w = Math.max(MIN_W, start.w + dx);
        newRect.h = Math.max(MIN_H, start.h + dy);
        newRect = resolveResize(newRect, "resize-se", getAllRects(), id);
        break;
      }
      case "resize-sw": {
        newRect.x = start.x + dx;
        newRect.w = start.w - dx;
        newRect.h = Math.max(MIN_H, start.h + dy);
        if (newRect.w < MIN_W) { newRect.x = start.x + start.w - MIN_W; newRect.w = MIN_W; }
        newRect = resolveResize(newRect, "resize-sw", getAllRects(), id);
        break;
      }
    }

    // Detect if resize was blocked (candidate smaller than what user dragged)
    if (dragMode.current !== "move" && dragMode.current !== null) {
      // If newRect equals start exactly while user dragged, we were blocked
      const noChange = newRect.x === start.x && newRect.y === start.y &&
                       newRect.w === start.w && newRect.h === start.h;
      if (noChange && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        isBlocked = true;
      }
    }

    setRect(id, newRect);
    setSnapped(isSnapped);
    setBlocked(isBlocked);
  }, [id, getAllRects, setRect]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragMode.current) return;
    const start = dragStart.current.rect;
    const end = rectRef.current;
    // If the panel actually moved or resized, push the pre-drag state to history.
    if (start.x !== end.x || start.y !== end.y || start.w !== end.w || start.h !== end.h) {
      commitHistoryRef.current(id, start);
    }
    dragMode.current = null;
    setIsDragging(false);
    setSnapped(false);
    setBlocked(false);
    try { (e.target as Element).releasePointerCapture(e.pointerId); } catch {}
  }, [id]);

  // Visual feedback:
  //   blocked → red glow (panel was stopped by another)
  //   snapped → accent glow (panel magnetized to an edge)
  //   dragging → soft shadow
  //   idle → none
  const snapGlow = blocked
    ? `0 0 0 2px #ef4444, 0 0 16px #ef444488`
    : snapped
      ? `0 0 0 2px ${accentColor}, 0 0 16px ${accentColor}88`
      : isDragging
        ? "0 8px 24px rgba(0,0,0,0.5)"
        : "none";

  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        boxShadow: snapGlow,
        borderRadius: 2,
        transition: isDragging ? "none" : "box-shadow 0.15s",
        zIndex: isDragging ? 1000 : 1,
      }}
    >
      {/* Inner content fills the panel */}
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        {children}
      </div>

      {/* Drag handle — invisible strip over the Panel's header */}
      <div
        onPointerDown={onPointerDown("move")}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: HEADER_H,
          cursor: "move",
          touchAction: "none",
        }}
      />

      {/* Resize handles — 8 directions */}
      <div onPointerDown={onPointerDown("resize-n")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", top: 0, left: 12, right: 12, height: 5, cursor: "ns-resize", touchAction: "none" }} />
      <div onPointerDown={onPointerDown("resize-s")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", bottom: 0, left: 12, right: 12, height: 5, cursor: "ns-resize", touchAction: "none" }} />
      <div onPointerDown={onPointerDown("resize-e")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", right: 0, top: 12, bottom: 12, width: 5, cursor: "ew-resize", touchAction: "none" }} />
      <div onPointerDown={onPointerDown("resize-w")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 5, cursor: "ew-resize", touchAction: "none" }} />
      <div onPointerDown={onPointerDown("resize-ne")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", top: 0, right: 0, width: 12, height: 12, cursor: "nesw-resize", touchAction: "none" }} />
      <div onPointerDown={onPointerDown("resize-nw")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", top: 0, left: 0, width: 12, height: 12, cursor: "nwse-resize", touchAction: "none" }} />
      <div onPointerDown={onPointerDown("resize-se")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", bottom: 0, right: 0, width: 12, height: 12, cursor: "nwse-resize", touchAction: "none" }} />
      <div onPointerDown={onPointerDown("resize-sw")} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        style={{ position: "absolute", bottom: 0, left: 0, width: 12, height: 12, cursor: "nesw-resize", touchAction: "none" }} />
    </div>
  );
}

// ─── Layout Container (absolute-positioned viewport) ─────────────────────────

export function LayoutContainer({
  children, height, bg,
}: { children: React.ReactNode; height: number; bg: string }) {
  return (
    <div style={{ position: "relative", width: "100%", height, background: bg, overflow: "hidden" }}>
      {children}
    </div>
  );
}

// ─── Default Layout Generator (3-column grid) ───────────────────────────────

export function computeGridLayout(
  panelIds: string[],
  cols: number,
  panelW: number,
  panelH: number,
  gap: number,
  startY: number
): LayoutState {
  const layout: LayoutState = {};
  panelIds.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    layout[id] = {
      x: col * (panelW + gap),
      y: startY + row * (panelH + gap),
      w: panelW,
      h: panelH,
    };
  });
  return layout;
}
