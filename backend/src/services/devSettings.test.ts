import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |        DEV SETTINGS DO NOTHING OUTSIDE DEVELOPMENT              |
///  +-----------------------------------------------------------------+
//
//  They switch off guards (sending email, self-approval), so the one thing
//  that must hold is that production ignores them, even with a row in the
//  table saying "true".
///  +-----------------------------------------------------------------+

const rows = new Map<string, string>();

vi.mock("../db/prisma.js", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async ({ where }: any) => (rows.has(where.key) ? { value: rows.get(where.key) } : null)),
      upsert: vi.fn(async ({ where, create }: any) => {
        rows.set(where.key, create.value);
        return { value: create.value };
      }),
    },
  },
}));

const { getDevSettings, setDevSettings, devSettingsAvailable } = await import("./devSettings.js");

const env = process.env.NODE_ENV;

beforeEach(() => {
  rows.clear();
});

afterEach(() => {
  process.env.NODE_ENV = env;
});

describe("dev settings", () => {
  it("are off when no row exists", async () => {
    process.env.NODE_ENV = "development";
    expect(await getDevSettings()).toEqual({ suppressEmail: false, allowSelfApproval: false });
  });

  it("save and read back in development", async () => {
    process.env.NODE_ENV = "development";
    await setDevSettings({ suppressEmail: true }, "admin@example.com");
    expect(await getDevSettings()).toEqual({ suppressEmail: true, allowSelfApproval: false });
    await setDevSettings({ allowSelfApproval: true, suppressEmail: false }, "admin@example.com");
    expect(await getDevSettings()).toEqual({ suppressEmail: false, allowSelfApproval: true });
  });

  it("read as off in production even when the table says on", async () => {
    rows.set("dev.suppressEmail", "true");
    rows.set("dev.allowSelfApproval", "true");
    process.env.NODE_ENV = "production";
    expect(devSettingsAvailable()).toBe(false);
    expect(await getDevSettings()).toEqual({ suppressEmail: false, allowSelfApproval: false });
  });

  it("can't be written in production", async () => {
    process.env.NODE_ENV = "production";
    await setDevSettings({ suppressEmail: true }, "admin@example.com");
    expect(rows.size).toBe(0);
  });
});
