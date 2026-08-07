import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";

///  +-----------------------------------------------------------------+
///  |              TROUBLESHOOTING ROUTES — CONTRACTS                 |
///  +-----------------------------------------------------------------+
//
//  These lock the three response contracts the frontend is written against,
//  each of which is a decision rather than an accident:
//
//    * an unknown device or symptom is a 404, so a mistyped deep link is
//      distinguishable from a real symptom nobody has written up yet;
//    * a symptom with no article is a 200 with `article: null` — the Draft
//      state is a legitimate destination, not an error;
//    * a Snipe outage degrades the picker to the devices we have content
//      for, rather than failing the page.
//
//  The Snipe services are mocked, which is also what keeps this file from
//  dragging Prisma in: the real modules reach settings, which reaches the
//  database, and none of that is under test here.
///  +-----------------------------------------------------------------+

const getRequestableAssetCategories = vi.fn();
const getRequestableAccessoryCategories = vi.fn();
const createEvent = vi.fn();

// The routes reach the analytics service, which reaches Prisma. None of that
// is under test here, and a real client would need a database.
vi.mock("../db/prisma.js", () => ({
  prisma: {
    troubleshootingEvent: {
      create: (args: unknown) => createEvent(args),
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
    },
    setting: { findUnique: async () => null, upsert: async () => ({}) },
  },
}));

vi.mock("../services/settings.js", () => ({
  getSetting: async () => "true",
  setSetting: async () => {},
}));

vi.mock("../services/snipeitassets.js", () => ({
  getRequestableAssetCategories: () => getRequestableAssetCategories(),
}));

vi.mock("../services/snipeitaccessories.js", () => ({
  getRequestableAccessoryCategories: () => getRequestableAccessoryCategories(),
}));

const { default: troubleshootingRoutes } = await import("./troubleshootingRoutes.js");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/troubleshooting", troubleshootingRoutes);

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/troubleshooting`;
});

afterAll(() => {
  server?.close();
});

const get = async (path: string) => {
  const res = await fetch(`${baseUrl}${path}`);
  return { status: res.status, body: await res.json() };
};

describe("GET /config", () => {
  it("serves a placeholder number when SUPPORT_PHONE is unset", async () => {
    const { status, body } = await get("/config");

    expect(status).toBe(200);
    // The env var is unset in test, which is the case worth pinning: the
    // page renders an obviously-blank number rather than breaking.
    expect(body.supportPhone).toBe("XXXX XXX XXX");
    expect(body.supportPhoneConfigured).toBe(false);
  });
});

describe("GET /devices", () => {
  it("unions requestable categories with devices that have content", async () => {
    getRequestableAssetCategories.mockResolvedValue([
      { id: 1, name: "Laptops" },
      { id: 2, name: "Printers" },
    ]);
    getRequestableAccessoryCategories.mockResolvedValue([{ id: 3, name: "Headphones" }]);

    const { status, body } = await get("/devices");
    const keys = body.devices.map((d: { key: string }) => d.key);

    expect(status).toBe(200);
    // Laptops and headphones are requestable; phones are not, but we have an
    // article for them, so they stay reachable. Printers map to no device.
    expect(keys).toEqual(["laptop", "phone", "headphones"]);
    expect(keys).not.toContain("printer");
  });

  it("only marks devices with articles as available", async () => {
    getRequestableAssetCategories.mockResolvedValue([{ id: 1, name: "Laptops" }]);
    getRequestableAccessoryCategories.mockResolvedValue([]);

    const { body } = await get("/devices");
    const byKey = Object.fromEntries(
      body.devices.map((d: { key: string; available: boolean }) => [d.key, d.available])
    );

    expect(byKey.phone).toBe(true);
    expect(byKey.laptop).toBe(false);
  });

  ///  The dialog deep link depends on this: it holds a Snipe category id and
  ///  needs the device that owns it, without reimplementing the name-matching
  ///  rules on the client.
  it("reports which snipe categories landed on each device", async () => {
    getRequestableAssetCategories.mockResolvedValue([
      { id: 11, name: "Mobile Phones" },
      { id: 12, name: "Android Phones" },
      { id: 13, name: "Printers" },
    ]);
    getRequestableAccessoryCategories.mockResolvedValue([{ id: 21, name: "Headsets" }]);

    const { body } = await get("/devices");
    const byKey = Object.fromEntries(
      body.devices.map((d: { key: string; categoryIds: number[] }) => [d.key, d.categoryIds])
    );

    // Two phone categories collapse onto the one tile; printers map nowhere.
    expect(byKey.phone.sort()).toEqual([11, 12]);
    expect(byKey.headphones).toEqual([21]);
    expect(Object.values(byKey).flat()).not.toContain(13);
  });

  it("falls back to covered devices when Snipe is unreachable", async () => {
    getRequestableAssetCategories.mockRejectedValue(new Error("snipe is down"));
    getRequestableAccessoryCategories.mockRejectedValue(new Error("snipe is down"));

    const { status, body } = await get("/devices");

    // A page somebody reached because something is already broken must not
    // break again over a catalogue call.
    expect(status).toBe(200);
    expect(body.devices.map((d: { key: string }) => d.key)).toEqual(["phone"]);
  });
});

describe("GET /devices/:deviceKey", () => {
  it("returns the taxonomy for a known device", async () => {
    const { status, body } = await get("/devices/phone");

    expect(status).toBe(200);
    expect(body.device.label).toBe("Phones");
    expect(body.categories.length).toBeGreaterThan(0);
  });

  it("404s an unknown device", async () => {
    expect((await get("/devices/toaster")).status).toBe(404);
  });
});

describe("GET /devices/:deviceKey/symptoms/:symptomId", () => {
  it("returns the article, its category and its siblings", async () => {
    const { status, body } = await get("/devices/phone/symptoms/wifi");

    expect(status).toBe(200);
    expect(body.article.symptomId).toBe("wifi");
    expect(body.article.steps.length).toBeGreaterThan(0);
    expect(body.category.name).toBe("Network & connectivity");
    expect(body.siblings.map((s: { id: string }) => s.id)).not.toContain("wifi");
  });

  it("returns 200 with a null article for a symptom nobody has written yet", async () => {
    const { status, body } = await get("/devices/phone/symptoms/bluetooth");

    expect(status).toBe(200);
    expect(body.article).toBeNull();
    // The symptom itself still comes back, so the Draft page can name it.
    expect(body.symptom.label).toBe("Bluetooth won't pair");
    expect(body.symptom.hasArticle).toBe(false);
  });

  it("404s a symptom that doesn't exist", async () => {
    expect((await get("/devices/phone/symptoms/nonsense")).status).toBe(404);
  });
});

describe("POST /events", () => {
  const post = async (body: unknown) => {
    const res = await fetch(`${baseUrl}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  ///  Recording must never be able to break the page. Someone reaches this
  ///  feature because a device is already broken; a failed analytics write
  ///  handing them a second failure would be indefensible, and there is
  ///  nothing they could do about it anyway.
  it("accepts a valid event and answers before writing", async () => {
    createEvent.mockClear();
    const { status, body } = await post({
      type: "ARTICLE_OPENED",
      sessionId: "abc",
      deviceKey: "phone",
      symptomId: "wifi",
    });

    expect(status).toBe(202);
    expect(body.recorded).toBe(true);
  });

  it("still returns 202 when the payload is malformed", async () => {
    createEvent.mockClear();
    const { status } = await post({ type: "NOT_A_REAL_TYPE", sessionId: "abc" });

    expect(status).toBe(202);
    // Dropped rather than written — a bad payload is our own bug to find in
    // the logs, not something the browser can act on.
    await new Promise((r) => setTimeout(r, 20));
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("still returns 202 when the database write throws", async () => {
    createEvent.mockClear();
    createEvent.mockRejectedValueOnce(new Error("database is gone"));

    const { status } = await post({
      type: "ESCAPE_TAKEN",
      sessionId: "abc",
      detail: "teams_call",
    });

    expect(status).toBe(202);
  });

  it("rejects an event with no session id", async () => {
    createEvent.mockClear();
    await post({ type: "ARTICLE_OPENED", sessionId: "" });

    await new Promise((r) => setTimeout(r, 20));
    expect(createEvent).not.toHaveBeenCalled();
  });
});

describe("GET /analytics", () => {
  it("requires an admin", async () => {
    const res = await fetch(`${baseUrl}/analytics`);
    expect(res.status).toBe(403);
  });
});
