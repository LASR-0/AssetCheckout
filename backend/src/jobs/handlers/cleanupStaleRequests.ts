import { findStaleRequests, rejectRequest } from "../../services/request.js";
import { getSetting } from "../../services/settings.js";

const DEFAULT_STALE_MONTHS = 6;

// Recorded in rejectedBy so automated rejections are distinguishable from a
// human rejecter's name in the UI.
const AUTOMATED_ACTOR = "Automated Job";
const STALE_REASON = "Rejected by automated system; Stale Request";

/**
 * CLEANUP_STALE_REQUESTS handler.
 *
 * Auto-rejects non-terminal requests (PENDING / APPROVED) with no activity
 * for jobs.staleRequestMonths (default 6). "Activity" = the request's
 * updatedAt, or — once a non-standard request is approved and its
 * ModelRequest exists — the later of the two updatedAt fields, since
 * post-approval work touches the ModelRequest row, not the Request row
 * (see findStaleRequests).
 *
 * Reuses rejectRequest so automated and manual rejections behave identically.
 * rejectRequest overwrites `reason`, so we rebuild the same string the manual
 * flow produces. No Snipe-IT work happens — a skeleton asset on an abandoned
 * non-standard request is left for CLEANUP_ORPHAN_SNIPE_MODELS.
 *
 * Registered with maxAttempts: 1 (ONE_SHOT_JOBS); the daily schedule is the
 * retry — stragglers are still non-terminal next run.
 */
export async function cleanupStaleRequestsHandler(): Promise<Record<string, unknown>> {
  const raw = await getSetting("jobs.staleRequestMonths");
  const months = Number(raw) > 0 ? Number(raw) : DEFAULT_STALE_MONTHS;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);

  const stale = await findStaleRequests(cutoff);

  let rejected = 0;
  const failures: string[] = [];

  for (const request of stale) {
    // Same shape as the manual reject flow:
    //   "REJECTED: <reason>\n REQUEST: <original reason>"
    const reason =
      "REJECTED: " + STALE_REASON + "\n REQUEST: " + (request.reason ?? "");
    try {
      await rejectRequest(request.id, AUTOMATED_ACTOR, reason);
      rejected++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`#${request.id}: ${msg}`);
    }
  }

  // Only flag the run as failed if NOTHING succeeded (systemic problem). A
  // partial failure — e.g. one request raced to a terminal state between the
  // scan and the reject — is reported in the summary but doesn't red-flag an
  // otherwise-successful sweep.
  if (rejected === 0 && failures.length > 0) {
    throw new Error(
      `Stale cleanup failed for all ${failures.length} candidate(s). First: ${failures[0]}`
    );
  }

  return {
    cutoffDate: cutoff.toISOString(),
    staleMonths: months,
    found: stale.length,
    rejected,
    failed: failures.length,
    firstError: failures[0] ?? null,
  };
}