import cron from "node-cron";
import { enqueue } from "./jobQueue.js";
import { getSetting } from "../services/settings.js";
import type { JobType } from "../../generated/prisma_client/client.js";
import { maxAttemptsFor } from "./policy.js";

///  +-----------------------------------------------------------------+
///  |                         SCHEDULER                               |
///  +-----------------------------------------------------------------+

/**
 * Registers recurring jobs with node-cron. Each cron callback does exactly
 * one thing: enqueue() a job. It never runs job logic directly — all actual
 * work happens in the poll runner's tick(), so scheduled and manual triggers
 * flow through the same execution path.
 *
 * Cron expressions are read from settings (seeded from JOBS_*_CRON env vars
 * or their defaults). Note: schedules are registered ONCE at startup, so
 * changing a cron expression via the admin UI requires an app restart to
 * take effect. This is an accepted limitation — schedule changes are rare.
 *
 * The job type → settings key mapping for the schedule of each job:
 */
export const SCHEDULE_KEYS: Record<string, JobType> = {
  "jobs.refreshCategoriesCron": "REFRESH_CATEGORIES_CACHE",
  "jobs.refreshPricesCron": "REFRESH_PRICES_CACHE",
  "jobs.cleanupStaleCron": "CLEANUP_STALE_REQUESTS",
  "jobs.cleanupOrphanCron": "CLEANUP_ORPHAN_SNIPE_MODELS",
  "jobs.purgeHistoryCron": "PURGE_OLD_JOB_HISTORY",
  "jobs.shipmentReminderCron": "REMIND_SHIPPED_REQUESTS",
};


export async function startScheduler(): Promise<void> {
  let registered = 0;

  for (const [settingKey, jobType] of Object.entries(SCHEDULE_KEYS)) {
    const expression = await getSetting(settingKey);

    if (!expression) {
      console.warn(
        `[Scheduler] No cron expression for ${settingKey}; skipping ${jobType}`
      );
      continue;
    }

    if (!cron.validate(expression)) {
      console.error(
        `[Scheduler] Invalid cron expression "${expression}" for ${settingKey}; skipping ${jobType}`
      );
      continue;
    }

    const maxAttempts = maxAttemptsFor(jobType);

    cron.schedule(expression, () => {
      enqueue(jobType, undefined, { maxAttempts }).catch((err) =>
        console.error(`[Scheduler] Failed to enqueue ${jobType}:`, err)
      );
    });

    registered++;
  }

  console.log(`[Scheduler] Started — ${registered} scheduled job(s) registered`);
}