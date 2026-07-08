import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { BackgroundJob, JobType } from "@/api/jobs";

///  +-----------------------------------------------------------------+
///  |                         JOB COLUMNS                             |
///  +-----------------------------------------------------------------+
//
//  Column definitions for the BackgroundJob history table. Deliberately
//  mirrors the requests table (request-table/columns.tsx): same header
//  layout, same badge visual language, same Material Symbols + surface
//  tokens, so the two tables read identically.
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
//  Palette mirrors columns.tsx StatusBadge: Completed green, Failed red,
//  Running blue (like Approved), Pending yellow. Icons per the handoff
//  (Running = schedule, matching the requests "Approved" badge — swap to
//  "progress_activity" + animate-spin if you'd prefer a live spinner).
function JobStatusBadge({ status }: { status: string }) {
  const styleMap: Record<string, { bg: string; text: string; icon: string }> = {
    Completed: { bg: "bg-green-500/10", text: "text-green-600", icon: "check_circle" },
    Failed: { bg: "bg-red-500/10", text: "text-red-600", icon: "cancel" },
    Running: { bg: "bg-blue-500/10", text: "text-blue-400", icon: "schedule" },
    Pending: { bg: "bg-yellow-500/10", text: "text-yellow-600", icon: "schedule" },
  };

  const style = styleMap[status] ?? styleMap.Pending;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold border-1 rounded-full ${style.bg} ${style.text}`}
    >
      <span className="material-symbols-outlined !text-sm">{style.icon}</span>
      {status}
    </span>
  );
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
//  in the error colour so a failed run is obvious at a glance.
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
        isError ? "text-red-600" : "text-info-light"
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
        <span className={`text-sm font-mono ${exhausted ? "text-red-600" : "text-info-light"}`}>
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