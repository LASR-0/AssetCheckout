import { useCallback, useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import ComboboxField from "@/components/ui/comboboxfield";
import { jobColumns, JOB_TYPE_LABELS } from "@/components/settings/JobColumns";
import {
  listJobs,
  type BackgroundJob,
  type JobStatus,
  type JobType,
} from "@/api/jobs";

///  +-----------------------------------------------------------------+
///  |                      JOB HISTORY TABLE                          |
///  +-----------------------------------------------------------------+
//
//  Server-driven view of the BackgroundJob history. Filtering, sorting
//  (fixed newest-first), and pagination all happen on the backend via query
//  params — so TanStack runs in core-model-only mode (no filter/sort/
//  pagination row models). It's used purely for consistent rendering with
//  the requests table (flexRender + header groups), not for client-side
//  data transforms.
//
//  Filters use the shared ComboboxField; the friendly labels map back to
//  the enum values the API expects.
//
//  Pass `refreshKey` and bump it (e.g. from ScheduledJobsCard after a
//  "Run now") to force a refetch without remounting.
///  +-----------------------------------------------------------------+

const PAGE_SIZE = 20;

// ---- Status filter: label <-> enum ----
const STATUS_ALL = "All statuses";
const STATUS_LABEL_TO_ENUM: Record<string, JobStatus | undefined> = {
  [STATUS_ALL]: undefined,
  Pending: "Pending",
  Running: "Running",
  Completed: "Completed",
  Failed: "Failed",
};
const STATUS_ITEMS = Object.keys(STATUS_LABEL_TO_ENUM);

// ---- Type filter: label <-> enum ----
//  Derived from JOB_TYPE_LABELS (jobColumns.tsx) so the friendly labels live
//  in exactly one place and can't drift between the table cells and this
//  filter. Dropdown order follows the key order in JOB_TYPE_LABELS.
const TYPE_ALL = "All types";
const TYPE_LABEL_TO_ENUM: Record<string, JobType | undefined> = {
  [TYPE_ALL]: undefined,
  ...Object.fromEntries(
    Object.entries(JOB_TYPE_LABELS).map(([type, label]) => [label, type as JobType]),
  ),
};
const TYPE_ITEMS = Object.keys(TYPE_LABEL_TO_ENUM);

type JobHistoryTableProps = {
  /** Bump to force a refetch (e.g. after a manually-triggered job). */
  refreshKey?: number;
};

export default function JobHistoryTable({ refreshKey = 0 }: JobHistoryTableProps) {
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<JobStatus | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<JobType | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listJobs({
        status: statusFilter,
        type: typeFilter,
        page,
        pageSize: PAGE_SIZE,
      });
      setJobs(data.jobs);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, typeFilter]);

  // Refetch whenever the query changes (page/filters, via fetchJobs identity)
  // or the parent bumps refreshKey. Filter changes also reset the page inside
  // their onSelect handlers, so the two state updates batch into ONE fetch.
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs, refreshKey]);

  const table = useReactTable<BackgroundJob>({
    data: jobs,
    columns: jobColumns,
    getCoreRowModel: getCoreRowModel(),
    // Server-driven: TanStack just renders the page the API returned.
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
  });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = table.getRowModel().rows;
  const totalCols = table.getVisibleLeafColumns().length;

  return (
    <div className="space-y-4">
      {/* Filters + refresh */}
      <div className="flex items-end gap-3 flex-wrap">
        <div className="w-44">
          <label className="block text-xs font-semibold text-info-light uppercase tracking-wider mb-1">
            Status
          </label>
          <ComboboxField
            items={STATUS_ITEMS}
            defaultValue={STATUS_ALL}
            keyHint="job-status-filter"
            size="compact"
            placeholder="Status"
            onSelect={(label) => {
              setStatusFilter(STATUS_LABEL_TO_ENUM[label]);
              setPage(1);
            }}
          />
        </div>

        <div className="w-52">
          <label className="block text-xs font-semibold text-info-light uppercase tracking-wider mb-1">
            Type
          </label>
          <ComboboxField
            items={TYPE_ITEMS}
            defaultValue={TYPE_ALL}
            keyHint="job-type-filter"
            size="compact"
            placeholder="Type"
            onSelect={(label) => {
              setTypeFilter(TYPE_LABEL_TO_ENUM[label]);
              setPage(1);
            }}
          />
        </div>

        <button
          onClick={fetchJobs}
          disabled={loading}
          className="inline-flex items-center text-nav-tab-selected font-bold gap-1 px-3 py-1.5 text-xs rounded-md bg-surface-container-low border border-outline/30 hover:cursor-pointer disabled:opacity-50 transition-all"
        >
          <span
            className={`material-symbols-outlined !text-[16px] ${loading ? "animate-spin" : ""}`}
            style={{ fontVariationSettings: "'wght' 900" }}
          >
            refresh
          </span>
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-xs text-error bg-error/10 rounded-md p-2">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="bg-surface-container-low/30 border-b !border-outline"
              >
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-xs font-semibold font-mono uppercase tracking-wider text-on-surface-variant"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-outline-variant/10">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-4 py-10 text-center text-sm text-info-light"
                >
                  {loading ? "Loading…" : "No jobs found"}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="hover:bg-surface-container-low/20 transition-colors border-b border-outline/10"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-info-light">
            {total} job{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-xs text-nav-tab-selected rounded-md bg-surface border border-outline/30 hover:brightness-95 hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Previous
            </button>
            <span className="text-info-light">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-xs rounded-md text-nav-tab-selected bg-surface border border-outline/30 hover:brightness-95 hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}