import { prisma } from "../../db/prisma.js";
import { getSetting } from "../../services/settings.js";

const BATCH_SIZE = 500;
const DEFAULT_RETENTION_DAYS = 90;

/**
 * PURGE_OLD_JOB_HISTORY handler.
 *
 * Deletes old BackgroundJob rows to stop the table growing unbounded. Runs
 * on the schedule defined by jobs.purgeHistoryCron (default daily at 3am).
 *
 * Only terminal-state jobs are eligible — Completed and Failed.
 *
 * Age is measured by createdAt against a cutoff of now minus
 * jobs.historyRetentionDays (default 90).
 *
 * Returns the number deleted, the cutoff date, and the retention window so
 * the job history shows what was swept.
 */
export async function purgeOldJobHistoryHandler(): Promise<Record<string, unknown>> {
  const raw = await getSetting("jobs.historyRetentionDays");
    /*
    *  minimal retnetion days can be 1 by desogm, if set to 0 the job will default back to 90.
    *  besides the point if you set retion days to 0 your jobs history will delete daily at 3am.
    *  if you want to delete history daily, change 0 in the line below too allow it or change constant DEFAULT_RETENTION_DAYS.
    */
  const retentionDays = Number(raw) > 0 ? Number(raw) : DEFAULT_RETENTION_DAYS;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  let totalDeleted = 0;

  while (true) {
    const batch = await prisma.backgroundJob.findMany({
      where: {
        status: { in: ["Completed", "Failed"] },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const ids = batch.map((row) => row.id);
    const result = await prisma.backgroundJob.deleteMany({
      where: { id: { in: ids } },
    });

    totalDeleted += result.count;

    if (batch.length < BATCH_SIZE) break;
  }

  return {
    deleted: totalDeleted,
    cutoffDate: cutoff.toISOString(),
    retentionDays,
  };
}