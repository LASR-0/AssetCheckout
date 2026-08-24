///  +-----------------------------------------------------------------+
///  |                  WHAT A TOUR STEP IS                            |
///  +-----------------------------------------------------------------+
//
//  A step is authored against the page as it looks when it is full — a user
//  with devices assigned and requests in flight. The tour's whole audience is
//  the opposite of that, so a step also declares where to go when its ideal
//  target is not on the page, and what to say instead when it lands there.
//
//  See resolveSteps for how that is applied, and lib/tours/home.ts for what it
//  looks like written out.
///  +-----------------------------------------------------------------+

export type TourId =
  | "home"
  | "requests"
  | "requests-manager"
  | "settings"
  | "troubleshooting";

export type TourSide = "top" | "bottom" | "left" | "right";
export type TourAlign = "start" | "center" | "end";

export type TourStepSpec = {
  /** Stable, for tests and for reading a failure. Never shown. */
  id: string;

  /**
   * Where to point, in preference order. The first anchor present in the DOM
   * wins, so the ideal target comes first and the consolation prizes follow.
   *
   * Every anchor is a `[data-tour="…"]` selector. Anchors that only exist on
   * one side of the `md` breakpoint must never be the only entry — the
   * desktop nav links are hidden below it, so a step relying on one of those
   * alone would silently vanish on a phone.
   */
  anchors: string[];

  title: string;
  description: string;

  /** Desktop preference. Overridden to top/bottom on narrow screens, where a
   *  side popover has no room — see resolveSteps. */
  side?: TourSide;
  align?: TourAlign;

  /**
   * Different words when the step landed somewhere other than first choice.
   *
   * Keyed by anchor. "Tell us your device is broken" is wrong when the step
   * fell back to a button that opens an empty list, and a tour that says the
   * wrong thing is worse than one that says nothing.
   */
  copyByAnchor?: Record<string, { title?: string; description?: string }>;

  /**
   * A headline topic that must be covered even if nothing matches.
   *
   * It survives as a page-level popover with no highlight, rather than being
   * dropped. Used sparingly: for the two or three things a user would leave
   * the tour not knowing, on a page bare enough that no anchor resolved.
   */
  required?: boolean;
};

export type TourDefinition = {
  id: TourId;
  steps: TourStepSpec[];
};

/** What the adapter hands to driver.js: an element, or nothing for a
 *  page-level step. */
export type ResolvedStep = {
  id: string;
  /** The anchor that won, or null when this is a page-level step. */
  anchor: string | null;
  title: string;
  description: string;
  side?: TourSide;
  align?: TourAlign;
};
