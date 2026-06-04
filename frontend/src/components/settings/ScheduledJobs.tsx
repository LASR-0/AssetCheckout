import { useEffect, useState } from "react";
import {
  enqueueJob,
  getDryRunStates,
  setDryRun,
  getJobSchedules,
  saveJobSchedule,
  type JobType,
  type DryRunStates,
} from "@/api/jobs";
import ScheduledJobRow from "./ScheduledJobRow";

///  +-----------------------------------------------------------------+
///  |                     SCHEDULED JOBS CARD                         |
///  +-----------------------------------------------------------------+
//
//  Owns all data for the Background Jobs section: the saved schedules
//  (scheduleMap: jobType -> { cron, settingKey }), the dry-run states, and the
//  shared feedback line. Renders one ScheduledJobRow per job and passes the
//  relevant slices + action callbacks down.
//
//  Saves are optimistic: after a successful write the local state is updated
//  from the server's response (no refetch), so badges reflect the new value
//  immediately.
///  +-----------------------------------------------------------------+

type ScheduledJob = {
  type: JobType;
  label: string;
  description: string;
};

const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    type: "REFRESH_CATEGORIES_CACHE",
    label: "Refresh Categories Cache",
    description: "Re-fetches the asset category list from Snipe-IT.",
  },
  {
    type: "REFRESH_PRICES_CACHE",
    label: "Refresh Prices Cache",
    description: "Re-fetches the hardware list used for tier price averages.",
  },
  {
    type: "CLEANUP_STALE_REQUESTS",
    label: "Cleanup Stale Requests",
    description:
      "Auto-rejects non-terminal requests with no activity past the staleness window.",
  },
  {
    type: "CLEANUP_ORPHAN_SNIPE_MODELS",
    label: "Cleanup Orphan Models",
    description:
      "Deletes Snipe models whose skeleton asset was removed, and rejects the stranded request.",
  },
  {
    type: "PURGE_OLD_JOB_HISTORY",
    label: "Purge Old Job History",
    description: "Deletes completed/failed job rows past the retention window.",
  },
];

type Feedback = { text: string; ok: boolean };

type ScheduledJobsCardProps = {
  onQueued?: () => void;
};

export default function ScheduledJobsCard({ onQueued }: ScheduledJobsCardProps) {
  const [running, setRunning] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState<string | null>(null);
  const [savingDryRun, setSavingDryRun] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // jobType -> { cron, settingKey }
  const [scheduleMap, setScheduleMap] = useState<
    Record<string, { cron: string; settingKey: string }>
  >({});
  const [dryRunStates, setDryRunStates] = useState<DryRunStates>({});

  useEffect(() => {
    getJobSchedules()
      .then((r) => {
        const map: Record<string, { cron: string; settingKey: string }> = {};
        for (const s of r.schedules) map[s.jobType] = { cron: s.cron, settingKey: s.settingKey };
        setScheduleMap(map);
      })
      .catch(() => setScheduleMap({}));
  }, []);

  useEffect(() => {
    getDryRunStates()
      .then((r) => setDryRunStates(r.states ?? {}))
      .catch(() => setDryRunStates({}));
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

  async function saveSchedule(job: ScheduledJob, settingKey: string, cron: string) {
    setSavingSchedule(job.type);
    setFeedback(null);
    try {
      const res = await saveJobSchedule(settingKey, cron);
      // Optimistic update from the response — no refetch.
      setScheduleMap((prev) => ({
        ...prev,
        [job.type]: { cron: res.cron, settingKey: res.settingKey },
      }));
      setFeedback({
        text: res.note ?? `${job.label} schedule updated`,
        ok: true,
      });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Failed to update schedule",
        ok: false,
      });
    } finally {
      setSavingSchedule(null);
    }
  }

  async function toggleDryRun(job: ScheduledJob, next: boolean) {
    setSavingDryRun(job.type);
    setFeedback(null);
    try {
      await setDryRun(job.type, next);
      setDryRunStates((prev) => ({ ...prev, [job.type]: next }));
      setFeedback({
        text: `${job.label} set to ${next ? "dry-run" : "live"}`,
        ok: true,
      });
    } catch (err) {
      setFeedback({
        text: err instanceof Error ? err.message : "Failed to update dry-run mode",
        ok: false,
      });
    } finally {
      setSavingDryRun(null);
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
        {SCHEDULED_JOBS.map((job) => {
          const schedule = scheduleMap[job.type];
          const hasDryRun = job.type in dryRunStates;
          return (
            <ScheduledJobRow
              key={job.type}
              type={job.type}
              label={job.label}
              description={job.description}
              settingKey={schedule?.settingKey}
              savedCron={schedule?.cron}
              dryRun={hasDryRun ? dryRunStates[job.type] : undefined}
              running={running === job.type}
              savingSchedule={savingSchedule === job.type}
              savingDryRun={savingDryRun === job.type}
              onTrigger={() => trigger(job)}
              onSaveSchedule={(settingKey, cron) => saveSchedule(job, settingKey, cron)}
              onToggleDryRun={(next) => toggleDryRun(job, next)}
            />
          );
        })}
      </div>
    </div>
  );
}