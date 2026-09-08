import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";

// request.ts pulls in snipeitassets.ts, which refuses to load at all without
// Snipe credentials. Nothing below reaches Snipe — editRequest reads settings
// and writes rows — so these exist purely to get the module graph up. Set
// before the dynamic import, which is why editRequest is imported down here
// rather than at the top with everything else.
process.env.SNIPEIT_API_URL ??= "https://snipe.test/api/v1";
process.env.SNIPEIT_BOT_TOKEN ??= "test-token";

const { editRequest } = await import("./request.js");

///  +-----------------------------------------------------------------+
///  |            EDITING A REQUEST WITHOUT MOVING IT                  |
///  +-----------------------------------------------------------------+
//
//  The whole feature rests on one promise: a request that gets corrected
//  keeps its place in the process. A manager who has already approved is not
//  asked again, an IT sign-off already given is not withdrawn, and a request
//  half-way through fulfilment does not quietly restart.
//
//  That promise is invisible from the outside. Nothing errors when it breaks;
//  the row just reappears in somebody's approval queue a week later and nobody
//  connects it to an edit. So it is asserted directly, column by column,
//  rather than inferred from the response.
//
//  The other half is the audit trail. An edit is one person rewriting somebody
//  else's request, and the only things that make that acceptable are the log
//  row and the email. Both are asserted; so is the case where NEITHER should
//  happen, because "we told the requester their request changed" when it
//  didn't is its own kind of wrong.
//
//  Runs against the throwaway database vitest provisions — see
//  vitest.config.ts. Snipe is never reached: editRequest reads settings and
//  writes rows, and nothing else.
///  +-----------------------------------------------------------------+

const ACTOR = { name: "Jordan Ellis", isAdmin: true } as const;

const created: number[] = [];

/** A plain standard asset request, PENDING, at the very start of the flow. */
async function seedRequest(overrides: Record<string, unknown> = {}) {
  const row = await prisma.request.create({
    data: {
      userId: 501,
      userName: "Sam Taylor",
      categoryId: 10,
      categoryName: "Mobile Phone",
      requestKind: "ASSET",
      requestType: "NON_STANDARD",
      status: "PENDING",
      reason: "Need a work phone",
      managerId: 502,
      manager: "Ali Rahman",
      callText: true,
      needsData: true,
      numberOption: "NEW",
      newNumber: true,
      ...overrides,
    },
  });
  created.push(row.id);
  return row;
}

/**
 * The notification is fire-and-forget — editRequest returns before the
 * enqueue settles, deliberately, so a queue hiccup can never fail an edit that
 * already committed. Poll rather than sleep a fixed amount.
 */
async function jobsFor(requestId: number, kind: string, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const jobs = await prisma.backgroundJob.findMany({
      where: { type: "SEND_REQUEST_NOTIFICATION" },
    });
    const matching = jobs.filter((j) => {
      if (!j.payload) return false;
      const p = JSON.parse(j.payload) as Record<string, unknown>;
      return p.requestId === requestId && p.kind === kind;
    });
    if (matching.length > 0) return matching;
    await new Promise((r) => setTimeout(r, 10));
  }
  return [];
}

beforeEach(async () => {
  await prisma.backgroundJob.deleteMany({});
});

afterAll(async () => {
  await prisma.requestEdit.deleteMany({ where: { requestId: { in: created } } });
  await prisma.modelRequest.deleteMany({ where: { requestId: { in: created } } });
  await prisma.request.deleteMany({ where: { id: { in: created } } });
  await prisma.backgroundJob.deleteMany({});
});

describe("editRequest — position in the process", () => {
  it("leaves every approval column untouched when the request is rewritten", async () => {
    const approvedAt = new Date("2026-08-01T00:00:00.000Z");
    const adminApprovedAt = new Date("2026-08-02T00:00:00.000Z");
    const request = await seedRequest({
      status: "APPROVED",
      approvedBy: "Ali Rahman",
      approvedAt,
      adminApprovedBy: "Jordan Ellis",
      adminApprovedAt,
    });

    await editRequest(request.id, ACTOR, {
      requestKind: "ACCESSORY",
      categoryId: 44,
      categoryName: "Phone Case",
    });

    const after = await prisma.request.findUniqueOrThrow({
      where: { id: request.id },
    });

    // The corrections landed...
    expect(after.requestKind).toBe("ACCESSORY");
    expect(after.categoryName).toBe("Phone Case");

    // ...and the request did not move an inch.
    expect(after.status).toBe("APPROVED");
    expect(after.approvedBy).toBe("Ali Rahman");
    expect(after.approvedAt?.toISOString()).toBe(approvedAt.toISOString());
    expect(after.adminApprovedBy).toBe("Jordan Ellis");
    expect(after.adminApprovedAt?.toISOString()).toBe(adminApprovedAt.toISOString());
  });

  it("does not ask an approver who already answered to answer again", async () => {
    const request = await seedRequest({
      status: "APPROVED",
      approvedBy: "Ali Rahman",
      approvedAt: new Date(),
    });

    await editRequest(request.id, ACTOR, { managerId: 777, manager: "Robin Vale" });

    // The new approver inherits an approval that has already been given —
    // re-requesting it is exactly the re-submission this feature exists to
    // avoid.
    expect(await jobsFor(request.id, "MANAGER_APPROVAL_NEEDED", 3)).toHaveLength(0);
  });

  it("re-sends the approval request when the approver changes before anyone answered", async () => {
    const request = await seedRequest();

    await editRequest(request.id, ACTOR, { managerId: 777, manager: "Robin Vale" });

    // Otherwise the original approver was asked and the new one never was, and
    // the request sits pending with nobody expecting it.
    expect(await jobsFor(request.id, "MANAGER_APPROVAL_NEEDED")).toHaveLength(1);
  });
});

describe("editRequest — telling the requester", () => {
  it("records the diff and emails it", async () => {
    const request = await seedRequest();

    const result = await editRequest(request.id, ACTOR, {
      requestKind: "ACCESSORY",
      categoryId: 44,
      categoryName: "Phone Case",
      requestType: "NON_STANDARD",
    });

    const labels = result.changes.map((c) => c.label);
    expect(labels).toContain("Request type");
    expect(labels).toContain("Item");

    const kindChange = result.changes.find((c) => c.field === "requestKind");
    expect(kindChange).toMatchObject({ from: "Asset", to: "Accessory" });

    const edit = await prisma.requestEdit.findFirstOrThrow({
      where: { requestId: request.id },
    });
    expect(edit.editedBy).toBe("Jordan Ellis");
    expect(JSON.parse(edit.changes)).toEqual(result.changes);

    // The email is pinned to THIS edit, so two edits in quick succession each
    // report their own diff.
    const [job] = await jobsFor(request.id, "REQUEST_EDITED");
    expect(JSON.parse(job.payload!).editId).toBe(edit.id);
  });

  it("says nothing when nothing changed", async () => {
    const request = await seedRequest();

    const result = await editRequest(request.id, ACTOR, {
      categoryId: request.categoryId,
      categoryName: request.categoryName,
      managerId: request.managerId,
      manager: request.manager,
    });

    expect(result.changes).toEqual([]);
    expect(
      await prisma.requestEdit.count({ where: { requestId: request.id } })
    ).toBe(0);
    // A "your request was changed" email about a request that wasn't changed
    // is worse than no email.
    expect(await jobsFor(request.id, "REQUEST_EDITED", 3)).toHaveLength(0);
  });

  it("does not list the phone options a switch to accessory merely nulls", async () => {
    const request = await seedRequest();

    const result = await editRequest(request.id, ACTOR, {
      requestKind: "ACCESSORY",
      categoryId: 44,
      categoryName: "Phone Case",
    });

    // The row really does drop them...
    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.callText).toBe(false);
    expect(after.needsData).toBe(false);
    expect(after.numberOption).toBeNull();

    // ...but they are a mechanical consequence of the one change that
    // happened, and listing them buries it.
    const fields = result.changes.map((c) => c.field);
    expect(fields).not.toContain("callText");
    expect(fields).not.toContain("needsData");
    expect(fields).not.toContain("numberOption");
  });
});

describe("editRequest — who is allowed", () => {
  it("refuses a non-admin actor, whatever route reached it", async () => {
    const request = await seedRequest();

    // The endpoint is behind requireAdmin and the table hides the control, but
    // neither of those travels to a second caller. This is the check that does.
    await expect(
      editRequest(
        request.id,
        { name: "Sam Taylor", isAdmin: false },
        { managerId: 777, manager: "Robin Vale" }
      )
    ).rejects.toMatchObject({ statusCode: 403 });

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.managerId).toBe(502);
    expect(
      await prisma.requestEdit.count({ where: { requestId: request.id } })
    ).toBe(0);
  });

  it("refuses a non-admin before revealing whether the request exists", async () => {
    // A 404 here would make this a working oracle for which ids are real.
    await expect(
      editRequest(999999, { name: "Sam Taylor", isAdmin: false }, {})
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("refuses an edit that cannot say who made it", async () => {
    const request = await seedRequest();

    // editedBy IS the audit trail; an anonymous rewrite of somebody else's
    // request is worse than no edit at all.
    await expect(
      editRequest(request.id, { name: "   ", isAdmin: true }, { managerId: 777 })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe("editRequest — what it refuses", () => {
  it("refuses a request that is already fulfilled or rejected", async () => {
    const done = await seedRequest({ status: "COMPLETED" });
    const dead = await seedRequest({ status: "REJECTED" });

    await expect(
      editRequest(done.id, ACTOR, { manager: "Robin Vale", managerId: 777 })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      editRequest(dead.id, ACTOR, { manager: "Robin Vale", managerId: 777 })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses a record correction", async () => {
    const correction = await seedRequest({
      requestKind: "CORRECTION",
      requestType: "CORRECTION",
      status: "APPROVED",
    });

    await expect(
      editRequest(correction.id, ACTOR, { manager: "Robin Vale", managerId: 777 })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuses to reshape a request IT has already built something from", async () => {
    const request = await seedRequest({ status: "APPROVED" });
    await prisma.modelRequest.create({
      data: { requestId: request.id, snipeModelId: 91, status: "COMPLETED" },
    });

    await expect(
      editRequest(request.id, ACTOR, {
        requestKind: "ACCESSORY",
        categoryId: 44,
        categoryName: "Phone Case",
      })
    ).rejects.toBeInstanceOf(AppError);

    // The softer fields still move, though — that is the point of the split.
    const result = await editRequest(request.id, ACTOR, {
      managerId: 777,
      manager: "Robin Vale",
    });
    expect(result.changes.map((c) => c.field)).toEqual(["managerId"]);
  });

  ///  ---- The hybrid-state hole ----
  //
  //  A non-standard request that reaches IT's own stages keeps NOTHING that
  //  looks committed until the very end: the Snipe id is the last thing the
  //  workflow writes. So "has a Snipe id or a quote" declared the shape free to
  //  change for the whole stretch where IT is actually working the request, and
  //  flipping one to STANDARD there left a standard request owning a
  //  non-standard workflow row. The requests table reads that row to decide
  //  which stage a request is at, so it went on offering the non-standard
  //  actions — "Select accessory" on a request that has a standard option.

  it("refuses the STANDARD flip once IT has taken the request on", async () => {
    const request = await seedRequest({
      requestKind: "ACCESSORY",
      requestType: "NON_STANDARD",
      categoryId: 15,
      categoryName: "Monitor",
      status: "APPROVED",
      callText: false,
      needsData: false,
      numberOption: null,
      newNumber: false,
    });
    // The selection stage exactly: admin-approved, nothing linked yet.
    await prisma.modelRequest.create({
      data: { requestId: request.id, status: "APPROVED" },
    });

    await expect(
      editRequest(request.id, ACTOR, { requestType: "STANDARD" })
    ).rejects.toBeInstanceOf(AppError);

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.requestType).toBe("NON_STANDARD");
  });

  it("counts a skipped quote as a quote", async () => {
    // Skipping is IT deciding this item is too cheap to be worth a supplier
    // quote — a judgement about THIS item, recorded on the request rather than
    // as a quoteDetail row. Reading only quoteDetail left both commitment
    // signals absent on the path that is now normal for cheap accessories.
    const request = await seedRequest({
      requestKind: "ACCESSORY",
      requestType: "NON_STANDARD",
      status: "APPROVED",
      quoteSkippedAt: new Date(),
      quoteSkippedBy: "Jordan Ellis",
      callText: false,
      needsData: false,
      numberOption: null,
      newNumber: false,
    });

    await expect(
      editRequest(request.id, ACTOR, { requestType: "STANDARD" })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("drops the orphan ModelRequest when an untouched request becomes STANDARD", async () => {
    // PENDING is the empty buffer row created on the manager's approval, before
    // IT has looked at it. Correcting a miscategorised request there is exactly
    // what editing is for — but the row has to go with it, or the table reads a
    // non-standard stage off a standard request.
    const request = await seedRequest({
      requestKind: "ACCESSORY",
      requestType: "NON_STANDARD",
      categoryId: 15,
      categoryName: "Monitor",
      status: "APPROVED",
      callText: false,
      needsData: false,
      numberOption: null,
      newNumber: false,
    });
    await prisma.modelRequest.create({
      data: { requestId: request.id, status: "PENDING" },
    });

    await editRequest(request.id, ACTOR, {
      requestType: "STANDARD",
      accessoryOption: null,
    });

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.requestType).toBe("STANDARD");
    expect(
      await prisma.modelRequest.findUnique({ where: { requestId: request.id } })
    ).toBeNull();
  });

  it("refuses to make the requester their own approver", async () => {
    const request = await seedRequest();

    // Both forms and the edit dialog refuse this too, but they are courtesies.
    // createRequest does not check it server-side at all, so this is currently
    // the only place the rule is actually enforced.
    await expect(
      editRequest(request.id, ACTOR, { managerId: 501, manager: "Sam Taylor" })
    ).rejects.toBeInstanceOf(AppError);

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.managerId).toBe(502);
  });
});

describe("editRequest — normalisation matches creation", () => {
  it("keeps call & text implying data, one-way", async () => {
    const request = await seedRequest({ callText: false, needsData: false });

    await editRequest(request.id, ACTOR, { callText: true, needsData: false });

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.needsData).toBe(true);
  });

  it("keeps the legacy newNumber bridge in step with numberOption", async () => {
    const request = await seedRequest({ numberOption: "NEW", newNumber: true });

    await editRequest(request.id, ACTOR, { numberOption: "NONE" });

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.numberOption).toBe("NONE");
    expect(after.newNumber).toBe(false);
  });

  it("drops whose number was being reused when the decision changes", async () => {
    const request = await seedRequest({
      numberOption: "REUSE",
      newNumber: false,
      reuseNumberFromEmail: "old.holder@ksb.com",
      reuseNumberPhone: "0400000000",
    });

    await editRequest(request.id, ACTOR, { numberOption: "NEW" });

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.reuseNumberFromEmail).toBeNull();
    expect(after.reuseNumberPhone).toBeNull();
  });

  it("blanks a preferred model rather than storing an empty string", async () => {
    const request = await seedRequest({ preferredModel: "Pixel 8" });

    await editRequest(request.id, ACTOR, { preferredModel: "   " });

    const after = await prisma.request.findUniqueOrThrow({ where: { id: request.id } });
    expect(after.preferredModel).toBeNull();
  });
});
