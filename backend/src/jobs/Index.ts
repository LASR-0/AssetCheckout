import { startRunner } from "./JobRunner.js";
import { startScheduler } from "./Scheduler.js";

///  +-----------------------------------------------------------------+
///  |                    JOB SYSTEM ENTRY POINT                       |
///  +-----------------------------------------------------------------+

/**
 * Boot the background job system. Called once at server startup from
 * server.ts, after ensureDefaults() (the runner and scheduler both read
 * job settings, which must be seeded first).
 *
 * Order:
 *   1. Register all job handlers (none yet — added in later commits)
 *   2. Start the poll runner (also runs stuck-job recovery)
 *   3. Start the cron scheduler
 *
 * Handlers are registered here via registerHandler() from jobRunner. Until
 * a handler is registered for a given JobType, any job of that type that
 * gets enqueued will fail with "No handler registered" — expected during
 * the build-out while handlers are still being added.
 */
export async function startJobs(): Promise<void> {
  // ---- Handler registration ----
  // (none yet — refreshCategoriesCache, refreshPricesCache, purgeOldJobHistory,
  //  and the rest are registered here as they're implemented in later commits)

  await startRunner();
  await startScheduler();

  console.log("[Jobs] Background job system started");
}