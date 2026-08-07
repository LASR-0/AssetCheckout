import { prisma } from "../../db/prisma.js";
import { getSetting } from "../../services/settings.js";
import { purgeOldEvents } from "../../services/troubleshootingAnalytics.js";

const BATCH_SIZE = 500;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_TROUBLESHOOTING_RETENTION_DAYS = 365;

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
 *
 * ALSO SWEEPS TROUBLESHOOTING EVENTS. They ride along here rather than in a
 * job of their own because a second nightly cron doing one deleteMany is
 * ceremony for its own sake — this job is already "the thing that stops
 * tables growing forever", and the alternative is another scheduler entry and
 * another row in Settings for admins to reason about. They keep their own
 * retention window, which is much longer: job history answers "what happened
 * last week", troubleshooting events answer "which articles earned their
 * place", and that needs seasons rather than weeks.
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

  // Its own window, and its own failure boundary: a problem sweeping
  // analytics must not make the job report a failed job-history purge that
  // actually succeeded.
  const tsRaw = await getSetting("troubleshooting.retentionDays");
  const tsRetentionDays =
    Number(tsRaw) > 0 ? Number(tsRaw) : DEFAULT_TROUBLESHOOTING_RETENTION_DAYS;

  let troubleshootingDeleted: number | null = null;
  try {
    troubleshootingDeleted = await purgeOldEvents(tsRetentionDays);
  } catch (err) {
    console.error("[purgeOldJobHistory] troubleshooting event sweep failed:", err);
  }

  return {
    deleted: totalDeleted,
    cutoffDate: cutoff.toISOString(),
    retentionDays,
    troubleshootingDeleted,
    troubleshootingRetentionDays: tsRetentionDays,
  };
}