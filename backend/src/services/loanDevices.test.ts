import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma } from "../db/prisma.js";
import type { AccessorySummary } from "../types/snipeTypes.js";

process.env.SNIPEIT_API_URL ??= "https://snipe.invalid";
process.env.SNIPEIT_BOT_TOKEN ??= "test-token";

///  +-----------------------------------------------------------------+
///  |        WHICH DEVICES CAN BE BORROWED, AND WHEN ONE IS TAKEN      |
///  +-----------------------------------------------------------------+
//
//  Loans used to be one Snipe category of hotspots. They are now a whitelist
//  of specific records — so KVMs and hotspots can sit side by side — and that
//  moves two decisions into this code that used to be implied by the
//  category:
//
//  WHAT MAY BE LENT. The whitelist is the authority. Saving it checks new
//  records really exist in Snipe and captures their category, because filing
//  a loan must not need Snipe to be up.
//
//  WHEN A DEVICE IS TAKEN. A record is a quantity, not a unit. Three hotspots
//  with one promised for the week is two free, not a clash — so clashes are
//  counted per record against its quantity.
//
//  Snipe is mocked here; the database is the throwaway one vitest provisions.
///  +-----------------------------------------------------------------+

function record(id: number, overrides: Partial<AccessorySummary> = {}): AccessorySummary {
  return {
    id,
    name: `Accessory ${id}`,
    modelNumber: null,
    manufacturer: null,
    categoryId: 18,
    categoryName: "Wi-Fi Hotspot",
    qty: 1,
    remaining: 1,
    locationId: 4,
    locationName: "Bundamba",
    ...overrides,
  };
}

const catalogue = vi.fn<() => Promise<AccessorySummary[]>>();
const byId = vi.fn<(id: number) => Promise<AccessorySummary | null>>();

vi.mock("./snipeitaccessories.js", () => ({
  getAllAccessories: () => catalogue(),
  getAccessoryById: (id: number) => byId(id),
  getAccessoryAssignments: vi.fn(),
  checkoutAccessory: vi.fn(),
  checkinAccessory: vi.fn(),
}));

const { normaliseLoanDevices, getLoanDevices } = await import("./settings.js");
const { saveLoanDevices, listLoanDevices, listLoanOptions, createLoanRequest } =
  await import("./loan.js");

const USER = 902;

async function setDevices(devices: unknown[]) {
  await prisma.setting.upsert({
    where: { key: "loan_devices" },
    create: { key: "loan_devices", value: JSON.stringify(devices) },
    update: { value: JSON.stringify(devices) },
  });
}

const HOTSPOTS = { id: "d-hot", kind: "ACCESSORY", snipeId: 53, categoryId: 18, displayName: "Wi-Fi Hotspot", description: null, showEventName: true };
const KVM = { id: "d-kvm", kind: "ACCESSORY", snipeId: 77, categoryId: 30, displayName: "KVM", description: "Remote support for iPads", showEventName: false };

function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** An assigned, unreturned loan of `snipeId` over days `from`..`to`. */
async function bookedLoan(snipeId: number, from: number, to: number) {
  const { request, loan } = await createLoanRequest({
    userId: USER,
    userName: "Other Borrower",
    deviceOptionId: snipeId === 77 ? "d-kvm" : "d-hot",
    startDate: dayOffset(from),
    endDate: dayOffset(to),
    reason: "Already booked",
  });
  await prisma.loan.update({
    where: { id: loan.id },
    data: { snipeAccessoryId: snipeId, accessoryName: `Accessory ${snipeId}` },
  });
  return request;
}

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.loan.deleteMany({ where: { request: { userId: USER } } });
  await prisma.request.deleteMany({ where: { userId: USER } });
  await setDevices([HOTSPOTS, KVM]);
});

afterAll(async () => {
  await prisma.loan.deleteMany({ where: { request: { userId: USER } } });
  await prisma.request.deleteMany({ where: { userId: USER } });
  await setDevices([]);
});

describe("normaliseLoanDevices", () => {
  it("drops entries with no record or no name, and a second entry for one record", () => {
    const out = normaliseLoanDevices(
      [
        { id: "a", snipeId: 53, displayName: "Hotspot" },
        { id: "b", snipeId: 53, displayName: "Same record again" },
        { id: "c", snipeId: 0, displayName: "No record" },
        { id: "d", snipeId: 77, displayName: "   " },
        "not an object",
      ],
      { mintIds: false }
    );
    expect(out.map((d) => d.id)).toEqual(["a"]);
  });

  it("mints ids on write only", () => {
    const raw = [{ snipeId: 53, displayName: "Hotspot" }];
    expect(normaliseLoanDevices(raw, { mintIds: false })).toEqual([]);
    expect(normaliseLoanDevices(raw, { mintIds: true })[0].id).toMatch(/[0-9a-f-]{36}/);
  });

  it("asks for an event name only when told to", () => {
    const [d] = normaliseLoanDevices([{ id: "a", snipeId: 1, displayName: "X" }], {
      mintIds: false,
    });
    expect(d.showEventName).toBe(false);
    expect(d.kind).toBe("ACCESSORY");
  });
});

describe("saveLoanDevices", () => {
  it("captures the Snipe category of a newly added record", async () => {
    byId.mockResolvedValue(record(91, { categoryId: 44 }));

    await saveLoanDevices([HOTSPOTS, KVM, { snipeId: 91, displayName: "Spare KVM" }]);

    const saved = await getLoanDevices();
    expect(saved.find((d) => d.snipeId === 91)?.categoryId).toBe(44);
    // The two already on the list were not looked up again.
    expect(byId).toHaveBeenCalledTimes(1);
  });

  it("refuses a record Snipe does not have, and saves nothing", async () => {
    byId.mockResolvedValue(null);

    await expect(
      saveLoanDevices([HOTSPOTS, { snipeId: 404, displayName: "Ghost" }])
    ).rejects.toMatchObject({ statusCode: 400 });
    expect((await getLoanDevices()).map((d) => d.snipeId)).toEqual([53, 77]);
  });

  it("turns loans off with an empty list", async () => {
    await saveLoanDevices([]);
    expect(await getLoanDevices()).toEqual([]);
  });
});

describe("listLoanDevices (the form)", () => {
  it("shows live stock and leaves out records gone from Snipe", async () => {
    catalogue.mockResolvedValue([record(53, { qty: 3, remaining: 2 })]);

    const devices = await listLoanDevices();

    expect(devices).toEqual([
      expect.objectContaining({ id: "d-hot", remaining: 2, qty: 3, showEventName: true }),
    ]);
  });

  it("still lists every device when Snipe is down, with unknown stock", async () => {
    catalogue.mockRejectedValue(new Error("ECONNREFUSED"));

    const devices = await listLoanDevices();

    expect(devices.map((d) => d.id)).toEqual(["d-hot", "d-kvm"]);
    expect(devices.every((d) => d.remaining === null)).toBe(true);
  });
});

describe("listLoanOptions (the assign dialog)", () => {
  it("puts the requested record first and names it as the whitelist does", async () => {
    catalogue.mockResolvedValue([record(53), record(77, { categoryId: 30 })]);
    const { request } = await createLoanRequest({
      userId: USER,
      userName: "Sam Taylor",
      deviceOptionId: "d-kvm",
      startDate: dayOffset(1),
      endDate: dayOffset(3),
      reason: "Support an iPad remotely",
    });

    const { options } = await listLoanOptions(request.id);

    expect(options.map((o) => o.id)).toEqual([77, 53]);
    expect(options[0]).toMatchObject({ requested: true, displayName: "KVM" });
  });

  it("does not call it a clash while the record still has units free", async () => {
    catalogue.mockResolvedValue([record(53, { qty: 3, remaining: 2 }), record(77)]);
    await bookedLoan(53, 1, 5);
    const { request } = await createLoanRequest({
      userId: USER,
      userName: "Sam Taylor",
      deviceOptionId: "d-hot",
      startDate: dayOffset(2),
      endDate: dayOffset(4),
      reason: "Roadshow",
    });

    const { options, clashes } = await listLoanOptions(request.id);

    expect(options.find((o) => o.id === 53)?.bookedOverWindow).toBe(1);
    expect(clashes).toHaveLength(0);
  });

  it("reports the clash once every unit of the record is promised", async () => {
    catalogue.mockResolvedValue([
      record(53, { qty: 1, remaining: 0 }),
      record(77, { qty: 2, remaining: 1 }),
    ]);
    const other = await bookedLoan(53, 1, 5);
    // Also booked over the window, but on a record with a unit to spare.
    const spare = await bookedLoan(77, 1, 5);
    const { request } = await createLoanRequest({
      userId: USER,
      userName: "Sam Taylor",
      deviceOptionId: "d-hot",
      startDate: dayOffset(2),
      endDate: dayOffset(4),
      reason: "Roadshow",
    });

    const { clashes } = await listLoanOptions(request.id);

    expect(clashes.map((c) => c.requestId)).toEqual([other.id]);
    expect(clashes.some((c) => c.requestId === spare.id)).toBe(false);
  });

  it("is a 503 while no devices are configured", async () => {
    const { request } = await createLoanRequest({
      userId: USER,
      userName: "Sam Taylor",
      deviceOptionId: "d-hot",
      startDate: dayOffset(1),
      endDate: dayOffset(2),
      reason: "Roadshow",
    });
    await setDevices([]);

    await expect(listLoanOptions(request.id)).rejects.toMatchObject({ statusCode: 503 });
  });
});
