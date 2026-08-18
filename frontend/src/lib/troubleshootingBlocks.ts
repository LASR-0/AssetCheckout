import type { Step } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |        WHICH ORDER A STEP'S BLOCKS ARE READ IN                  |
///  +-----------------------------------------------------------------+
//
//  A step carries up to four optional blocks — a note, a warning, a figure and
//  a link somewhere else — and until now the reader rendered them in a fixed
//  order hardcoded in JSX. `blockOrder` lets an author change that per step.
//
//  IT IS A HINT, NOT A CONTENT MODEL, and everything here follows from that.
//  The blocks are still four named optional fields; the list only says which
//  order to read them in. So the list can be stale, incomplete, or name a
//  block that no longer exists, and none of those may cost the reader
//  anything: `orderedBlocks` starts from what the step ACTUALLY HAS and uses
//  the hint only to sort it.
//
//  The consequence worth stating plainly: a wrong `blockOrder` can change the
//  order things appear in. It can never make one disappear.
///  +-----------------------------------------------------------------+

export type BlockKind = "note" | "warn" | "figure" | "branch" | "link";

/** The order used when a step says nothing — what the reader hardcoded before
 *  `blockOrder` existed, so every article written up to now is unaffected. */
export const DEFAULT_BLOCK_ORDER: readonly BlockKind[] = [
  "note",
  "warn",
  "figure",
  "branch",
  "link",
];

/** Which blocks this step actually carries, in default order. */
export function presentBlocks(step: Step): BlockKind[] {
  return DEFAULT_BLOCK_ORDER.filter((kind) => step[kind] !== undefined);
}

/**
 * The blocks this step carries, in the order to show them.
 *
 * Built from what is present, then sorted by the hint — never the other way
 * round. A block missing from `blockOrder` still renders; it goes after the
 * ones that are listed, in default order, which is what somebody adding a
 * block to a reordered step would expect.
 */
export function orderedBlocks(step: Step): BlockKind[] {
  const present = presentBlocks(step);
  const hinted = (step.blockOrder ?? []).filter((kind) => present.includes(kind));
  const rest = present.filter((kind) => !hinted.includes(kind));

  return [...hinted, ...rest];
}

/**
 * A step with one block moved up or down.
 *
 * Writes `blockOrder` only when the result is NOT the default order — so a
 * step whose blocks happen to sit in the default order carries no hint at all,
 * and the sixty existing modules stay byte-identical on export rather than
 * each gaining a line describing what they already do.
 */
export function moveBlock(step: Step, kind: BlockKind, direction: -1 | 1): Step {
  const order = orderedBlocks(step);
  const index = order.indexOf(kind);
  const target = index + direction;

  if (index < 0 || target < 0 || target >= order.length) return step;

  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];

  const isDefault =
    next.join() === DEFAULT_BLOCK_ORDER.filter((k) => next.includes(k)).join();

  const updated: Step = { ...step, blockOrder: next };
  if (isDefault) delete updated.blockOrder;

  return updated;
}
