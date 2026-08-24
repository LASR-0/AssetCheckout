import type { ResolvedStep, TourSide, TourStepSpec } from "./types";

///  +-----------------------------------------------------------------+
///  |        TURNING AUTHORED STEPS INTO STEPS THIS PAGE HAS          |
///  +-----------------------------------------------------------------+
//
//  THE PROBLEM THIS SOLVES. The tour exists for people who have just arrived,
//  and almost nothing on the home page renders for them: the holdings section
//  returns null until it has loaded and shows an empty state when they hold
//  nothing, the accessory suggestions return null outright, the status tiles
//  degrade from links to plain text at zero, and the recent-requests list is
//  a sentence saying there aren't any. A tour authored against a full page
//  would spend half its steps pointing at nothing.
//
//  driver.js will not save us: it takes a selector, and a step whose selector
//  matches nothing renders as a centred popover with no highlight and no
//  indication that it was meant to be attached to something. Its
//  skipMissingElement option drops the step entirely, which is better but
//  still all-or-nothing — it cannot say something different instead.
//
//  So resolution happens here, before driver sees anything: take the first
//  anchor that is actually present, swap the copy if that was not the first
//  choice, drop what has nothing to say, and keep the headline topics as
//  page-level popovers when even their fallbacks are missing.
//
//  PURE, WITH THE DOM INJECTED. `find` is the only thing that touches a
//  document, which is what makes every decision in here testable against a
//  Set of anchor names rather than a rendered page.
///  +-----------------------------------------------------------------+

export type ResolveOptions = {
  /** True when the viewport is at least `md` — see hooks/useIsDesktop. */
  isDesktop: boolean;
};

export function resolveSteps(
  steps: TourStepSpec[],
  find: (anchor: string) => boolean,
  options: ResolveOptions = { isDesktop: true }
): ResolvedStep[] {
  const resolved: ResolvedStep[] = [];

  for (const step of steps) {
    const anchor = step.anchors.find(find) ?? null;

    // Nothing to point at and nothing that must be said: this topic simply
    // does not apply to this page right now.
    if (anchor === null && !step.required) continue;

    const override = anchor ? step.copyByAnchor?.[anchor] : undefined;

    resolved.push({
      id: step.id,
      anchor,
      title: override?.title ?? step.title,
      description: override?.description ?? step.description,
      side: sideFor(step.side, options.isDesktop),
      align: step.align,
    });
  }

  return dedupeAdjacent(resolved);
}

/**
 * Narrow screens get top or bottom, never left or right.
 *
 * A side-anchored popover on a 360px screen has about a hundred pixels to
 * live in. driver.js flips when it must, but it flips to whatever fits rather
 * than to what reads best, and "whatever fits" next to a full-width element
 * is not a choice worth leaving to chance.
 */
function sideFor(side: TourSide | undefined, isDesktop: boolean): TourSide | undefined {
  if (isDesktop || side === undefined) return side;
  return side === "left" || side === "right" ? "bottom" : side;
}

/**
 * Fold two consecutive steps that landed on the same element.
 *
 * Not hypothetical. For somebody holding nothing, "tell us this device is
 * broken" and "tell us about a device we have not recorded" both fall back to
 * the one button that opens the holdings dialog — and the same spotlight
 * twice in a row, with different words, reads as the tour having lost its
 * place. Joined into one step, it reads as one thought.
 */
function dedupeAdjacent(steps: ResolvedStep[]): ResolvedStep[] {
  const out: ResolvedStep[] = [];

  for (const step of steps) {
    const last = out[out.length - 1];

    if (last && step.anchor !== null && last.anchor === step.anchor) {
      out[out.length - 1] = {
        ...last,
        description: `${last.description} ${step.description}`,
      };
      continue;
    }

    out.push(step);
  }

  return out;
}
