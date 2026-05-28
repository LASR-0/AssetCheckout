import { prisma } from "../db/prisma.js";
import type { JobType } from "../../generated/prisma_client/client.js";

///  +-----------------------------------------------------------------+
///  |                          ENQUEUE                                |
///  +-----------------------------------------------------------------+

export type EnqueueOptions = {
  /**
   * When true, the job jumps to the front of the queue by setting
   * scheduledAt to the epoch. Used by manual "Run now" triggers from the
   * admin UI. Scheduled (cron-fired) enqueues omit this so they queue
   * normally by arrival time.
   */
  priority?: boolean;

  /**
   * Override the default maxAttempts (3). One-shot jobs that shouldn't be
   * retried (e.g. cache refreshes, stub handlers) pass maxAttempts: 1.
   */
  maxAttempts?: number;
};

/**
 * Add a job to the queue.
 *
 * Deduplication: if an identical Pending job (same type + same payload)
 * already exists, this is a no-op and returns false. This prevents a
 * buildup of redundant jobs when the same work is requested repeatedly in
 * quick succession, and lets the admin UI show "already queued" instead of
 * stacking duplicates.
 *
 * Returns true if a new job row was created, false if it was deduped.
 */
export async function enqueue(
  type: JobType,
  payload?: Record<string, unknown>,
  options: EnqueueOptions = {}
): Promise<boolean> {
  const payloadStr = payload ? JSON.stringify(payload) : null;

  // Dedup against existing Pending jobs of the same type + payload.
  const existing = await prisma.backgroundJob.findFirst({
    where: {
      type,
      status: "Pending",
      payload: payloadStr,
    },
  });
  if (existing) return false;

  await prisma.backgroundJob.create({
    data: {
      type,
      payload: payloadStr,
      scheduledAt: options.priority ? new Date(0) : new Date(),
      maxAttempts: options.maxAttempts ?? 3,
    },
  });

  return true;
}