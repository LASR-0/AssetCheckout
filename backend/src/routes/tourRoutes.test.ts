import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";

///  +-----------------------------------------------------------------+
///  |         TOUR ROUTES — WHAT HAPPENS WHEN IDENTITY FAILS          |
///  +-----------------------------------------------------------------+
//
//  This sits on the critical path of every page load for a decorative
//  feature, so almost everything worth testing is a failure path. Three
//  contracts, and the client is written against all three:
//
//    * no email on the request -> identified: false, and NEVER a 500. The
//      client fails closed on that flag; if it ever saw a thrown error or an
//      optimistic `true`, a tour would run, fail to record, and run again on
//      every navigation.
//    * an unknown tour id is a 400 that never reaches the database, so the
//      table cannot fill with ids nothing reads.
//    * recording is fire-and-forget: a write that fails still answers 204,
//      because there is nothing the browser could usefully do about it.
//
//  THERE IS NO SNIPE MOCK HERE ANY MORE, and its absence is the point of the
//  rework. Identity is the header the proxy already injected, so the two
//  failure modes this file used to spend half its cases on — no Snipe account
//  for the address, and Snipe unreachable — cannot happen. What is left is a
//  key, taken straight off the request and lowercased.
///  +-----------------------------------------------------------------+

const getSetting = vi.fn();
const upsert = vi.fn();
const findMany = vi.fn();
const deleteMany = vi.fn();

vi.mock("../db/prisma.js", () => ({
  prisma: {
    tourCompletion: {
      upsert: (a: unknown) => upsert(a),
      findMany: (a: unknown) => findMany(a),
      deleteMany: (a: unknown) => deleteMany(a),
    },
  },
}));

vi.mock("../services/settings.js", () => ({ getSetting: (k: string) => getSetting(k) }));

const { default: tourRoutes } = await import("./tourRoutes.js");

let server: Server;
let baseUrl = "";

/** The proxy-injected identity header, as Caddy sends it in production. */
const AS_SAM = { "x-user-email": "sam.taylor@ksb.com" };

/** The same person, as a proxy that likes title case would send them. */
const AS_SAM_SHOUTING = { "x-user-email": " Sam.Taylor@KSB.com " };

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/tours", tourRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/tours`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  getSetting.mockResolvedValue("true");
  findMany.mockResolvedValue([{ tourId: "home" }]);
  upsert.mockResolvedValue({});
  deleteMany.mockResolvedValue({ count: 1 });
});

describe("reading the checklist", () => {
  it("reports what this person has already had", async () => {
    const res = await fetch(baseUrl, { headers: AS_SAM });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, identified: true, seen: ["home"] });
  });

  it("looks them up by the address the proxy sent, and nothing else", async () => {
    await fetch(baseUrl, { headers: AS_SAM });

    // One query, keyed on the header. This is the whole rework: there is no
    // directory call in front of it to fail or go stale.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userEmail: "sam.taylor@ksb.com" } })
    );
  });

  it("is not identified when the proxy sent no email", async () => {
    const res = await fetch(baseUrl);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ identified: false, seen: [] });
    // Nothing to key on, so nothing was read.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("degrades rather than throwing when the database is unreachable", async () => {
    findMany.mockRejectedValue(new Error("SQLITE_BUSY"));

    const res = await fetch(baseUrl, { headers: AS_SAM });

    expect(res.status).toBe(200);
    // The safe lie: say we cannot tell who they are, so the client stays
    // quiet rather than running a tour it will not be able to record.
    expect(await res.json()).toMatchObject({ identified: false, seen: [] });
  });

  it("reports the feature switch", async () => {
    getSetting.mockResolvedValue("false");
    expect(await (await fetch(baseUrl, { headers: AS_SAM })).json()).toMatchObject({
      enabled: false,
    });
  });

  it("treats an unset switch as on", async () => {
    getSetting.mockResolvedValue(null);
    expect(await (await fetch(baseUrl, { headers: AS_SAM })).json()).toMatchObject({
      enabled: true,
    });
  });
});

describe("recording a completion", () => {
  it("records it", async () => {
    const res = await fetch(`${baseUrl}/home/seen`, { method: "POST", headers: AS_SAM });

    expect(res.status).toBe(204);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userEmail_tourId: { userEmail: "sam.taylor@ksb.com", tourId: "home" } },
        update: {},
      })
    );
  });

  it("writes and reads the same key however the header was cased", async () => {
    // The one new way this design can break: if a write stored the header
    // verbatim and a read lowercased it, somebody would be two people and
    // would sit through every tour twice.
    await fetch(`${baseUrl}/home/seen`, { method: "POST", headers: AS_SAM_SHOUTING });
    await fetch(baseUrl, { headers: AS_SAM });

    expect(upsert.mock.calls[0][0].create).toEqual({
      userEmail: "sam.taylor@ksb.com",
      tourId: "home",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userEmail: "sam.taylor@ksb.com" } })
    );
  });

  it("refuses an unknown tour before touching the database", async () => {
    const res = await fetch(`${baseUrl}/not-a-tour/seen`, { method: "POST", headers: AS_SAM });

    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("accepts, but does not record, when nobody can be identified", async () => {
    const res = await fetch(`${baseUrl}/home/seen`, { method: "POST" });

    expect(res.status).toBe(204);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("still answers 204 when the write fails", async () => {
    // Fire and forget: there is nothing the browser would do differently, and
    // a rejected promise here would surface as a console error on a page the
    // user is trying to read.
    upsert.mockRejectedValue(new Error("SQLITE_BUSY"));

    const res = await fetch(`${baseUrl}/home/seen`, { method: "POST", headers: AS_SAM });

    expect(res.status).toBe(204);
  });
});

describe("forgetting one", () => {
  it("deletes only the caller's own row", async () => {
    const res = await fetch(`${baseUrl}/home`, { method: "DELETE", headers: AS_SAM });

    expect(res.status).toBe(204);
    // Scoped to the caller's own address, which is what makes this safe
    // without an admin guard: the only rows reachable are your own.
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userEmail: "sam.taylor@ksb.com", tourId: "home" },
    });
  });

  it("refuses an unknown tour", async () => {
    const res = await fetch(`${baseUrl}/nope`, { method: "DELETE", headers: AS_SAM });

    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
