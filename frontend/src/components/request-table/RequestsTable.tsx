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
};

const globalFilterFn = (row: Row<Request>, _columnId: string, filterValue: string) => {
  if (!filterValue) return true;
  const term = filterValue.toLowerCase();
  const r = row.original;
  return (
    !!r.userName?.toLowerCase().includes(term) ||
    !!r.categoryName?.toLowerCase().includes(term) ||
    !!r.reason?.toLowerCase().includes(term) ||
    !!r.manager?.toLowerCase().includes(term) ||
    r.status.toLowerCase().includes(term) ||
    !!r.modelRequest?.modelName?.toLowerCase().includes(term) ||
    !!r.modelRequest?.manufacturer?.toLowerCase().includes(term) ||
    (r.modelRequest?.price != null && r.modelRequest.price.toString().includes(term))
  );
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
      onMarkReadyForCollection
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
                  className="hover:bg-surface-container-low/20 transition-colors border-b border-outline group"
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