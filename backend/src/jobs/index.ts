import { registerHandler, startRunner } from "./jobRunner.js";
import { startScheduler } from "./scheduler.js";
import { refreshCategoriesCacheHandler } from "./handlers/refreshCategoriesCache.js";
import { refreshPricesCacheHandler } from "./handlers/refreshPricesCache.js";
import { purgeOldJobHistoryHandler } from "./handlers/purgeOldJobHistory.js";

///  +-----------------------------------------------------------------+
///  |                    JOB SYSTEM ENTRY POINT                       |
///  +-----------------------------------------------------------------+

/**
 * Boot the background job system. Called once at server startup from
 * server.ts, after ensureDefaults() (the runner and scheduler both read
 * job settings, which must be seeded first).
 *
 * Order:
 *   1. Register all job handlers
 *   2. Start the poll runner (also runs stuck-job recovery)
 *   3. Start the cron scheduler
 */
export async function startJobs(): Promise<void> {
  registerHandler("REFRESH_CATEGORIES_CACHE", refreshCategoriesCacheHandler);
  registerHandler("REFRESH_PRICES_CACHE", refreshPricesCacheHandler);
  registerHandler("PURGE_OLD_JOB_HISTORY", purgeOldJobHistoryHandler)
  // Not yet implemented (enqueueing these will fail with "no handler" until
  // their handlers land in later commits):
  //   SEND_REQUEST_NOTIFICATION
  //   SYNC_REQUEST_TO_SHAREPOINT
  //   CLEANUP_STALE_REQUESTS
  //   CLEANUP_ORPHAN_SNIPE_MODELS

  await startRunner();
  await startScheduler();

  console.log("[Jobs] Background job system started");
}