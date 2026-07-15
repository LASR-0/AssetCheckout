import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BackgroundJob, JobType } from "@/api/jobs";
import { Badge } from "@/components/ui/statusbadge";

///  +-----------------------------------------------------------------+
///  |                         JOB COLUMNS                             |
///  +-----------------------------------------------------------------+
//
//  Column definitions for the BackgroundJob history table. Deliberately
//  mirrors the requests table (request-table/columns.tsx): same header
//  layout, same badge visual language, same Material Symbols + surface
//  tokens, so the two tables read identically.
//
//  Badges render through the shared <Badge> primitive (StatusBadge.tsx)
//  with the theme-aware `status-*` tokens, so job statuses recolour with
//  the theme exactly like request statuses do.
//
//  Sorting is fixed newest-first on the backend (JobHistoryTable runs with
//  manualSorting: true), so headers are STATIC — no sort handlers, no idle
//  client-side sort engine. This matches the non-sortable columns in the
//  requests table (Reason, Actions).
///  +-----------------------------------------------------------------+

// Friendly labels for each JobType enum. Exported as the single source of
// truth — JobHistoryTable's type filter can build its options from this map
// instead of maintaining its own duplicate (see note in the handoff).
export const JOB_TYPE_LABELS: Record<JobType, string> = {
  SEND_REQUEST_NOTIFICATION: "Request Notification",
  SYNC_REQUEST_TO_SHAREPOINT: "SharePoint Sync",
  REFRESH_CATEGORIES_CACHE: "Refresh Categories",
  REFRESH_PRICES_CACHE: "Refresh Prices",
  CLEANUP_STALE_REQUESTS: "Cleanup Stale",
  CLEANUP_ORPHAN_SNIPE_MODELS: "Cleanup Orphans",
  PURGE_OLD_JOB_HISTORY: "Purge History",
  REMIND_SHIPPED_REQUESTS: "Shipping Reminder",
};

function jobTypeLabel(type: string): string {
  return JOB_TYPE_LABELS[type as JobType] ?? type;
}

// --- Static header (no sort) — mirrors columns.tsx StaticHeader ---
function StaticHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="material-symbols-outlined !text-[20px] text-base">{icon}</span>
      {label}
    </div>
  );
}

// --- Status badge — job statuses (Pending/Running/Completed/Failed) ---
//  Semantic mapping onto the shared status tokens: Completed → success,
//  Failed → error, Running → approved (the requests-table blue), Pending →
//  pending. Icons per the handoff (Running = schedule, matching the requests
//  "Approved" badge — swap to "progress_activity" if you'd prefer a spinner).
const JOB_STATUS_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  Completed: { bg: "bg-status-success/15", text: "text-status-success", icon: "check_circle" },
  Failed: { bg: "bg-status-error/15", text: "text-status-error", icon: "cancel" },
  Running: { bg: "bg-status-approved/15", text: "text-status-approved", icon: "schedule" },
  Pending: { bg: "bg-status-pending/15", text: "text-status-pending", icon: "schedule" },
};

function JobStatusBadge({ status }: { status: string }) {
  const style = JOB_STATUS_STYLES[status] ?? JOB_STATUS_STYLES.Pending;
  return <Badge icon={style.icon} label={status} bg={style.bg} text={style.text} />;
}

// --- Date/time formatter ---
//  Jobs run frequently (prices every 10 min), so a date alone is ambiguous —
//  show date + time. Null (e.g. a job that hasn't finished) renders as a dash.
function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Detail cell: result summary, or the error message when failed ---
//  Click to expand (mirrors the requests table's ReasonCell). Errors render
//  in the error token so a failed run is obvious at a glance.
function DetailCell({ job }: { job: BackgroundJob }) {
  const [expanded, setExpanded] = useState(false);
  const isError = job.status === "Failed" && !!job.errorMessage;
  const text = isError ? job.errorMessage : job.resultSummary;

  if (!text) return <span className="text-info-light/50">—</span>;

  return (
    <p
      onClick={() => setExpanded((p) => !p)}
      title={text}
      className={`text-sm w-[280px] leading-relaxed cursor-pointer transition-all break-words whitespace-normal ${
        isError ? "text-status-error" : "text-info-light"
      } ${expanded ? "" : "line-clamp-2"}`}
    >
      {text}
    </p>
  );
}

// --- Column definitions ---
export const jobColumns: ColumnDef<BackgroundJob>[] = [
  {
    accessorKey: "type",
    id: "type",
    enableSorting: false,
    header: () => <StaticHeader icon="category" label="Type" />,
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="text-sm font-medium text-on-surface-variant">
          {jobTypeLabel(row.original.type)}
        </span>
        <span className="text-xs font-mono text-info-light/60">#{row.original.id}</span>
      </div>
    ),
  },
  {
    accessorKey: "status",
    id: "status",
    enableSorting: false,
    header: () => <StaticHeader icon="flag" label="Status" />,
    cell: ({ row }) => <JobStatusBadge status={row.original.status} />,
  },
  {
    accessorKey: "attempts",
    id: "attempts",
    enableSorting: false,
    header: () => <StaticHeader icon="replay" label="Attempts" />,
    cell: ({ row }) => {
      const { attempts, maxAttempts, status } = row.original;
      const exhausted = status === "Failed" && attempts >= maxAttempts;
      return (
        <span
          className={`text-sm font-mono ${exhausted ? "text-status-error" : "text-info-light"}`}
        >
          {attempts} / {maxAttempts}
        </span>
      );
    },
  },
  {
    accessorKey: "resultSummary",
    id: "detail",
    enableSorting: false,
    header: () => <StaticHeader icon="text_snippet" label="Detail" />,
    cell: ({ row }) => <DetailCell job={row.original} />,
  },
  {
    accessorKey: "createdAt",
    id: "createdAt",
    enableSorting: false,
    header: () => <StaticHeader icon="event" label="Created" />,
    cell: ({ row }) => (
      <span className="text-sm text-info-light whitespace-nowrap">
        {formatDateTime(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: "completedAt",
    id: "completedAt",
    enableSorting: false,
    header: () => <StaticHeader icon="event_available" label="Finished" />,
    cell: ({ row }) => (
      <span className="text-sm text-info-light whitespace-nowrap">
        {formatDateTime(row.original.completedAt)}
      </span>
    ),
  },
];