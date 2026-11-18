import { useCallback, useState, type KeyboardEvent, type PointerEvent } from "react";

///  +-----------------------------------------------------------------+
///  |                  THE LOG'S ADJUSTABLE LAYOUT                    |
///  +-----------------------------------------------------------------+
//
//  Two things on the Requests desk can be dragged: the split between the
//  list and the docket, and the widths of the table's columns. Both are a
//  per-browser convenience, kept in localStorage; when storage is missing
//  or blocked the defaults apply and nothing else changes. Double-click a
//  handle to put it back.
///  +-----------------------------------------------------------------+

const LIST_KEY = "requests-list-width";
const COLS_KEY = "requests-columns";

function load<T>(key: string, ok: (v: unknown) => v is T): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    const v: unknown = JSON.parse(raw);
    return ok(v) ? v : null;
  } catch {
    return null;
  }
}

function save(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* No storage: it lasts until the page is left, which is fine. */
  }
}

/**
 * Follows a pointer from a handle until it's released. `onMove` gets the
 * pointer's x, in viewport px, on every move.
 */
export function startDrag(e: PointerEvent<HTMLElement>, onMove: (x: number) => void, onEnd?: () => void) {
  if (e.button !== 0) return;
  e.preventDefault();
  const el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  const prev = document.body.style.cursor;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  const move = (ev: globalThis.PointerEvent) => onMove(ev.clientX);
  const up = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    document.body.style.cursor = prev;
    document.body.style.userSelect = "";
    onEnd?.();
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

/** Left and right arrows nudge a handle, by `step`, or 4× with Shift. */
export function arrowNudge(e: KeyboardEvent, step: number, nudge: (d: number) => void) {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  nudge((e.key === "ArrowLeft" ? -1 : 1) * step * (e.shiftKey ? 4 : 1));
}

// ---- the split ----------------------------------------------------------

/** The list's width in CSS px, or null for the layout's own default. */
export function useListWidth() {
  const [width, setWidthState] = useState<number | null>(() =>
    load(LIST_KEY, (v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
  );
  const setWidth = useCallback((w: number | null) => {
    const v = w == null ? null : Math.round(w);
    setWidthState(v);
    save(LIST_KEY, v);
  }, []);
  return [width, setWidth] as const;
}

// ---- the columns ----------------------------------------------------------

/** The resizable columns, in order, after the flexible Request column. */
export const COL_KEYS = ["requester", "stage", "action", "filed"] as const;
export type ColKey = (typeof COL_KEYS)[number];
export type ColWidths = Record<ColKey, number>;

/** Design px. The defaults are the design's own widths. */
export const COL_DEFAULT: ColWidths = { requester: 116, stage: 132, action: 184, filed: 44 };
const COL_MIN: ColWidths = { requester: 72, stage: 80, action: 96, filed: 44 };
const COL_MAX = 480;
/** What the Request column keeps, however wide the others are dragged. */
export const REQUEST_MIN = 140;

function isWidths(v: unknown): v is ColWidths {
  return !!v && typeof v === "object" && COL_KEYS.every((k) => typeof (v as Record<string, unknown>)[k] === "number");
}

export function clampCol(k: ColKey, w: number): number {
  return Math.round(Math.min(COL_MAX, Math.max(COL_MIN[k], w)));
}

/**
 * The grid template every row of the table shares. Each dragged width is
 * what a column would like, not what it insists on: when the table narrows
 * (the list dragged smaller, a smaller window) the Request column gives up
 * room down to its minimum, then the others shrink toward theirs, so the
 * columns always fit side by side rather than running into each other.
 */
export function colTemplate(w: ColWidths): string {
  const rem = (px: number) => `${px / 16}rem`;
  const cols = COL_KEYS.map((k) => `minmax(${rem(COL_MIN[k])},${rem(w[k])})`);
  return `0.5rem minmax(${rem(REQUEST_MIN)},1fr) ${cols.join(" ")}`;
}

export function useColumnWidths() {
  const [widths, setState] = useState<ColWidths>(() => {
    const stored = load(COLS_KEY, isWidths);
    return stored ? { ...COL_DEFAULT, ...stored } : COL_DEFAULT;
  });
  const setWidths = useCallback((next: ColWidths) => {
    setState(next);
    const same = COL_KEYS.every((k) => next[k] === COL_DEFAULT[k]);
    save(COLS_KEY, same ? null : next);
  }, []);
  return [widths, setWidths] as const;
}
