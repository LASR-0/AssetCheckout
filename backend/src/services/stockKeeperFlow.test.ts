import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import { isLegacyShipment } from "./settings.js";

// request.ts pulls in snipeitassets.ts, which refuses to load without Snipe
// credentials. Nothing below reaches Snipe — both functions under test read
// and write rows and read one setting — so these exist only to get the module
// graph up, which is why the import is dynamic and down here.
process.env.SNIPEIT_API_URL ??= "https://snipe.test/api/v1";
process.env.SNIPEIT_BOT_TOKEN ??= "test-token";

const { markReadyForCollection, markRequestReceived } = await import("./request.js");

///  +-----------------------------------------------------------------+
///  |     THE HANDOVER STEP, AND WHO IT MUST NOT BE APPLIED TO         |
///  +-----------------------------------------------------------------+
//
//  Marking a request ready to collect became a step on BOTH paths: a device
//  shipped to a site is received there by its stock keeper before the person
//  who asked for it collects it. The guard that used to refuse this outright
//  for anything shipped — "This request is for shipping, not collection" — is
//  gone, and that removal is the centre of the change.
//
//  THE RISK IS ENTIRELY IN THE ROWS THAT ALREADY EXIST. A shipment dispatched
//  last week has a requester who was told to confirm receipt themselves, and
//  a destination site that may have no keeper assigned yet. Applying the new
//  rule to it takes the button away from the one person who can see the
//  parcel and hands the job to somebody who does not know they have it. The
//  request does not error; it just stops moving, and nobody finds out until
//  somebody asks where their laptop went.
//
//  So the cutover is asserted from both sides: the new flow genuinely applies
//  to everything after it, and genuinely does not apply to what came before.
//
//  Runs against the throwaway database vitest provisions — see
//  vitest.config.ts.
///  +-----------------------------------------------------------------+

const CUTOVER = new Date("2026-09-15T00:00:00.000Z");
const BEFORE = new Date("2026-09-10T00:00:00.000Z");
const AFTER = new Date("2026-09-20T00:00:00.000Z");

const created: number[] = [];

async function seedFulfilled(overrides: Record<string, unknown> = {}) {
  const row = await prisma.request.create({
    data: {
      userId: 601,
      userName: "Sam Taylor",
      categoryId: 10,
      categoryName: "Laptop",
      requestKind: "ASSET",
      requestType: "STANDARD",
      status: "COMPLETED",
      managerId: 602,
      manager: "Ali Rahman",
      userLocationId: 4,
      userLocationName: "Bundamba",
      ...overrides,
    },
  });
  created.push(row.id);
  return row;
}

beforeEach(async () => {
  await prisma.setting.upsert({
    where: { key: "stock_keeper_flow_enabled_at" },
    create: {
      key: "stock_keeper_flow_enabled_at",
      value: CUTOVER.toISOString(),
    },
    update: { value: CUTOVER.toISOString() },
  });
});

afterAll(async () => {
  if (created.length > 0) {
    await prisma.request.deleteMany({ where: { id: { in: created } } });
  }
});

describe("marking ready to collect", () => {
  it("works on a collect-path request, as it always did", async () => {
    const row = await seedFulfilled({ needsShipping: false });

    const result = await markReadyForCollection(row.id);

    expect(result.success).toBe(true);
    expect(result.request.collectionReadyAt).not.toBeNull();
  });

  it("now works on a SHIPPED request — the guard that refused this is gone", async () => {
    const row = await seedFulfilled({ needsShipping: true, shippedAt: AFTER });

    const result = await markReadyForCollection(row.id);

    expect(result.request.collectionReadyAt).not.toBeNull();
  });

  it("does not require the device to have been marked shipped first", async () => {
    // "Marked shipped" is an admin remembering to click a button. The keeper
    // holding the parcel is the authoritative "it is here", and blocking them
    // on somebody else's bookkeeping is backwards.
    const row = await seedFulfilled({ needsShipping: true, shippedAt: null });

    const result = await markReadyForCollection(row.id);

    expect(result.request.collectionReadyAt).not.toBeNull();
  });

  it("refuses a request that is not fulfilled yet", async () => {
    const row = await seedFulfilled({ status: "APPROVED" });

    await expect(markReadyForCollection(row.id)).rejects.toThrow(/completed/i);
  });

  it("refuses to hand over the same request twice", async () => {
    const row = await seedFulfilled({ collectionReadyAt: AFTER });

    await expect(markReadyForCollection(row.id)).rejects.toThrow(/already/i);
  });

  it("refuses a request the requester already has", async () => {
    const row = await seedFulfilled({ receivedAt: AFTER });

    await expect(markReadyForCollection(row.id)).rejects.toThrow(/already been received/i);
  });
});

describe("confirming receipt under the new flow", () => {
  it("is blocked until the stock keeper has handed it over", async () => {
    const row = await seedFulfilled({
      needsShipping: true,
      shippedAt: AFTER,
      collectionReadyAt: null,
    });

    await expect(markRequestReceived(row.id)).rejects.toThrow(/ready to collect/i);
  });

  it("is allowed once they have", async () => {
    const row = await seedFulfilled({
      needsShipping: true,
      shippedAt: AFTER,
      collectionReadyAt: AFTER,
    });

    const result = await markRequestReceived(row.id);

    expect(result.request.receivedAt).not.toBeNull();
    // Both paths end at a collection now; the shipped ones just had a courier
    // leg first.
    expect(result.message).toMatch(/collected/i);
  });

  it("applies to the collect path too", async () => {
    const row = await seedFulfilled({ needsShipping: false, collectionReadyAt: null });

    await expect(markRequestReceived(row.id)).rejects.toThrow(/ready to collect/i);
  });
});

///  +-----------------------------------------------------------------+
///  |          WHAT WAS ALREADY IN THE AIR KEEPS ITS ENDING           |
///  +-----------------------------------------------------------------+

describe("a shipment dispatched before the cutover", () => {
  it("can still be closed by its requester, with no handover", async () => {
    const row = await seedFulfilled({
      needsShipping: true,
      shippedAt: BEFORE,
      collectionReadyAt: null,
    });

    const result = await markRequestReceived(row.id);

    expect(result.request.receivedAt).not.toBeNull();
    // And keeps the wording it was sent out under.
    expect(result.message).toMatch(/received/i);
  });

  it("stops being legacy the moment it is handed over anyway", async () => {
    // A keeper who does mark an old shipment ready has taken responsibility
    // for it; from then on it behaves like everything else.
    expect(
      isLegacyShipment(
        { needsShipping: true, shippedAt: BEFORE, collectionReadyAt: AFTER },
        CUTOVER
      )
    ).toBe(false);
  });
});

describe("isLegacyShipment", () => {
  const ship = (overrides: Partial<{
    needsShipping: boolean;
    shippedAt: Date | null;
    collectionReadyAt: Date | null;
  }> = {}) => ({
    needsShipping: true,
    shippedAt: BEFORE,
    collectionReadyAt: null,
    ...overrides,
  });

  it("covers a shipment dispatched before the line", () => {
    expect(isLegacyShipment(ship(), CUTOVER)).toBe(true);
  });

  it("excludes one dispatched after it, however old the request", () => {
    expect(isLegacyShipment(ship({ shippedAt: AFTER }), CUTOVER)).toBe(false);
  });

  it("excludes a collect-path request entirely", () => {
    // Its requester could never act at the awaiting-prep stage anyway, so
    // routing it through a keeper takes nothing away from anyone.
    expect(isLegacyShipment(ship({ needsShipping: false }), CUTOVER)).toBe(false);
  });

  it("excludes one that was never dispatched", () => {
    expect(isLegacyShipment(ship({ shippedAt: null }), CUTOVER)).toBe(false);
  });

  it("treats a missing cutover as 'the new flow applies'", () => {
    // A marker that failed to write must not silently switch the feature off.
    // Nothing strands either way: admins can act as keeper anywhere.
    expect(isLegacyShipment(ship(), null)).toBe(false);
  });
});

///  +-----------------------------------------------------------------+
///  |     THE ESCALATION LADDER RESTARTS WHEN THE BALL CHANGES HANDS   |
///  +-----------------------------------------------------------------+
//
//  Worked example of the bug this prevents, on the shipped defaults (7/14/30):
//
//    day 0   dispatched
//    day 7   stock keeper nudged        → reminderStage 1
//    day 14  stock keeper nudged again  → reminderStage 2
//    day 16  keeper marks it ready; it is now the requester's to collect
//    day 17+ daysSince(shippedAt) is 17, so dueStage is 2 — but reminderStage
//            is ALREADY 2, so nothing fires. The requester is never nudged.
//    day 30  SHIPMENT_OVERDUE, which copies in IT.
//
//  The requester's first and only contact about the device is an escalation
//  to their IT department, about a fortnight of delay that was somebody
//  else's. Both halves are wrong, and neither logs anything.
//
//  Two changes fix it and each is useless alone: the counter resets at the
//  handover, and the clock measures from the handover once there is one.
//  Reset without the clock change would re-fire every stage the shipping time
//  had already crossed, immediately.
///  +-----------------------------------------------------------------+

describe("the reminder ladder at the handover", () => {
  it("resets the stage the keeper advanced", async () => {
    const row = await seedFulfilled({
      needsShipping: true,
      shippedAt: AFTER,
      reminderStage: 2,
    });

    const result = await markReadyForCollection(row.id);

    expect(result.request.reminderStage).toBe(0);
  });

  it("restarts the clock from the handover, not from dispatch", async () => {
    const { reminderClockStart } = await import("./request.js");

    const shipped = new Date("2026-09-01T00:00:00.000Z");
    const handedOver = new Date("2026-09-17T00:00:00.000Z");

    // Before: the keeper's ladder, measured from dispatch.
    expect(
      reminderClockStart({ shippedAt: shipped, collectionReadyAt: null })
    ).toEqual(shipped);

    // After: the requester's, measured from the moment it became theirs. Were
    // this still `shipped`, a device handed over on day 16 would arrive with
    // the requester already past the day-14 threshold.
    expect(
      reminderClockStart({ shippedAt: shipped, collectionReadyAt: handedOver })
    ).toEqual(handedOver);
  });

  it("falls back to fulfilment on the collect path, which has no shipment", async () => {
    const fulfilled = new Date("2026-09-05T00:00:00.000Z");
    const readyAt = new Date("2026-09-17T00:00:00.000Z");
    const { reminderClockStart } = await import("./request.js");

    // Sitting on a shelf: measured from when it came off it.
    expect(
      reminderClockStart({
        shippedAt: null,
        collectionReadyAt: null,
        fulfilledAt: fulfilled,
      })
    ).toEqual(fulfilled);

    // Handed over: the requester's ladder starts.
    expect(
      reminderClockStart({
        shippedAt: null,
        collectionReadyAt: readyAt,
        fulfilledAt: fulfilled,
      })
    ).toEqual(readyAt);
  });

  it("prefers dispatch over fulfilment, so a keeper isn't charged for transit", async () => {
    const { reminderClockStart } = await import("./request.js");
    const fulfilled = new Date("2026-09-01T00:00:00.000Z");
    const shipped = new Date("2026-09-04T00:00:00.000Z");

    expect(
      reminderClockStart({
        shippedAt: shipped,
        collectionReadyAt: null,
        fulfilledAt: fulfilled,
      })
    ).toEqual(shipped);
  });

  it("returns null, not undefined, when there is no clock at all", async () => {
    // The callers test the result for null. `a ?? b ?? c` yields undefined
    // when every operand is absent, which is falsy but not null — and this
    // file is not typechecked (tsconfig excludes tests), so nothing else
    // would have caught it.
    const { reminderClockStart } = await import("./request.js");

    expect(
      reminderClockStart({
        shippedAt: null,
        collectionReadyAt: null,
        fulfilledAt: null,
      })
    ).toBeNull();
  });
});
