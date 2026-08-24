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
//    * no email, no Snipe account, or Snipe unreachable -> identified: false
//      and NEVER a 500. The client fails closed on that flag; if it ever saw
//      a thrown error or an optimistic `true`, a tour would run, fail to
//      record, and run again on every navigation.
//    * an unknown tour id is a 400 that never reaches the database, so the
//      table cannot fill with ids nothing reads.
//    * recording is fire-and-forget: a write that fails still answers 204,
//      because there is nothing the browser could usefully do about it.
///  +-----------------------------------------------------------------+

const resolveActorUserId = vi.fn();
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

vi.mock("../services/snipeitassets.js", () => ({
  resolveActorUserId: (e: string) => resolveActorUserId(e),
}));

const { default: tourRoutes } = await import("./tourRoutes.js");

let server: Server;
let baseUrl = "";

/** The proxy-injected identity header, as Caddy sends it in production. */
const AS_SAM = { "x-user-email": "sam.taylor@ksb.com" };

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
  resolveActorUserId.mockResolvedValue(4242);
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

  it("is not identified when the proxy sent no email", async () => {
    const res = await fetch(baseUrl);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ identified: false, seen: [] });
    // Nothing to look up, so nothing was looked up.
    expect(resolveActorUserId).not.toHaveBeenCalled();
  });

  it("is not identified when Snipe has no account for them", async () => {
    // A contractor or a service login. Real, and not an error.
    resolveActorUserId.mockResolvedValue(null);

    const res = await fetch(baseUrl, { headers: AS_SAM });

    expect(await res.json()).toMatchObject({ identified: false, seen: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("degrades rather than throwing when Snipe is unreachable", async () => {
    // resolveActorUserId throws by design and leaves the choice to callers.
    // For a tour the choice is always to go quiet — a directory outage must
    // not turn every page load into a 500.
    resolveActorUserId.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await fetch(baseUrl, { headers: AS_SAM });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ identified: false });
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
        where: { userId_tourId: { userId: 4242, tourId: "home" } },
        update: {},
      })
    );
  });

  it("refuses an unknown tour before touching the database", async () => {
    const res = await fetch(`${baseUrl}/not-a-tour/seen`, { method: "POST", headers: AS_SAM });

    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
    // Nor did it bother resolving who they were for a request it was always
    // going to reject.
    expect(resolveActorUserId).not.toHaveBeenCalled();
  });

  it("accepts, but does not record, when nobody can be identified", async () => {
    resolveActorUserId.mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/home/seen`, { method: "POST", headers: AS_SAM });

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
    // Scoped to the resolved actor, which is what makes this safe without an
    // admin guard: the only rows reachable are your own.
    expect(deleteMany).toHaveBeenCalledWith({ where: { userId: 4242, tourId: "home" } });
  });

  it("refuses an unknown tour", async () => {
    const res = await fetch(`${baseUrl}/nope`, { method: "DELETE", headers: AS_SAM });

    expect(res.status).toBe(400);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
