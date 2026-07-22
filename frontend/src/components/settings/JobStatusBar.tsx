import { useEffect, useMemo, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getJobStats, type JobStatsResponse } from "@/api/jobs";

///  +-----------------------------------------------------------------+
///  |                     JOB STATUS DISTRIBUTION BAR                 |
///  +-----------------------------------------------------------------+
//
//  Stacked bar summarising the outcome split of all background jobs:
//  completed / in progress / failed. "In progress" folds Pending and
//  Running together (jobs execute quickly, so this segment is rarely
//  visible — the tooltip shows the pending/running split when it is).
//
//  Data comes from GET /api/jobs/stats (global counts), NOT from the
//  paginated JobHistoryTable — the table only ever holds one filtered
//  page. Bump `refreshKey` (shared with the table) to refetch after a
//  manually-queued job.
//
//  Visual language matches FeedbackDistributionBar: translucent /15
//  fills with solid status-token borders, cursor-tracking tooltips,
//  grey pill placeholder for empty/loading/error states.
///  +-----------------------------------------------------------------+

type BucketKey = "completed" | "in_progress" | "failed";

// Fixed display order: success → in-flight → failure, left to right.
const BAR_ORDER: BucketKey[] = ["completed", "in_progress", "failed"];

const BUCKET_DISPLAY: Record<BucketKey, { label: string }> = {
  completed: { label: "Completed" },
  in_progress: { label: "In progress" },
  failed: { label: "Failed" },
};

// Badge-matched styling: translucent fill + solid border per status.
const BAR_SEGMENT_STYLE: Record<BucketKey, string> = {
  completed: "bg-status-success/15 border-status-success border-r-0",
  in_progress: "bg-status-pending/15 border-status-pending border-r-0 border-l-0",
  failed: "bg-status-error/15 border-status-error border-l-0",
};

const BAR_HEIGHT = "h-6";

type BarSegmentData = {
  key: BucketKey;
  count: number;
  width: number; // exact %, segments sum to 100
  pct: number; // rounded, for display
  detail?: string; // extra tooltip line (pending/running split)
};

function BarSegment({ segment }: { segment: BarSegmentData }) {
  // Cursor offset from segment centre → Radix alignOffset, so the tooltip
  // slides horizontally with the mouse (same trick as the feedback bar).
  const [cursorOffset, setCursorOffset] = useState(0);
  const d = BUCKET_DISPLAY[segment.key];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`h-full border-1 first:rounded-l-full last:rounded-r-full transition-opacity hover:opacity-70 ${BAR_SEGMENT_STYLE[segment.key]}`}
          style={{ width: `${segment.width}%` }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursorOffset(e.clientX - (rect.left + rect.width / 2));
          }}
        />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        alignOffset={cursorOffset}
        sideOffset={8}
        collisionPadding={8}
        className="pointer-events-none text-xs"
      >
        <span className="font-semibold">{d.label}</span>
        {" — "}
        {segment.pct}% ({segment.count})
        {segment.detail && (
          <span className="text-info-light"> · {segment.detail}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

// Grey placeholder for the loading / error / no-data states.
function PlaceholderBar({ message }: { message: string }) {
  return (
    <div
      className={`flex ${BAR_HEIGHT} w-full items-center justify-center rounded-full border-2 border-outline bg-surface-container-low`}
    >
      <span className="text-xs text-info-light/60 select-none">{message}</span>
    </div>
  );
}

type JobStatusBarProps = {
  /** Bump to force a refetch (shared with JobHistoryTable's refreshKey). */
  refreshKey?: number;
};

export default function JobStatusBar({ refreshKey = 0 }: JobStatusBarProps) {
  const [stats, setStats] = useState<JobStatsResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(false);
    getJobStats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        console.error("getJobStats failed:", err);
        if (!cancelled) setError(true);
      });
  }, [refreshKey]);

  const segments = useMemo<BarSegmentData[]>(() => {
    if (!stats) return [];
    const inProgress = stats.pending + stats.running;
    const total = stats.completed + stats.failed + inProgress;
    if (total === 0) return [];

    const counts: Record<BucketKey, number> = {
      completed: stats.completed,
      in_progress: inProgress,
      failed: stats.failed,
    };

    return BAR_ORDER.flatMap((key) => {
      const count = counts[key];
      if (count === 0) return [];
      return [
        {
          key,
          count,
          width: (count / total) * 100,
          pct: Math.round((count / total) * 100),
          detail:
            key === "in_progress"
              ? `${stats.running} running, ${stats.pending} pending`
              : undefined,
        },
      ];
    });
  }, [stats]);

  if (error) return <PlaceholderBar message="Couldn't load job stats" />;
  if (stats === null) return <PlaceholderBar message="Loading…" />;
  if (segments.length === 0) return <PlaceholderBar message="No jobs recorded" />;

  return (
    <TooltipProvider delayDuration={100} skipDelayDuration={300}>
      <div
        className={`flex ${BAR_HEIGHT} w-full overflow-hidden rounded-full`}
        role="img"
        aria-label={segments
          .map((s) => `${BUCKET_DISPLAY[s.key].label}: ${s.pct}%`)
          .join(", ")}
      >
        {segments.map((s) => (
          <BarSegment key={s.key} segment={s} />
        ))}
      </div>
    </TooltipProvider>
  );
}