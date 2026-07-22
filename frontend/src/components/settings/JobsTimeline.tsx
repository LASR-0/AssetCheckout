import { useEffect, useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getJobSchedules, type JobSchedule } from "@/api/jobs";

///  +-----------------------------------------------------------------+
///  |                  SCHEDULED JOBS DAY TIMELINE                    |
///  +-----------------------------------------------------------------+
//
//  Slim, full-width 24-hour strip showing WHEN scheduled jobs fire.
//  Visual language from the Claude Design prototype — solid green
//  dots with a translucent halo, hourly gridlines (stronger every
//  6h), monospace hour labels, red "now" line with a time pill —
//  reworked to stay one row tall and never scroll horizontally.
//
//  DATA: GET /api/job/schedules (same live-settings source as the
//  schedule badges in ScheduledJobsCard). Each schedule's cron is
//  parsed here:
//
//    • TIME-OF-DAY crons — plain numeric minute + hour, comma lists
//      allowed ("0 2 * * *", "30 6,18 * * *") — are plotted. Day
//      restrictions ("0 2 * * 1") still plot at their time; the
//      tooltip shows the raw cron so the restriction is visible.
//    • INTERVAL crons — any wildcard/step/range in minute or hour
//      ("*/15 * * * *", "0 * * * *") — are excluded. This is what
//      keeps repeated jobs like the cache refreshes off the track.
//
//  COLLISIONS: jobs within CLUSTER_GAP_MINUTES merge into one marker
//  with a count; the tooltip lists every job in the cluster. Height
//  stays fixed (~60px) no matter how many jobs coincide.
//
//  EDGE BUFFER: the track (and the label row, so positions stay
//  aligned) has TRACK_EDGE_PADDING of inner horizontal padding — the
//  0%–100% positioning context is the padded inner div, so a 00:00
//  marker sits fully inside the border instead of half-clipped.
///  +-----------------------------------------------------------------+

/** Jobs closer together than this merge into one counted marker. */
const CLUSTER_GAP_MINUTES = 40;

const MINUTES_PER_DAY = 24 * 60;

/** Inner buffer so 00:00 / 23:xx markers don't clip on the borders. */
const TRACK_EDGE_PADDING = "px-5";

type TimelineJob = {
  key: string;
  name: string;
  minutes: number;
  /** Raw cron, shown as the tooltip's second line. */
  scheduleLabel: string;
};

type Cluster = {
  key: string;
  /** Mean trigger time of the cluster, as a % across the day. */
  centerPct: number;
  jobs: TimelineJob[];
};

///  ------------------------- cron parsing --------------------------

/**
 * Expand a cron field into plain numbers. Accepts "5" and "5,17";
 * rejects wildcards, steps, and ranges ("*", "*\/15", "1-5") — those
 * mark an interval job, which doesn't belong on a time-of-day track.
 */
function expandNumericList(field: string, max: number): number[] | null {
  const out: number[] = [];
  for (const part of field.split(",")) {
    if (!/^\d{1,2}$/.test(part)) return null;
    const n = Number(part);
    if (n > max) return null;
    out.push(n);
  }
  return out;
}

/**
 * Minutes-into-the-day for each firing of a time-of-day cron, or null
 * if the cron is interval-style / unset / unparseable. Handles both
 * 5-field and node-cron's optional 6-field (leading seconds) form.
 */
function cronTriggerTimes(cron: string): number[] | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5 && fields.length !== 6) return null;

  const offset = fields.length === 6 ? 1 : 0;
  const mins = expandNumericList(fields[offset], 59);
  const hours = expandNumericList(fields[offset + 1], 23);
  if (!mins || !hours) return null;

  const times: number[] = [];
  for (const h of hours) for (const m of mins) times.push(h * 60 + m);
  return times.sort((a, b) => a - b);
}

/** "REFRESH_PRICES_CACHE" → "Refresh Prices Cache". */
function prettifyJobType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function schedulesToJobs(schedules: JobSchedule[]): TimelineJob[] {
  return schedules.flatMap((s) => {
    const times = cronTriggerTimes(s.cron);
    if (!times) return []; // interval job or unset cron — not plotted
    return times.map((minutes) => ({
      key: `${s.settingKey}@${minutes}`,
      name: prettifyJobType(s.jobType),
      minutes,
      scheduleLabel: s.cron,
    }));
  });
}

/** Sort by trigger time, then greedily merge near-coincident jobs. */
function buildClusters(jobs: TimelineJob[]): Cluster[] {
  const sorted = [...jobs].sort((a, b) => a.minutes - b.minutes);

  const clusters: Cluster[] = [];
  for (const job of sorted) {
    const last = clusters[clusters.length - 1];
    const lastEnd = last ? last.jobs[last.jobs.length - 1].minutes : -Infinity;
    if (last && job.minutes - lastEnd <= CLUSTER_GAP_MINUTES) {
      last.jobs.push(job);
    } else {
      clusters.push({ key: job.key, centerPct: 0, jobs: [job] });
    }
  }

  for (const c of clusters) {
    const mean = c.jobs.reduce((sum, j) => sum + j.minutes, 0) / c.jobs.length;
    c.centerPct = (mean / MINUTES_PER_DAY) * 100;
  }
  return clusters;
}

///  ------------------------- formatting ----------------------------

function formatTime(minutes: number, use24h: boolean): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const mm = String(m).padStart(2, "0");
  if (use24h) return `${String(h).padStart(2, "0")}:${mm}`;
  const period = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${mm} ${period}`;
}

/** Compact axis label — "3 AM" / "03:00" rather than "3:00 AM". */
function formatHourLabel(hour: number, use24h: boolean): string {
  if (use24h) return `${String(hour).padStart(2, "0")}:00`;
  return formatTime(hour * 60, false).replace(":00", "");
}

///  ------------------------- components -----------------------------

function ClusterMarker({
  cluster,
  use24h,
}: {
  cluster: Cluster;
  use24h: boolean;
}) {
  const count = cluster.jobs.length;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={cluster.jobs
            .map((j) => `${j.name} at ${formatTime(j.minutes, true)}`)
            .join(", ")}
          className="absolute top-1/2 z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2
                     cursor-pointer items-center justify-center
                     transition-transform hover:scale-125 focus-visible:scale-125
                     focus-visible:outline-none"
          style={{ left: `${cluster.centerPct}%` }}
        >
          {count > 1 ? (
            <span
              className="flex h-4 min-w-4 items-center justify-center rounded-full
                         bg-status-success px-1 text-[10px] font-semibold leading-none
                         text-white ring-2 ring-status-success/50"
            >
              {count}
            </span>
          ) : (
            <span
              className="h-2.5 w-2.5 rounded-full bg-status-success
                         ring-[3px] ring-status-success/20"
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        sideOffset={8}
        collisionPadding={8}
        className="pointer-events-none"
      >
        <div className="space-y-1">
          {cluster.jobs.map((j) => (
            <div key={j.key}>
              <div className="text-xs font-semibold">{j.name}</div>
              <div className="font-mono text-[11px] opacity-75">
                {formatTime(j.minutes, use24h)} · {j.scheduleLabel}
              </div>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** Grey placeholder for the loading / error / no-data states. */
function PlaceholderTrack({ message }: { message: string }) {
  return (
    <div className="flex h-9 w-full items-center justify-center rounded-lg border border-outline bg-surface-container-low">
      <span className="select-none text-xs text-info-light/60">{message}</span>
    </div>
  );
}

type ScheduledJobsTimelineProps = {
  /** Bump to force a refetch (e.g. after saving a schedule). */
  refreshKey?: number;
  /** Show the current-time line and pill. Defaults to true. */
  showNow?: boolean;
  /** Hour label / tooltip time format. Defaults to "24h". */
  timeFormat?: "12h" | "24h";
};

export default function ScheduledJobsTimeline({
  refreshKey = 0,
  showNow = true,
  timeFormat = "24h",
}: ScheduledJobsTimelineProps) {
  const use24h = timeFormat === "24h";

  const [schedules, setSchedules] = useState<JobSchedule[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getJobSchedules()
      .then((r) => {
        if (!cancelled) setSchedules(r.schedules);
      })
      .catch((err) => {
        console.error("getJobSchedules failed:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const clusters = useMemo(
    () => (schedules ? buildClusters(schedulesToJobs(schedules)) : []),
    [schedules]
  );

  // Computed once per render — indicative, not a live clock.
  const nowMinutes = useMemo(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  }, []);
  const nowPct = (nowMinutes / MINUTES_PER_DAY) * 100;

  if (error) return <PlaceholderTrack message="Couldn't load job schedules" />;
  if (schedules === null) return <PlaceholderTrack message="Loading…" />;
  if (clusters.length === 0)
    return <PlaceholderTrack message="No time-of-day scheduled jobs" />;

  const hours = Array.from({ length: 25 }, (_, i) => i);

  return (
    <TooltipProvider delayDuration={100} skipDelayDuration={300}>
      <div className="w-full">
        {/* Hour labels — every 3 hours (every 6 always, the rest from md
            up). The axis is bookended by 00:00 at both edges: h === 24
            renders as "00:00", right-aligned so it hugs the track's end.
            Same edge padding as the track so labels line up with the
            gridlines below. */}
        <div className={`mb-1 h-4 select-none ${TRACK_EDGE_PADDING}`}>
          <div className="relative h-full w-full">
            {hours
              .filter((h) => h % 3 === 0)
              .map((h) => (
                <span
                  key={h}
                  className={`absolute top-0 font-mono text-[10px] font-medium text-info-light/70
                              ${h === 0 ? "" : h === 24 ? "-translate-x-full" : "-translate-x-1/2"}
                              ${h % 6 !== 0 ? "hidden md:inline" : ""}`}
                  style={{ left: `${(h / 24) * 100}%` }}
                >
                  {formatHourLabel(h % 24, use24h)}
                </span>
              ))}

            {/* "Now" time pill sits in the label row, above its line */}
            {showNow && (
              <span
                aria-hidden
                className="absolute top-0 z-20 -translate-x-1/2 whitespace-nowrap rounded
                           bg-status-error/65 px-1.5 py-px font-mono text-[10px] font-semibold
                           leading-none text-white"
                style={{
                  left: `clamp(1.5rem, ${nowPct}%, calc(100% - 1.5rem))`,
                }}
              >
                {formatTime(nowMinutes, use24h)}
              </span>
            )}
          </div>
        </div>

        {/* Track — outer div draws the border/background and carries the
            edge padding; the inner div is the 0%–100% positioning context,
            so markers at 00:00 and late evening sit inside the buffer. */}
        <div
          className={`h-9 w-full overflow-hidden rounded-lg border border-outline/80 bg-surface ${TRACK_EDGE_PADDING}`}
          role="img"
          aria-label={`Scheduled jobs across the day: ${clusters
            .flatMap((c) => c.jobs)
            .map((j) => `${j.name} at ${formatTime(j.minutes, true)}`)
            .join(", ")}`}
        >
          <div className="relative h-full w-full">
            {/* Hourly gridlines — stronger every 6 hours */}
            {hours
              .filter((h) => h > 0 && h < 24)
              .map((h) => (
                <div
                  key={h}
                  aria-hidden
                  className={`absolute inset-y-0 w-px ${
                    h % 6 === 0 ? "bg-outline/40" : "bg-outline/15"
                  }`}
                  style={{ left: `${(h / 24) * 100}%` }}
                />
              ))}

            {/* Current time line */}
            {showNow && (
              <div
                aria-hidden
                className="absolute inset-y-0 z-[5] w-0.5 -translate-x-1/2 bg-status-error/50"
                style={{ left: `${nowPct}%` }}
              />
            )}

            {/* Job markers */}
            {clusters.map((c) => (
              <ClusterMarker key={c.key} cluster={c} use24h={use24h} />
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}