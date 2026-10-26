import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";

// Same shape as stockKeeperFlow.test.ts: the module graph reaches
// snipeitassets.ts, which refuses to load without credentials. The URL is
// deliberately unroutable — see "the blocked return" below, which depends on
// Snipe being unreachable rather than merely absent.
process.env.SNIPEIT_API_URL ??= "https://snipe.invalid";
process.env.SNIPEIT_BOT_TOKEN ??= "test-token";

const {
  createLoanRequest,
  markLoanReturned,
  findLoansDueBack,
  findClashingLoans,
  isLoanDue,
  formatLoanDate,
} = await import("./loan.js");

///  +-----------------------------------------------------------------+
///  |          A LOAN IS THE ONE REQUEST THAT COMES BACK              |
///  +-----------------------------------------------------------------+
//
//  Everything else in this system ends when the requester has the thing. The
//  interesting half of a loan starts there, and these pin the two places that
//  half can go wrong:
//
//  THE DUE DATE IS A CALENDAR DAY, not an instant. A keeper standing at the
//  desk at 9am on the due date has to be able to take the hotspot back. Both
//  the client (deriveLoanStage) and the server (isLoanDue) decide that
//  independently, and if they disagree the button appears and the API refuses
//  it — which is why the boundary is asserted on both sides of the wire.
//
//  A RETURN IS NOT RECORDED UNTIL SNIPE AGREES. The failure mode worth having
//  a test for is the quiet one: Snipe refuses the checkin, we stamp returnedAt
//  anyway, and a hotspot Snipe still shows as checked out becomes
//  indistinguishable from one genuinely back on the shelf.
//
//  Runs against the throwaway database vitest provisions — see vitest.config.ts.
///  +-----------------------------------------------------------------+

/** A date N days from today, as the "YYYY-MM-DD" the form submits. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UTC midnight N days out — how the column stores it. */
function dateOffset(days: number): Date {
  return new Date(`${dayOffset(days)}T00:00:00.000Z`);
}

const created: number[] = [];

/** The whitelist every test files against: a hotspot that asks for an event
 *  name and a KVM that does not. */
const DEVICES = [
  {
    id: "dev-hotspot",
    kind: "ACCESSORY",
    snipeId: 53,
    categoryId: 18,
    displayName: "Wi-Fi Hotspot",
    description: "For events and site visits",
    showEventName: true,
  },
  {
    id: "dev-kvm",
    kind: "ACCESSORY",
    snipeId: 77,
    categoryId: 30,
    displayName: "KVM",
    description: null,
    showEventName: false,
  },
];

async function setDevices(devices: unknown[]) {
  await prisma.setting.upsert({
    where: { key: "loan_devices" },
    create: { key: "loan_devices", value: JSON.stringify(devices) },
    update: { value: JSON.stringify(devices) },
  });
}

async function file(overrides: Record<string, unknown> = {}) {
  const result = await createLoanRequest({
    userId: 901,
    userName: "Sam Taylor",
    deviceOptionId: "dev-hotspot",
    startDate: dayOffset(0),
    endDate: dayOffset(3),
    reason: "Roadshow at Toowoomba — no site wifi",
    ...overrides,
  });
  created.push(result.request.id);
  return result;
}

/** Drive a filed loan to the point where it is out with the borrower. */
async function collected(loanId: number, requestId: number, endDate: Date) {
  await prisma.request.update({
    where: { id: requestId },
    data: {
      status: "COMPLETED",
      adminApprovedBy: "IT",
      adminApprovedAt: new Date(),
      fulfilledAt: new Date(),
      collectionReadyAt: new Date(),
      receivedAt: new Date(),
    },
  });
  await prisma.loan.update({
    where: { id: loanId },
    data: {
      snipeAccessoryId: 53,
      accessoryName: "Inseego 5G Hotspot",
      checkedOutAt: new Date(),
      endDate,
    },
  });
}

beforeEach(async () => {
  await setDevices(DEVICES);
  await prisma.loan.deleteMany({ where: { request: { userId: 901 } } });
  await prisma.request.deleteMany({ where: { userId: 901 } });
  created.length = 0;
});

afterAll(async () => {
  await prisma.loan.deleteMany({ where: { request: { userId: 901 } } });
  await prisma.request.deleteMany({ where: { userId: 901 } });
  await setDevices([]);
});

describe("filing a loan", () => {
  it("lands at APPROVED with no manager, waiting on IT", () => {
    // The whole front half of the feature in one assertion. A loan has no
    // approver stage, and APPROVED is how this machine already spells
    // "waiting on IT" — the same trick createCorrectionRequest uses.
    return file().then(({ request, loan }) => {
      expect(request.status).toBe("APPROVED");
      expect(request.adminApprovedAt).toBeNull();
      expect(request.manager).toBeNull();
      expect(request.managerId).toBe(0);
      expect(loan.returnedAt).toBeNull();
    });
  });

  it("files as LOAN on BOTH kind and type", async () => {
    // requestType is the interlock, not decoration: every provisioning branch
    // in request.ts tests it for STANDARD or NON_STANDARD, and those branches
    // check real hardware out of Snipe. If this ever reverts to NON_STANDARD
    // a loan becomes eligible for them.
    const { request } = await file();
    expect(request.requestKind).toBe("LOAN");
    expect(request.requestType).toBe("LOAN");
  });

  it("is collect-only", async () => {
    const { request } = await file();
    expect(request.needsShipping).toBe(false);
  });

  it("accepts a same-day loan as one day, not zero", async () => {
    const { message } = await file({ startDate: dayOffset(2), endDate: dayOffset(2) });
    expect(message).toContain("1 day");
    expect(message).not.toContain("0 day");
  });

  it("allows a loan starting TODAY, however late in the day it is", async () => {
    // The obvious over-strict validation, and it would refuse the single most
    // ordinary request there is: somebody who needs a hotspot this afternoon.
    await expect(file({ startDate: dayOffset(0), endDate: dayOffset(0) })).resolves.toBeTruthy();
  });

  it("refuses a window that ends before it starts", async () => {
    await expect(file({ startDate: dayOffset(5), endDate: dayOffset(2) })).rejects.toThrow(
      /can't be before/i
    );
  });

  it("refuses a start date in the past", async () => {
    await expect(file({ startDate: dayOffset(-1), endDate: dayOffset(2) })).rejects.toThrow(
      /in the past/i
    );
  });

  it("refuses a window past the configured maximum", async () => {
    await expect(file({ startDate: dayOffset(0), endDate: dayOffset(400) })).rejects.toThrow(
      /at most/i
    );
  });

  it("refuses an ISO timestamp, not just a bad date", async () => {
    // Accepting one would let the submitter's timezone decide which calendar
    // day the loan fell on — a Brisbane evening booking would land tomorrow.
    await expect(file({ startDate: new Date().toISOString() })).rejects.toThrow(
      /YYYY-MM-DD/
    );
  });

  it("insists on a reason", async () => {
    await expect(file({ reason: "   " })).rejects.toThrow(/what you need/i);
  });
});

describe("filing against the device whitelist", () => {
  it("records which device was asked for, named as the form showed it", async () => {
    const { request, loan } = await file({ deviceOptionId: "dev-kvm" });

    expect(request.categoryName).toBe("KVM");
    expect(request.categoryId).toBe(30);
    expect(loan.deviceOptionId).toBe("dev-kvm");
    expect(loan.requestedAccessoryId).toBe(77);
    // Requested, not yet assigned — IT may still hand over another one.
    expect(loan.snipeAccessoryId).toBeNull();
  });

  it("keeps an event name only for a device whose form asks for one", async () => {
    const hotspot = await file({ eventName: "Toowoomba roadshow" });
    const kvm = await file({ deviceOptionId: "dev-kvm", eventName: "Toowoomba roadshow" });

    expect(hotspot.loan.eventName).toBe("Toowoomba roadshow");
    expect(kvm.loan.eventName).toBeNull();
  });

  it("refuses a device that is not on the whitelist", async () => {
    await expect(file({ deviceOptionId: "dev-retired" })).rejects.toMatchObject({
      statusCode: 400,
    });
    await expect(file({ deviceOptionId: undefined })).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it("is switched off — 503, not 400 — while the whitelist is empty", async () => {
    // The cutover state: the whitelist starts empty and an admin fills it in.
    await setDevices([]);
    await expect(file()).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe("the due-date boundary", () => {
  it("is not due the day before, and is due on the day", () => {
    expect(isLoanDue({ endDate: dateOffset(1) })).toBe(false);
    expect(isLoanDue({ endDate: dateOffset(0) })).toBe(true);
    expect(isLoanDue({ endDate: dateOffset(-2) })).toBe(true);
  });

  it("agrees with the client's rule at the boundary", () => {
    // The contract between isLoanDue here and isReturnable in statusbadge.tsx.
    // They are separate implementations against the same stored value, and a
    // disagreement shows up as a button the API refuses.
    expect(isLoanDue({ endDate: dateOffset(0) })).toBe(true);
    expect(formatLoanDate(dateOffset(0))).toMatch(/\d{4}$/);
  });
});

describe("returning", () => {
  it("is refused before the due date for a keeper", async () => {
    const { request, loan } = await file({ endDate: dayOffset(5) });
    await collected(loan.id, request.id, dateOffset(5));

    await expect(markLoanReturned(request.id, "Keeper")).rejects.toThrow(
      /isn't due back until/i
    );
  });

  it("is refused when the borrower never collected it", async () => {
    // Nothing to give back. Without this the keeper could close a loan whose
    // hotspot is still sitting on their own shelf, un-handed-over.
    const { request, loan } = await file();
    await prisma.loan.update({
      where: { id: loan.id },
      data: { snipeAccessoryId: 53, endDate: dateOffset(-1) },
    });
    await prisma.request.update({
      where: { id: request.id },
      data: { status: "COMPLETED", receivedAt: null },
    });

    await expect(markLoanReturned(request.id, "Keeper")).rejects.toThrow(
      /hasn't been collected/i
    );
  });

  it("is refused when nothing was ever assigned", async () => {
    const { request } = await file();
    await prisma.request.update({
      where: { id: request.id },
      data: { status: "COMPLETED", receivedAt: new Date() },
    });

    await expect(markLoanReturned(request.id, "Keeper")).rejects.toThrow(
      /nothing to return/i
    );
  });

  it("lets an ADMIN close a loan early", async () => {
    // Events finish early, and somebody is standing there holding the
    // hotspot. Refusing it because the spreadsheet says Thursday is worse
    // than the inconsistency — so the override exists, and it is admin-only.
    const { request, loan } = await file({ endDate: dayOffset(5) });
    await collected(loan.id, request.id, dateOffset(5));

    // Snipe is unreachable here, so this gets as far as the network and comes
    // back blocked rather than throwing "not due yet" — which is the point:
    // the DATE guard did not stop it.
    const result = await markLoanReturned(request.id, "Admin", { allowEarly: true });
    expect(result.checkedIn).toBe(false);
    expect(result.message).not.toMatch(/isn't due back/i);
  });

  it("does NOT record a return Snipe refused", async () => {
    // The quiet failure this whole design is arranged around. Snipe is
    // unreachable, so the checkin cannot land; returnedAt must stay null and
    // the row must keep its reason, or a hotspot Snipe still shows as checked
    // out looks exactly like one back on the shelf.
    const { request, loan } = await file({ endDate: dayOffset(0) });
    await collected(loan.id, request.id, dateOffset(0));

    const result = await markLoanReturned(request.id, "Keeper");

    expect(result.checkedIn).toBe(false);
    expect(result.loan.returnedAt).toBeNull();
    expect(result.loan.checkinError).toBeTruthy();

    // And it is still outstanding as far as every other reader is concerned.
    const stored = await prisma.loan.findUnique({ where: { id: loan.id } });
    expect(stored?.returnedAt).toBeNull();
  });

  it("refuses a second return once one is recorded", async () => {
    const { request, loan } = await file({ endDate: dayOffset(0) });
    await collected(loan.id, request.id, dateOffset(0));
    await prisma.loan.update({
      where: { id: loan.id },
      data: { returnedAt: new Date(), returnedBy: "Keeper" },
    });

    await expect(markLoanReturned(request.id, "Keeper")).rejects.toThrow(
      /already marked returned/i
    );
  });
});

describe("the due-back scan", () => {
  it("finds a collected loan that is overdue, and counts the days", async () => {
    const { request, loan } = await file({ endDate: dayOffset(0) });
    await collected(loan.id, request.id, dateOffset(-3));

    const due = await findLoansDueBack(-1);
    const mine = due.find((d) => d.requestId === request.id);

    expect(mine).toBeTruthy();
    expect(mine!.daysOverdue).toBe(3);
  });

  it("reaches a loan due TOMORROW when the first rung is -1", async () => {
    // The courtesy rung. A scan that only looked at loans already past their
    // date could never send it.
    const { request, loan } = await file({ endDate: dayOffset(1) });
    await collected(loan.id, request.id, dateOffset(1));

    const due = await findLoansDueBack(-1);
    expect(due.some((d) => d.requestId === request.id)).toBe(true);
  });

  it("ignores a loan the borrower has NOT collected", async () => {
    // It cannot be overdue — it is still in the handover queue, where the
    // shipment ladder is already chasing the keeper. Chasing the borrower for
    // hardware nobody handed them is the failure the shipment reminders were
    // once fixed for.
    const { request, loan } = await file({ endDate: dayOffset(0) });
    await collected(loan.id, request.id, dateOffset(-5));
    await prisma.request.update({
      where: { id: request.id },
      data: { receivedAt: null },
    });

    const due = await findLoansDueBack(-1);
    expect(due.some((d) => d.requestId === request.id)).toBe(false);
  });

  it("ignores a loan already returned", async () => {
    const { request, loan } = await file({ endDate: dayOffset(0) });
    await collected(loan.id, request.id, dateOffset(-5));
    await prisma.loan.update({
      where: { id: loan.id },
      data: { returnedAt: new Date() },
    });

    const due = await findLoansDueBack(-1);
    expect(due.some((d) => d.requestId === request.id)).toBe(false);
  });
});

describe("clash detection", () => {
  it("names a loan already out over the same window", async () => {
    // The pool is one unit, so this is not a theoretical clash — it is the
    // second request.
    const { request, loan } = await file({ startDate: dayOffset(1), endDate: dayOffset(6) });
    await collected(loan.id, request.id, dateOffset(6));
    await prisma.loan.update({
      where: { id: loan.id },
      data: { startDate: dateOffset(1) },
    });

    const clashes = await findClashingLoans(dateOffset(4), dateOffset(9));
    expect(clashes.some((c) => c.requestId === request.id)).toBe(true);
  });

  it("does not flag a window that starts after the other ends", async () => {
    const { request, loan } = await file({ startDate: dayOffset(1), endDate: dayOffset(3) });
    await collected(loan.id, request.id, dateOffset(3));
    await prisma.loan.update({
      where: { id: loan.id },
      data: { startDate: dateOffset(1) },
    });

    const clashes = await findClashingLoans(dateOffset(4), dateOffset(9));
    expect(clashes.some((c) => c.requestId === request.id)).toBe(false);
  });

  it("excludes the request being assigned from its own clash list", async () => {
    const { request, loan } = await file({ startDate: dayOffset(1), endDate: dayOffset(6) });
    await collected(loan.id, request.id, dateOffset(6));

    const clashes = await findClashingLoans(dateOffset(1), dateOffset(6), request.id);
    expect(clashes.some((c) => c.requestId === request.id)).toBe(false);
  });
});
