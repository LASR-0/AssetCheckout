import { describe, it, expect, vi, beforeEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |        THE CAP IS A PERMISSION BOUNDARY, NOT A UI HINT           |
///  +-----------------------------------------------------------------+
//
//  A stock keeper can mark somebody else's request ready to collect, which is
//  the step that tells a requester their device is waiting and closes out the
//  shipping reminders. Three per location is what keeps that authority narrow
//  enough to stay meaningful while still covering leave.
//
//  A cap enforced only in the settings card is not a cap: the PUT is reachable
//  directly, the config is seedable from an env var, and neither path renders
//  a disabled Add button. These pin it to the service, which is the one place
//  every writer goes through.
//
//  The cleaning rules matter for the same reason. An entry with no usable
//  Snipe id is not a person the permission check can ever match, and a
//  duplicate would eat a slot and double every notification — so both are
//  dropped on the way in rather than tolerated and worked around later.
///  +-----------------------------------------------------------------+

// One in-memory settings row, which is all these functions touch.
let stored: string | null = null;

vi.mock("../db/prisma.js", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async () => (stored === null ? null : { value: stored })),
      upsert: vi.fn(async ({ create }: any) => {
        stored = create.value;
        return { value: stored };
      }),
    },
  },
}));

const {
  getStockKeepers,
  getStockKeepersForLocation,
  setStockKeepersForLocation,
  getStockKeeperLocationIdsForUser,
  getStockKeeperLocationsForUser,
  MAX_STOCK_KEEPERS_PER_LOCATION,
} = await import("./settings.js");

const { canActAsStockKeeper } = await import("../config/auth.js");

/** A keeper with everything the service needs. */
function keeper(userId: number, name = `User ${userId}`) {
  return { userId, name, email: `user${userId}@example.com` };
}

beforeEach(() => {
  stored = null;
});

describe("the per-location cap", () => {
  it("accepts a location filled exactly to the cap", async () => {
    const full = Array.from({ length: MAX_STOCK_KEEPERS_PER_LOCATION }, (_, i) =>
      keeper(i + 1)
    );

    await setStockKeepersForLocation(4, full, "admin@example.com");

    expect(await getStockKeepersForLocation(4)).toHaveLength(
      MAX_STOCK_KEEPERS_PER_LOCATION
    );
  });

  it("rejects one past the cap instead of silently truncating", async () => {
    const tooMany = Array.from(
      { length: MAX_STOCK_KEEPERS_PER_LOCATION + 1 },
      (_, i) => keeper(i + 1)
    );

    await expect(
      setStockKeepersForLocation(4, tooMany, "admin@example.com")
    ).rejects.toThrow(/at most/i);

    // And nothing was written — a rejected write must not half-apply.
    expect(await getStockKeepersForLocation(4)).toEqual([]);
  });

  it("counts duplicates once, so re-sending the same person is not an error", async () => {
    // Over the cap by raw length, at the cap once deduplicated. Rejecting this
    // would mean an admin re-saving a full row could not save it back.
    const withDupes = [
      ...Array.from({ length: MAX_STOCK_KEEPERS_PER_LOCATION }, (_, i) =>
        keeper(i + 1)
      ),
      keeper(1),
    ];

    await setStockKeepersForLocation(4, withDupes, "admin@example.com");

    const saved = await getStockKeepersForLocation(4);
    expect(saved).toHaveLength(MAX_STOCK_KEEPERS_PER_LOCATION);
    expect(saved.map((k) => k.userId)).toEqual([1, 2, 3]);
  });

  it("applies per location, not across the whole config", async () => {
    await setStockKeepersForLocation(4, [keeper(1), keeper(2)], "admin@example.com");
    await setStockKeepersForLocation(7, [keeper(3), keeper(4)], "admin@example.com");

    expect(await getStockKeepersForLocation(4)).toHaveLength(2);
    expect(await getStockKeepersForLocation(7)).toHaveLength(2);
  });
});

describe("cleaning", () => {
  it("drops entries with no usable Snipe user id", async () => {
    await setStockKeepersForLocation(
      4,
      [
        keeper(1),
        { userId: 0, name: "Zero", email: null },
        { userId: -3, name: "Negative", email: null },
        { userId: Number.NaN, name: "Not a number", email: null },
      ] as any,
      "admin@example.com"
    );

    expect((await getStockKeepersForLocation(4)).map((k) => k.userId)).toEqual([1]);
  });

  it("drops entries with no name, since nothing could render them", async () => {
    await setStockKeepersForLocation(
      4,
      [keeper(1), { userId: 2, name: "   ", email: null }] as any,
      "admin@example.com"
    );

    expect((await getStockKeepersForLocation(4)).map((k) => k.userId)).toEqual([1]);
  });

  it("keeps an email-less keeper — assignable, just not notifiable", async () => {
    await setStockKeepersForLocation(
      4,
      [{ userId: 1, name: "No Email", email: null }],
      "admin@example.com"
    );

    expect(await getStockKeepersForLocation(4)).toEqual([
      { userId: 1, name: "No Email", email: null },
    ]);
  });

  it("normalises email case, so recipient matching can compare directly", async () => {
    await setStockKeepersForLocation(
      4,
      [{ userId: 1, name: "Mixed Case", email: "  Mixed.Case@Example.COM " }],
      "admin@example.com"
    );

    expect((await getStockKeepersForLocation(4))[0].email).toBe(
      "mixed.case@example.com"
    );
  });

  it("survives a corrupt stored value rather than failing every caller", async () => {
    stored = "{not json";
    expect(await getStockKeepers()).toEqual({});
  });
});

describe("clearing a location", () => {
  it("removes the key entirely, so 'has a key' means 'has a keeper'", async () => {
    await setStockKeepersForLocation(4, [keeper(1)], "admin@example.com");
    await setStockKeepersForLocation(4, [], "admin@example.com");

    expect(await getStockKeepers()).toEqual({});
    expect(await getStockKeepersForLocation(4)).toEqual([]);
  });

  it("leaves other locations untouched", async () => {
    await setStockKeepersForLocation(4, [keeper(1)], "admin@example.com");
    await setStockKeepersForLocation(7, [keeper(2)], "admin@example.com");
    await setStockKeepersForLocation(4, [], "admin@example.com");

    expect(Object.keys(await getStockKeepers())).toEqual(["7"]);
  });
});

describe("resolving a user's locations", () => {
  it("finds every location a person keeps, in a stable order", async () => {
    await setStockKeepersForLocation(7, [keeper(1)], "admin@example.com");
    await setStockKeepersForLocation(4, [keeper(1), keeper(2)], "admin@example.com");

    expect(await getStockKeeperLocationIdsForUser(1)).toEqual([4, 7]);
  });

  it("returns nothing for someone who keeps no site", async () => {
    await setStockKeepersForLocation(4, [keeper(1)], "admin@example.com");

    expect(await getStockKeeperLocationIdsForUser(99)).toEqual([]);
  });

  it("matches on id, not on name — the name is only a display snapshot", async () => {
    await setStockKeepersForLocation(
      4,
      [{ userId: 1, name: "Old Name", email: null }],
      "admin@example.com"
    );

    // The person was renamed in Snipe; the stored snapshot is now stale. Their
    // authority must not depend on the two spellings agreeing, which is the
    // failure the requests list already had to be fixed for.
    expect(await getStockKeeperLocationIdsForUser(1)).toEqual([4]);
  });
});

///  +-----------------------------------------------------------------+
///  |       THE LOCATION NAME IS A SNAPSHOT, NOT A SOURCE OF TRUTH     |
///  +-----------------------------------------------------------------+
//
//  /api/auth/role reports which sites the signed-in user keeps, and it runs on
//  every page load. getLocations() is an uncached Snipe request, so resolving
//  names there would put a Snipe round trip on the hot path and make role
//  resolution fail whenever Snipe blips. The name is captured at assignment
//  time instead — which only works if writes actually keep it.
///  +-----------------------------------------------------------------+

describe("the location name snapshot", () => {
  it("is stored with the assignment", async () => {
    await setStockKeepersForLocation(4, [keeper(1)], "admin@example.com", "Bundamba");

    expect(await getStockKeeperLocationsForUser(1)).toEqual([
      { id: 4, name: "Bundamba" },
    ]);
  });

  it("is refreshed when a renamed location is written again", async () => {
    await setStockKeepersForLocation(4, [keeper(1)], "admin@example.com", "Bundamba");
    await setStockKeepersForLocation(
      4,
      [keeper(1), keeper(2)],
      "admin@example.com",
      "Bundamba Depot"
    );

    expect(await getStockKeeperLocationsForUser(1)).toEqual([
      { id: 4, name: "Bundamba Depot" },
    ]);
  });

  it("survives a write that supplies no name, rather than being blanked", async () => {
    await setStockKeepersForLocation(4, [keeper(1)], "admin@example.com", "Bundamba");
    // e.g. the orphan-clearing path, which has no name to offer.
    await setStockKeepersForLocation(4, [keeper(1), keeper(2)], "admin@example.com");

    expect(await getStockKeeperLocationsForUser(1)).toEqual([
      { id: 4, name: "Bundamba" },
    ]);
  });

  it("is optional — a nameless assignment still grants the location", async () => {
    await setStockKeepersForLocation(4, [keeper(1)], "admin@example.com");

    expect(await getStockKeeperLocationsForUser(1)).toEqual([{ id: 4, name: null }]);
    expect(await getStockKeeperLocationIdsForUser(1)).toEqual([4]);
  });

  it("reads a hand-written bare array as a nameless assignment", async () => {
    // The config is env-seedable and hand-editable, and `[{...}]` is the
    // obvious thing to write for "the keepers at this site". Dropping it
    // silently would look like the assignment simply not taking effect.
    stored = JSON.stringify({ "4": [{ userId: 1, name: "Hand Written", email: null }] });

    expect(await getStockKeeperLocationIdsForUser(1)).toEqual([4]);
    expect(await getStockKeeperLocationsForUser(1)).toEqual([{ id: 4, name: null }]);
  });
});

///  +-----------------------------------------------------------------+
///  |            AN UNASSIGNED SITE MUST NOT DEADLOCK                 |
///  +-----------------------------------------------------------------+
//
//  Marking a request ready to collect is now a stock keeper's step on EVERY
//  path — it is what tells the requester their device is waiting and what
//  hands the reminder clock over to them. If only assigned keepers could do
//  it, a location with nobody assigned would park its requests at "fulfilled,
//  waiting to be made ready" with no one able to advance them, and the only
//  symptom would be requests quietly not finishing.
//
//  Admins acting anywhere is what closes that. These pin it, along with the
//  null-location case, where there is no site for an assignment to match.
///  +-----------------------------------------------------------------+

describe("who may act as a stock keeper", () => {
  const assigned = { isAdmin: false, stockKeeperLocationIds: [4, 7] };
  const admin = { isAdmin: true, stockKeeperLocationIds: [] };
  const nobody = { isAdmin: false, stockKeeperLocationIds: [] };

  it("lets an assigned keeper act at their own location", () => {
    expect(canActAsStockKeeper(assigned, 4)).toBe(true);
  });

  it("does not let them act at someone else's", () => {
    expect(canActAsStockKeeper(assigned, 9)).toBe(false);
  });

  it("lets an admin act at a location nobody keeps", () => {
    expect(canActAsStockKeeper(admin, 9)).toBe(true);
  });

  it("gives an ordinary user nothing", () => {
    expect(canActAsStockKeeper(nobody, 4)).toBe(false);
  });

  it("restricts a request with no location to admins", () => {
    // Filed before locations were stamped, or a requester with no Snipe
    // location set. Falling open would hand every keeper every unplaceable
    // request in the system.
    expect(canActAsStockKeeper(assigned, null)).toBe(false);
    expect(canActAsStockKeeper(admin, null)).toBe(true);
  });
});
