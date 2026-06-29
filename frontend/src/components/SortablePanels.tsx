'use client';

/* ============================================================
 *  SortablePanels — Insertion/Reordering Drag & Drop
 * ============================================================
 *  Strategia:    INSERTION (nie swapping). Przeciągany panel
 *                jest wstawiany w nowe miejsce, pozostałe
 *                płynnie się rozsuńą, zachowując stałą szerokość.
 *
 *  Animacja:     FLIP (First, Last, Invert, Play) na transform.
 *                Brak zależności zewnętrznych (czysty React + DOM).
 *
 *  Detekcja:     Środek ciężkości (center-of-mass) przeciąganego
 *                elementu vs. środek sąsiada. Zmiana indeksu
 *                następuje dopiero po przekroczeniu "niewidzialnej
 *                linii" — połowy wysokości sąsiedniego panelu.
 *
 *  Ograniczenia: Stała szerokość (--panel-width), zmienna wysokość.
 * ============================================================ */

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from 'react';

/* ------------------------------------------------------------
 *  1. arrayMove — czysta funkcja, nie mutuje wejścia
 * ------------------------------------------------------------ */
export function arrayMove<T>(array: readonly T[], from: number, to: number): T[] {
  const len = array.length;
  if (from < 0 || to < 0 || from >= len || to >= len || from === to) {
    return array.slice();
  }
  const next = array.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/* ------------------------------------------------------------
 *  2. useFlip — animacja First/Last/Invert/Play
 * ------------------------------------------------------------ */
function useFlip(
  deps: unknown,
  opts: {
    skipId: string | null;
    duration: number;
    easing: string;
  },
) {
  const lastPositions = useRef<Map<string, { top: number; left: number }>>(new Map());
  const itemEls = useRef<Map<string, HTMLElement>>(new Map());

  useLayoutEffect(() => {
    const newPositions = new Map<string, { top: number; left: number }>();
    const inversions: Array<{ el: HTMLElement; dx: number; dy: number }> = [];

    itemEls.current.forEach((el, id) => {
      if (id === opts.skipId) {
        const rect = el.getBoundingClientRect();
        newPositions.set(id, { top: rect.top, left: rect.left });
        return;
      }

      const newRect = el.getBoundingClientRect();
      newPositions.set(id, { top: newRect.top, left: newRect.left });

      const oldPos = lastPositions.current.get(id);
      if (!oldPos) return;

      const dx = oldPos.left - newRect.left;
      const dy = oldPos.top - newRect.top;
      if (dx === 0 && dy === 0) return;

      inversions.push({ el, dx, dy });
    });

    inversions.forEach(({ el, dx, dy }) => {
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth;
    });

    if (inversions.length > 0) {
      const raf = requestAnimationFrame(() => {
        inversions.forEach(({ el }) => {
          el.style.transition = `transform ${opts.duration}ms ${opts.easing}`;
          el.style.transform = '';
        });
      });
      const cleanup = window.setTimeout(() => {
        inversions.forEach(({ el }) => {
          el.style.transition = '';
          el.style.transform = '';
        });
      }, opts.duration + 40);

      lastPositions.current = newPositions;
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(cleanup);
      };
    }

    lastPositions.current = newPositions;
  }, [deps, opts.skipId, opts.duration, opts.easing]);

  const registerEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) itemEls.current.set(id, el);
    else itemEls.current.delete(id);
  }, []);

  return { registerEl };
}

/* ------------------------------------------------------------
 *  3. findInsertionIndex — detekcja kolizji (środek ciężkości)
 * ------------------------------------------------------------ */
function findInsertionIndex(params: {
  draggingIndex: number;
  dragCenterY: number;
  otherRects: Array<{ index: number; rect: DOMRect }>;
}): number | null {
  const { draggingIndex, dragCenterY, otherRects } = params;
  let target: number | null = null;

  for (const { index, rect } of otherRects) {
    const itemCenter = rect.top + rect.height / 2;

    if (draggingIndex < index) {
      if (dragCenterY > itemCenter) target = index;
    } else if (draggingIndex > index) {
      if (dragCenterY < itemCenter) target = index;
    }
  }

  return target;
}

/* ------------------------------------------------------------
 *  4. Single-column SortablePanels (zachowane dla demo)
 * ------------------------------------------------------------ */
export interface SortablePanel<T = unknown> {
  id: string;
  height: number;
  data: T;
}

export type SortablePanelRenderer<T> = (
  item: SortablePanel<T>,
  index: number,
  isDragging: boolean,
) => React.ReactNode;

interface SortablePanelsProps<T> {
  items: SortablePanel<T>[];
  onReorder: (next: SortablePanel<T>[]) => void;
  renderItem: SortablePanelRenderer<T>;
  panelWidth?: number;
  gap?: number;
  showHeader?: boolean;
  renderHeader?: (item: SortablePanel<T>, index: number) => React.ReactNode;
  className?: string;
  flipDuration?: number;
  flipEasing?: string;
}

export function SortablePanels<T = unknown>({
  items,
  onReorder,
  renderItem,
  panelWidth = 360,
  gap = 8,
  showHeader = true,
  renderHeader,
  className,
  flipDuration = 280,
  flipEasing = 'cubic-bezier(0.2, 0, 0, 1)',
}: SortablePanelsProps<T>) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number>(-1);

  const drag = useRef({
    pointerId: null as number | null,
    offsetX: 0,
    offsetY: 0,
    ghost: null as HTMLElement | null,
    lastTargetIndex: -1,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const { registerEl } = useFlip(items, {
    skipId: draggingId,
    duration: flipDuration,
    easing: flipEasing,
  });

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent, id: string, index: number) => {
      if (e.button !== 0) return;
      const handle = e.currentTarget as HTMLElement;
      const itemEl = handle.closest('[data-sortable-id]') as HTMLElement | null;
      if (!itemEl) return;

      const rect = itemEl.getBoundingClientRect();
      const ghost = itemEl.cloneNode(true) as HTMLElement;
      ghost.setAttribute('data-ghost', 'true');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        pointerEvents: 'none',
        zIndex: '9999',
        opacity: '0.95',
        transform: 'scale(1.02)',
        boxShadow: '0 16px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(245,158,11,0.4)',
        transition: 'transform 120ms ease-out, box-shadow 120ms ease-out',
        borderRadius: '10px',
        overflow: 'hidden',
      } as CSSProperties);
      document.body.appendChild(ghost);

      drag.current = {
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        ghost,
        lastTargetIndex: -1,
      };

      itemEl.style.opacity = '0.18';
      itemEl.style.transition = 'opacity 180ms ease';

      setDraggingId(id);
      setDraggingIndex(index);
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const d = drag.current;
      if (d.pointerId !== e.pointerId || !draggingId) return;

      if (d.ghost) {
        d.ghost.style.left = `${e.clientX - d.offsetX}px`;
        d.ghost.style.top = `${e.clientY - d.offsetY}px`;
      }
      if (!d.ghost) return;

      const dragRect = d.ghost.getBoundingClientRect();
      const dragCenterY = dragRect.top + dragRect.height / 2;

      const otherRects: Array<{ index: number; rect: DOMRect }> = [];
      const currentIndex = items.findIndex(it => it.id === draggingId);
      items.forEach((item, idx) => {
        if (item.id === draggingId) return;
        const el = document.querySelector(
          `[data-sortable-id="${item.id}"]:not([data-ghost])`,
        ) as HTMLElement | null;
        if (!el) return;
        otherRects.push({ index: idx, rect: el.getBoundingClientRect() });
      });

      const targetIndex = findInsertionIndex({
        draggingIndex: currentIndex,
        dragCenterY,
        otherRects,
      });

      if (
        targetIndex !== null &&
        targetIndex !== currentIndex &&
        targetIndex !== d.lastTargetIndex
      ) {
        const next = arrayMove(items, currentIndex, targetIndex);
        d.lastTargetIndex = targetIndex;
        onReorder(next);
        setDraggingIndex(targetIndex);
      }
    },
    [items, draggingId, onReorder],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent) => {
      const d = drag.current;
      if (d.pointerId !== e.pointerId) return;

      if (d.ghost) d.ghost.remove();

      if (draggingId) {
        const el = document.querySelector(
          `[data-sortable-id="${draggingId}"]:not([data-ghost])`,
        ) as HTMLElement | null;
        if (el) {
          el.style.opacity = '';
          el.style.transition = '';
        }
      }

      drag.current = {
        pointerId: null,
        offsetX: 0,
        offsetY: 0,
        ghost: null,
        lastTargetIndex: -1,
      };

      setDraggingId(null);
      setDraggingIndex(-1);
    },
    [draggingId],
  );

  return (
    <div
      ref={containerRef}
      className={className}
      style={
        {
          '--panel-width': `${panelWidth}px`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${gap}px`,
          width: 'var(--panel-width)',
          position: 'relative',
          userSelect: 'none',
        } as CSSProperties
      }
    >
      {items.map((item, index) => {
        const isDragging = item.id === draggingId;
        return (
          <div
            key={item.id}
            data-sortable-id={item.id}
            ref={el => registerEl(item.id, el)}
            style={{
              width: 'var(--panel-width)',
              height: `${item.height}px`,
              position: 'relative',
              flexShrink: 0,
              borderRadius: '10px',
              background: '#0f1419',
              border: isDragging
                ? '1px dashed rgba(245,158,11,0.55)'
                : '1px solid #1f2937',
              overflow: 'hidden',
              transition: isDragging ? 'none' : 'border-color 180ms ease',
              touchAction: 'none',
            }}
          >
            {showHeader && (
              <div
                onPointerDown={e => handlePointerDown(e, item.id, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{
                  height: '34px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 12px',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  background: 'linear-gradient(180deg, #1a2231 0%, #131a26 100%)',
                  borderBottom: '1px solid #1f2937',
                  fontSize: '12px',
                  color: '#cbd5e1',
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  userSelect: 'none',
                  touchAction: 'none',
                }}
              >
                <span style={{ marginRight: 8, color: '#64748b', fontSize: '14px' }}>⠿</span>
                <span style={{ flex: 1 }}>
                  {renderHeader ? renderHeader(item, index) : `${item.id} · #${index + 1}`}
                </span>
                <span style={{ fontSize: '10px', color: '#475569', fontFamily: 'ui-monospace, monospace' }}>
                  {item.height}px
                </span>
              </div>
            )}

            <div
              style={{
                height: showHeader ? 'calc(100% - 34px)' : '100%',
                overflow: 'auto',
                padding: '10px',
                pointerEvents: isDragging ? 'none' : 'auto',
              }}
            >
              {renderItem(item, index, isDragging)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
 *  5. SortableGrid — wielokolumnowa siatka dla HyperA
 * ============================================================
 *  - N kolumn obok siebie, panele ułożone pionowo w każdej
 *  - Wszystkie panele w JEDNYM kontenerze z absolutnym
 *    pozycjonowaniem → React zachowuje węzły DOM (key=id),
 *    FLIP animuje płynnie przejścia między kolumnami.
 *  - Drag wykrywa kolumnę pod kursorem + indeks wstawienia
 *    na podstawie środka ciężkości.
 *  - localStorage zapisuje układ (order per column).
 *  - Ctrl+Z cofa ostatnią zmianę.
 *  - Reset przywraca domyślny rozkład (index % columns).
 * ============================================================ */

export interface SortableGridItem {
  id: string;
  height: number;
}

export interface SortableGridTheme {
  accent: string;
  border: string;
  borderLight: string;
  panel: string;
  panelAlt: string;
  text: string;
  textMuted: string;
  bg: string;
}

interface SortableGridProps {
  /** Definicje paneli (id + domyślna wysokość). Kolejność = domyślny rozkład. */
  items: SortableGridItem[];
  /** Liczba kolumn (domyślnie 3) */
  columns?: number;
  /** Szerokość pojedynczej kolumny (px) — stała dla wszystkich paneli */
  columnWidth?: number;
  /** Odstęp między panelami i między kolumnami (px) */
  gap?: number;
  /** Górny offset kontenera (np. pod nagłówek aplikacji) */
  startY?: number;
  /** Klucz localStorage dla trwałego zapisu układu */
  storageKey: string;
  /** Renderer zawartości panelu (poniżej nagłówka) */
  renderItem: (id: string, isDragging: boolean) => React.ReactNode;
  /** Renderer etykiety nagłówka (nad uchwytem przeciągania) */
  renderHeaderLabel?: (id: string) => React.ReactNode;
  /** Motyw kolorystyczny HyperA */
  theme: SortableGridTheme;
  /** Czy pokazać wbudowany nagłówek z uchwytem (domyślnie tak) */
  showHeader?: boolean;
  /** Wysokość nagłówka panelu (px) — musi pasować do istniejących paneli HyperA */
  headerHeight?: number;
  /** Czy włączyć Ctrl+Z undo (domyślnie tak) */
  enableUndo?: boolean;
  /** Maks. liczba kroków undo (domyślnie 50) */
  undoLimit?: number;
  /** Czas animacji FLIP (ms) */
  flipDuration?: number;
  flipEasing?: string;
  /** Ref do expose kontroler API (reset, undo) */
  controllerRef?: React.MutableRefObject<SortableGridController | null>;
}

export interface SortableGridController {
  reset: () => void;
  resetHeights: () => void;
  undo: () => void;
  canUndo: () => boolean;
}

/** Struktura zapisywana w localStorage */
interface GridLayout {
  /** order[c] = lista ID paneli w kolumnie c (od góry) */
  order: string[][];
  /** heights[id] = wysokość panelu (px) — opcjonalne dla kompatybilności wstecz */
  heights?: Record<string, number>;
}

const DEFAULT_FLIP_DURATION = 280;
const DEFAULT_FLIP_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

/** Minimalna wysokość panelu — nie można zmniejszyć poniżej */
const MIN_PANEL_HEIGHT = 80;

/** Domyślna wysokość fallback, gdy brak w heightMap */
const FALLBACK_HEIGHT = 240;

export function SortableGrid({
  items,
  columns = 3,
  columnWidth = 460,
  gap = 6,
  startY = 0,
  storageKey,
  renderItem,
  renderHeaderLabel,
  theme,
  showHeader = true,
  headerHeight = 26,
  enableUndo = true,
  undoLimit = 50,
  flipDuration = DEFAULT_FLIP_DURATION,
  flipEasing = DEFAULT_FLIP_EASING,
  controllerRef,
}: SortableGridProps) {
  /* ----- Heights state — per-panel height, modyfikowalne przez resize handle ----
   *  Szerokość jest stała (columnWidth), wysokość zmienna — użytkownik może
   *  przeciągać dolną krawędź każdego panelu, aby dopasować jej rozmiar.
   *  Wysokości są zapisywane w localStorage razem z order.
   */
  const [heights, setHeights] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    items.forEach(it => { init[it.id] = it.height; });
    return init;
  });

  // Scal domyślne wysokości dla nowo dodanych paneli (np. AI panel się pojawia)
  useEffect(() => {
    setHeights(prev => {
      let changed = false;
      const next = { ...prev };
      items.forEach(it => {
        if (!(it.id in next) || next[it.id] === undefined) {
          next[it.id] = it.height;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [items]);

  /* ----- Stan układu: order[c] = lista ID w kolumnie c ----- */
  const buildDefaultOrder = useCallback((): string[][] => {
    const cols: string[][] = Array.from({ length: columns }, () => []);
    items.forEach((it, i) => cols[i % columns].push(it.id));
    return cols;
  }, [items, columns]);

  const [order, setOrder] = useState<string[][]>(buildDefaultOrder);
  const [loaded, setLoaded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  /* ----- Undo history ----- */
  const historyRef = useRef<string[][][]>([]);
  const [, setHistoryVersion] = useState(0);

  const pushHistory = useCallback((prev: string[][]) => {
    historyRef.current.push(prev.map(c => c.slice()));
    if (historyRef.current.length > undoLimit) {
      historyRef.current.shift();
    }
    setHistoryVersion(v => v + 1);
  }, [undoLimit]);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const last = historyRef.current.pop()!;
    setOrder(last);
    setHistoryVersion(v => v + 1);
  }, []);

  const canUndo = historyRef.current.length > 0;

  const reset = useCallback(() => {
    if (order !== buildDefaultOrder()) {
      pushHistory(order);
    }
    setOrder(buildDefaultOrder());
  }, [order, buildDefaultOrder, pushHistory]);

  /* ----- Reset heights to defaults from items prop ----- */
  const resetHeights = useCallback(() => {
    const defaults: Record<string, number> = {};
    items.forEach(it => { defaults[it.id] = it.height; });
    setHeights(defaults);
  }, [items]);

  /* ----- Expose controller API ----- */
  useEffect(() => {
    if (controllerRef) {
      controllerRef.current = {
        reset,
        resetHeights,
        undo,
        canUndo: () => historyRef.current.length > 0,
      };
    }
  }, [controllerRef, reset, resetHeights, undo, canUndo]);

  /* ----- Załaduj z localStorage ----- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as GridLayout;
        if (
          parsed &&
          Array.isArray(parsed.order) &&
          parsed.order.length === columns
        ) {
          // Walidacja: każdy ID z items musi być dokładnie raz
          const allIds = new Set(items.map(it => it.id));
          const seen = new Set<string>();
          let valid = true;
          for (const col of parsed.order) {
            if (!Array.isArray(col)) { valid = false; break; }
            for (const id of col) {
              if (!allIds.has(id) || seen.has(id)) { valid = false; break; }
              seen.add(id);
            }
            if (!valid) break;
          }
          // Wszystkie ID muszą być obecne
          if (valid && seen.size === allIds.size) {
            setOrder(parsed.order);
          }
          // Wczytaj zapisane wysokości (jeśli są) — scal z domyślnymi
          if (parsed.heights && typeof parsed.heights === 'object') {
            setHeights(prev => {
              const next = { ...prev };
              for (const id of Object.keys(parsed.heights!)) {
                const h = parsed.heights![id];
                if (typeof h === 'number' && h >= MIN_PANEL_HEIGHT && h <= 5000) {
                  next[id] = h;
                }
              }
              return next;
            });
          }
        }
      }
    } catch { /* ignore corrupt storage */ }
    setLoaded(true);
  }, [storageKey, columns, items]);

  /* ----- Zapisuj do localStorage przy zmianie order lub heights ----- */
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ order, heights } satisfies GridLayout),
      );
    } catch { /* storage full or disabled */ }
  }, [order, heights, loaded, storageKey]);

  /* ----- Globalny Ctrl+Z ----- */
  useEffect(() => {
    if (!enableUndo) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enableUndo, undo]);

  /* ----- FLIP dla wszystkich paneli ----- */
  const { registerEl } = useFlip(order, {
    skipId: draggingId,
    duration: flipDuration,
    easing: flipEasing,
  });

  /* ----- Drag state ----- */
  const drag = useRef({
    pointerId: null as number | null,
    offsetX: 0,
    offsetY: 0,
    ghost: null as HTMLElement | null,
    sourceCol: -1,
    sourceIndex: -1,
    lastSignature: '',
    // Aktualny cel wstawienia (do wyświetlania drop indicatora)
    targetCol: -1,
    targetIndex: -1,
  });

  // Stan drop indicatora — {col, index, left, top, height}
  const [dropIndicator, setDropIndicator] = useState<{
    left: number;
    top: number;
    height: number;
  } | null>(null);

  // Referencje do window listenerów (żeby je usunąć po zakończeniu drag)
  const winMoveRef = useRef<((e: PointerEvent) => void) | null>(null);
  const winUpRef = useRef<((e: PointerEvent) => void) | null>(null);

  /* ----- Resize state — dla dolnego uchwytu resize ----- */
  const resize = useRef({
    pointerId: null as number | null,
    id: '',
    startY: 0,
    startHeight: 0,
  });
  const [resizingId, setResizingId] = useState<string | null>(null);
  const winResizeMoveRef = useRef<((e: PointerEvent) => void) | null>(null);
  const winResizeUpRef = useRef<((e: PointerEvent) => void) | null>(null);

  /* ----- Resize handler — dolna krawędź panelu, ns-resize ----
   *  Szerokość paneli jest zafixowana (columnWidth), tylko wysokość
   *  jest modyfikowalna. Uchwyt jest na dole panelu (6px pasek).
   *  Live update: setHeights na każdy pointermove → re-render →
   *  positions.current się przelicza → panele poniżej przesuwają się
   *  płynnie (FLIP animuje przesunięcia).
   */
  const handleResizePointerDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      if (e.button !== 0) return;
      e.stopPropagation(); // nie aktywuj sort-drag na nagłówku
      e.preventDefault();

      const startH = heights[id] ?? FALLBACK_HEIGHT;
      resize.current = {
        pointerId: e.pointerId,
        id,
        startY: e.clientY,
        startHeight: startH,
      };
      setResizingId(id);

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const r = resize.current;
        if (r.pointerId === null) return;
        const dy = ev.clientY - r.startY;
        const nextH = Math.max(MIN_PANEL_HEIGHT, r.startHeight + dy);
        setHeights(prev => {
          if (prev[id] === nextH) return prev;
          return { ...prev, [id]: nextH };
        });
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        if (winResizeMoveRef.current) {
          window.removeEventListener('pointermove', winResizeMoveRef.current);
          winResizeMoveRef.current = null;
        }
        if (winResizeUpRef.current) {
          window.removeEventListener('pointerup', winResizeUpRef.current);
          window.removeEventListener('pointercancel', winResizeUpRef.current);
          winResizeUpRef.current = null;
        }
        resize.current = { pointerId: null, id: '', startY: 0, startHeight: 0 };
        setResizingId(null);
      };

      winResizeMoveRef.current = onMove;
      winResizeUpRef.current = onUp;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [heights],
  );

  /* ----- Oblicz pozycje (left, top) per panel ----- */
  // Dla każdej kolumny, akumuluj wysokości od góry.
  const positions = useRef<Record<string, { left: number; top: number; height: number }>>({});
  const containerHeightRef = useRef<number>(0);

  // Oblicz pozycje przed renderem (synchronicznie) — używa heights (state)
  const colLeft = (c: number) => c * (columnWidth + gap);
  let maxBottom = startY;
  positions.current = {};
  for (let c = 0; c < order.length; c++) {
    let top = startY;
    for (let i = 0; i < order[c].length; i++) {
      const id = order[c][i];
      const h = heights[id] ?? FALLBACK_HEIGHT;
      positions.current[id] = { left: colLeft(c), top, height: h };
      top += h + gap;
    }
    if (top > maxBottom) maxBottom = top;
  }
  containerHeightRef.current = maxBottom + 40;

  /* ----- Pointer handlers (window-level dla niezawodnego śledzenia) ----- */
  // Zamiast setPointerCapture na małym pasku nagłówka (22px),
  // attachujemy listenery pointermove/pointerup do window.
  // Dzięki temu kursor NIGDY nie gubi zdarzeń, nawet przy
  // szybkim ruchu poza obszar nagłówka.
  const handlePointerDown = useCallback(
    (e: ReactPointerEvent, id: string) => {
      if (e.button !== 0) return;
      const handle = e.currentTarget as HTMLElement;
      const itemEl = handle.closest('[data-grid-id]') as HTMLElement | null;
      if (!itemEl) return;

      // Znajdź sourceCol i sourceIndex
      let sourceCol = -1, sourceIndex = -1;
      for (let c = 0; c < order.length; c++) {
        const idx = order[c].indexOf(id);
        if (idx >= 0) { sourceCol = c; sourceIndex = idx; break; }
      }
      if (sourceCol < 0) return;

      const rect = itemEl.getBoundingClientRect();
      const ghost = itemEl.cloneNode(true) as HTMLElement;
      ghost.setAttribute('data-ghost', 'true');
      Object.assign(ghost.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        margin: '0',
        pointerEvents: 'none',
        zIndex: '9999',
        opacity: '0.92',
        transform: 'scale(1.02)',
        boxShadow: `0 16px 40px rgba(0,0,0,0.55), 0 0 0 2px ${theme.accent}`,
        transition: 'none', // BRAK transition — ghost pozycjonowany natychmiast
        borderRadius: '2px',
        overflow: 'hidden',
      } as CSSProperties);
      document.body.appendChild(ghost);

      drag.current = {
        pointerId: e.pointerId,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        ghost,
        sourceCol,
        sourceIndex,
        lastSignature: '',
        targetCol: sourceCol,
        targetIndex: sourceIndex,
      };

      itemEl.style.opacity = '0.15';
      itemEl.style.transition = 'opacity 180ms ease';

      setDraggingId(id);

      // ---- WINDOW LISTENERS (zamiast setPointerCapture) ----
      // Listenery są attachowane do window, więc kursor nigdy nie gubi zdarzeń.
      // Usuwane w endDrag.
      const onWinMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const d = drag.current;
        if (!d.ghost) return;

        // 1) Aktualizuj pozycję ghosta NATYCHMIAST (bez throttling)
        const newLeft = ev.clientX - d.offsetX;
        const newTop = ev.clientY - d.offsetY;
        d.ghost.style.left = `${newLeft}px`;
        d.ghost.style.top = `${newTop}px`;

        const ghostRect = d.ghost.getBoundingClientRect();
        const dragCenterX = ghostRect.left + ghostRect.width / 2;
        const dragCenterY = ghostRect.top + ghostRect.height / 2;

        // 2) Znajdź kolumnę pod kursorem
        const container = containerRef.current;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();
        const relX = dragCenterX - containerRect.left;
        const relY = dragCenterY - containerRect.top;

        // Kolumna: najbliższa środkowi kolumny. Działa nawet poza kontenerem.
        let bestCol = 0;
        let bestDist = Infinity;
        for (let c = 0; c < columns; c++) {
          const colCenter = colLeft(c) + columnWidth / 2;
          const dist = Math.abs(relX - colCenter);
          if (dist < bestDist) { bestDist = dist; bestCol = c; }
        }
        const targetCol = bestCol;

        // 3) Indeks wstawienia w kolumnie (center-of-mass)
        const colPanels = order[targetCol].filter(pid => pid !== id);
        let targetIndex = colPanels.length; // domyślnie koniec kolumny
        let accTop = startY;
        let indicatorTop = startY;
        let indicatorHeight = heights[id] ?? FALLBACK_HEIGHT;

        for (let i = 0; i < colPanels.length; i++) {
          const pid = colPanels[i];
          const h = heights[pid] ?? FALLBACK_HEIGHT;
          const itemCenter = accTop + h / 2;
          if (relY < itemCenter) {
            targetIndex = i;
            indicatorTop = accTop;
            indicatorHeight = h;
            break;
          }
          accTop += h + gap;
          indicatorTop = accTop;
        }

        // Jeśli cel to koniec kolumny, indicator na dole
        if (targetIndex === colPanels.length) {
          indicatorTop = accTop;
          indicatorHeight = heights[id] ?? FALLBACK_HEIGHT;
        }

        // 4) Dostosuj indeks jeśli przesuwamy w tej samej kolumnie
        let effectiveIndex = targetIndex;
        if (targetCol === d.sourceCol) {
          if (targetIndex > d.sourceIndex) {
            effectiveIndex = targetIndex - 1;
          }
        }

        // 5) Zaktualizuj drop indicator (zawsze, żeby podążał za kursorem)
        d.targetCol = targetCol;
        d.targetIndex = effectiveIndex;
        setDropIndicator({
          left: colLeft(targetCol),
          top: indicatorTop,
          height: indicatorHeight,
        });

        // 6) Wykonaj arrayMove tylko gdy zmieniła się sygnatura
        const sig = `${targetCol}:${effectiveIndex}`;
        if (sig === d.lastSignature) return;
        if (targetCol === d.sourceCol && effectiveIndex === d.sourceIndex) {
          d.lastSignature = sig;
          return;
        }

        d.lastSignature = sig;

        setOrder(prev => {
          const next = prev.map(cc => cc.slice());
          next[d.sourceCol].splice(d.sourceIndex, 1);
          next[targetCol].splice(effectiveIndex, 0, id);
          d.sourceCol = targetCol;
          d.sourceIndex = effectiveIndex;
          historyRef.current.push(prev.map(cc => cc.slice()));
          if (historyRef.current.length > undoLimit) historyRef.current.shift();
          setHistoryVersion(v => v + 1);
          return next;
        });
      };

      const onWinUp = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return;
        const d = drag.current;

        if (d.ghost) d.ghost.remove();

        if (id) {
          const el = document.querySelector(
            `[data-grid-id="${id}"]:not([data-ghost])`,
          ) as HTMLElement | null;
          if (el) {
            el.style.opacity = '';
            el.style.transition = '';
          }
        }

        // Usuń window listenery
        if (winMoveRef.current) {
          window.removeEventListener('pointermove', winMoveRef.current);
          winMoveRef.current = null;
        }
        if (winUpRef.current) {
          window.removeEventListener('pointerup', winUpRef.current);
          window.removeEventListener('pointercancel', winUpRef.current);
          winUpRef.current = null;
        }

        // Wyczyść drop indicator
        setDropIndicator(null);

        drag.current = {
          pointerId: null,
          offsetX: 0,
          offsetY: 0,
          ghost: null,
          sourceCol: -1,
          sourceIndex: -1,
          lastSignature: '',
          targetCol: -1,
          targetIndex: -1,
        };

        setDraggingId(null);
      };

      winMoveRef.current = onWinMove;
      winUpRef.current = onWinUp;
      window.addEventListener('pointermove', onWinMove, { passive: false });
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinUp);

      e.preventDefault();
    },
    [order, theme.accent, columns, columnWidth, gap, startY, undoLimit],
  );

  /* ----- Ref na kontener (do obliczeń boundingRect) ----- */
  const containerRef = useRef<HTMLDivElement>(null);

  /* ----- Render ----- */
  const containerWidth = columns * columnWidth + (columns - 1) * gap;

  return (
    <div
      ref={containerRef}
      style={
        {
          '--panel-width': `${columnWidth}px`,
          position: 'relative',
          width: `${containerWidth}px`,
          height: `${containerHeightRef.current}px`,
          userSelect: 'none',
        } as CSSProperties
      }
    >
      {/* Styl dla resize handle — hover effect z akcentem koloru */}
      <style>{`
        .hypera-resize-handle:hover {
          background: ${theme.accent}1a !important;
        }
      `}</style>
      {/* DROP INDICATOR — wizualny placeholder pokazujący miejsce wstawienia */}
      {dropIndicator && draggingId && (
        <div
          style={{
            position: 'absolute',
            left: `${dropIndicator.left}px`,
            top: `${dropIndicator.top}px`,
            width: `${columnWidth}px`,
            height: `${dropIndicator.height}px`,
            border: `2px dashed ${theme.accent}`,
            background: `${theme.accent}11`,
            borderRadius: '2px',
            pointerEvents: 'none',
            zIndex: 5,
            transition: 'top 120ms ease, left 120ms ease, height 120ms ease',
            boxSizing: 'border-box',
          }}
        />
      )}

      {/* Wszystkie panele absolutnie pozycjonowane w jednym kontenerze.
          Dzięki key={id} React zachowuje węzły DOM — FLIP działa płynnie. */}
      {order.flatMap((col, c) =>
        col.map(id => {
          const pos = positions.current[id];
          if (!pos) return null;
          const isDragging = id === draggingId;
          const isResizing = id === resizingId;
          return (
            <div
              key={id}
              data-grid-id={id}
              ref={el => registerEl(id, el)}
              style={{
                position: 'absolute',
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                width: `${columnWidth}px`,
                height: `${pos.height}px`,
                background: theme.panel,
                border: isDragging
                  ? `1px dashed ${theme.accent}88`
                  : `1px solid ${theme.border}`,
                borderRadius: '2px',
                overflow: 'hidden',
                // Podczas resize: brak transition na height (natychmiastowa aktualizacja)
                // Inne panele i tak animują się przez FLIP (transform)
                transition: isDragging || isResizing ? 'none' : 'border-color 180ms ease',
                boxSizing: 'border-box',
                zIndex: isDragging ? 1 : 2,
              }}
            >
              {/* Drag handle — niewidzialna warstwa nad nagłówkiem panelu */}
              {showHeader && (
                <div
                  onPointerDown={e => handlePointerDown(e, id)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: `${headerHeight}px`,
                    cursor: isDragging ? 'grabbing' : 'grab',
                    touchAction: 'none',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: '8px',
                    paddingRight: '8px',
                    background: 'transparent',
                  }}
                  title="Przeciągnij aby zmienić kolejność"
                >
                  <span
                    style={{
                      color: theme.textMuted,
                      fontSize: '11px',
                      fontFamily: "'Sarasa Mono SC', monospace",
                      letterSpacing: '1px',
                      textTransform: 'uppercase',
                      opacity: 0.5,
                      pointerEvents: 'none',
                    }}
                  >
                    ⠿ {renderHeaderLabel ? renderHeaderLabel(id) : id}
                  </span>
                </div>
              )}

              {/* Zawartość panelu (renderery HyperA) */}
              <div
                style={{
                  position: 'absolute',
                  top: showHeader ? `${headerHeight}px` : 0,
                  left: 0,
                  right: 0,
                  // bottom odsunięty o 6px — pod spodem jest resize handle
                  bottom: '6px',
                  overflow: 'auto',
                  pointerEvents: isDragging ? 'none' : 'auto',
                }}
              >
                {renderItem(id, isDragging)}
              </div>

              {/* Resize handle — dolna krawędź panelu (6px pasek).
                  Szerokość zafixowana, tylko wysokość jest modyfikowalna.
                  Klasa CSS .hypera-resize-handle dostarcza hover effect. */}
              <div
                onPointerDown={e => handleResizePointerDown(e, id)}
                className="hypera-resize-handle"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '6px',
                  cursor: isResizing ? 'row-resize' : 'ns-resize',
                  touchAction: 'none',
                  zIndex: 11,
                  background: 'transparent',
                  // Wskaźnik grip — pozioma kreska na środku dolnej krawędzi
                }}
                title="Przeciągnij aby zmienić wysokość"
              >
                <div
                  style={{
                    position: 'absolute',
                    bottom: '2px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '32px',
                    height: '1px',
                    background: isResizing ? theme.accent : theme.textMuted,
                    opacity: isResizing ? 0.9 : 0.22,
                    transition: 'opacity 120ms ease, background 120ms ease',
                    pointerEvents: 'none',
                  }}
                />
              </div>
            </div>
          );
        }),
      )}
    </div>
  );
}

export default SortablePanels;
