///  +-----------------------------------------------------------------+
///  |          SHARED REQUEST STATUS BADGE + STAGE DERIVATION         |
///  +-----------------------------------------------------------------+
//
//  Single source of truth for request status presentation, used by the
//  requests table and the home page (and anything else that needs it).
//  Colours come from the theme-aware `status-*` tokens in index.css —
//  saturated originals on light, pastels on dark.
//
//  Suggested location: src/components/StatusBadge.tsx

// Minimal structural input — satisfied by both the full `Request` type
// and the home page's `HomeRequest`.
export type FulfilmentInput = {
  status: string;
  needsShipping?: boolean | null;
  shippedAt?: string | null;
  collectionReadyAt?: string | null;
  receivedAt?: string | null;
};

export type FulfilmentStage = {
  isCompleted: boolean;
  isCollectAwaitingPrep: boolean;
  isReadyToCollect: boolean;
  isShipAwaitingPrep: boolean;
  isShipped: boolean;
  isReceivedOrCollected: boolean;
  /** The badge key to display: the raw status for non-completed requests,
   *  or the derived post-fulfilment stage for COMPLETED ones. */
  badgeKey: string;
};

// ── Post-fulfilment shipping/receipt derivation ──
// Collect path: assigned (awaiting prep) → ready to collect → collected
// Ship path:    assigned (awaiting dispatch) → shipped → received
export function deriveFulfilment(request: FulfilmentInput): FulfilmentStage {
  const needsShipping = request.needsShipping ?? false;
  const shippedAt = request.shippedAt ?? null;
  const collectionReadyAt = request.collectionReadyAt ?? null;
  const receivedAt = request.receivedAt ?? null;

  const isCompleted = request.status === "COMPLETED";

  const isCollectAwaitingPrep =
    isCompleted && !needsShipping && !collectionReadyAt && !receivedAt;
  const isReadyToCollect =
    isCompleted && !needsShipping && !!collectionReadyAt && !receivedAt;

  const isShipAwaitingPrep =
    isCompleted && needsShipping && !shippedAt && !receivedAt;
  const isShipped =
    isCompleted && needsShipping && !!shippedAt && !receivedAt;

  const isReceivedOrCollected = isCompleted && !!receivedAt;

  const badgeKey = !isCompleted
    ? request.status
    : isReceivedOrCollected
    ? (needsShipping ? "RECEIVED" : "COLLECTED")
    : isReadyToCollect
    ? "READY_TO_COLLECT"
    : isShipped
    ? "SHIPPED"
    : (isCollectAwaitingPrep || isShipAwaitingPrep)
    ? "ASSIGNED"
    : "COMPLETED";

  return {
    isCompleted,
    isCollectAwaitingPrep,
    isReadyToCollect,
    isShipAwaitingPrep,
    isShipped,
    isReceivedOrCollected,
    badgeKey,
  };
}

// ── Badge presentation ──

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
  ASSIGNED: "Assigned",
};

// Theme-aware status tokens (see index.css): saturated originals on the
// light theme, pastels on dark. Hue lives in CSS — only opacity here.
const styleMap: Record<string, { bg: string; text: string; icon: string }> = {
  APPROVED: { bg: "bg-status-approved/15", text: "text-status-approved", icon: "schedule" },
  COMPLETED: { bg: "bg-status-success/15", text: "text-status-success", icon: "check_circle" },
  REJECTED: { bg: "bg-status-error/15", text: "text-status-error", icon: "cancel" },
  PENDING: { bg: "bg-status-pending/15", text: "text-status-pending", icon: "schedule" },
  AWAITING_IT: { bg: "bg-status-awaiting-it/15", text: "text-status-awaiting-it", icon: "shield_person" },
  READY_TO_COLLECT: { bg: "bg-status-collect/15", text: "text-status-collect", icon: "package_2" },
  READY_TO_SHIP: { bg: "bg-status-ship/15", text: "text-status-ship", icon: "local_shipping" },
  SHIPPED: { bg: "bg-status-shipped/15", text: "text-status-shipped", icon: "local_shipping" },
  COLLECTED: { bg: "bg-status-success/15", text: "text-status-success", icon: "check_circle" },
  RECEIVED: { bg: "bg-status-success/15", text: "text-status-success", icon: "check_circle" },
  ASSIGNED: { bg: "bg-status-assigned/15", text: "text-status-assigned", icon: "assignment_ind" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = styleMap[status] ?? styleMap.PENDING;
  const label = labelMap[status] ?? status;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold border-1 rounded-full ${style.bg} ${style.text}`}>
      <span className="material-symbols-outlined !text-sm">{style.icon}</span>
      {label}
    </span>
  );
}