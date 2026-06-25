import { findShippedAwaitingReceipt, setReminderStage } from "../../services/request.js";
import { getSetting } from "../../services/settings.js";
import { enqueue } from "../jobQueue.js";
import { maxAttemptsFor } from "../policy.js";

const DEFAULTS = { d1: 7, d2: 14, d3: 30 };

function readDays(raw: string | null, fallback: number): number {
  const n = Number(raw);
  return n > 0 ? n : fallback;
}

/** Whole days elapsed since `from` until now. */
function daysSince(from: Date): number {
  const ms = Date.now() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * REMIND_SHIPPED_REQUESTS handler.
 *
 * Scans shipped-but-unreceived requests and escalates received-reminders:
 *   stage 1 (>= reminder_days_1): nudge the user
 *   stage 2 (>= reminder_days_2): nudge the user again
 *   stage 3 (>= reminder_days_3): escalate to user AND admins (overdue)
 *
 * Each request carries reminderStage (0..3). A reminder fires only when the
 * DUE stage (highest threshold the elapsed time has crossed) exceeds the
 * stage already recorded — so a daily run never re-sends, and a request that
 * crosses several thresholds in one gap jumps straight to its highest due
 * stage (only the current-reality reminder fires; superseded ones are
 * skipped). The cron ENQUEUES SEND_REQUEST_NOTIFICATION jobs; the sending and
 * recipient resolution live in that handler (SHIPMENT_OVERDUE fans out to the
 * user and admins there).
 *
 * ONE_SHOT (maxAttempts 1) — the daily schedule is the retry.
 */
export async function remindShippedRequestsHandler(): Promise<Record<string, unknown>> {
  const [r1, r2, r3] = await Promise.all([
    getSetting("reminder_days_1"),
    getSetting("reminder_days_2"),
    getSetting("reminder_days_3"),
  ]);
  const d1 = readDays(r1, DEFAULTS.d1);
  const d2 = readDays(r2, DEFAULTS.d2);
  const d3 = readDays(r3, DEFAULTS.d3);

  const candidates = await findShippedAwaitingReceipt();

  let remindersSent = 0;
  let escalations = 0;
  const failures: string[] = [];

  for (const request of candidates) {
    if (!request.shippedAt) continue; // type-guard; scan already filters

    const days = daysSince(request.shippedAt);

    // Highest threshold crossed → due stage.
    let dueStage = 0;
    if (days >= d3) dueStage = 3;
    else if (days >= d2) dueStage = 2;
    else if (days >= d1) dueStage = 1;

    if (dueStage === 0 || dueStage <= request.reminderStage) {
      continue; // not due, or this stage already sent
    }

    const kind = dueStage === 3 ? "SHIPMENT_OVERDUE" : "SHIPMENT_REMINDER";

    try {
      await enqueue(
        "SEND_REQUEST_NOTIFICATION",
        { requestId: request.id, kind },
        { maxAttempts: maxAttemptsFor("SEND_REQUEST_NOTIFICATION") }
      );
      await setReminderStage(request.id, dueStage);
      if (dueStage === 3) escalations++;
      else remindersSent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`#${request.id}: ${msg}`);
    }
  }

  if (remindersSent === 0 && escalations === 0 && failures.length > 0) {
    throw new Error(
      `Shipment reminders failed for all ${failures.length} candidate(s). First: ${failures[0]}`
    );
  }

  return {
    thresholds: { d1, d2, d3 },
    scanned: candidates.length,
    remindersSent,
    escalations,
    failed: failures.length,
    firstError: failures[0] ?? null,
  };
}