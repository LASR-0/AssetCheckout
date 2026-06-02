import { useState } from "react";
import { enqueueJob, type JobType } from "@/api/jobs";

///  +-----------------------------------------------------------------+
///  |                     SCHEDULED JOBS CARD                         |
///  +-----------------------------------------------------------------+
//
//  Lists the jobs an admin can trigger on demand. Each "Run now" POSTs to
//  /api/jobs; the backend jumps the queue (priority) and dedups, so a job
//  already pending returns enqueued: false and we show "already queued".
//
//  Only jobs whose handlers are implemented (and allowed by the backend's
//  MANUALLY_TRIGGERABLE set) appear here. As handlers land, add them below.
//
//  onQueued (optional) fires after any successful POST so a parent can
//  refresh a sibling view (e.g. JobHistoryTable) to reflect the new run.
///  +-----------------------------------------------------------------+

type ScheduledJob = {
  type: JobType;
  label: string;
  description: string;
  schedule: string;
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
    type: "PURGE_OLD_JOB_HISTORY",
    label: "Purge Old Job History",
    description: "Deletes completed/failed job rows past the retention window.",
    schedule: "Quarterly at 3am",
  },
];

type Feedback = { text: string; ok: boolean };

type ScheduledJobsCardProps = {
  /** Called after a successful enqueue, so the parent can refresh related views. */
  onQueued?: () => void;
};

export default function ScheduledJobsCard({ onQueued }: ScheduledJobsCardProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function trigger(job: ScheduledJob) {
    setRunning(job.type);
    setFeedback(null);
    try {
      const res = await enqueueJob(job.type);
      setFeedback({
        text: res.enqueued
          ? `${job.label} queued`
          : `${job.label} is already queued`,
        ok: true,
      });
      // Refresh the history view either way: a fresh enqueue adds a row, and a
      // dedup means there's already a pending row worth surfacing.
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
                <span className="font-semibold text-on-background text-sm">
                  {job.label}
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400">
                  <span className="material-symbols-outlined !text-[14px]">schedule</span>
                  {job.schedule}
                </span>
              </div>
              <p className="text-xs text-info-light mt-0.5">{job.description}</p>
            </div>
            <button
              onClick={() => trigger(job)}
              disabled={running === job.type}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-md bg-filter/30 hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span className="material-symbols-outlined !text-[16px]">
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