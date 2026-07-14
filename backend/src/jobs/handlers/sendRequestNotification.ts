import { prisma } from "../../db/prisma.js";
import { resolveUserEmail } from "../../services/snipeit.js";
import { sendEmail } from "../../services/email.js";
import { getSetting } from "../../services/settings.js";
import { appLink } from "../handlers/AppLinks.js";
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

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) {
    return { skipped: true, reason: "request_not_found", requestId, kind };
  }

  // Absolute link into the app — appLink() picks the production or dev base
  // URL from the environment, so localhost never leaks into real emails.
  const reviewLink = appLink("/requests");
  const userFirst = firstNameFromDisplayName(request.userName);
  const category = esc(request.categoryName);
  const userName = esc(request.userName);

  let to: string | string[] | null = null;
  let subject = "";
  let text = "";
  let content: EmailContent | null = null;

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
        secondaryLink: { prefix: "Or open the request log directly:", label: reviewLink, url: reviewLink },
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
        secondaryLink: { prefix: "Or open the request log directly:", label: reviewLink, url: reviewLink },
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
  }

  if (!to || (Array.isArray(to) && to.length === 0)) {
    console.warn(
      `[notification] skipped ${kind} for request ${requestId}: no recipient email`
    );
    return { skipped: true, reason: "no_recipient_email", requestId, kind };
  }

  const html = content ? renderEmail(content) : undefined;

  await sendEmail({ to, subject, text, ...(html ? { html } : {}) });

  return {
    sent: true,
    kind,
    requestId,
    recipient: Array.isArray(to) ? to : [to],
  };
}