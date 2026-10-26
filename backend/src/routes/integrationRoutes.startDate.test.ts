import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AppError } from "../utils/errors.js";

///  +-----------------------------------------------------------------+
///  |        HRT START DATE — WHAT THE INTEGRATION ACCEPTS            |
///  +-----------------------------------------------------------------+
//
//  The field is optional and its absence is the ordinary case, so the
//  contract worth pinning is the edge: a malformed date is a 400, never a
//  request filed without one. Filing it anyway would quietly bring back the
//  reminders the field exists to hold, and HRT would never find out.
///  +-----------------------------------------------------------------+

process.env.HRT_API_KEY = "test-hrt-key";

const createRequest = vi.fn();
const setRequestStartDate = vi.fn();

vi.mock("../services/request.js", () => ({
  createRequest: (a: unknown) => createRequest(a),
  setRequestStartDate: (...a: unknown[]) => setRequestStartDate(...a),
}));
vi.mock("../services/snipeitassets.js", () => ({}));

const { default: integrationRoutes } = await import("./integrationRoutes.js");

let server: Server;
let baseUrl = "";
const HEADERS = { "content-type": "application/json", "x-api-key": "test-hrt-key" };

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/integrations", integrationRoutes);
  app.use((err: AppError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}/api/integrations/hrt`;
});

afterAll(() => {
  server?.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  createRequest.mockResolvedValue({ success: true });
  setRequestStartDate.mockResolvedValue({ success: true });
});

const post = (body: unknown) =>
  fetch(`${baseUrl}/request`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
const patch = (id: number | string, body: unknown) =>
  fetch(`${baseUrl}/request/${id}`, { method: "PATCH", headers: HEADERS, body: JSON.stringify(body) });

describe("POST /hrt/request", () => {
  it("passes a start date through as UTC midnight of that day", async () => {
    const res = await post({ userId: 1, startDate: "2026-11-12" });

    expect(res.status).toBe(200);
    expect(createRequest.mock.calls[0][0].startDate).toEqual(
      new Date("2026-11-12T00:00:00.000Z")
    );
  });

  it("files with no hold when the field is absent", async () => {
    await post({ userId: 1 });

    expect(createRequest.mock.calls[0][0].startDate).toBeNull();
  });

  it.each(["12/11/2026", "2026-11-12T09:00:00+10:00", "2026-02-30", 20261112])(
    "refuses %s rather than filing without it",
    async (startDate) => {
      const res = await post({ userId: 1, startDate });

      expect(res.status).toBe(400);
      expect(createRequest).not.toHaveBeenCalled();
    }
  );
});

describe("PATCH /hrt/request/:id", () => {
  it("moves the date, logged as NextHRT", async () => {
    const res = await patch(42, { startDate: "2026-12-01" });

    expect(res.status).toBe(200);
    expect(setRequestStartDate).toHaveBeenCalledWith(
      42,
      new Date("2026-12-01T00:00:00.000Z"),
      "NextHRT"
    );
  });

  it("clears it on an explicit null", async () => {
    await patch(42, { startDate: null });

    expect(setRequestStartDate).toHaveBeenCalledWith(42, null, "NextHRT");
  });

  it("refuses a body without the key, which is not the same as clearing it", async () => {
    const res = await patch(42, {});

    expect(res.status).toBe(400);
    expect(setRequestStartDate).not.toHaveBeenCalled();
  });

  it("refuses a bad id", async () => {
    const res = await patch("abc", { startDate: "2026-12-01" });

    expect(res.status).toBe(400);
  });

  it("is behind the API key like every other HRT route", async () => {
    const res = await fetch(`${baseUrl}/request/42`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ startDate: "2026-12-01" }),
    });

    expect(res.status).toBe(401);
  });
});
