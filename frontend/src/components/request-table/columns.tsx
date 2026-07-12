import type { Column, ColumnDef, Row, RowData, Table } from "@tanstack/react-table";
import type { Request } from "@/types/requestType";
import { getInitials } from "@/lib/utils";
import { ReasonCell } from "@/components/request-table/FormatReason";
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
    color,
    hoverBg,
    title,
    border,
    onClick,
  }: {
    icon: string;
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
        className={`group/icon ${color} ${hoverBg} ${border} p-1 hover:cursor-pointer rounded-lg shadow-sm transition-colors  inline-flex items-center justify-center`}
      >
        <span className="material-symbols-outlined hover:cursor-pointer icon-fill-hover transition-all">
          {icon}
        </span>
      </button>
    );
  }

function StatusBadge({ status }: { status: string }) {
  const labelMap: Record<string, string> = {
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected",
    COMPLETED: "Completed",
    AWAITING_IT: "Awaiting IT",
    READY_TO_COLLECT: "Ready to collect",
    READY_TO_SHIP: "Ready to ship",
    SHIPPED: "Shipped",
    COLLECTED: "Collected",
    RECEIVED: "Received",
    ASSIGNED: "Assigned"
  };

  const styleMap: Record<string, { bg: string; text: string; icon: string }> = {
    APPROVED: { bg: "bg-blue-500/10", text: "text-blue-400", icon: "schedule" },
    COMPLETED: { bg: "bg-green-500/10", text: "text-green-600", icon: "Add_DIAMOND" },
    REJECTED: { bg: "bg-red-500/10", text: "text-red-600", icon: "cancel" },
    PENDING: { bg: "bg-yellow-500/10", text: "text-yellow-600", icon: "schedule" },
    AWAITING_IT: { bg: "bg-purple-500/10", text: "text-purple-400", icon: "shield_person" },
    READY_TO_COLLECT: { bg: "bg-teal-500/10", text: "text-teal-400", icon: "package_2" },
    READY_TO_SHIP: { bg: "bg-amber-500/10", text: "text-amber-400", icon: "local_shipping" },
    SHIPPED: { bg: "bg-sky-500/10", text: "text-sky-400", icon: "local_shipping" },
    COLLECTED: { bg: "bg-green-500/10", text: "text-green-500", icon: "check_circle" },
    RECEIVED: { bg: "bg-green-500/10", text: "text-green-500", icon: "check_circle" },
    ASSIGNED: { bg: "bg-indigo-500/10", text: "text-indigo-400", icon: "assignment_ind" },
  };

  const style = styleMap[status] ?? styleMap.PENDING;
  const label = labelMap[status] ?? status;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold border-1 rounded-full ${style.bg} ${style.text}`}>
      <span className="material-symbols-outlined !text-sm">{style.icon}</span>
      {label}
    </span>
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
  const needsShipping = request.needsShipping ?? false;
  const shippedAt = request.shippedAt ?? null;
  const collectionReadyAt = request.collectionReadyAt ?? null;
  const receivedAt = request.receivedAt ?? null;
  const isOwner = request.userName === meta.currentUserName;

  const isCompleted = requestStatus === "COMPLETED";

  // Collect path: assigned (awaiting prep) → ready to collect → collected
  const isCollectAwaitingPrep =
    isCompleted && !needsShipping && !collectionReadyAt && !receivedAt;
  const isReadyToCollect =
    isCompleted && !needsShipping && !!collectionReadyAt && !receivedAt;

  // Ship path: assigned (awaiting dispatch) → shipped → received
  const isShipAwaitingPrep =
    isCompleted && needsShipping && !shippedAt && !receivedAt;
  const isShipped =
    isCompleted && needsShipping && !!shippedAt && !receivedAt;

  const isReceivedOrCollected = isCompleted && !!receivedAt;

  // Synthetic badge key for the completed states.
  const completedBadgeKey =
    isReceivedOrCollected
      ? (needsShipping ? "RECEIVED" : "COLLECTED")
      : isReadyToCollect
      ? "READY_TO_COLLECT"
      : isShipped
      ? "SHIPPED"
      : (isCollectAwaitingPrep || isShipAwaitingPrep)
      ? "ASSIGNED"
      : "COMPLETED";

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
            color="text-green-500"
            hoverBg="bg-green-600/10"
            border="hover:border-green-500/50 hover:border-1"
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
              color="text-amber-400"
              hoverBg="bg-amber-500/10"
              border="hover:border-amber-500/50 hover:border-1"
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
              color="text-teal-400"
              hoverBg="bg-teal-500/10"
              border="hover:border-teal-500/50 hover:border-1"
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
          <ActionButton icon="check_circle" color="text-green-500" hoverBg="bg-green-600/10"
            border="hover:border-green-500/50 hover:border-1" title="Approve"
            onClick={() => meta.onApprove(request)} />
          <ActionButton icon="cancel" color="text-error" hoverBg="bg-error/10"
            border="hover:border-error/50 hover:border-1" title="Reject"
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
          <ActionButton icon="check_circle" color="text-green-500" hoverBg="bg-green-600/10"
            border="hover:border-green-500/50 hover:border-1"
            title={isStandardAwaitingIT ? "Approve & assign asset" : "Approve"}
            onClick={() => meta.onApprove(request)} />
          <ActionButton icon="cancel" color="text-error" hoverBg="bg-red-600/10"
            border="hover:border-red-500/50 hover:border-1" title="Reject"
            onClick={() => meta.onReject(request)} />
        </ActionRow>
      );
    }
    if (isAdminApprovedAwaitingModel) {
      return (
        <ActionRow>
          <ActionButton icon="Add_Circle" color="text-amber-400" hoverBg="bg-amber-500/10"
            border="hover:border-amber-500/50 hover:border-1" title="Create Model"
            onClick={() => meta.onCreateModel(request)} />
        </ActionRow>
      );
    }
    if (isModelCreated) {
      return (
        <ActionRow>
          <ActionButton icon="info" color="text-blue-400" hoverBg="bg-blue-600/10"
            border="hover:border-blue-500/50 hover:border-1" title="Asset Details"
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
              <span className="material-symbols-outlined !text-[14px] text-green-500">check</span>
              Call &amp; text
            </span>
          )}
          {isNewNumber && (
            <span className="inline-flex items-center gap-1 text-xs text-info-light">
              <span className="material-symbols-outlined !text-[14px] text-green-500">check</span>
              New number
            </span>
          )}
          {/* FIXED: reuse decision surfaced, with the number itself when known */}
          {isReuse && (
            <span className="inline-flex items-center gap-1 text-xs text-info-light">
              <span className="material-symbols-outlined !text-[14px] text-green-500">check</span>
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
    cell: ({ row }) => <ReasonCell text={row.original.reason} />,
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
    meta: { headerClass: "text-center", tdClass: "text-center" },
  },
];