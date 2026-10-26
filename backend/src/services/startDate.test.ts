import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";

// request.ts pulls in snipeitassets.ts, which refuses to load without Snipe
// credentials. Nothing below reaches Snipe.
process.env.SNIPEIT_API_URL ??= "https://snipe.test/api/v1";
process.env.SNIPEIT_BOT_TOKEN ??= "test-token";

const { reminderClockStart, isHeldForStartDate, setRequestStartDate } =
  await import("./request.js");
const { remindShippedRequestsHandler } = await import(
  "../jobs/handlers/remindShippedRequests.js"
);

///  +-----------------------------------------------------------------+
///  |        A NEW STARTER'S DEVICE IS NOT LATE BEFORE DAY ONE        |
///  +-----------------------------------------------------------------+
//
//  NextHRT files hardware weeks ahead of a start date. The device gets
//  prepared and put on a shelf — exactly what should happen — and the ladder
//  used to read that shelf time as the keeper sitting on it, chasing them and
//  eventually escalating to IT about somebody who had not started yet.
//
//  Two things are asserted: the ladder is silent while the start date is in
//  the future, and on the day it starts from the START DATE, not from when
//  the device came off the shelf. The second matters as much as the first —
//  measuring from fulfilment would have the first email after day one be the
//  day-30 overdue escalation.
//
//  Runs against the throwaway database vitest provisions.
///  +-----------------------------------------------------------------+

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/** UTC midnight `n` days from today — how startDate is always stored. */
function startDateIn(n: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + n)
  );
}

const created: number[] = [];

async function seedOnShelf(overrides: Record<string, unknown> = {}) {
  const row = await prisma.request.create({
    data: {
      userId: 701,
      userName: "Robin New-Starter",
      categoryId: 10,
      categoryName: "Laptop",
      requestKind: "ASSET",
      requestType: "STANDARD",
      status: "COMPLETED",
      managerId: 702,
      manager: "Ali Rahman",
      userLocationId: 4,
      userLocationName: "Bundamba",
      needsShipping: false,
      fulfilledAt: daysAgo(20),
      ...overrides,
    },
  });
  created.push(row.id);
  return row;
}

/** Reminder jobs the handler queued for this one request. */
async function remindersFor(requestId: number) {
  const jobs = await prisma.backgroundJob.findMany({
    where: { type: "SEND_REQUEST_NOTIFICATION" },
  });
  return jobs.filter((j) => JSON.parse(j.payload ?? "{}").requestId === requestId);
}

afterAll(async () => {
  if (created.length > 0) {
    await prisma.requestEdit.deleteMany({ where: { requestId: { in: created } } });
    await prisma.request.deleteMany({ where: { id: { in: created } } });
  }
});

describe("reminderClockStart with a start date", () => {
  const fulfilled = new Date("2026-09-01T00:00:00.000Z");

  it("starts on the start date when that is later than the handover", () => {
    const start = new Date("2026-09-21T00:00:00.000Z");
    expect(
      reminderClockStart({
        shippedAt: null,
        collectionReadyAt: null,
        fulfilledAt: fulfilled,
        startDate: start,
      })
    ).toEqual(start);
  });

  it("ignores a start date that has already been overtaken by the handover", () => {
    // Filed for somebody who started a month ago: nothing to hold.
    expect(
      reminderClockStart({
        shippedAt: null,
        collectionReadyAt: null,
        fulfilledAt: fulfilled,
        startDate: new Date("2026-08-01T00:00:00.000Z"),
      })
    ).toEqual(fulfilled);
  });

  it("is unchanged when there is no start date", () => {
    expect(
      reminderClockStart({
        shippedAt: null,
        collectionReadyAt: null,
        fulfilledAt: fulfilled,
        startDate: null,
      })
    ).toEqual(fulfilled);
  });

  it("still returns null when there is no handover, start date or not", () => {
    // A start date alone is not a clock — nothing has been prepared yet.
    expect(
      reminderClockStart({
        shippedAt: null,
        collectionReadyAt: null,
        fulfilledAt: null,
        startDate: new Date("2026-09-21T00:00:00.000Z"),
      })
    ).toBeNull();
  });

  it("isHeldForStartDate is true only while the date is in the future", () => {
    expect(isHeldForStartDate({ startDate: startDateIn(3) })).toBe(true);
    expect(isHeldForStartDate({ startDate: startDateIn(-3) })).toBe(false);
    expect(isHeldForStartDate({ startDate: null })).toBe(false);
  });
});

describe("the shipment reminder ladder", () => {
  it("holds a request whose requestee has not started yet", async () => {
    const row = await seedOnShelf({ startDate: startDateIn(5) });

    const result = await remindShippedRequestsHandler();

    expect(result.heldForStartDate).toBeGreaterThanOrEqual(1);
    expect(await remindersFor(row.id)).toHaveLength(0);
    const after = await prisma.request.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.reminderStage).toBe(0);
  });

  it("counts from the start date once it has passed, not from fulfilment", async () => {
    // On the shelf 20 days — past the day-14 rung on the old clock — but the
    // requestee started 8 days ago, which is the day-7 rung only.
    const row = await seedOnShelf({ startDate: startDateIn(-8) });

    await remindShippedRequestsHandler();

    const after = await prisma.request.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.reminderStage).toBe(1);
    const jobs = await remindersFor(row.id);
    expect(jobs).toHaveLength(1);
    expect(JSON.parse(jobs[0].payload ?? "{}").kind).toBe("SHIPMENT_REMINDER");
  });

  it("leaves requests without a start date on the clock they always had", async () => {
    const row = await seedOnShelf({ startDate: null });

    await remindShippedRequestsHandler();

    const after = await prisma.request.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.reminderStage).toBe(2);
  });
});

describe("setRequestStartDate", () => {
  it("logs the change and emails nobody", async () => {
    const row = await seedOnShelf({ startDate: startDateIn(5) });
    const moved = startDateIn(12);

    const result = await setRequestStartDate(row.id, moved, "NextHRT");

    expect(result.request.startDate).toEqual(moved);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].field).toBe("startDate");

    const edits = await prisma.requestEdit.findMany({ where: { requestId: row.id } });
    expect(edits).toHaveLength(1);
    expect(edits[0].editedBy).toBe("NextHRT");
    expect(await remindersFor(row.id)).toHaveLength(0);
  });

  it("restarts the ladder when the date moves back into the future", async () => {
    // Reminders went out under the old date; the start was then pushed back.
    const row = await seedOnShelf({ startDate: startDateIn(-10), reminderStage: 1 });

    const result = await setRequestStartDate(row.id, startDateIn(7), "Admin Person");

    expect(result.request.reminderStage).toBe(0);
  });

  it("keeps the ladder's place when the date is cleared", async () => {
    const row = await seedOnShelf({ startDate: startDateIn(-10), reminderStage: 1 });

    const result = await setRequestStartDate(row.id, null, "Admin Person");

    expect(result.request.startDate).toBeNull();
    expect(result.request.reminderStage).toBe(1);
  });

  it("writes nothing when the date is unchanged", async () => {
    const date = startDateIn(5);
    const row = await seedOnShelf({ startDate: date });

    const result = await setRequestStartDate(row.id, new Date(date), "NextHRT");

    expect(result.changes).toHaveLength(0);
    expect(await prisma.requestEdit.count({ where: { requestId: row.id } })).toBe(0);
  });

  it("refuses a rejected request and a missing one", async () => {
    const rejected = await seedOnShelf({ status: "REJECTED" });

    await expect(
      setRequestStartDate(rejected.id, startDateIn(5), "NextHRT")
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      setRequestStartDate(999_999, startDateIn(5), "NextHRT")
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
