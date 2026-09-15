import { describe, it, expect } from "vitest";
import { deriveFulfilment } from "./statusbadge";

///  +-----------------------------------------------------------------+
///  |        THE TWO FULFILMENT PATHS NOW CONVERGE                    |
///  +-----------------------------------------------------------------+
//
//  needsShipping used to fork the tail of the lifecycle into two different
//  endings — ship → received, or collect → ready → collected. It now decides
//  only whether there was a courier leg in the middle. Both paths finish the
//  same way: a stock keeper marks the device ready, then the requester
//  collects it.
//
//  The stage that changed meaning is SHIPPED. It used to mean "the requester
//  has been told to expect it"; it now means "in transit, or delivered but
//  not yet handed over" — and it must END when the keeper marks it ready, or
//  a handed-over device would read as still in the van and the requester
//  would be shown no way to close it.
//
//  Two badges being simultaneously true is the failure mode worth pinning:
//  nothing throws, the badge just silently picks whichever the ternary
//  reaches first, and the row reads as the wrong stage to everyone.
///  +-----------------------------------------------------------------+

const AT = "2026-09-20T00:00:00.000Z";

const completed = (overrides: Record<string, unknown> = {}) => ({
  status: "COMPLETED",
  needsShipping: false,
  shippedAt: null,
  collectionReadyAt: null,
  receivedAt: null,
  ...overrides,
});

describe("the ship path", () => {
  it("awaits dispatch before anything is sent", () => {
    const s = deriveFulfilment(completed({ needsShipping: true }));
    expect(s.isShipAwaitingPrep).toBe(true);
    expect(s.badgeKey).toBe("ASSIGNED");
  });

  it("reads as shipped while in transit", () => {
    const s = deriveFulfilment(completed({ needsShipping: true, shippedAt: AT }));
    expect(s.isShipped).toBe(true);
    expect(s.badgeKey).toBe("SHIPPED");
  });

  it("STOPS reading as shipped once the keeper hands it over", () => {
    // The regression this exists for: leave `isShipped` keyed on shippedAt
    // alone and a handed-over device stays badged SHIPPED forever, with its
    // requester shown no way to confirm they have it.
    const s = deriveFulfilment(
      completed({ needsShipping: true, shippedAt: AT, collectionReadyAt: AT })
    );
    expect(s.isShipped).toBe(false);
    expect(s.isReadyToCollect).toBe(true);
    expect(s.badgeKey).toBe("READY_TO_COLLECT");
  });

  it("ends at received", () => {
    const s = deriveFulfilment(
      completed({
        needsShipping: true,
        shippedAt: AT,
        collectionReadyAt: AT,
        receivedAt: AT,
      })
    );
    expect(s.isReceivedOrCollected).toBe(true);
    expect(s.badgeKey).toBe("RECEIVED");
  });
});

describe("the collect path", () => {
  it("awaits the keeper making it ready", () => {
    const s = deriveFulfilment(completed());
    expect(s.isCollectAwaitingPrep).toBe(true);
    expect(s.badgeKey).toBe("ASSIGNED");
  });

  it("reads as ready once they have", () => {
    const s = deriveFulfilment(completed({ collectionReadyAt: AT }));
    expect(s.isReadyToCollect).toBe(true);
    expect(s.badgeKey).toBe("READY_TO_COLLECT");
  });

  it("ends at collected", () => {
    const s = deriveFulfilment(completed({ collectionReadyAt: AT, receivedAt: AT }));
    expect(s.badgeKey).toBe("COLLECTED");
  });
});

describe("the stages stay mutually exclusive", () => {
  const cases = [
    ["awaiting dispatch", completed({ needsShipping: true })],
    ["in transit", completed({ needsShipping: true, shippedAt: AT })],
    [
      "handed over after shipping",
      completed({ needsShipping: true, shippedAt: AT, collectionReadyAt: AT }),
    ],
    ["awaiting prep", completed()],
    ["ready on the shelf", completed({ collectionReadyAt: AT })],
  ] as const;

  for (const [name, request] of cases) {
    it(`exactly one stage is true: ${name}`, () => {
      const s = deriveFulfilment(request);
      const live = [
        s.isCollectAwaitingPrep,
        s.isReadyToCollect,
        s.isShipAwaitingPrep,
        s.isShipped,
        s.isReceivedOrCollected,
      ].filter(Boolean);
      expect(live).toHaveLength(1);
    });
  }
});

describe("corrections", () => {
  it("still have no fulfilment chain at all", () => {
    // A resolved correction is COMPLETED with no stamps, which is byte-for-byte
    // what "awaiting prep" looks like — and would now offer a keeper a handover
    // button for a device that does not exist.
    const s = deriveFulfilment(completed({ requestKind: "CORRECTION" }));
    expect(s.isCollectAwaitingPrep).toBe(false);
    expect(s.isReadyToCollect).toBe(false);
    expect(s.badgeKey).toBe("COMPLETED");
  });
});
