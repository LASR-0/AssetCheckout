import { useEffect, useState } from "react";
import { enqueueJob, getOrphanDryRun, type JobType } from "@/api/jobs";

///  +-----------------------------------------------------------------+
///  |                     SCHEDULED JOBS CARD                         |
///  +-----------------------------------------------------------------+
//
//  Lists the jobs an admin can trigger on demand. Each "Run now" POSTs to
//  /api/jobs; the backend jumps the queue (priority), applies one-shot retry
//  policy, and dedups (an already-pending job returns enqueued: false).
//
//  The orphan-cleanup job carries a dry-run/live badge so an admin can see,
//  before clicking, whether a manual run will actually delete models or only
//  report what it would do. The live state is read from the backend.
//
//  onQueued (optional) fires after any successful POST so a parent can
//  refresh a sibling view (e.g. JobHistoryTable).
///  +-----------------------------------------------------------------+

type ScheduledJob = {
  type: JobType;
  label: string;
  description: string;
  schedule: string;
  destructive?: boolean; // shows the dry-run/live badge
};

const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    type: "REFRESH_CATEGORIES_CACHE",
    label: "Refresh Categories Cache",
    description: "Re-fetches the asset category list from Snipe-IT.",
    schedule: "Hourly",
  },
  {
    type: "REFRESH_PRICES_CACHE",
    label: "Refresh Prices Cache",
    description: "Re-fetches the hardware list used for tier price averages.",
    schedule: "Every 10 minutes",
  },
  {
    type: "CLEANUP_STALE_REQUESTS",
    label: "Cleanup Stale Requests",
    description:
      "Auto-rejects non-terminal requests with no activity past the staleness window.",
    schedule: "Daily at midnight",
  },
  {
    type: "CLEANUP_ORPHAN_SNIPE_MODELS",
    label: "Cleanup Orphan Models",
    description:
      "Deletes Snipe models whose skeleton asset was removed, and rejects the stranded request.",
    schedule: "Weekly, Sunday 2am",
    destructive: true,
  },
  {
    type: "PURGE_OLD_JOB_HISTORY",
    label: "Purge Old Job History",
    description: "Deletes completed/failed job rows past the retention window.",
    schedule: "Daily at 3am",
  },
];

type Feedback = { text: string; ok: boolean };

type ScheduledJobsCardProps = {
  onQueued?: () => void;
};

export default function ScheduledJobsCard({ onQueued }: ScheduledJobsCardProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [orphanDryRun, setOrphanDryRun] = useState<boolean | null>(null);

  useEffect(() => {
    getOrphanDryRun()
      .then((r) => setOrphanDryRun(r.dryRun))
      .catch(() => setOrphanDryRun(null)); // unknown — render no badge
  }, []);

  async function trigger(job: ScheduledJob) {
    setRunning(job.type);
    setFeedback(null);
    try {
      const res = await enqueueJob(job.type);
      setFeedback({
        text: res.enqueued ? `${job.label} queued` : `${job.label} is already queued`,
        ok: true,
      });
      onQueued?.();
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Failed to queue job",
        ok: false,
      });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      {feedback && (
        <p className={`text-sm ${feedback.ok ? "text-green-600" : "text-error"}`}>
          {feedback.text}
        </p>
      )}
      <div className="space-y-3">
        {SCHEDULED_JOBS.map((job) => (
          <div
            key={job.type}
            className="flex items-start justify-between gap-4 rounded-lg border border-outline/20 bg-surface p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-on-background text-sm">{job.label}</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400">
                  <span className="material-symbols-outlined !text-[14px]">schedule</span>
                  {job.schedule}
                </span>
                {job.destructive && orphanDryRun !== null && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                      orphanDryRun
                        ? "bg-green-500/10 text-green-600"
                        : "bg-red-500/10 text-red-600"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[14px]">
                      {orphanDryRun ? "visibility" : "warning"}
                    </span>
                    {orphanDryRun ? "Dry-run" : "Live"}
                  </span>
                )}
              </div>
              <p className="text-xs text-info-light mt-0.5">{job.description}</p>
            </div>
            <button
              onClick={() => trigger(job)}
              disabled={running === job.type}
              className="shrink-0 inline-flex items-center text-nav-tab-selected font-bold gap-1 px-3 py-1.5 text-xs rounded-md bg-surface-container-low hover:brightness-90 dark:hover:brightness-150 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span className="material-symbols-outlined !text-[16px]"
                style={{ fontVariationSettings: "'wght' 900" }}>
                {running === job.type ? "progress_activity" : "play_arrow"}
              </span>
              {running === job.type ? "Queuing…" : "Run now"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}