import { prisma } from "../../db/prisma.js";
import { resolveUserEmail } from "../../services/snipeit.js";
import { sendEmail } from "../../services/email.js";
import { getSetting } from "../../services/settings.js";

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
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

/**
 * SEND_REQUEST_NOTIFICATION handler.
 *
 * Payload: { requestId: number, kind: NotificationKind }. Loads the request
 * fresh and renders the per-kind email, resolving recipients from Snipe
 * (user/manager) or ADMIN_EMAILS (admin).
 *
 * Skip vs fail:
 *   - No recipient email (Snipe user has none, or ADMIN_EMAILS empty),
 *     request missing, or bad payload → returns a skip summary → job
 *     Completes, no retry (nothing a retry would fix).
 *   - sendEmail throws (relay/TLS/transient) → propagates → runner marks
 *     Failed and retries with backoff (default maxAttempts 3).
 *
 * NOT a one-shot job: SMTP blips should retry, so it uses the default
 * retry budget rather than ONE_SHOT_JOBS.
 */
export async function sendRequestNotificationHandler(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const requestId = Number(payload.requestId);
  const kind = payload.kind;

  if (!Number.isFinite(requestId) || !isKind(kind)) {
    // Malformed payload — a retry can't fix it, so complete with a note.
    return { skipped: true, reason: "invalid_payload", payload };
  }

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) {
    return { skipped: true, reason: "request_not_found", requestId, kind };
  }

  const reviewLink = `${APP_BASE_URL}/requests`;

  let to: string | string[] | null = null;
  let subject = "";
  let text = "";

  switch (kind) {
    case "MANAGER_APPROVAL_NEEDED":
      to = await resolveUserEmail(request.managerId);
      subject = `Approval needed: ${request.userName}'s ${request.categoryName} request`;
      text =
        `${request.userName} has requested a ${request.categoryName}.\n\n` +
        `As the nominated approver, please review and approve or decline this request.\n\n` +
        `Log into AssetCheckout to review: ${reviewLink}`;
      break;

    case "ADMIN_APPROVAL_NEEDED":
      to = ADMIN_EMAILS.length ? ADMIN_EMAILS : null;
      subject = `IT sign-off needed: ${request.userName}'s ${request.categoryName} request`;
      text =
        `${request.userName}'s ${request.categoryName} request has been approved by their manager ` +
        `and now needs IT sign-off before fulfilment.\n\n` +
        `Log into AssetCheckout to review: ${reviewLink}`;
      break;

    case "DEVICE_ASSIGNED":
      to = await resolveUserEmail(request.userId);
      subject = `Your ${request.categoryName} request has been approved`;
      text =
        `Good news — your ${request.categoryName} request has been approved and a device assigned.\n\n` +
        `You'll be notified when it's ready to collect or has been shipped.`;
      break;

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
      break;
    }

    case "DEVICE_READY_FOR_COLLECTION":
      to = await resolveUserEmail(request.userId);
      subject = `Your ${request.categoryName} is ready for collection`;
      text =
        `Your ${request.categoryName} has been prepared and is ready to collect.\n\n` +
        `Please collect it from IT, then mark it as collected in AssetCheckout.`;
      break;

    case "REQUEST_REJECTED":
      to = await resolveUserEmail(request.userId);
      subject = `Your ${request.categoryName} request was declined`;
      text =
        `Your ${request.categoryName} request has been declined.\n\n` +
        `Reason: ${parseRejectionReason(request.reason)}\n\n` +
        `If you have any questions, please follow up with IT.`;
      break;

    case "SHIPMENT_REMINDER":
      to = await resolveUserEmail(request.userId);
      subject = `Have you received your ${request.categoryName}?`;
      text =
        `We're checking in on your ${request.categoryName}, which was shipped to you recently.\n\n` +
        `If it has arrived, please mark it as received in AssetCheckout. ` +
        `If it hasn't arrived yet, no action is needed — we'll check in again soon.`;
      break;

    case "SHIPMENT_OVERDUE": {
      // Fans out to the user AND all admins.
      const userEmail = await resolveUserEmail(request.userId);
      to = [userEmail, ...ADMIN_EMAILS].filter((e): e is string => !!e);

      subject = `Overdue: ${request.categoryName} not yet marked received`;
      text =
        `The ${request.categoryName} shipped to ${request.userName} has not been marked as received ` +
        `after more than a month.\n\n` +
        `If it doesn't arrive within another week, this will need to be investigated as a possible ` +
        `postage issue. ${request.userName}: if you have received it, please mark it as received in ` +
        `AssetCheckout. IT has been notified.`;
      break;
    }
  }

  if (!to || (Array.isArray(to) && to.length === 0)) {
    console.warn(
      `[notification] skipped ${kind} for request ${requestId}: no recipient email`
    );
    return { skipped: true, reason: "no_recipient_email", requestId, kind };
  }

  await sendEmail({ to, subject, text });

  return {
    sent: true,
    kind,
    requestId,
    recipient: Array.isArray(to) ? to : [to],
  };
}