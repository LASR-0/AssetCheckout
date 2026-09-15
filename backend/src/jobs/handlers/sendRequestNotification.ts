import { prisma } from "../../db/prisma.js";
import { resolveUserEmail } from "../../services/snipeitassets.js";
import { sendEmail, type EmailAttachment } from "../../services/email.js";
import {
  getSetting,
  getStockKeepersForLocation,
  type StockKeeperEntry,
} from "../../services/settings.js";
import { readQuoteDocument } from "../../services/quoteStorage.js";
import { appLink } from "./appLinks.js";
import {
  renderEmail,
  esc,
  firstNameFromEmail,
  firstNameFromDisplayName,
  type EmailContent,
} from "./emailTemplate.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const KINDS = [
  "MANAGER_APPROVAL_NEEDED",
  "ADMIN_APPROVAL_NEEDED",
  "DEVICE_ASSIGNED",
  "DEVICE_SHIPPED",
  "DEVICE_READY_FOR_COLLECTION",
  "REQUEST_REJECTED",
  "SHIPMENT_REMINDER",
  "SHIPMENT_OVERDUE",
  /// Something is on its way to a site, addressed to the keepers there rather
  /// than to the person who asked for it. They are the ones who will take
  /// delivery of it, and they cannot hand over a parcel they were never told
  /// to expect.
  "SHIPMENT_INBOUND",
  "QUOTE_APPROVAL_NEEDED",
  "REQUEST_EDITED",
  "SELF_PROCUREMENT_NEEDED",
  "SELF_PROCUREMENT_SUBMITTED",
] as const;
type NotificationKind = (typeof KINDS)[number];

function isKind(v: unknown): v is NotificationKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

///  +-----------------------------------------------------------------+
///  |            WHO IS ON THE HOOK FOR A DEVICE RIGHT NOW            |
///  +-----------------------------------------------------------------+
//
//  Between dispatch and handover it is the destination site's stock keeper.
//  After handover it is the requester. Chasing the wrong one of those is not
//  a cosmetic problem: it asks somebody to confirm they have a device nobody
//  has given them, and it lets the person actually holding it up hear
//  nothing.
//
//  FALLS BACK TO ADMINS, never to nobody. A site with no assigned keeper, a
//  request with no recorded location, keepers assigned without an email on
//  record — each of those would otherwise silently drop the reminder, and a
//  reminder nobody receives is indistinguishable from one that was never due.
//  Admins can act as keeper anywhere, so they are the correct fallback as
//  well as the safe one.
///  +-----------------------------------------------------------------+

async function resolveStockKeeperEmails(
  locationId: number | null
): Promise<{ emails: string[]; keepers: StockKeeperEntry[]; viaAdmins: boolean }> {
  if (locationId === null) {
    return { emails: ADMIN_EMAILS, keepers: [], viaAdmins: true };
  }

  let keepers: StockKeeperEntry[] = [];
  try {
    keepers = await getStockKeepersForLocation(locationId);
  } catch (err) {
    console.error("[notification] could not read stock keepers:", err);
  }

  const emails = keepers
    .map((k) => k.email)
    .filter((e): e is string => !!e);

  return emails.length > 0
    ? { emails, keepers, viaAdmins: false }
    : { emails: ADMIN_EMAILS, keepers, viaAdmins: true };
}

/** "Ali Rahman or Sam Taylor" — who to go and see. */
function keeperNames(keepers: StockKeeperEntry[]): string | null {
  const names = keepers.map((k) => k.name).filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Pull just the rejection reason out of the "REJECTED: x\n REQUEST: y" format. */
function parseRejectionReason(reason: string | null): string {
  if (!reason) return "No reason provided";
  const m = reason.match(/^REJECTED:\s*([\s\S]*?)\n\s*REQUEST:/);
  return (m ? m[1] : reason).trim() || "No reason provided";
}

/** Opening line for a body: "Hi Luke," when we have a name, else a generic
 *  lead-in so the email doesn't open with a bare comma. */
function greeting(firstName: string | null): string {
  return firstName ? `Hi ${esc(firstName)},` : "Hi there,";
}

/**
 * Read a RequestEdit.changes blob back into the before/after list the email
 * quotes. Written by describeRequestChanges in services/request.ts.
 *
 * Every entry is re-checked rather than trusted: this is a JSON column, and
 * the alternative to dropping a malformed entry is rendering `undefined →
 * undefined` into somebody's inbox. Entries that don't hold three strings are
 * skipped; if that leaves nothing, the caller skips the send entirely.
 */
function parseEditChanges(
  raw: string
): { label: string; from: string; to: string }[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const { label, from, to } = entry as Record<string, unknown>;
    if (typeof label !== "string" || typeof from !== "string" || typeof to !== "string") {
      return [];
    }
    return [{ label, from, to }];
  });
}

/** "$1,234.56" — quotes are in AUD and always shown to the cent, because this
 *  is the number the manager is agreeing to spend. */
function money(amount: number): string {
  return amount.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}

/**
 * SEND_REQUEST_NOTIFICATION handler.
 *
 * Payload: { requestId: number, kind: NotificationKind }. Loads the request
 * fresh and renders the per-kind email (plain-text + HTML), resolving
 * recipients from Snipe (user/manager) or ADMIN_EMAILS (admin).
 *
 * Skip vs fail:
 *   - No recipient email, request missing, or bad payload → skip summary →
 *     job Completes, no retry (nothing a retry would fix).
 *   - sendEmail throws (relay/TLS/transient) → propagates → runner marks
 *     Failed and retries with backoff.
 */
export async function sendRequestNotificationHandler(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const requestId = Number(payload.requestId);
  const kind = payload.kind;

  if (!Number.isFinite(requestId) || !isKind(kind)) {
    return { skipped: true, reason: "invalid_payload", payload };
  }

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { quoteDetail: true, selfProcured: true },
  });
  if (!request) {
    return { skipped: true, reason: "request_not_found", requestId, kind };
  }

  //  PINNED TO THIS REQUEST, not to the request log.
  //
  //  Every email used to land on /requests, which is the whole table. For a
  //  requester that is a short list; for an approver with a department under
  //  them it is not, and the request the email is actually about could be
  //  anywhere in it. Catching up on a fortnight of approvals meant reading
  //  the subject line, then hunting for the matching row — once per email.
  //
  //  ?requestId=<n> is the filter the home page's recent-requests links
  //  already use: the table pins to that one row and shows a chip saying so,
  //  which the reader can dismiss to get the full log back. So the email now
  //  opens on the thing it is about, and the old destination is one click
  //  away rather than the other way round.
  //
  //  Uses request.id rather than the payload's, which is only checked for
  //  being a finite number — the row that was actually loaded is the one the
  //  link should point at.
  //
  //  appLink() picks the production or dev base URL from the environment, so
  //  localhost never leaks into a real email.
  const reviewLink = appLink(`/requests?requestId=${request.id}`);
  const userFirst = firstNameFromDisplayName(request.userName);
  const category = esc(request.categoryName);
  const userName = esc(request.userName);

  let to: string | string[] | null = null;
  let subject = "";
  let text = "";
  let content: EmailContent | null = null;
  let attachments: EmailAttachment[] | undefined;

  switch (kind) {
    case "MANAGER_APPROVAL_NEEDED": {
      to = await resolveUserEmail(request.managerId);
      const managerFirst = firstNameFromEmail(typeof to === "string" ? to : null);
      subject = `Approval needed: ${request.userName}'s ${request.categoryName} request`;
      text =
        `${request.userName} has requested a ${request.categoryName}.\n\n` +
        `As the nominated approver, please review and approve or decline this request.\n\n` +
        `Log into AssetCheckout to review: ${reviewLink}`;
      content = {
        eyebrow: "Action required",
        title: "Approval needed",
        paragraphs: [
          greeting(managerFirst),
          `<strong style="color:#27242e; font-weight:600;">${userName}</strong> has requested a ${category} through KSB Checkout and your approval is needed before it can be fulfilled.`,
          `Please review the request details and approve or decline.`,
        ],
        detailRows: [
          { label: "Requested item", value: category },
          { label: "Requested by", value: userName },
        ],
        cta: { label: "Review request", url: reviewLink },
        secondaryLink: { prefix: "Or paste this link into your browser:", label: reviewLink, url: reviewLink },
      };
      break;
    }

    case "ADMIN_APPROVAL_NEEDED": {
      to = ADMIN_EMAILS.length ? ADMIN_EMAILS : null;
      subject = `IT sign-off needed: ${request.userName}'s ${request.categoryName} request`;
      text =
        `${request.userName}'s ${request.categoryName} request has been approved by their manager ` +
        `and now needs IT sign-off before fulfilment.\n\n` +
        `Log into AssetCheckout to review: ${reviewLink}`;
      content = {
        eyebrow: "Action required",
        title: "IT sign-off needed",
        paragraphs: [
          greeting(null),
          `<strong style="color:#27242e; font-weight:600;">${userName}</strong>'s ${category} request has been approved by their manager and now needs IT sign-off before fulfilment.`,
        ],
        detailRows: [
          { label: "Requested item", value: category },
          { label: "Requested by", value: userName },
        ],
        cta: { label: "Review request", url: reviewLink },
        secondaryLink: { prefix: "Or paste this link into your browser:", label: reviewLink, url: reviewLink },
      };
      break;
    }

    case "DEVICE_ASSIGNED": {
      to = await resolveUserEmail(request.userId);
      subject = `Your ${request.categoryName} request has been approved`;
      text =
        `Good news — your ${request.categoryName} request has been approved and a device assigned.\n\n` +
        `You'll be notified when it's ready to collect or has been shipped.`;
      content = {
        eyebrow: "Approved",
        title: "Your request has been approved",
        paragraphs: [
          greeting(userFirst),
          `Good news — your ${category} request has been approved and a device assigned.`,
          `You'll be notified when it's ready to collect or has been shipped.`,
        ],
        cta: { label: "Open KSB Checkout", url: reviewLink },
      };
      break;
    }

    case "DEVICE_SHIPPED": {
      to = await resolveUserEmail(request.userId);
      const estimateRaw = await getSetting("shipping_estimate_days");
      const estimateDays = Number(estimateRaw) > 0 ? Number(estimateRaw) : 5;

      let trackingBlock = "";
      if (request.trackingCode || request.trackingUrl) {
        trackingBlock = "\n\nTracking details:";
        if (request.trackingCode) trackingBlock += `\nTracking number: ${request.trackingCode}`;
        if (request.trackingUrl) trackingBlock += `\nTrack your delivery: ${request.trackingUrl}`;
      }

      subject = `Your ${request.categoryName} has shipped`;
      text =
        `Your ${request.categoryName} is on its way.\n\n` +
        `You can expect it to arrive within approximately ${estimateDays} days.` +
        trackingBlock +
        `\n\nOnce it arrives, please mark it as received in AssetCheckout.`;

      // Tracking highlight block — only when we have a code and/or URL.
      let highlight: EmailContent["highlight"] | undefined;
      if (request.trackingCode || request.trackingUrl) {
        const lines: string[] = [];
        if (request.trackingCode) {
          lines.push(
            `<span style="font:600 17px/1.3 'SF Mono',ui-monospace,Menlo,Consolas,monospace; color:#1c1a22;">${esc(request.trackingCode)}</span>`
          );
        }
        if (request.trackingUrl) {
          lines.push(
            `<a href="${esc(request.trackingUrl)}" style="color:#8b5cf6; font-weight:600;">View live tracking →</a>`
          );
        }
        highlight = { heading: request.trackingCode ? "Tracking number" : "Tracking", lines };
      }

      content = {
        eyebrow: "On its way",
        title: "Your device has shipped",
        paragraphs: [
          greeting(userFirst),
          `Your ${category} is on its way. You can expect it to arrive within approximately <strong style="color:#27242e; font-weight:600;">${estimateDays} days</strong>.`,
          `Once it arrives, please mark it as received in KSB Checkout.`,
        ],
        highlight,
        // "Track delivery" button only when there's a URL to track.
        cta: request.trackingUrl
          ? { label: "Track delivery", url: request.trackingUrl }
          : { label: "Open KSB Checkout", url: reviewLink },
      };
      break;
    }

    case "DEVICE_READY_FOR_COLLECTION": {
      to = await resolveUserEmail(request.userId);

      // NAME THE PERSON, not the department. "Collect it from IT" is useless
      // at a site where IT is in another state — which is the situation this
      // whole role exists for. Falls back to the old wording when the site has
      // no named keeper (an admin stood in), because "collect it from
      // somebody" is worse than a vague but honest instruction.
      const { keepers } = await resolveStockKeeperEmails(request.userLocationId);
      const from = keeperNames(keepers);
      const whereFrom = from ? `from ${from}` : "from IT";

      subject = `Your ${request.categoryName} is ready for collection`;
      text =
        `Your ${request.categoryName} is ready to collect.\n\n` +
        `Please collect it ${whereFrom}, then mark it as collected in AssetCheckout.`;
      content = {
        eyebrow: "Ready to collect",
        title: "Your device is ready for collection",
        paragraphs: [
          greeting(userFirst),
          `Your ${category} is ready to collect.`,
          from
            ? `Please collect it from <strong style="color:#27242e; font-weight:600;">${esc(from)}</strong>, then mark it as collected in KSB Checkout.`
            : `Please collect it from IT, then mark it as collected in KSB Checkout.`,
        ],
        cta: { label: "Open KSB Checkout", url: reviewLink },
      };
      break;
    }

    case "SHIPMENT_INBOUND": {
      const { emails, viaAdmins } = await resolveStockKeeperEmails(
        request.userLocationId
      );
      to = emails;

      const site = request.userLocationName ?? "your location";
      subject = `Inbound: ${request.categoryName} for ${request.userName}`;
      text =
        `A ${request.categoryName} for ${request.userName} has been shipped to ${site}.\n\n` +
        `When it arrives, mark it as ready to collect in AssetCheckout — that tells ` +
        `${request.userName} to come and get it, and stops the reminders coming to you.`;
      content = {
        eyebrow: "On its way to you",
        title: "A device is being shipped to your location",
        paragraphs: [
          greeting(null),
          `A ${category} for <strong style="color:#27242e; font-weight:600;">${userName}</strong> has been shipped to <strong style="color:#27242e; font-weight:600;">${esc(site)}</strong>.`,
          `When it arrives, mark it as ready to collect — that tells ${userName} to come and get it, and stops the reminders coming to you.`,
          ...(viaAdmins
            ? [
                `This went to IT because ${esc(site)} has no stock keeper assigned.`,
              ]
            : []),
        ],
        cta: { label: "Open KSB Checkout", url: reviewLink },
      };
      break;
    }

    case "REQUEST_REJECTED": {
      to = await resolveUserEmail(request.userId);
      const reason = parseRejectionReason(request.reason);
      subject = `Your ${request.categoryName} request was declined`;
      text =
        `Your ${request.categoryName} request has been declined.\n\n` +
        `Reason: ${reason}\n\n` +
        `If you have any questions, please follow up with IT.`;
      content = {
        eyebrow: "Update",
        title: "Your request was declined",
        paragraphs: [
          greeting(userFirst),
          `Your ${category} request has been declined.`,
          `If you have any questions, please follow up with IT.`,
        ],
        highlight: { heading: "Reason", lines: [esc(reason)] },
      };
      break;
    }

    case "SHIPMENT_REMINDER": {
      // WHOEVER IS ACTUALLY HOLDING IT UP. Before the handover the device is
      // the destination site's problem and the requester can do nothing about
      // it; after the handover it is sitting waiting for them. Sending the
      // "have you received it?" copy to a requester who has not been given
      // anything is how people learn to ignore these.
      if (request.collectionReadyAt === null) {
        const { emails } = await resolveStockKeeperEmails(request.userLocationId);
        to = emails;

        const site = request.userLocationName ?? "your location";

        // A shipped device may genuinely not have turned up yet, so that copy
        // offers "no action needed" as a real answer. One already at the site
        // has no such excuse — it is on a shelf waiting to be handed over, and
        // telling its keeper they might have nothing to do would be wrong.
        const wasShipped = request.needsShipping;

        subject = wasShipped
          ? `Has ${request.userName}'s ${request.categoryName} arrived?`
          : `${request.userName}'s ${request.categoryName} is waiting to be handed over`;
        text = wasShipped
          ? `A ${request.categoryName} for ${request.userName} was shipped to ${site} and ` +
            `hasn't been marked ready to collect yet.\n\n` +
            `If it has arrived, mark it ready to collect in AssetCheckout so ${request.userName} ` +
            `knows to come and get it. If it hasn't turned up, no action is needed.`
          : `A ${request.categoryName} for ${request.userName} has been ready at ${site} for a ` +
            `while and hasn't been marked ready to collect yet.\n\n` +
            `Mark it ready to collect in AssetCheckout so ${request.userName} knows to come and get it.`;
        content = {
          eyebrow: "Checking in",
          title: wasShipped
            ? "Has this arrived at your location?"
            : "This is waiting to be handed over",
          paragraphs: [
            greeting(null),
            wasShipped
              ? `A ${category} for <strong style="color:#27242e; font-weight:600;">${userName}</strong> was shipped to <strong style="color:#27242e; font-weight:600;">${esc(site)}</strong> and hasn't been marked ready to collect yet.`
              : `A ${category} for <strong style="color:#27242e; font-weight:600;">${userName}</strong> has been ready at <strong style="color:#27242e; font-weight:600;">${esc(site)}</strong> for a while and hasn't been marked ready to collect yet.`,
            wasShipped
              ? `If it has arrived, mark it ready to collect so ${userName} knows to come and get it. If it hasn't turned up, no action is needed.`
              : `Mark it ready to collect so ${userName} knows to come and get it.`,
          ],
          cta: { label: "Mark ready to collect", url: reviewLink },
        };
        break;
      }

      to = await resolveUserEmail(request.userId);
      subject = `Have you collected your ${request.categoryName}?`;
      text =
        `We're checking in on your ${request.categoryName}, which is waiting for you to collect.\n\n` +
        `If you have it, please mark it as collected in AssetCheckout. ` +
        `If you haven't picked it up yet, no action is needed — we'll check in again soon.`;
      content = {
        eyebrow: "Checking in",
        title: `Have you collected your ${request.categoryName}?`,
        paragraphs: [
          greeting(userFirst),
          `We're checking in on your ${category}, which is waiting for you to collect.`,
          `If you have it, please mark it as collected. If you haven't picked it up yet, no action is needed — we'll check in again soon.`,
        ],
        cta: { label: "Mark as collected", url: reviewLink },
      };
      break;
    }

    case "SHIPMENT_OVERDUE": {
      // Admins are always copied — that is what makes this an escalation
      // rather than a fourth reminder. Who it is escalating ABOUT depends on
      // where the device got stuck, same split as SHIPMENT_REMINDER above.
      const awaitingHandover = request.collectionReadyAt === null;

      if (awaitingHandover) {
        const { emails } = await resolveStockKeeperEmails(request.userLocationId);
        to = Array.from(new Set([...emails, ...ADMIN_EMAILS]));

        const site = request.userLocationName ?? "an unrecorded location";
        const wasShipped = request.needsShipping;

        subject = `Overdue: ${request.categoryName} for ${request.userName} not marked ready`;
        text = wasShipped
          ? `A ${request.categoryName} for ${request.userName} was shipped to ${site} and still ` +
            `hasn't been marked ready to collect.\n\n` +
            `Either it never arrived — in which case this needs investigating as a possible postage ` +
            `issue — or it is sitting there and ${request.userName} hasn't been told. IT has been notified.`
          : `A ${request.categoryName} for ${request.userName} has been sitting at ${site} for over ` +
            `a month and still hasn't been marked ready to collect.\n\n` +
            `${request.userName} has not been told it is there. IT has been notified.`;
        content = {
          eyebrow: "Overdue",
          title: wasShipped
            ? "Shipment not yet marked ready to collect"
            : "Device not yet handed over",
          paragraphs: [
            greeting(null),
            wasShipped
              ? `A ${category} for <strong style="color:#27242e; font-weight:600;">${userName}</strong> was shipped to <strong style="color:#27242e; font-weight:600;">${esc(site)}</strong> and still hasn't been marked ready to collect.`
              : `A ${category} for <strong style="color:#27242e; font-weight:600;">${userName}</strong> has been sitting at <strong style="color:#27242e; font-weight:600;">${esc(site)}</strong> for over a month and still hasn't been marked ready to collect.`,
            wasShipped
              ? `Either it never arrived — in which case this needs investigating as a possible postage issue — or it is sitting there and ${userName} hasn't been told.`
              : `<strong style="color:#27242e; font-weight:600;">${userName}</strong> has not been told it is there.`,
            `IT has been notified.`,
          ],
          cta: { label: "Mark ready to collect", url: reviewLink },
        };
        break;
      }

      const userEmail = await resolveUserEmail(request.userId);
      to = [userEmail, ...ADMIN_EMAILS].filter((e): e is string => !!e);

      subject = `Overdue: ${request.categoryName} not yet collected`;
      text =
        `The ${request.categoryName} for ${request.userName} has been ready to collect for ` +
        `more than a month and still hasn't been picked up.\n\n` +
        `${request.userName}: if you have it, please mark it as collected in AssetCheckout. ` +
        `IT has been notified.`;
      content = {
        eyebrow: "Overdue",
        title: "Device not yet collected",
        paragraphs: [
          greeting(null),
          `The ${category} for <strong style="color:#27242e; font-weight:600;">${userName}</strong> has been ready to collect for more than a month and still hasn't been picked up.`,
          `<strong style="color:#27242e; font-weight:600;">${userName}</strong>: if you have it, please mark it as collected. IT has been notified.`,
        ],
        cta: { label: "Mark as collected", url: reviewLink },
      };
      break;
    }

    case "QUOTE_APPROVAL_NEEDED": {
      const quote = request.quoteDetail;
      // No quote row means the job was enqueued out of order or against the
      // wrong request. Nothing a retry fixes, so skip rather than fail.
      if (!quote) {
        return { skipped: true, reason: "no_quote_detail", requestId, kind };
      }

      to = await resolveUserEmail(request.managerId);
      const managerFirst = firstNameFromEmail(typeof to === "string" ? to : null);
      const supplier = esc(quote.supplier);
      const amount = money(quote.amount);

      // The document IS the quote. If it can't be read, this must not go out
      // as a quote email with nothing attached — let it throw so the runner
      // retries and, failing that, surfaces it in the job history where a
      // broken QUOTES_DIR mount can actually be seen and fixed.
      attachments = [
        {
          filename: quote.documentName,
          content: await readQuoteDocument(quote.documentPath),
          contentType: quote.documentMime,
        },
      ];

      subject = `Quote for approval: ${request.userName}'s ${request.categoryName}`;
      text =
        `A quote is ready for ${request.userName}'s ${request.categoryName} request.\n\n` +
        `Supplier: ${quote.supplier}\n` +
        `Amount: ${amount}\n` +
        (quote.reference ? `Quote reference: ${quote.reference}\n` : "") +
        `\nThis is a non-standard accessory, so the cost comes out of your department's ` +
        `budget rather than IT's. The quote is attached.\n\n` +
        `Nothing will be ordered until you approve it. Log into AssetCheckout to accept ` +
        `or decline: ${reviewLink}`;

      content = {
        eyebrow: "Action required",
        title: "Quote ready for your approval",
        paragraphs: [
          greeting(managerFirst),
          `A quote has come back for <strong style="color:#27242e; font-weight:600;">${userName}</strong>'s ${category} request. It's attached to this email.`,
          `This is a non-standard accessory, so the cost comes out of <strong style="color:#27242e; font-weight:600;">your department's budget</strong> rather than IT's — which is why it needs your approval rather than just IT's.`,
          `Nothing will be ordered until you accept it.`,
        ],
        detailRows: [
          { label: "Requested item", value: category },
          { label: "Requested by", value: userName },
          { label: "Supplier", value: supplier },
          { label: "Amount", value: amount },
          ...(quote.reference
            ? [{ label: "Quote reference", value: esc(quote.reference), mono: true }]
            : []),
        ],
        cta: { label: "Accept or decline", url: reviewLink },
        secondaryLink: {
          prefix: "Or paste this link into your browser:",
          label: reviewLink,
          url: reviewLink,
        },
      };
      break;
    }
    case "REQUEST_EDITED": {
      //  THE ONE EMAIL THAT REPORTS A CHANGE SOMEBODY ELSE MADE.
      //
      //  Everything else here tells the requester what has HAPPENED to their
      //  request. This tells them their request is no longer the one they
      //  submitted: IT corrected it — usually because the form was filled in
      //  for the wrong thing — and they are entitled to see exactly what moved.
      //
      //  So the diff IS the email. Without it this is a notification that
      //  something unspecified was altered on their behalf, which is worse
      //  than no email at all.
      to = await resolveUserEmail(request.userId);

      // Pinned by id, so two edits in quick succession each report their own
      // diff rather than both reporting whichever landed last. Falls back to
      // the newest edit for a job enqueued before editId existed.
      const editId = Number(payload.editId);
      const edit = Number.isFinite(editId)
        ? await prisma.requestEdit.findUnique({ where: { id: editId } })
        : await prisma.requestEdit.findFirst({
            where: { requestId: request.id },
            orderBy: { createdAt: "desc" },
          });

      // No edit row, or one belonging to a different request, means the job
      // was enqueued against the wrong thing. Nothing a retry fixes.
      if (!edit || edit.requestId !== request.id) {
        return { skipped: true, reason: "no_edit_record", requestId, kind };
      }

      const changes = parseEditChanges(edit.changes);
      if (changes.length === 0) {
        // editRequest never writes a no-op edit, so this is a corrupt or
        // hand-inserted row. Sending "your request changed" with nothing to
        // show would just generate a support call.
        return { skipped: true, reason: "no_changes_recorded", requestId, kind };
      }

      const editedBy = esc(edit.editedBy);

      subject = `Your ${request.categoryName} request has been updated`;
      text =
        `${edit.editedBy} has corrected your request in KSB Checkout.\n\n` +
        `What changed:\n` +
        changes.map((c) => `  ${c.label}: ${c.from} → ${c.to}`).join("\n") +
        `\n\nYour request keeps its place in the queue — nothing needs approving again ` +
        `and there's nothing for you to do.\n\n` +
        `If any of this doesn't look right, let IT know: ${reviewLink}`;

      content = {
        eyebrow: "Updated",
        title: "Your request has been corrected",
        paragraphs: [
          greeting(userFirst),
          `<strong style="color:#27242e; font-weight:600;">${editedBy}</strong> has corrected your request in KSB Checkout. Here's exactly what changed.`,
          `Your request <strong style="color:#27242e; font-weight:600;">keeps its place in the queue</strong> — nothing needs approving again, and there's nothing for you to do.`,
          `If any of this doesn't look right, let IT know and we'll sort it out.`,
        ],
        // Old value struck through, new value plain — the row reads
        // left-to-right as "this became that" without needing a legend.
        detailRows: changes.map((c) => ({
          // Escaped like the values, even though every label describeRequestChanges
          // emits is one of our own constants: this side of the wire reads them
          // out of a JSON column, and nothing downstream re-escapes a label.
          label: esc(c.label),
          value:
            `<span style="color:#9b97a3; text-decoration:line-through;">${esc(c.from)}</span>` +
            `<span style="color:#9b97a3;"> &rarr; </span>${esc(c.to)}`,
        })),
        cta: { label: "View my request", url: reviewLink },
        secondaryLink: {
          prefix: "Or paste this link into your browser:",
          label: reviewLink,
          url: reviewLink,
        },
      };
      break;
    }

    case "SELF_PROCUREMENT_NEEDED": {
      // IT decided this is cheap enough for the requester to just go and buy
      // it themselves. Told to the requester, not the manager — they're the
      // one with something to do next.
      to = await resolveUserEmail(request.userId);
      subject = `Go ahead and buy your ${request.categoryName} yourself`;
      text =
        `IT has approved your ${request.categoryName} request, but this item is simple enough ` +
        `that you can go and purchase it yourself rather than waiting on IT to source it.\n\n` +
        `Once you have it, come back to AssetCheckout and enter what you bought and what it cost: ${reviewLink}`;
      content = {
        eyebrow: "Action required",
        title: "Go ahead and get this yourself",
        paragraphs: [
          greeting(userFirst),
          `Your ${category} request has been approved, but it's simple enough that you can go and purchase it yourself rather than waiting on IT.`,
          `Once you have it, come back and enter what you bought and what it cost.`,
        ],
        cta: { label: "Enter item details", url: reviewLink },
      };
      break;
    }

    case "SELF_PROCUREMENT_SUBMITTED": {
      const detail = request.selfProcured;
      if (!detail || detail.itemName == null || detail.cost == null) {
        return { skipped: true, reason: "no_self_procured_detail", requestId, kind };
      }

      to = ADMIN_EMAILS.length ? ADMIN_EMAILS : null;
      const itemName = esc(detail.itemName);
      const cost = money(detail.cost);
      subject = `Review needed: ${request.userName} bought their own ${request.categoryName}`;
      text =
        `${request.userName} has reported what they bought for their ${request.categoryName} request.\n\n` +
        `Item: ${detail.itemName}\n` +
        `Cost: ${cost}\n\n` +
        `Review it and decide whether to record it in Snipe: ${reviewLink}`;
      content = {
        eyebrow: "Action required",
        title: "Self-procured item ready for review",
        paragraphs: [
          greeting(null),
          `<strong style="color:#27242e; font-weight:600;">${userName}</strong> has reported what they bought for their ${category} request.`,
          `Review it and decide whether it's worth a Snipe record, or just a Checkout one.`,
        ],
        detailRows: [
          { label: "Requested by", value: userName },
          { label: "Item", value: itemName },
          { label: "Cost", value: cost },
        ],
        cta: { label: "Review and complete", url: reviewLink },
      };
      break;
    }
  }

  if (!to || (Array.isArray(to) && to.length === 0)) {
    console.warn(
      `[notification] skipped ${kind} for request ${requestId}: no recipient email`
    );
    return { skipped: true, reason: "no_recipient_email", requestId, kind };
  }

  const html = content ? renderEmail(content) : undefined;

  await sendEmail({
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    ...(attachments ? { attachments } : {}),
  });

  return {
    sent: true,
    kind,
    requestId,
    recipient: Array.isArray(to) ? to : [to],
    ...(attachments ? { attached: attachments.map((a) => a.filename) } : {}),
  };
}