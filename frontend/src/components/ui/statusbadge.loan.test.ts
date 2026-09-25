import { describe, it, expect } from "vitest";
import { deriveLoanStage, deriveFulfilment, deriveStage, isDoneStage, isReturnable } from "./statusbadge";

///  +-----------------------------------------------------------------+
///  |            A LOAN DOES NOT END WHEN IT IS COLLECTED             |
///  +-----------------------------------------------------------------+
//
//  Every other request in the system finishes the moment the requester has
//  the thing. A hotspot loan STARTS there, and the whole feature rests on
//  that one divergence, so it is pinned here from both directions: the loan
//  stages themselves, and the fact that the shared fulfilment derivation
//  still answers the handover half unchanged.
//
//  THE DAY BOUNDARY IS THE POINT. "Due back on the 5th" means the whole of
//  the 5th — a keeper standing there at 9am on the due date must be able to
//  take it back, and must not be told it is overdue. The due date is written
//  as UTC midnight of the chosen day and today is read locally, so these
//  cases are the ones that catch a naive instant comparison.
///  +-----------------------------------------------------------------+

/** The due date as it is stored: UTC midnight of the chosen calendar day. */
const due = (day: string) => `${day}T00:00:00.000Z`;

/** A local wall-clock instant on the given day — how the VIEWER sees "now". */
const localNoon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

describe("deriveLoanStage", () => {
  it("is on loan while the due date is still ahead", () => {
    expect(deriveLoanStage({ endDate: due("2026-10-05") }, localNoon(2026, 10, 1)))
      .toBe("ON_LOAN");
  });

  it("is due back ON the due date, not the day after", () => {
    // The unlock moment. Getting this wrong by a day means the keeper holding
    // the hotspot is refused by the button that exists for them.
    expect(deriveLoanStage({ endDate: due("2026-10-05") }, localNoon(2026, 10, 5)))
      .toBe("DUE_BACK");
  });

  it("stays due back all day, not just at midnight", () => {
    const end = new Date(2026, 9, 5, 23, 59, 59);
    expect(deriveLoanStage({ endDate: due("2026-10-05") }, end)).toBe("DUE_BACK");
  });

  it("is overdue from the following day", () => {
    expect(deriveLoanStage({ endDate: due("2026-10-05") }, localNoon(2026, 10, 6)))
      .toBe("OVERDUE");
  });

  it("is returned once Snipe agreed, however late that was", () => {
    // returnedAt wins over the clock: a loan brought back three weeks late is
    // returned, not overdue, and must stop appearing in the chase queue.
    expect(
      deriveLoanStage(
        { endDate: due("2026-10-05"), returnedAt: "2026-10-26T04:00:00.000Z" },
        localNoon(2026, 11, 20)
      )
    ).toBe("RETURNED");
  });

  it("does not flip early for a viewer ahead of UTC", () => {
    // Brisbane is UTC+10, so 9am local on the 5th is 23:00 UTC on the 4th.
    // An instant comparison against UTC midnight of the 5th calls that
    // ON_LOAN and hides the return button for the first ten hours of the day
    // it is actually owed back.
    const brisbaneMorning = new Date(2026, 9, 5, 9, 0, 0);
    expect(deriveLoanStage({ endDate: due("2026-10-05") }, brisbaneMorning))
      .toBe("DUE_BACK");
  });
});

describe("isReturnable", () => {
  it("is shut before the due date and open from it", () => {
    const loan = { endDate: due("2026-10-05") };
    expect(isReturnable(loan, localNoon(2026, 10, 4))).toBe(false);
    expect(isReturnable(loan, localNoon(2026, 10, 5))).toBe(true);
    expect(isReturnable(loan, localNoon(2026, 10, 9))).toBe(true);
  });

  it("is shut again once the loan is back", () => {
    expect(
      isReturnable(
        { endDate: due("2026-10-05"), returnedAt: "2026-10-05T06:00:00.000Z" },
        localNoon(2026, 10, 5)
      )
    ).toBe(false);
  });
});

describe("the handover half is untouched", () => {
  // The stock keeper's queues are built on these booleans and know nothing
  // about loans. If a hotspot stopped satisfying them it would simply never
  // appear in anybody's queue — silently, with no error.
  const hotspot = (overrides: Record<string, unknown> = {}) => ({
    status: "COMPLETED",
    requestKind: "HOTSPOT",
    needsShipping: false,
    shippedAt: null,
    collectionReadyAt: null,
    receivedAt: null,
    hotspotLoan: { endDate: due("2026-10-05"), returnedAt: null },
    ...overrides,
  });

  it("waits for the keeper exactly as an accessory does", () => {
    const s = deriveFulfilment(hotspot());
    expect(s.isCollectAwaitingPrep).toBe(true);
    expect(s.badgeKey).toBe("ASSIGNED");
  });

  it("reads as ready to collect after the keeper's mark", () => {
    const s = deriveFulfilment(hotspot({ collectionReadyAt: due("2026-10-01") }));
    expect(s.isReadyToCollect).toBe(true);
    expect(s.badgeKey).toBe("READY_TO_COLLECT");
  });

  it("becomes a LOAN rather than COLLECTED once picked up", () => {
    // The divergence, stated directly. COLLECTED is terminal; ON_LOAN is not.
    const s = deriveFulfilment(
      hotspot({ collectionReadyAt: due("2026-10-01"), receivedAt: due("2026-10-01") })
    );
    expect(s.isReceivedOrCollected).toBe(true);
    expect(s.badgeKey).not.toBe("COLLECTED");
    expect(["ON_LOAN", "DUE_BACK", "OVERDUE"]).toContain(s.badgeKey);
  });

  it("leaves a non-hotspot request collected, as before", () => {
    const s = deriveFulfilment({
      status: "COMPLETED",
      requestKind: "ACCESSORY",
      needsShipping: false,
      shippedAt: null,
      collectionReadyAt: due("2026-10-01"),
      receivedAt: due("2026-10-01"),
    });
    expect(s.badgeKey).toBe("COLLECTED");
  });
});

describe("deriveStage", () => {
  it("says a fresh loan is with IT, not merely 'Approved'", () => {
    // A loan is BORN at APPROVED — there is no manager stage — so without its
    // own branch the one row genuinely sitting in IT's lap is the one that
    // does not say so.
    expect(
      deriveStage({
        status: "APPROVED",
        requestKind: "HOTSPOT",
        requestType: "HOTSPOT",
        adminApprovedAt: null,
      })
    ).toBe("AWAITING_IT");
  });
});

describe("isDoneStage", () => {
  it("counts a returned loan as finished and a running one as not", () => {
    expect(isDoneStage("RETURNED")).toBe(true);
    expect(isDoneStage("ON_LOAN")).toBe(false);
    expect(isDoneStage("DUE_BACK")).toBe(false);
    expect(isDoneStage("OVERDUE")).toBe(false);
  });
});
