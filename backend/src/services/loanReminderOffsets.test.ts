import { describe, it, expect, vi, beforeEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |        THE DUE-BACK LADDER, AS SETTINGS EDITS IT                 |
///  +-----------------------------------------------------------------+
//
//  Four rungs in days from the due date. The job walks them as stages, so
//  only four strictly climbing whole numbers are let in.
///  +-----------------------------------------------------------------+

const stored = new Map<string, string>();

vi.mock("../db/prisma.js", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: any) => (stored.has(where.key) ? { value: stored.get(where.key) } : null)),
      upsert: vi.fn(async ({ where, create }: any) => {
        stored.set(where.key, create.value);
        return { value: create.value };
      }),
    },
  },
}));

const { getLoanReminderOffsets, setLoanReminderOffsets } = await import("./settings.js");

beforeEach(() => stored.clear());

describe("loan reminder offsets", () => {
  it("defaults to -1, 0, 3, 7", async () => {
    expect(await getLoanReminderOffsets()).toEqual([-1, 0, 3, 7]);
  });

  it("saves four climbing days and reads them back", async () => {
    await setLoanReminderOffsets([-2, 0, 5, 10], "admin@example.com");
    expect(await getLoanReminderOffsets()).toEqual([-2, 0, 5, 10]);
  });

  it("refuses rungs that don't climb, aren't whole, or aren't four", async () => {
    for (const bad of [[0, 0, 3, 7], [3, 0, 5, 7], [-1, 0.5, 3, 7], [-1, 0, 3], [-40, 0, 3, 7]]) {
      await expect(setLoanReminderOffsets(bad, "admin@example.com")).rejects.toThrow(/four whole numbers/);
    }
    expect(stored.size).toBe(0);
  });
});
