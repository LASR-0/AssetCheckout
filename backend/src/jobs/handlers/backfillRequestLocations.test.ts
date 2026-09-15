import { describe, it, expect, vi, beforeEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |     A FAILED LOOKUP IS NOT EVIDENCE OF "NO LOCATION"            |
///  +-----------------------------------------------------------------+
//
//  The backfill resolves each distinct requester once and reuses the answer
//  across every row they own. That caching is what keeps it from making one
//  Snipe call per row — and it is also the thing that turns a single transient
//  failure into permanent wrong data if the failure is cached as "no location".
//
//  Both outcomes look identical afterwards: userLocationId stays null. The
//  difference only shows on the NEXT run, where a row left untouched gets
//  retried and a row written as null never does — except the column can't
//  record that distinction, so getting it wrong here is unrecoverable without
//  someone noticing that a whole site's requests are invisible to its keeper.
//
//  The other property worth pinning is the per-user call count. It is the
//  reason this job is safe to point at a table with thousands of rows.
///  +-----------------------------------------------------------------+

type Row = { id: number; userId: number };

let rows: Row[] = [];
const updates: { id: number; userLocationId: number; userLocationName: string }[] = [];
let maxRowsSetting: string | null = null;

// userId -> location, or a thrown error for the ones standing in for an outage.
const snipeUsers = new Map<number, { location: { id: number; name: string } | null }>();
const failingUsers = new Set<number>();
const lookupCalls: number[] = [];

vi.mock("../../db/prisma.js", () => ({
  prisma: {
    request: {
      findMany: vi.fn(async ({ take }: any) => rows.slice(0, take)),
      update: vi.fn(async ({ where, data }: any) => {
        updates.push({ id: where.id, ...data });
        // Mirror the write, so the "remaining" count reflects it.
        rows = rows.filter((r) => r.id !== where.id);
        return {};
      }),
      count: vi.fn(async () => rows.length),
    },
  },
}));

vi.mock("../../services/snipeitassets.js", () => ({
  getSnipeUser: vi.fn(async (userId: number) => {
    lookupCalls.push(userId);
    if (failingUsers.has(userId)) throw new Error("snipe unreachable");
    return snipeUsers.get(userId) ?? null;
  }),
}));

vi.mock("../../services/settings.js", () => ({
  getSetting: vi.fn(async () => maxRowsSetting),
}));

const { backfillRequestLocationsHandler } = await import(
  "./backfillRequestLocations.js"
);

beforeEach(() => {
  rows = [];
  updates.length = 0;
  lookupCalls.length = 0;
  snipeUsers.clear();
  failingUsers.clear();
  maxRowsSetting = null;
});

describe("resolving requesters", () => {
  it("looks a person up once however many requests they own", async () => {
    rows = [
      { id: 1, userId: 50 },
      { id: 2, userId: 50 },
      { id: 3, userId: 50 },
      { id: 4, userId: 51 },
    ];
    snipeUsers.set(50, { location: { id: 4, name: "Bundamba" } });
    snipeUsers.set(51, { location: { id: 7, name: "Brisbane" } });

    const summary = await backfillRequestLocationsHandler();

    expect(lookupCalls.sort()).toEqual([50, 51]);
    expect(summary.updated).toBe(4);
    expect(summary.distinctUsers).toBe(2);
  });

  it("stamps the id and the name together", async () => {
    rows = [{ id: 1, userId: 50 }];
    snipeUsers.set(50, { location: { id: 4, name: "Bundamba" } });

    await backfillRequestLocationsHandler();

    expect(updates).toEqual([
      { id: 1, userLocationId: 4, userLocationName: "Bundamba" },
    ]);
  });
});

describe("when a lookup fails", () => {
  it("leaves the row untouched so a re-run retries it", async () => {
    rows = [{ id: 1, userId: 50 }];
    failingUsers.add(50);

    const summary = await backfillRequestLocationsHandler();

    expect(updates).toEqual([]);
    expect(summary.updated).toBe(0);
    expect(summary.lookupFailures).toBe(1);
    // Crucially NOT counted as "this person has no location" — that is the
    // reading that would stop it ever being retried.
    expect(summary.noLocation).toBe(0);
    expect(summary.remaining).toBe(1);
  });

  it("does not stop the people whose lookups worked", async () => {
    rows = [
      { id: 1, userId: 50 },
      { id: 2, userId: 51 },
    ];
    failingUsers.add(50);
    snipeUsers.set(51, { location: { id: 7, name: "Brisbane" } });

    const summary = await backfillRequestLocationsHandler();

    expect(updates).toEqual([
      { id: 2, userLocationId: 7, userLocationName: "Brisbane" },
    ]);
    expect(summary.updated).toBe(1);
    expect(summary.lookupFailures).toBe(1);
  });
});

describe("a requester with no Snipe location", () => {
  it("is counted, not written, and not treated as a failure", async () => {
    rows = [{ id: 1, userId: 50 }];
    snipeUsers.set(50, { location: null });

    const summary = await backfillRequestLocationsHandler();

    expect(updates).toEqual([]);
    expect(summary.noLocation).toBe(1);
    expect(summary.lookupFailures).toBe(0);
    // Stays null forever, which is the correct end state: admins act on it.
    expect(summary.remaining).toBe(1);
  });
});

describe("the row cap", () => {
  it("defaults to 500 and reports when a run was capped", async () => {
    rows = Array.from({ length: 501 }, (_, i) => ({ id: i + 1, userId: 50 }));
    snipeUsers.set(50, { location: { id: 4, name: "Bundamba" } });

    const summary = await backfillRequestLocationsHandler();

    expect(summary.scanned).toBe(500);
    expect(summary.cappedAt).toBe(500);
    // One row left for the next run — the signal to run it again.
    expect(summary.remaining).toBe(1);
  });

  it("is configurable", async () => {
    maxRowsSetting = "2";
    rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1, userId: 50 }));
    snipeUsers.set(50, { location: { id: 4, name: "Bundamba" } });

    const summary = await backfillRequestLocationsHandler();

    expect(summary.scanned).toBe(2);
    expect(summary.remaining).toBe(3);
  });

  it("ignores a nonsense setting rather than scanning nothing", async () => {
    maxRowsSetting = "not a number";
    rows = [{ id: 1, userId: 50 }];
    snipeUsers.set(50, { location: { id: 4, name: "Bundamba" } });

    const summary = await backfillRequestLocationsHandler();

    expect(summary.updated).toBe(1);
  });
});

describe("a table with nothing left to do", () => {
  it("returns early without touching Snipe", async () => {
    const summary = await backfillRequestLocationsHandler();

    expect(lookupCalls).toEqual([]);
    expect(summary).toEqual({
      scanned: 0,
      updated: 0,
      noLocation: 0,
      distinctUsers: 0,
      remaining: 0,
    });
  });
});
