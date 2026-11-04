import type { JobType } from "../../generated/prisma_client/client.js";

///  +-----------------------------------------------------------------+
///  |                        JOB POLICY                               |
///  +-----------------------------------------------------------------+

/**
 * Jobs that shouldn't be retried when they fail — they'll just run again on
 * their next scheduled tick (or next manual trigger), so retrying within the
 * same run adds no value. Cache refreshes and cleanups fall in this bucket.
 *
 * Single source of truth for one-shot policy, consulted by BOTH the scheduler
 * (cron enqueues) and the POST /api/jobs route (manual enqueues), so a job's
 * retry behaviour is identical no matter how it was triggered.
 */
export const ONE_SHOT_JOBS: Set<JobType> = new Set([
  "REFRESH_CATEGORIES_CACHE",
  "REFRESH_PRICES_CACHE",
  "REFRESH_ACCESSORIES_CACHE",
  "CLEANUP_STALE_REQUESTS",
  "CLEANUP_ORPHAN_SNIPE_MODELS",
  "PURGE_OLD_JOB_HISTORY",
  "REMIND_SHIPPED_REQUESTS",
  "REMIND_LOAN_RETURNS",
  // Idempotent and re-runnable by hand; an auto-retry inside one run would
  // just re-hammer Snipe with the lookups that already failed.
  "BACKFILL_REQUEST_LOCATIONS",
]);

export const DRY_RUN_JOBS: Partial<Record<JobType, string>> = {
  CLEANUP_ORPHAN_SNIPE_MODELS: "jobs.orphanCleanupDryRun",
};

/**
 * Jobs that delete for real, the setting capping how many records one run
 * may delete, and the cap when it's unset. The cap is the second safety
 * after dry-run: a live run that misjudges what's an orphan stops short.
 */
export const MAX_DELETE_JOBS: Partial<Record<JobType, { key: string; fallback: number }>> = {
  CLEANUP_ORPHAN_SNIPE_MODELS: { key: "jobs.orphanCleanupMaxDeletes", fallback: 5 },
};

/** maxAttempts for a job type: 1 for one-shots, 3 otherwise. */
export function maxAttemptsFor(type: JobType): number {
  return ONE_SHOT_JOBS.has(type) ? 1 : 3;
}