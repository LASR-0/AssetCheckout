import type { Column, ColumnDef, Row, RowData, Table } from "@tanstack/react-table";
import type { Request } from "@/types/requestType";
import { getInitials } from "@/lib/utils";
import { ReasonCell } from "@/components/request-table/FormatReason";
import { StatusBadge, deriveFulfilment } from "@/components/ui/statusbadge";
import type { Role } from "@/types/authType";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    tdClass?: string;
    headerClass?: string;
  }
}

export type RequestsTableMeta = {
  role: Role;
  currentUserName: string;
  onApprove: (request: Request) => void;
  onReject: (request: Request) => void;
  onCreateModel: (request: Request) => void;
  onAssetDetails: (request: Request) => void;
  onMarkShipped: (request: Request) => void;
  onMarkReceived: (request: Request) => void;
  onMarkReadyForCollection: (request: Request) => void;
};

// --- Sort indicator ---
function SortIndicator({ column }: { column: Column<Request, unknown> }) {
  if (!column.getCanSort()) return null;
  const sorted = column.getIsSorted();
  return (
    <span className="material-symbols-outlined !text-[16px] text-info-light/60">
      {sorted === "asc" ? "arrow_upward" : sorted === "desc" ? "arrow_downward" : "unfold_more"}
    </span>
  );
}

// --- Sortable header
function SortableHeader({
  column,
  icon,
  label,
  align = "start",
}: {
  column: Column<Request, unknown>;
  icon: string;
  label: string;
  align?: "start" | "center";
}) {
  const justify = align === "center" ? "justify-center" : "";
  return (
    <button
      onClick={column.getToggleSortingHandler()}
      className={`flex items-center gap-2 ${justify} hover:cursor-pointer hover:text-on-surface transition-colors`}
    >
      <span className="material-symbols-outlined !text-[20px] text-base">{icon}</span>
      {label}
      <SortIndicator column={column} />
    </button>
  );
}

// --- Static header (no sort) ---
function StaticHeader({ icon, label, align = "start" }: { icon: string; label: string; align?: "start" | "center" }) {
  const justify = align === "center" ? "justify-center" : "";
  return (
    <div className={`flex items-center gap-2 ${justify}`}>
      <span className="material-symbols-outlined !text-[20px] text-base">{icon}</span>
      {label}
    </div>
  );
}

  function ActionRow({ children }: { children: React.ReactNode }) {
    return <div className="flex justify-center gap-2">{children}</div>;
  }

  function ActionButton({
    icon,
    label,
    color,
    hoverBg,
    title,
    border,
    onClick,
  }: {
    icon: string;
    label: string;
    color: string;
    hoverBg: string;
    title: string;
    border: string;
    onClick: () => void;
  }) {
    return (
      <button
        onClick={onClick}
        title={title}
        className={`group/icon ${color} ${hoverBg} ${border} border-1 rounded-full px-3 py-1 gap-1.5 hover:cursor-pointer transition-colors inline-flex items-center justify-center whitespace-nowrap text-xs font-semibold`}
      >
        <span className="material-symbols-outlined !text-[16px] hover:cursor-pointer icon-fill-hover transition-all">
          {icon}
        </span>
        {label}
      </button>
    );
  }

// --- Actions / Status cell ---
function ActionsCell({ row, table }: { row: Row<Request>; table: Table<Request> }) {
  const meta = table.options.meta as RequestsTableMeta;
  const request = row.original;
  const role = meta.role;

  const requestStatus = request.status;
  const modelRequestStatus = request.modelRequest?.status ?? null;
  const linkedAssetId = request.modelRequest?.linkedAssetId ?? null;

  const isPending = requestStatus === "PENDING";
  const isApprovedAwaitingAdmin =
    requestStatus === "APPROVED" && modelRequestStatus === "PENDING";
  const isAdminApprovedAwaitingModel =
    requestStatus === "APPROVED" && modelRequestStatus === "APPROVED" && !linkedAssetId;
  const isModelCreated =
    requestStatus === "APPROVED" && modelRequestStatus === "COMPLETED" && !!linkedAssetId;
  const isStandardAwaitingIT =
    requestStatus === "APPROVED" &&
    request.requestType === "STANDARD" &&
    !request.adminApprovedAt;

  // ── Post-fulfilment shipping/receipt derivation (COMPLETED requests) ──
  // Shared with the home page — see components/StatusBadge.tsx.
  const {
    isCompleted,
    isCollectAwaitingPrep,
    isReadyToCollect,
    isShipAwaitingPrep,
    isShipped,
    isReceivedOrCollected,
    badgeKey: completedBadgeKey,
  } = deriveFulfilment(request);

  const needsShipping = request.needsShipping ?? false;
  const isOwner = request.userName === meta.currentUserName;

  if (requestStatus === "REJECTED") {
    return <StatusBadge status={requestStatus} />;
  }

  // ──────────────────────────────────────────────────
  // COMPLETED — post-fulfilment stage (all roles)
  // ──────────────────────────────────────────────────
  if (isCompleted) {
    // Terminal: received/collected → badge only, everyone.
    if (isReceivedOrCollected) {
      return <StatusBadge status={completedBadgeKey} />;
    }

    // Owner receipt action takes precedence over role — an admin who is also
    // the requester can still mark their own device collected/received.
    if (isOwner && (isReadyToCollect || isShipped)) {
      const collecting = !needsShipping;
      return (
        <ActionRow>
          <ActionButton
            icon="inventory_2"
            label={collecting ? "Mark collected" : "Mark received"}
            color="text-status-success"
            hoverBg="hover:bg-status-success/10"
            border="border-status-success/40"
            title={collecting ? "Mark collected" : "Mark received"}
            onClick={() => meta.onMarkReceived(request)}
          />
        </ActionRow>
      );
    }

    // Admin prep actions: ship-path → Mark shipped; collect-path → Mark ready.
    if (role === "ADMIN") {
      if (isShipAwaitingPrep) {
        return (
          <ActionRow>
            <ActionButton
              icon="local_shipping"
              label="Mark shipped"
              color="text-status-ship"
              hoverBg="hover:bg-status-ship/10"
              border="border-status-ship/40"
              title="Mark shipped"
              onClick={() => meta.onMarkShipped(request)}
            />
          </ActionRow>
        );
      }
      if (isCollectAwaitingPrep) {
        return (
          <ActionRow>
            <ActionButton
              icon="package_2"
              label="Mark ready"
              color="text-status-collect"
              hoverBg="hover:bg-status-collect/10"
              border="border-status-collect/40"
              title="Mark ready for collection"
              onClick={() => meta.onMarkReadyForCollection(request)}
            />
          </ActionRow>
        );
      }
      return <StatusBadge status={completedBadgeKey} />;
    }

    // Everyone else (manager, non-owner requester, owner at non-actionable
    // stage): the stage badge.
    return <StatusBadge status={completedBadgeKey} />;
  }

  // ──────────────────────────────────────────────────
  // MANAGER VIEW (non-completed states)
  // ──────────────────────────────────────────────────
  if (role === "MANAGER") {
    if (isPending) {
      return (
        <ActionRow>
          <ActionButton icon="check_circle" label="Approve" color="text-status-success" hoverBg="hover:bg-status-success/10"
            border="border-status-success/40" title="Approve"
            onClick={() => meta.onApprove(request)} />
          <ActionButton icon="cancel" label="Reject" color="text-status-error" hoverBg="hover:bg-status-error/10"
            border="border-status-error/40" title="Reject"
            onClick={() => meta.onReject(request)} />
        </ActionRow>
      );
    }
    if (isStandardAwaitingIT) {
      return <StatusBadge status="AWAITING_IT" />;
    }
    return <StatusBadge status={requestStatus} />;
  }

  // ──────────────────────────────────────────────────
  // ADMIN VIEW (non-completed states)
  // ──────────────────────────────────────────────────
  if (role === "ADMIN") {
    if (isPending || isApprovedAwaitingAdmin || isStandardAwaitingIT) {
      return (
        <ActionRow>
          <ActionButton icon="check_circle" label="Approve" color="text-status-success" hoverBg="hover:bg-status-success/10"
            border="border-status-success/40"
            title={isStandardAwaitingIT ? "Approve & assign asset" : "Approve"}
            onClick={() => meta.onApprove(request)} />
          <ActionButton icon="cancel" label="Reject" color="text-status-error" hoverBg="hover:bg-status-error/10"
            border="border-status-error/40" title="Reject"
            onClick={() => meta.onReject(request)} />
        </ActionRow>
      );
    }
    if (isAdminApprovedAwaitingModel) {
      return (
        <ActionRow>
          <ActionButton icon="add_circle" label="Create model" color="text-status-model" hoverBg="hover:bg-status-model/10"
            border="border-status-model/40" title="Create Model"
            onClick={() => meta.onCreateModel(request)} />
        </ActionRow>
      );
    }
    if (isModelCreated) {
      return (
        <ActionRow>
          <ActionButton icon="info" label="Asset details" color="text-status-approved" hoverBg="hover:bg-status-approved/10"
            border="border-status-approved/40" title="Asset Details"
            onClick={() => meta.onAssetDetails(request)} />
        </ActionRow>
      );
    }
    return <StatusBadge status={requestStatus} />;
  }

  // REQUESTER and others on non-completed states: badge only.
  return <StatusBadge status={requestStatus} />;
}

// --- Column definitions ---
export const columns: ColumnDef<Request>[] = [
  {
    accessorKey: "userName",
    id: "userName",
    enableSorting: true,
    header: ({ column }) => <SortableHeader column={column} icon="person" label="Requester" />,
    cell: ({ row }) => {
      const initials = getInitials(row.original.userName);
      return (
        <div className="flex items-center">
          <div className="h-10 w-10 flex-shrink-0 rounded-full bg-primary-container flex items-center justify-center mr-3">
            <span className="text-requester-text bg-requester-bg/90 rounded-full py-1 px-1.5 font-bold text-sm">
              {initials}
            </span>
          </div>
          <div>
            <div className="text-sm font-semibold text-on-surface-variant">{row.original.userName}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "categoryName",
    id: "requestType",
    enableSorting: true,
    header: ({ column }) => <SortableHeader column={column} icon="Devices" label="Request Type" />,
    cell: ({ row }) => {
      const r = row.original;
      // FIXED: numberOption is authoritative where present; newNumber remains
      // the legacy bridge for records created before the enum existed.
      const isNewNumber = r.numberOption ? r.numberOption === "NEW" : !!r.newNumber;
      const isReuse = r.numberOption === "REUSE" || !!r.reuseNumberPhone;
      return (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-on-surface-variant">
            {r.categoryName}
          </span>
          {r.callText && (
            <span className="inline-flex items-center gap-1 text-xs text-info-light">
              <span className="material-symbols-outlined !text-[14px] text-status-success">check</span>
              Call &amp; text
            </span>
          )}
          {isNewNumber && (
            <span className="inline-flex items-center gap-1 text-xs text-info-light">
              <span className="material-symbols-outlined !text-[14px] text-status-success">check</span>
              New number
            </span>
          )}
          {/* FIXED: reuse decision surfaced, with the number itself when known */}
          {isReuse && (
            <span className="inline-flex items-center gap-1 text-xs text-info-light">
              <span className="material-symbols-outlined !text-[14px] text-status-success">check</span>
              Existing number:{r.reuseNumberPhone ? ` ${r.reuseNumberPhone}` : ""}
            </span>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "reason",
    id: "reason",
    enableSorting: false,
    header: () => <StaticHeader icon="text_snippet" label="Reason" />,
    // Constrained so long reasons wrap inside a fixed width instead of
    // squeezing the actions column and overflowing the pill buttons.
    cell: ({ row }) => (
      <div className="max-w-[220px]">
        <ReasonCell text={row.original.reason} />
      </div>
    ),
    meta: { tdClass: "max-w-[220px]" },
  },
  {
    accessorKey: "manager",
    id: "manager",
    enableSorting: true,
    header: ({ column }) => <SortableHeader column={column} icon="how_to_reg" label="Approver" />,
    cell: ({ row }) => {
      const initials = getInitials(row.original.manager ?? "");
      return (
        <div className="flex text-left items-center">
          <div className="h-10 w-10 rounded-full bg-primary-container flex items-center justify-center mr-2">
            <p className="text-approver-text bg-approver-bg/30 rounded-full py-1 px-1.5 font-bold text-sm">
              {initials}
            </p>
          </div>
          <div>
            <div className="text-sm font-semibold text-on-surface-variant">{row.original.manager}</div>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "createdAt",
    id: "createdAt",
    enableSorting: true,
    sortingFn: (a, b) => new Date(a.original.createdAt).getTime() - new Date(b.original.createdAt).getTime(),
    header: ({ column }) => <SortableHeader column={column} icon="event" label="Date" />,
    cell: ({ row }) => (
      <span className="text-sm text-info-light">
        {new Date(row.original.createdAt).toLocaleDateString()}
      </span>
    ),
  },
  {
    id: "actions",
    enableSorting: false,
    header: () => <StaticHeader icon="menu" label="Actions" align="center" />,
    cell: ActionsCell,
    meta: { headerClass: "text-center", tdClass: "text-center whitespace-nowrap" },
  },
];