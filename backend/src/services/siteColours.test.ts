import { describe, it, expect, vi, beforeEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |        A SITE'S COLOUR IS DATA FROM AN ADMIN, SO IT IS CHECKED   |
///  +-----------------------------------------------------------------+
//
//  The stored value is drawn straight into style attributes on every page
//  that names a site, so only a #RRGGBB value is ever let in or let out.
///  +-----------------------------------------------------------------+

let stored: string | null = null;

vi.mock("../db/prisma.js", () => ({
  prisma: {
    setting: {
      findUnique: vi.fn(async () => (stored === null ? null : { value: stored })),
      upsert: vi.fn(async ({ create }: any) => {
        stored = create.value;
        return { value: stored };
      }),
    },
  },
}));

const { getSiteColours, setSiteColour } = await import("./settings.js");

beforeEach(() => {
  stored = null;
});

describe("site colours", () => {
  it("is empty when nothing is set", async () => {
    expect(await getSiteColours()).toEqual({});
  });

  it("sets, normalises to lower case, and clears one site", async () => {
    await setSiteColour(4, "#3F8A8C", "admin@example.com");
    await setSiteColour(7, "#a8843a", "admin@example.com");
    expect(await getSiteColours()).toEqual({ "4": "#3f8a8c", "7": "#a8843a" });

    await setSiteColour(4, null, "admin@example.com");
    expect(await getSiteColours()).toEqual({ "7": "#a8843a" });
  });

  it("refuses anything that is not #RRGGBB", async () => {
    for (const bad of ["red", "#fff", "#12345g", "url(x)", "#3f8a8c; background:red"]) {
      await expect(setSiteColour(4, bad, "admin@example.com")).rejects.toThrow(/#RRGGBB/);
    }
  });

  it("drops malformed entries already in storage", async () => {
    stored = JSON.stringify({ "4": "#3f8a8c", "5": "javascript:x", abc: "#000000", "6": 7 });
    expect(await getSiteColours()).toEqual({ "4": "#3f8a8c" });
  });
});
