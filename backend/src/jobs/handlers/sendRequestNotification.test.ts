import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { prisma } from "../../db/prisma.js";

///  +-----------------------------------------------------------------+
///  |        WHERE A NOTIFICATION EMAIL ACTUALLY LANDS                |
///  +-----------------------------------------------------------------+
//
//  Every kind builds one `reviewLink` and reuses it sixteen times, so the
//  thing worth testing is that link — once, for every kind, rather than the
//  wording of each template.
//
//  IT PINS TO THE REQUEST. An email about request 115 that opens the whole
//  log makes the reader find the row themselves, which for an approver with
//  a department under them is the actual work. This is the regression that
//  would be invisible: the link still resolves, the page still loads, and
//  nobody notices it stopped filtering until somebody complains about
//  scrolling.
///  +-----------------------------------------------------------------+

const sent: { to: string | string[]; subject: string; html: string; text: string }[] = [];

vi.mock("../../services/email.js", () => ({
  sendEmail: vi.fn(async (message: never) => {
    sent.push(message);
    return { messageId: "test" };
  }),
}));

// Recipients come from Snipe, which is not reachable from a test and is not
// what these assert. Every kind needs *a* recipient or it skips.
vi.mock("../../services/snipeitassets.js", () => ({
  resolveUserEmail: vi.fn(async () => "approver@ksb.com"),
}));

const { sendRequestNotificationHandler } = await import("./sendRequestNotification.js");

const BASE = "https://checkout.ksb.com";
let requestId = 0;

beforeEach(() => {
  sent.length = 0;
});

afterAll(async () => {
  if (requestId) await prisma.request.deleteMany({ where: { id: requestId } });
});

/** A real row, because the handler loads one and skips when it cannot. */
async function seedRequest(): Promise<number> {
  if (requestId) return requestId;

  process.env.NODE_ENV = "production";
  process.env.APP_BASE_URL = BASE;

  const row = await prisma.request.create({
    data: {
      userName: "Sam Taylor",
      userId: 1,
      managerId: 2,
      categoryName: "Laptop",
      categoryId: 3,
      // requestType is non-nullable and every provisioning branch tests it.
      requestType: "STANDARD",
      status: "PENDING",
    } as never,
  });

  requestId = row.id;
  return requestId;
}

describe("the link in a notification email", () => {
  it("points at the request the email is about, not the whole log", async () => {
    const id = await seedRequest();

    await sendRequestNotificationHandler({ requestId: id, kind: "MANAGER_APPROVAL_NEEDED" });

    expect(sent).toHaveLength(1);
    const link = `${BASE}/requests?requestId=${id}`;

    // Both bodies: an approver reading in a plain-text client gets the same
    // destination as one reading the HTML.
    expect(sent[0].html).toContain(link);
    expect(sent[0].text).toContain(link);
  });

  it("never links to the bare request log", async () => {
    const id = await seedRequest();

    await sendRequestNotificationHandler({ requestId: id, kind: "MANAGER_APPROVAL_NEEDED" });

    // The old destination, which is what a careless refactor would restore.
    // Matched with the closing quote or whitespace so the pinned link — which
    // starts with the same characters — does not satisfy it.
    expect(sent[0].html).not.toMatch(new RegExp(`${BASE}/requests(?![?])`));
    expect(sent[0].text).not.toMatch(new RegExp(`${BASE}/requests(?![?])`));
  });

  it("pins the link in every kind that carries one", async () => {
    const id = await seedRequest();

    // Not every kind links: a decline notice deliberately has no call to
    // action, because there is nothing for the reader to do. So the
    // invariant is not "every email has a link" — it is that any email which
    // DOES link, links to the request rather than the log.
    let linked = 0;

    for (const kind of [
      "MANAGER_APPROVAL_NEEDED",
      "ADMIN_APPROVAL_NEEDED",
      "DEVICE_ASSIGNED",
      "DEVICE_SHIPPED",
      "REQUEST_REJECTED",
    ]) {
      sent.length = 0;
      await sendRequestNotificationHandler({ requestId: id, kind });

      for (const message of sent) {
        for (const body of [message.html, message.text]) {
          if (!body.includes(`${BASE}/requests`)) continue;
          linked += 1;
          expect(body, kind).toContain(`${BASE}/requests?requestId=${id}`);
          expect(body, kind).not.toMatch(new RegExp(`${BASE}/requests(?![?])`));
        }
      }
    }

    // Guards the loop itself: if recipient resolution changed and every kind
    // started skipping, the assertions above would all pass vacuously.
    expect(linked).toBeGreaterThan(0);
  });
});

///  +-----------------------------------------------------------------+
///  |        THE EDIT NOTICE IS THE DIFF, OR IT IS NOTHING            |
///  +-----------------------------------------------------------------+
//
//  Every other kind here tells the requester what has HAPPENED to their
//  request. This one tells them their request is no longer the one they
//  submitted — somebody in IT rewrote it. An email that says so without
//  saying WHAT is a support call, so the failure mode worth guarding is a
//  notice that goes out with the diff missing or unreadable.
///  +-----------------------------------------------------------------+

describe("the request-edited notice", () => {
  it("quotes the recorded before-and-after in both bodies", async () => {
    const id = await seedRequest();
    const edit = await prisma.requestEdit.create({
      data: {
        requestId: id,
        editedBy: "Jordan Ellis",
        changes: JSON.stringify([
          { field: "requestKind", label: "Request type", from: "Asset", to: "Accessory" },
          { field: "categoryId", label: "Item", from: "Mobile Phone", to: "Phone Case" },
        ]),
      },
    });

    await sendRequestNotificationHandler({ requestId: id, kind: "REQUEST_EDITED", editId: edit.id });

    expect(sent).toHaveLength(1);
    for (const body of [sent[0].html, sent[0].text]) {
      expect(body).toContain("Mobile Phone");
      expect(body).toContain("Phone Case");
      expect(body).toContain("Jordan Ellis");
    }

    await prisma.requestEdit.delete({ where: { id: edit.id } });
  });

  it("reports the edit it was told about, not whichever is newest", async () => {
    const id = await seedRequest();
    const first = await prisma.requestEdit.create({
      data: {
        requestId: id,
        editedBy: "Jordan Ellis",
        changes: JSON.stringify([
          { field: "categoryId", label: "Item", from: "Mobile Phone", to: "Phone Case" },
        ]),
      },
    });
    const second = await prisma.requestEdit.create({
      data: {
        requestId: id,
        editedBy: "Jordan Ellis",
        changes: JSON.stringify([
          { field: "managerId", label: "Approver", from: "Ali Rahman", to: "Robin Vale" },
        ]),
      },
    });

    // Two edits in quick succession queue two emails. Each must report its
    // own, or the requester is told the same thing twice and never hears
    // about the first change at all.
    await sendRequestNotificationHandler({ requestId: id, kind: "REQUEST_EDITED", editId: first.id });

    expect(sent[0].text).toContain("Phone Case");
    expect(sent[0].text).not.toContain("Robin Vale");

    await prisma.requestEdit.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  });

  it("stays silent rather than announcing an unreadable change", async () => {
    const id = await seedRequest();
    const edit = await prisma.requestEdit.create({
      // editRequest never writes an empty diff, so this can only be a corrupt
      // or hand-inserted row — and "your request changed" with nothing to show
      // is worse than no email at all.
      data: { requestId: id, editedBy: "Jordan Ellis", changes: "not json" },
    });

    const result = await sendRequestNotificationHandler({
      requestId: id,
      kind: "REQUEST_EDITED",
      editId: edit.id,
    });

    expect(result.skipped).toBe(true);
    expect(sent).toHaveLength(0);

    await prisma.requestEdit.delete({ where: { id: edit.id } });
  });
});
