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
