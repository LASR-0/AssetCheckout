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
