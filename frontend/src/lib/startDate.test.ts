import { describe, it, expect } from "vitest";
import { isStartPending, formatStartShort, startDateToLocal } from "./startDate";

///  +-----------------------------------------------------------------+
///  |        THE CHIP MUST AGREE WITH THE SERVER ABOUT WHAT DAY IT IS  |
///  +-----------------------------------------------------------------+
//
//  The chip tells a stock keeper "reminders are held until this date". If it
//  disappears a day early they go looking for a reminder that is not coming;
//  a day late and they ignore one that is. So the edges are pinned: the day
//  before is pending, the day itself is not.
///  +-----------------------------------------------------------------+

// 10am on 11 November, local time — wherever the test happens to run.
const NOW = new Date(2026, 10, 11, 10, 0, 0);

describe("isStartPending", () => {
  it("is pending for a start date after today", () => {
    expect(isStartPending("2026-11-12T00:00:00.000Z", NOW)).toBe(true);
  });

  it("is NOT pending on the start date itself — day one starts the clock", () => {
    expect(isStartPending("2026-11-11T00:00:00.000Z", NOW)).toBe(false);
  });

  it("is not pending for a past date, a missing one, or garbage", () => {
    expect(isStartPending("2026-11-01T00:00:00.000Z", NOW)).toBe(false);
    expect(isStartPending(null, NOW)).toBe(false);
    expect(isStartPending(undefined, NOW)).toBe(false);
    expect(isStartPending("not a date", NOW)).toBe(false);
  });
});

describe("display", () => {
  it("shows the stored calendar day, not the viewer's local reading of it", () => {
    expect(formatStartShort("2026-11-12T00:00:00.000Z")).toBe("12 Nov");
    const local = startDateToLocal("2026-11-12T00:00:00.000Z");
    expect([local.getFullYear(), local.getMonth(), local.getDate()]).toEqual([2026, 10, 12]);
  });
});
