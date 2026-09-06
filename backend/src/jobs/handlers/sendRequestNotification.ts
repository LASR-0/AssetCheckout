import { prisma } from "../../db/prisma.js";
import { resolveUserEmail } from "../../services/snipeitassets.js";
import { sendEmail, type EmailAttachment } from "../../services/email.js";
import { getSetting } from "../../services/settings.js";
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
  "QUOTE_APPROVAL_NEEDED",
  "REQUEST_EDITED",
  "SELF_PROCUREMENT_NEEDED",
  "SELF_PROCUREMENT_SUBMITTED",
] as const;
type NotificationKind = (typeof KINDS)[number];

function isKind(v: unknown): v is NotificationKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
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
      subject = `Your ${request.categoryName} is ready for collection`;
      text =
        `Your ${request.categoryName} has been prepared and is ready to collect.\n\n` +
        `Please collect it from IT, then mark it as collected in AssetCheckout.`;
      content = {
        eyebrow: "Ready to collect",
        title: "Your device is ready for collection",
        paragraphs: [
          greeting(userFirst),
          `Your ${category} has been prepared and is ready to collect.`,
          `Please collect it from IT, then mark it as collected in KSB Checkout.`,
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
      to = await resolveUserEmail(request.userId);
      subject = `Have you received your ${request.categoryName}?`;
      text =
        `We're checking in on your ${request.categoryName}, which was shipped to you recently.\n\n` +
        `If it has arrived, please mark it as received in AssetCheckout. ` +
        `If it hasn't arrived yet, no action is needed — we'll check in again soon.`;
      content = {
        eyebrow: "Checking in",
        title: `Have you received your ${request.categoryName}?`,
        paragraphs: [
          greeting(userFirst),
          `We're checking in on your ${category}, which was shipped to you recently.`,
          `If it has arrived, please mark it as received. If it hasn't arrived yet, no action is needed — we'll check in again soon.`,
        ],
        cta: { label: "Mark as received", url: reviewLink },
      };
      break;
    }

    case "SHIPMENT_OVERDUE": {
      // Fans out to the user AND all admins — so the body opens generically.
      const userEmail = await resolveUserEmail(request.userId);
      to = [userEmail, ...ADMIN_EMAILS].filter((e): e is string => !!e);

      subject = `Overdue: ${request.categoryName} not yet marked received`;
      text =
        `The ${request.categoryName} shipped to ${request.userName} has not been marked as received ` +
        `after more than a month.\n\n` +
        `If it doesn't arrive within another week, this will need to be investigated as a possible ` +
        `postage issue. ${request.userName}: if you have received it, please mark it as received in ` +
        `AssetCheckout. IT has been notified.`;
      content = {
        eyebrow: "Overdue",
        title: "Shipment not yet marked received",
        paragraphs: [
          greeting(null),
          `The ${category} shipped to <strong style="color:#27242e; font-weight:600;">${userName}</strong> has not been marked as received after more than a month.`,
          `If it doesn't arrive within another week, this will need to be investigated as a possible postage issue.`,
          `<strong style="color:#27242e; font-weight:600;">${userName}</strong>: if you have received it, please mark it as received. IT has been notified.`,
        ],
        cta: { label: "Mark as received", url: reviewLink },
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