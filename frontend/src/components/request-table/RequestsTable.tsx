import { useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import type { Request } from "@/types/requestType";
import { columns, type RequestsTableMeta } from "./columns";
import type { Role } from "@/types/authType";

type Props = {
  requests: Request[];
  role: Role;
  currentUserName: string;
  onApprove: (request: Request) => void;
  onReject: (request: Request) => void;
  onCreateModel: (request: Request) => void;
  onAssetDetails: (request: Request) => void;
  onSelectAccessory: (request: Request) => void;
  onAddAccessoryStock: (request: Request) => void;
  onMarkShipped: (request: Request) => void;
  onMarkReceived: (request: Request) => void;
  globalFilter: string;
  page: number;
  pageSize: number;
  onFilteredCountChange?: (count: number) => void;
  columnVisibility: Record<string, boolean>;
  onMarkReadyForCollection: (request: Request) => void;
  onManageCorrection: (request: Request) => void;
};

/**
 * Keys excluded from the deep search walk. These are all technically strings
 * or numbers, but matching on them produces near-universal false positives
 * rather than useful hits:
 *   - `id` / anything ending in `Id` — a single typed digit would match most
 *     rows via snipeAccessoryId, linkedAssetId, etc.
 *   - anything ending in `At` — raw ISO timestamps, so "2026" or "07" matches
 *     nearly every request. createdAt is instead matched on its *rendered*
 *     locale date below, which is what the user actually sees in the column.
 *   - `trackingUrl` — long opaque URLs full of incidental substrings.
 */
function isNoiseKey(key: string): boolean {
  return (
    key === "id" ||
    key.endsWith("Id") ||
    key.endsWith("At") ||
    key === "trackingUrl"
  );
}

/**
 * Recursively test every meaningful leaf value on the object. Covers the
 * fields the old hand-written filter missed — requestKind, accessoryOption /
 * accessoryOptionDisplay, accessoryLinkedLabel, accessoryRemaining,
 * numberOption, reuseNumberPhone, needsShipping, requestType, and anything
 * nested under modelRequest — without needing to be updated each time the
 * Request shape grows a field.
 */
function deepMatch(value: unknown, needle: string): boolean {
  if (value == null) return false;

  if (Array.isArray(value)) {
    return value.some((v) => deepMatch(v, needle));
  }

  if (value instanceof Date) {
    return value.toLocaleDateString().toLowerCase().includes(needle);
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, v]) => !isNoiseKey(key) && deepMatch(v, needle)
    );
  }

  // Primitives — strings, numbers, booleans all get stringified so a search
  // for "true", "0", or an enum value like "non_standard" behaves sensibly.
  return String(value).toLowerCase().includes(needle);
}

const globalFilterFn = (
  row: Row<Request>,
  _columnId: string,
  filterValue: string
) => {
  const needle = String(filterValue ?? "").trim().toLowerCase();
  if (!needle) return true;

  const r = row.original;

  // Match the date as it's rendered in the Date column, not as stored.
  if (r.createdAt) {
    const shown = new Date(r.createdAt).toLocaleDateString().toLowerCase();
    if (shown.includes(needle)) return true;
  }

  return deepMatch(r, needle);
};

export default function RequestsTable({
  requests,
  role,
  currentUserName,
  onApprove,
  onReject,
  onCreateModel,
  onAssetDetails,
  onSelectAccessory,
  onAddAccessoryStock,
  onMarkShipped,
  onMarkReceived,
  globalFilter,
  page,
  pageSize,
  onFilteredCountChange,
  columnVisibility,
  onMarkReadyForCollection,
  onManageCorrection,
}: Props) {
  // Default sort: newest first
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);

  const table = useReactTable<Request>({
    data: requests,
    columns,
    state: {
      sorting,
      globalFilter,
      pagination: { pageIndex: page - 1, pageSize },
      columnVisibility,
    },
    onSortingChange: setSorting,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    meta: {
      role,
      currentUserName,
      onApprove,
      onReject,
      onCreateModel,
      onAssetDetails,
      onSelectAccessory,
      onAddAccessoryStock,
      onMarkShipped,
      onMarkReceived,
      onMarkReadyForCollection,
      onManageCorrection
    } as RequestsTableMeta,
  });

  // Bubble filtered count up so RequestsPagination knows totalPages/totalItems
  const filteredCount = table.getFilteredRowModel().rows.length;
  useEffect(() => {
    onFilteredCountChange?.(filteredCount);
  }, [filteredCount, onFilteredCountChange]);

  const rows = table.getRowModel().rows;
  const totalCols = table.getVisibleLeafColumns().length;

  return (
    <div className="bg-surface-container-lowest overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-[100px] w-7xl max-w-7xl text-left border-collapse">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="bg-surface-container-low/30 border-b !border-outline">
                {headerGroup.headers.map((header) => {
                  const headerExtra = header.column.columnDef.meta?.headerClass ?? "";
                  return (
                    <th
                      key={header.id}
                      className={`px-6 py-4 text-xs font-semibold font-mono uppercase tracking-wider text-on-surface-variant ${headerExtra}`}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-outline-variant/10">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={totalCols}
                  className="px-6 py-10 text-center text-sm text-info-light"
                >
                  No requests found
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  // Non-standard rows carry a left accent so they are findable
                  // by scanning the edge of the table rather than by reading
                  // the reason cell. Driven off requestType, never off the
                  // presence of reason text.
                  //
                  // `primary` (brand) rather than a status-* token on purpose:
                  // every status token is bound to a lifecycle stage, so an
                  // amber or green accent would read as "pending"/"completed".
                  // Non-standard is an attribute of the request, not a stage.
                  //
                  // Corrections carry the same accent in status-correction —
                  // its own token for the same reason `primary` was chosen
                  // here: a correction is a kind of row, not a stage within
                  // one. The two are mutually exclusive by construction
                  // (requestType is CORRECTION, never NON_STANDARD).
                  //
                  // Standard rows get the same 4px border in transparent so
                  // the first column stays aligned across the table.
                  className={`hover:bg-surface-container-low/20 transition-colors border-b border-outline group border-l-4 ${
                    row.original.requestKind === "CORRECTION"
                      ? "border-l-status-correction"
                      : row.original.requestType === "NON_STANDARD"
                      ? "border-l-primary"
                      : "border-l-transparent"
                  }`}
                >
                  {row.getVisibleCells().map((cell) => {
                    const tdExtra = cell.column.columnDef.meta?.tdClass ?? "";
                    return (
                      <td key={cell.id} className={`px-6 py-5 align-center ${tdExtra}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}