import { describe, it, expect, vi, beforeEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |      A RENAMED OPTION MUST NOT ORPHAN THE REQUESTS UNDER IT      |
///  +-----------------------------------------------------------------+
//
//  A standard accessory request used to be bound to its option by NAME. An
//  admin swapping the standard monitor for a newer one — and renaming the
//  option while they were in there, which the field's own helper text
//  encourages — silently unbound every in-flight request that referenced it.
//  Fulfilment found no option with that name, returned null, and the admin
//  saw "No accessory stock available for this request" for a monitor sitting
//  in stock. Nothing errored, nothing logged, and the message pointed at
//  entirely the wrong thing.
//
//  The binding is now the option's id, minted once and carried across renames.
//  These assert the property that failure had: rename anything you like, the
//  request still resolves to the configured accessory.
///  +-----------------------------------------------------------------+

const catalogRows: any[] = [];
let storedConfig: any = { options: [] };

vi.mock("./snipeitassets.js", () => ({
  fetchWithTimeout: vi.fn(async () => ({
    ok: true, status: 200, json: async () => ({ rows: catalogRows }),
  })),
  getHeaders: () => ({}),
  baseUrl: "https://snipe.example",
  getSnipeUser: vi.fn(async () => ({ location: { id: 4, name: "Bundamba" } })),
}));

// findAccessoryOption is mocked too, not inherited from the real module: the
// real one reads the stored setting through its own internal call, which the
// mocked export above cannot intercept. This mirrors its documented rule — id
// first, label only when there is no id.
vi.mock("./settings.js", () => ({
  getRequestableAccessoryCategoryIds: async () => null,
  getStandardAccessoriesForCategory: async () => storedConfig,
  getAllConfiguredStandardAccessoryIds: async () => new Set<number>(),
  findAccessoryOption: async (
    _categoryId: number,
    optionId: string | null,
    legacyLabel: string | null
  ) => {
    if (optionId) return storedConfig.options.find((o: any) => o.id === optionId) ?? null;
    if (legacyLabel) return storedConfig.options.find((o: any) => o.label === legacyLabel) ?? null;
    return null;
  },
}));

const { resolveAccessoryForRequest } = await import("./snipeitaccessories.js");

const MONITOR = {
  id: 52,
  name: "Phillips 27in 144Hz FHD Business Monitor",
  manufacturer: { name: "Philips" },
  model_number: "27B2N2200G/75",
  category: { id: 15, name: "Monitor" },
  location: { id: 4, name: "Bundamba" },
  qty: 10,
  remaining_qty: 10,
};

const OPTION_ID = "3f8b0c22-0000-4000-8000-000000000001";

beforeEach(() => {
  catalogRows.splice(0, catalogRows.length, MONITOR);
});

describe("resolveAccessoryForRequest — bound by id, not by name", () => {
  it("resolves when the label still matches", async () => {
    storedConfig = {
      options: [{ id: OPTION_ID, label: "Standard Option", primary: 52, backup: null }],
    };
    const r = await resolveAccessoryForRequest(15, OPTION_ID, "Standard Option", 501);
    expect(r?.accessory.id).toBe(52);
  });

  it("STILL resolves after the option is renamed — the bug this replaces", async () => {
    storedConfig = {
      options: [
        { id: OPTION_ID, label: "Philips 27in 144Hz Business Monitor", primary: 52, backup: null },
      ],
    };
    // The request carries the id plus the name it was filed under. The name is
    // now wrong; that must not matter.
    const r = await resolveAccessoryForRequest(15, OPTION_ID, "Standard Option", 501);
    expect(r?.accessory.id).toBe(52);
    expect(r?.needsShipping).toBe(false);
  });

  it("still resolves when the primary is swapped AND the label renamed at once", async () => {
    catalogRows.push({ ...MONITOR, id: 77, name: "Dell U2724D", model_number: "U2724D" });
    storedConfig = {
      options: [{ id: OPTION_ID, label: "Something else entirely", primary: 77, backup: null }],
    };
    const r = await resolveAccessoryForRequest(15, OPTION_ID, "Standard Option", 501);
    expect(r?.accessory.id).toBe(77);
  });

  it("does NOT fall back to the label for a row that has an id", async () => {
    // The option this request was filed under was deleted, and a different one
    // now happens to carry the old name. Matching that would check out the
    // wrong accessory, which is worse than refusing.
    storedConfig = {
      options: [{ id: "some-other-id", label: "Standard Option", primary: 52, backup: null }],
    };
    const r = await resolveAccessoryForRequest(15, OPTION_ID, "Standard Option", 501);
    expect(r).toBeNull();
  });

  it("falls back to the label for a legacy row with no id at all", async () => {
    storedConfig = {
      options: [{ id: OPTION_ID, label: "Standard Option", primary: 52, backup: null }],
    };
    const r = await resolveAccessoryForRequest(15, null, "Standard Option", 501);
    expect(r?.accessory.id).toBe(52);
  });
});
