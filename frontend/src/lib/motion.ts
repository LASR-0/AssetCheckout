import type { CSSProperties } from "react";

///  +-----------------------------------------------------------------+
///  |                  ROWS ARRIVING, TOP DOWN                        |
///  +-----------------------------------------------------------------+
//
//  Table rows fade and drop in one after another (animate-row-in), like a
//  row of dominoes. Each row waits for its place in the batch; the wait is
//  capped so a long page settles quickly instead of trickling in.
//
//  It plays when a row MOUNTS. A table that should replay it when its
//  contents change (a new page, a new filter) keys its rows' container on
//  that, so they remount; a background refresh of the same rows does not
//  replay, and rows appended as a list grows cascade from their own start.
//  Reduced motion turns it off (motion-reduce:animate-none at the call).
///  +-----------------------------------------------------------------+

const STEP_MS = 28;
const MAX_STEPS = 14;

/** The delay for the row at `index` within the batch that just arrived. */
export function rowIn(index: number): CSSProperties {
  return { animationDelay: `${Math.min(index, MAX_STEPS) * STEP_MS}ms` };
}

/** Classes for an animated row. */
export const ROW_IN = "animate-row-in motion-reduce:animate-none";
