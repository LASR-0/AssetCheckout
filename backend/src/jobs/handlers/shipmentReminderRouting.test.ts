import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "../../db/prisma.js";

///  +-----------------------------------------------------------------+
///  |        A REMINDER SENT TO THE WRONG PERSON IS WORSE THAN NONE    |
///  +-----------------------------------------------------------------+
//
//  One clock and one counter now serve two people in sequence: the
//  destination site's stock keeper between dispatch and handover, the
//  requester after it. Every failure here is silent and looks like the system
//  working.
//
//    * Chase the requester before the handover and you ask somebody to
//      confirm receipt of a device nobody has given them — while the person
//      actually holding it up hears nothing at all.
//    * Let a site with no keeper resolve to an empty recipient list and the
//      reminder is simply never sent. Nothing errors; the job reports success.
//    * Carry the keeper's reminderStage across the handover and the
//      requester's early nudges are swallowed by a stage somebody else
//      advanced — their first contact about the device is the day-30
//      escalation that copies in IT, about a delay that was not theirs.
//
//  None of those show up in a log. They show up as somebody asking where
//  their laptop is, six weeks later.
///  +-----------------------------------------------------------------+

process.env.ADMIN_EMAILS = "it@ksb.com";
process.env.APP_BASE_URL ??= "https://checkout.ksb.com";
process.env.SNIPEIT_API_URL ??= "https://snipe.test/api/v1";
process.env.SNIPEIT_BOT_TOKEN ??= "test-token";

const sent: { to: string | string[]; subject: string; html: string; text: string }[] = [];

vi.mock("../../services/email.js", () => ({
  sendEmail: vi.fn(async (message: never) => {
    sent.push(message);
    return { messageId: "test" };
  }),
}));

vi.mock("../../services/snipeitassets.js", () => ({
  resolveUserEmail: vi.fn(async () => "sam.taylor@ksb.com"),
}));

const { sendRequestNotificationHandler } = await import("./sendRequestNotification.js");

const BUNDAMBA = 4;
const created: number[] = [];

/** Recipients of the one email that was sent, normalised to an array. */
function recipients(): string[] {
  expect(sent).toHaveLength(1);
  const to = sent[0].to;
  return Array.isArray(to) ? to : [to];
}

async function seedShipment(overrides: Record<string, unknown> = {}) {
  const row = await prisma.request.create({
    data: {
      userId: 701,
      userName: "Sam Taylor",
      categoryId: 10,
      categoryName: "Laptop",
      requestKind: "ASSET",
      requestType: "STANDARD",
      status: "COMPLETED",
      managerId: 702,
      manager: "Ali Rahman",
      needsShipping: true,
      shippedAt: new Date("2026-09-01T00:00:00.000Z"),
      userLocationId: BUNDAMBA,
      userLocationName: "Bundamba",
      ...overrides,
    },
  });
  created.push(row.id);
  return row.id;
}

async function setKeepers(
  keepers: { userId: number; name: string; email: string | null }[]
) {
  const value =
    keepers.length === 0
      ? "{}"
      : JSON.stringify({
          [String(BUNDAMBA)]: { locationName: "Bundamba", keepers },
        });
  await prisma.setting.upsert({
    where: { key: "stock_keepers" },
    create: { key: "stock_keepers", value },
    update: { value },
  });
}

beforeEach(async () => {
  sent.length = 0;
  await setKeepers([
    { userId: 801, name: "Ali Rahman", email: "ali.rahman@ksb.com" },
  ]);
});

afterAll(async () => {
  if (created.length > 0) {
    await prisma.request.deleteMany({ where: { id: { in: created } } });
  }
  await setKeepers([]);
});

describe("before the handover", () => {
  it("chases the stock keeper, not the requester", async () => {
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_REMINDER" });

    expect(recipients()).toEqual(["ali.rahman@ksb.com"]);
    expect(recipients()).not.toContain("sam.taylor@ksb.com");
  });

  it("asks them the question they can actually answer", async () => {
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_REMINDER" });

    // "Have you received your laptop?" to somebody who is not the requester
    // is the copy that teaches people to ignore these.
    expect(sent[0].subject).toMatch(/has sam taylor's laptop arrived/i);
    expect(sent[0].text).toMatch(/mark it ready to collect/i);
  });

  it("names the site so a keeper of two knows which one", async () => {
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_REMINDER" });

    expect(sent[0].text).toContain("Bundamba");
  });
});

describe("after the handover", () => {
  it("chases the requester, who now has something to collect", async () => {
    const id = await seedShipment({
      collectionReadyAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_REMINDER" });

    expect(recipients()).toEqual(["sam.taylor@ksb.com"]);
    expect(sent[0].subject).toMatch(/have you collected/i);
  });
});

///  +-----------------------------------------------------------------+
///  |          NO KEEPER MUST NEVER MEAN NO RECIPIENT                 |
///  +-----------------------------------------------------------------+

describe("when the site has nobody to chase", () => {
  it("falls back to admins rather than sending nothing", async () => {
    await setKeepers([]);
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_REMINDER" });

    expect(recipients()).toEqual(["it@ksb.com"]);
  });

  it("falls back when the assigned keeper has no email on record", async () => {
    // Assignable but not notifiable — the settings card flags this, and the
    // reminder must not quietly evaporate when somebody ignores the warning.
    await setKeepers([{ userId: 801, name: "Ali Rahman", email: null }]);
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_REMINDER" });

    expect(recipients()).toEqual(["it@ksb.com"]);
  });

  it("falls back when the request has no recorded location", async () => {
    const id = await seedShipment({ collectionReadyAt: null, userLocationId: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_REMINDER" });

    expect(recipients()).toEqual(["it@ksb.com"]);
  });
});

describe("the overdue escalation", () => {
  it("copies admins in alongside the keeper before handover", async () => {
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_OVERDUE" });

    expect(recipients().sort()).toEqual(["ali.rahman@ksb.com", "it@ksb.com"]);
    expect(recipients()).not.toContain("sam.taylor@ksb.com");
  });

  it("copies admins in alongside the requester after it", async () => {
    const id = await seedShipment({
      collectionReadyAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_OVERDUE" });

    expect(recipients().sort()).toEqual(["it@ksb.com", "sam.taylor@ksb.com"]);
  });

  it("does not double up when a keeper is also an admin", async () => {
    await setKeepers([{ userId: 801, name: "IT Person", email: "it@ksb.com" }]);
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_OVERDUE" });

    expect(recipients()).toEqual(["it@ksb.com"]);
  });
});

describe("the ready-to-collect notice", () => {
  it("names the person to collect from, not 'IT'", async () => {
    // The whole point of the role: "collect it from IT" is useless at a site
    // where IT is in another state.
    const id = await seedShipment({
      collectionReadyAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    await sendRequestNotificationHandler({
      requestId: id,
      kind: "DEVICE_READY_FOR_COLLECTION",
    });

    expect(recipients()).toEqual(["sam.taylor@ksb.com"]);
    expect(sent[0].text).toContain("Ali Rahman");
    expect(sent[0].html).toContain("Ali Rahman");
  });

  it("lists all of them when a site has more than one", async () => {
    await setKeepers([
      { userId: 801, name: "Ali Rahman", email: "ali.rahman@ksb.com" },
      { userId: 802, name: "Jo Bailey", email: "jo.bailey@ksb.com" },
    ]);
    const id = await seedShipment({
      collectionReadyAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    await sendRequestNotificationHandler({
      requestId: id,
      kind: "DEVICE_READY_FOR_COLLECTION",
    });

    expect(sent[0].text).toMatch(/Ali Rahman or Jo Bailey/);
  });

  it("falls back to 'IT' when an admin stood in for an unassigned site", async () => {
    await setKeepers([]);
    const id = await seedShipment({
      collectionReadyAt: new Date("2026-09-10T00:00:00.000Z"),
    });

    await sendRequestNotificationHandler({
      requestId: id,
      kind: "DEVICE_READY_FOR_COLLECTION",
    });

    // Vague but honest beats "collect it from somebody".
    expect(sent[0].text).toMatch(/collect it from IT/i);
  });
});

describe("the inbound notice", () => {
  it("tells the keeper something is coming, before anyone chases them", async () => {
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_INBOUND" });

    expect(recipients()).toEqual(["ali.rahman@ksb.com"]);
    expect(sent[0].text).toContain("Bundamba");
    expect(sent[0].text).toContain("Sam Taylor");
  });

  it("says why IT got it when a site has no keeper", async () => {
    await setKeepers([]);
    const id = await seedShipment({ collectionReadyAt: null });

    await sendRequestNotificationHandler({ requestId: id, kind: "SHIPMENT_INBOUND" });

    expect(recipients()).toEqual(["it@ksb.com"]);
    expect(sent[0].html).toMatch(/no stock keeper assigned/i);
  });
});
