import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import {
  TOUR_IDS,
  isTourId,
  normalizeActor,
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
//  THE SECOND THING WORTH TESTING IS CASING. The key is now an address off a
//  proxy header, and the same person arriving as Sam.Taylor@ and sam.taylor@
//  must be one person — otherwise the checklist looks empty and every tour
//  replays. Normalisation lives in one function precisely so read and write
//  cannot drift apart, and these tests go through the public functions rather
//  than that function to prove they actually do.
//
//  Addresses are on a domain nothing else in the suite uses, so a stray row
//  cannot collide with seeded data.
///  +-----------------------------------------------------------------+

const USER = "tour.tester@tours.test";
const OTHER = "other.tester@tours.test";
const STRANGER = "never.been.here@tours.test";

afterAll(async () => {
  await prisma.tourCompletion.deleteMany({
    where: { userEmail: { in: [USER, OTHER, STRANGER] } },
  });
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
      where: { userEmail_tourId: { userEmail: USER, tourId: "settings" } },
    });

    await markTourSeen(USER, "settings");
    await markTourSeen(USER, "settings");

    const rows = await prisma.tourCompletion.findMany({
      where: { userEmail: USER, tourId: "settings" },
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
    expect(await listCompletedTours(STRANGER)).toEqual([]);
  });
});

describe("the same person, spelled differently", () => {
  it("is one person however the proxy cased the header", async () => {
    // Written one way, read back another. If these ever disagreed, everybody
    // whose proxy changed its casing would be handed an empty checklist and
    // sit through every tour again.
    await markTourSeen(` ${USER.toUpperCase()} `, "troubleshooting");

    expect(await listCompletedTours(USER)).toContain("troubleshooting");
    expect(await listCompletedTours(`  ${USER}  `)).toContain("troubleshooting");
  });

  it("stores the normalised form, not what arrived", async () => {
    // Belt and braces on the above: a row written in mixed case would still
    // read back correctly through these functions, but would break anything
    // querying the table directly.
    const rows = await prisma.tourCompletion.findMany({
      where: { tourId: "troubleshooting", userEmail: USER },
    });

    expect(rows).toHaveLength(1);
  });

  it("does nothing at all without an address", async () => {
    // The unauthenticated path. Not an error — there is simply nothing to key
    // a row on, so the read is empty and the writes are no-ops.
    expect(await listCompletedTours("")).toEqual([]);
    await expect(markTourSeen("   ", "home")).resolves.toBeUndefined();
    await expect(forgetTour("", "home")).resolves.toBeUndefined();

    expect(await prisma.tourCompletion.count({ where: { userEmail: "" } })).toBe(0);
  });

  it("normalizeActor reports what it cannot use", () => {
    expect(normalizeActor(" Sam.Taylor@KSB.com ")).toBe("sam.taylor@ksb.com");
    for (const blank of ["", "   ", null, undefined]) {
      expect(normalizeActor(blank), String(blank)).toBeNull();
    }
  });
});

describe("forgetting", () => {
  it("removes one tour and leaves the rest", async () => {
    await markTourSeen(USER, "requests-manager");
    await forgetTour(USER, "requests-manager");

    const seen = await listCompletedTours(USER);
    expect(seen).not.toContain("requests-manager");
    expect(seen).toContain("home");
  });

  it("is silent about a tour that was never had", async () => {
    await expect(forgetTour(STRANGER, "home")).resolves.toBeUndefined();
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
      data: { userEmail: USER, tourId: "a-tour-that-was-retired" },
    });

    expect(await listCompletedTours(USER)).not.toContain("a-tour-that-was-retired");
  });
});
