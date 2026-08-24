import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import {
  TOUR_IDS,
  isTourId,
  listCompletedTours,
  markTourSeen,
  forgetTour,
} from "./tours.js";

///  +-----------------------------------------------------------------+
///  |            A CHECKLIST THAT MUST NOT DOUBLE-WRITE               |
///  +-----------------------------------------------------------------+
//
//  The table records one fact — this person has had this tour — and the whole
//  design rests on recording it twice being harmless. A user replaying from
//  the navbar, or finishing on a second browser, hits markTourSeen again; a
//  second row, or a moved completedAt, would mean the table cannot answer
//  "when did they first see this" and would grow one row per replay.
//
//  Ids are chosen high enough not to collide with anything the seed inserts.
///  +-----------------------------------------------------------------+

const USER = 900_001;
const OTHER = 900_002;

afterAll(async () => {
  await prisma.tourCompletion.deleteMany({ where: { userId: { in: [USER, OTHER] } } });
});

describe("recording", () => {
  it("records a tour once", async () => {
    await markTourSeen(USER, "home");
    expect(await listCompletedTours(USER)).toEqual(["home"]);
  });

  it("is idempotent, and keeps the FIRST completedAt", async () => {
    // The reason for the compound key and the empty `update`. A replay must
    // not add a row, and must not rewrite when they first saw it.
    await markTourSeen(USER, "settings");
    const first = await prisma.tourCompletion.findUnique({
      where: { userId_tourId: { userId: USER, tourId: "settings" } },
    });

    await markTourSeen(USER, "settings");
    await markTourSeen(USER, "settings");

    const rows = await prisma.tourCompletion.findMany({
      where: { userId: USER, tourId: "settings" },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].completedAt.getTime()).toBe(first!.completedAt.getTime());
  });

  it("keeps one person's tours apart from another's", async () => {
    await markTourSeen(OTHER, "requests");

    expect(await listCompletedTours(OTHER)).toEqual(["requests"]);
    expect(await listCompletedTours(USER)).not.toContain("requests");
  });

  it("has nothing for somebody who has never been here", async () => {
    // The new-user case the whole feature exists for.
    expect(await listCompletedTours(999_999)).toEqual([]);
  });
});

describe("forgetting", () => {
  it("removes one tour and leaves the rest", async () => {
    await markTourSeen(USER, "troubleshooting");
    await forgetTour(USER, "troubleshooting");

    const seen = await listCompletedTours(USER);
    expect(seen).not.toContain("troubleshooting");
    expect(seen).toContain("home");
  });

  it("is silent about a tour that was never had", async () => {
    await expect(forgetTour(999_999, "home")).resolves.toBeUndefined();
  });
});

describe("the id list", () => {
  it("accepts every id it publishes", () => {
    for (const id of TOUR_IDS) expect(isTourId(id), id).toBe(true);
  });

  it("rejects anything else, including near misses", () => {
    // These arrive as a URL segment, so whitespace and casing are real inputs.
    for (const bad of ["home ", " home", "Home", "", "admin", null, 7, undefined]) {
      expect(isTourId(bad), String(bad)).toBe(false);
    }
  });

  it("hides a stored id that is no longer a tour", async () => {
    // A row written by an older build for a tour since retired. The client
    // must not be told about it, and it is not worth a migration to delete.
    await prisma.tourCompletion.create({
      data: { userId: USER, tourId: "a-tour-that-was-retired" },
    });

    expect(await listCompletedTours(USER)).not.toContain("a-tour-that-was-retired");
  });
});
