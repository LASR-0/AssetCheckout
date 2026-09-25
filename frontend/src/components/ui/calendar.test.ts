import { describe, it, expect } from "vitest";
import { CALENDAR_CLASS_NAMES as C } from "./calendar";

///  +-----------------------------------------------------------------+
///  |        THE MONTH ARROWS ARE POSITIONED, NOT LAID OUT            |
///  +-----------------------------------------------------------------+
//
//  react-day-picker renders <Nav> as the first child of `months`, and we lift
//  it out of flow so it can straddle the caption row. That makes two entries
//  in the class map load-bearing on each other while sitting forty lines
//  apart with nothing to say so.
//
//  WHEN IT BREAKS, NOTHING ERRORS. The arrows resolve against whatever
//  ancestor happens to be positioned — a dialog, the page — and leave the
//  calendar entirely. The grid still renders, the days still select, and the
//  month simply cannot be changed. That shipped once already, and the only
//  thing that caught it was somebody trying to book across a month boundary.
//
//  These assert the couplings, not the styling. Colours and spacing are free
//  to change; the four facts below are not.
///  +-----------------------------------------------------------------+

describe("month navigation", () => {
  it("anchors the nav to `months`, which Nav is a child of", () => {
    // The regression. If nav is out of flow, its container must establish the
    // containing block — or the arrows go somewhere else on the page.
    expect(C.nav).toContain("absolute");
    expect(C.months).toContain("relative");
  });

  it("spans the full width so two months get outer arrows", () => {
    // inset-x-0 rather than a fixed offset: with numberOfMonths={2} the bar
    // has to reach both edges of the pair, not bracket the first month.
    expect(C.nav).toContain("inset-x-0");
    expect(C.nav).toContain("justify-between");
  });

  it("keeps the nav strip click-through but its buttons clickable", () => {
    // The bar covers the caption row. Without this split it silently eats
    // clicks aimed at the month label behind it.
    expect(C.nav).toContain("pointer-events-none");
    expect(C.button_previous).toContain("pointer-events-auto");
    expect(C.button_next).toContain("pointer-events-auto");
  });

  it("dims the arrows via aria-disabled, which is what Nav actually sets", () => {
    // Nav marks the end of the navigable range with aria-disabled and leaves
    // the button enabled. A `disabled:` variant matches nothing, so the arrow
    // at the boundary would look live and do nothing.
    for (const btn of [C.button_previous, C.button_next]) {
      expect(btn).toContain("aria-disabled:");
      expect(btn).not.toMatch(/(^|\s)disabled:/);
    }
  });

  it("gives the chevron a fill, since the glyph carries none of its own", () => {
    // The arrow is a bare <polygon>. Unstyled it paints browser-default
    // black: invisible on the dark theme, off-palette on the light one.
    expect(C.chevron).toContain("fill-current");
  });
});
