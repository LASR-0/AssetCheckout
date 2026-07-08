import { prisma } from "../../db/prisma.js";
import { sendEmail } from "../../services/email.js";
import { getSetting } from "../../services/settings.js";
import { getSnipeUser } from "../../services/snipeit.js";

///  +-----------------------------------------------------------------+
///  |              SYNC REQUESTS TO SHAREPOINT (cron)                 |
///  +-----------------------------------------------------------------+
//
//  Nightly request-ledger sync. SharePoint is an append-only ledger of
//  request DETAILS (not lifecycle state), so each request is sent exactly
//  ONCE — the watermark column `syncedToSharepointAt` marks a request as
//  synced and excludes it from future runs.
//
//  Transport is the SMTP relay: each request's full row (plus a resolved
//  managerName) is serialised as marker-wrapped JSON and emailed to the
//  SharePoint service mailbox (SHAREPOINT_SYNC_TO). A Power Automate flow
//  triggers on that mailbox, extracts the JSON between the markers, maps the
//  fields (decoding enums/booleans, resolving the tablet/phone filter), and
//  creates the SharePoint list item. All mapping/filtering lives in the flow;
//  the backend's only job is to reliably emit the data.
//
//  Exactly-once + retry:
//    - A request is stamped `syncedToSharepointAt` only AFTER its send
//      succeeds, so a failure leaves it NULL and the next run retries it.
//    - Within a run, failures are caught per-request so one bad send doesn't
//      block the rest. If ANY failed, the handler throws at the end → the job
//      is marked Failed and retried per the standard budget (3 attempts).
//      Anything still failing after that stays NULL and is picked up by the
//      next scheduled run.
///  +-----------------------------------------------------------------+

const SHAREPOINT_SYNC_TO = (process.env.SHAREPOINT_SYNC_TO ?? "").trim();

const PAYLOAD_START = "=== ASSETCHECKOUT-PAYLOAD-START ===";
const PAYLOAD_END = "=== ASSETCHECKOUT-PAYLOAD-END ===";

/** Build the marker-wrapped JSON email body for one request. The body is
 *  machine-read by Power Automate (plain text, no HTML) — the markers let the
 *  flow extract the JSON unambiguously regardless of any surrounding text. */
function buildPayloadBody(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  return (
    `KSB Checkout — request ledger sync.\n` +
    `This is an automated machine-readable message. Do not reply.\n\n` +
    `${PAYLOAD_START}\n${json}\n${PAYLOAD_END}\n`
  );
}

export async function syncRequestsToSharepointHandler(
  _payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  // Master toggle — off by default; enabled once the Power Automate flow is live.
  const enabled = (await getSetting("sharepoint_sync_enabled")) === "true";
  if (!enabled) {
    return { skipped: true, reason: "sync_disabled" };
  }

  if (!SHAREPOINT_SYNC_TO) {
    console.warn("[sharepoint-sync] SHAREPOINT_SYNC_TO is not set — skipping.");
    return { skipped: true, reason: "no_target_mailbox" };
  }

  // Unsynced backlog. No `include` → just the Request table's own columns,
  // which is exactly the ledger payload we want (no related modelRequest etc).
  const pending = await prisma.request.findMany({
    where: { syncedToSharepointAt: null },
    orderBy: { id: "asc" },
  });

  if (pending.length === 0) {
    return { synced: 0, failed: 0, note: "nothing to sync" };
  }

  // Cache manager lookups within a run — many requests can share a manager,
  // so we avoid hammering Snipe for the same id repeatedly.
  const managerNameCache = new Map<number, string | null>();

  async function resolveManagerName(managerId: unknown): Promise<string | null> {
    const id = Number(managerId);
    if (!Number.isFinite(id)) return null;
    if (managerNameCache.has(id)) return managerNameCache.get(id) ?? null;
    let name: string | null = null;
    try {
      const user = await getSnipeUser(id);
      name = user?.name ?? null;
    } catch (err) {
      // A manager lookup failure shouldn't abort the request's sync — the
      // ledger can record a null managerName rather than miss the row. Log it.
      console.warn(
        `[sharepoint-sync] manager lookup failed for id ${id}: ${err instanceof Error ? err.message : String(err)}`
      );
      name = null;
    }
    managerNameCache.set(id, name);
    return name;
  }

  let synced = 0;
  const failures: { id: number; error: string }[] = [];

  for (const request of pending) {
    try {
      const managerName = await resolveManagerName(request.managerId);

      // Full request row + resolved managerName. Dates serialise to ISO via
      // JSON.stringify; Power Automate formats them for SharePoint.
      const payload: Record<string, unknown> = { ...request, managerName };

      await sendEmail({
        to: SHAREPOINT_SYNC_TO,
        subject: `[KSB Checkout Sync] Request ${request.id} — ${request.userName}`,
        text: buildPayloadBody(payload),
      });

      // Stamp ONLY after a successful send → exactly-once.
      await prisma.request.update({
        where: { id: request.id },
        data: { syncedToSharepointAt: new Date() },
      });

      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sharepoint-sync] failed to sync request ${request.id}: ${msg}`);
      failures.push({ id: request.id, error: msg });
      // Continue — don't let one failure block the rest of tonight's batch.
    }
  }

  // If anything failed, throw so the runner marks the job Failed and applies
  // the retry budget. Successfully-synced requests are already stamped, so a
  // retry re-scans and only re-attempts the still-NULL ones.
  if (failures.length > 0) {
    throw new Error(
      `SharePoint sync completed with ${failures.length} failure(s) ` +
        `(synced ${synced}): ${failures.map((f) => `#${f.id}`).join(", ")}`
    );
  }

  return { synced, failed: 0 };
}