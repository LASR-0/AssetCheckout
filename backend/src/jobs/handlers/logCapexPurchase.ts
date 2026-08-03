import { prisma } from "../../db/prisma.js";
import { sendEmail } from "../../services/email.js";
import { getSetting } from "../../services/settings.js";
import { getSnipeUser } from "../../services/snipeitassets.js";

///  +-----------------------------------------------------------------+
///  |               LOG A PURCHASE TO THE CAPEX LEDGER                |
///  +-----------------------------------------------------------------+
//
//  A purchase over the threshold has to be recorded in the CAPEX table. That
//  table is financial: it does not care what was bought, only that money was
//  committed — so unlike the ordering ledger there is no per-kind split here,
//  one destination takes everything that qualifies.
//
//  IN PRACTICE THAT MEANS NON-STANDARD ACCESSORIES ONLY. Assets are ordered by
//  the department separately and lodged in CAPEX by hand, so nothing on the
//  asset side reaches this job. The guards below say so positively rather than
//  by omission, so an asset can never arrive here by accident if the flow
//  changes shape later.
//
//  THIS IS NOT THE ORDERING LEDGER. syncRequestsToSharepoint is a nightly
//  sweep of ASSET requests that drives purchasing; its accessory skip-guard is
//  deliberate and permanent. This is a different destination with its own
//  guard and its own marker column, and it does not touch that one.
//
//  Event-driven rather than scheduled. It is enqueued the moment a manager
//  accepts a quote, which is the moment the money is committed — so it needs
//  no cron expression, and cannot become a schedule that was registered in one
//  place but never seeded in the other.
//
//  Transport matches the ordering ledger: marker-wrapped JSON emailed to the
//  SharePoint service mailbox, where a Power Automate flow parses it and
//  creates the list item. It shares the mailbox with the ordering sync and is
//  told apart by its OWN markers and subject prefix, so the two flows filter
//  cleanly and a CAPEX row can never be mistaken for an ordering row.
//
//  Exactly-once: `loggedToCapexAt` is stamped only AFTER a successful send, so
//  a failure leaves it null and the retry budget picks it up again. Same
//  watermark discipline as syncedToSharepointAt.
///  +-----------------------------------------------------------------+

const SHAREPOINT_SYNC_TO = (process.env.SHAREPOINT_SYNC_TO ?? "").trim();

// Deliberately different from the ordering sync's markers. One mailbox, two
// flows: the marker is what tells them apart, so these strings are part of the
// contract with Power Automate and must not be changed casually.
const PAYLOAD_START = "=== ASSETCHECKOUT-CAPEX-START ===";
const PAYLOAD_END = "=== ASSETCHECKOUT-CAPEX-END ===";

function buildPayloadBody(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return (
    `KSB Checkout — CAPEX purchase log.\n` +
    `This is an automated machine-readable message. Do not reply.\n\n` +
    `${PAYLOAD_START}\n${json}\n${PAYLOAD_END}\n`
  );
}

/** The configured threshold, falling back to $1,000 if the setting is unusable. */
async function capexThreshold(): Promise<number> {
  const raw = await getSetting("purchase_log_threshold");
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

/**
 * LOG_CAPEX_PURCHASE handler.
 *
 * Payload: { requestId: number }.
 *
 * Skip vs fail, on the same terms as the notification handler: anything a
 * retry cannot fix (not qualifying, already logged, no mailbox configured)
 * returns a skip summary and Completes; a failed send throws so the runner
 * retries with backoff and the failure is visible in the job history.
 */
export async function logCapexPurchaseHandler(
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const requestId = Number(payload.requestId);
  if (!Number.isFinite(requestId)) {
    return { skipped: true, reason: "invalid_payload", payload };
  }

  // Master toggle, mirroring sharepoint_sync_enabled — off until the Power
  // Automate flow that reads the CAPEX marker actually exists, so this never
  // mails a payload nothing is listening for.
  const enabled = (await getSetting("capex_log_enabled")) === "true";
  if (!enabled) {
    return { skipped: true, reason: "capex_log_disabled", requestId };
  }

  if (!SHAREPOINT_SYNC_TO) {
    console.warn("[capex-log] SHAREPOINT_SYNC_TO is not set — skipping.");
    return { skipped: true, reason: "no_target_mailbox", requestId };
  }

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    include: { quoteDetail: true },
  });

  if (!request) {
    return { skipped: true, reason: "request_not_found", requestId };
  }
  if (request.loggedToCapexAt) {
    return { skipped: true, reason: "already_logged", requestId };
  }

  // Positive guards, not exclusions. Only a non-standard accessory with an
  // accepted quote represents a committed department spend, and only that
  // combination belongs in this ledger.
  if (request.requestKind !== "ACCESSORY" || request.requestType !== "NON_STANDARD") {
    return {
      skipped: true,
      reason: "not_a_non_standard_accessory",
      requestId,
      requestKind: request.requestKind,
      requestType: request.requestType,
    };
  }

  const quote = request.quoteDetail;
  if (!quote || quote.status !== "ACCEPTED") {
    return {
      skipped: true,
      reason: "quote_not_accepted",
      requestId,
      quoteStatus: quote?.status ?? null,
    };
  }

  const threshold = await capexThreshold();
  // Strictly greater than: "over $1k" means a purchase AT the threshold is
  // not over it.
  if (!(quote.amount > threshold)) {
    return {
      skipped: true,
      reason: "under_threshold",
      requestId,
      amount: quote.amount,
      threshold,
    };
  }

  // Best-effort, exactly as the ordering sync does it — a Snipe lookup failure
  // should not cost us the ledger row.
  let managerName: string | null = null;
  try {
    const user = await getSnipeUser(request.managerId);
    managerName = user?.name ?? null;
  } catch (err) {
    console.warn(
      `[capex-log] manager lookup failed for id ${request.managerId}: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  // Flattened rather than nested, so the Power Automate flow maps straight
  // from top-level keys to columns without walking into an object.
  const capexPayload: Record<string, unknown> = {
    requestId: request.id,
    requestKind: request.requestKind,
    requestType: request.requestType,
    categoryId: request.categoryId,
    categoryName: request.categoryName,
    userId: request.userId,
    userName: request.userName,
    managerId: request.managerId,
    managerName: managerName ?? request.manager ?? null,
    preferredModel: request.preferredModel,
    amount: quote.amount,
    supplier: quote.supplier,
    quoteReference: quote.reference,
    quoteSentBy: quote.sentBy,
    quoteSentAt: quote.sentAt,
    quoteAcceptedBy: quote.respondedBy,
    quoteAcceptedAt: quote.respondedAt,
    quoteAcceptedOnBehalf: quote.respondedOnBehalf,
    threshold,
    requestedAt: request.createdAt,
  };

  await sendEmail({
    to: SHAREPOINT_SYNC_TO,
    subject: `[KSB Checkout CAPEX] Request ${request.id} — ${request.userName} — ${quote.amount}`,
    text: buildPayloadBody(capexPayload),
  });

  // Stamped ONLY after the send succeeds → exactly-once.
  await prisma.request.update({
    where: { id: request.id },
    data: { loggedToCapexAt: new Date() },
  });

  return {
    logged: true,
    requestId,
    amount: quote.amount,
    threshold,
    recipient: SHAREPOINT_SYNC_TO,
  };
}
