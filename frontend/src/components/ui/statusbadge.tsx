///  +-----------------------------------------------------------------+
///  |          SHARED REQUEST STATUS BADGE + STAGE DERIVATION         |
///  +-----------------------------------------------------------------+
//
//  Single source of truth for request status presentation, used by the
//  requests table and the home page (and anything else that needs it).
//  Colours come from the theme-aware `status-*` tokens in index.css —
//  saturated originals on light, pastels on dark.
//
//  Also exports the low-level <Badge> primitive — the ONE badge shell in
//  the app. Anything that needs a pill with its own semantic vocabulary
//  (job statuses, feedback responses, schedule/dry-run indicators) builds
//  on Badge with its own style map, rather than duplicating the markup.
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
  /** CORRECTION rows have no fulfilment chain — see the guard below. */
  requestKind?: string | null;
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

  // CORRECTIONS HAVE NO FULFILMENT CHAIN. Nothing is ever shipped, prepared or
  // collected for one — it is applied to Snipe and finished. But a resolved
  // correction is COMPLETED with no shipping stamps, which is byte-for-byte
  // what "fulfilled, waiting for IT to prepare it" looks like, so the
  // derivation below reads it as ASSIGNED. That is why the home page showed
  // Assigned for corrections the request table showed as Completed: the table
  // returns early for CORRECTION rows before it uses any of this, the home
  // page had no such guard.
  //
  // Fixed HERE rather than at the second call site, because the guard is only
  // reliable if it can't be forgotten by the next caller. A correction's
  // status is its own answer, so it is passed straight through.
  if (request.requestKind === "CORRECTION") {
    return {
      isCompleted,
      isCollectAwaitingPrep: false,
      isReadyToCollect: false,
      isShipAwaitingPrep: false,
      isShipped: false,
      isReceivedOrCollected: false,
      badgeKey: request.status,
    };
  }

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

// ── Full lifecycle stage derivation ──
//
//  deriveFulfilment above only splits the tail of the lifecycle (what happens
//  after IT checks the thing out). deriveStage covers the WHOLE of it, and is
//  the single answer to "what stage is this request at" for both the badge and
//  the requests-table filter.
//
//  Why derived rather than stored: every stage below is already a deterministic
//  read of data we hold — timestamps, the quote's own status, the ModelRequest's
//  own status. Promoting them to RequestStatus enum values would mean the same
//  fact written in two places, and ~25 `status === "COMPLETED"` guards in
//  backend/src/services/request.ts each becoming a place where a missed write
//  silently strands a request. The timestamps stay authoritative; this reads
//  them.
//
//  Note what this fixes: RequestStatus.COMPLETED does NOT mean the request is
//  complete. It's stamped the moment IT checks the asset out of Snipe, with the
//  whole ship/collect chain still ahead of it. So a raw status filter put
//  "assigned but sitting on a desk in IT", "shipped, in transit" and "in the
//  requester's hands" into one bucket. Only COLLECTED/RECEIVED are terminal —
//  see isDoneStage.

export type StageInput = FulfilmentInput & {
  requestType?: string | null;
  adminApprovedAt?: string | null;
  quoteDetail?: { status?: string | null } | null;
  modelRequest?: { status?: string | null } | null;
};

export function deriveStage(request: StageInput): string {
  if (request.status === "REJECTED") return "REJECTED";

  // Corrections have no provisioning or fulfilment chain — they're applied to
  // Snipe and finished — so their status IS their stage. Same reasoning as the
  // guard inside deriveFulfilment, and it has to come before the APPROVED
  // branch below: a correction's requestType is CORRECTION and its
  // adminApprovedAt is never set, which would otherwise read as AWAITING_IT.
  if (request.requestKind === "CORRECTION") return request.status;

  if (request.status === "COMPLETED") return deriveFulfilment(request).badgeKey;

  if (request.status === "APPROVED") {
    // Stalled on the manager's answer to a cost — outside IT's hands, and the
    // one stage nobody in IT can advance. Checked first because a request
    // sitting here also satisfies the ModelRequest test below.
    if (request.quoteDetail?.status === "SENT") return "AWAITING_QUOTE";

    // Manager has approved; IT hasn't signed off yet. Standard requests record
    // that sign-off on adminApprovedAt, non-standard ones by advancing the
    // ModelRequest off PENDING — different mechanics, same stage.
    if (request.requestType === "STANDARD" && !request.adminApprovedAt)
      return "AWAITING_IT";
    if (request.modelRequest?.status === "PENDING") return "AWAITING_IT";

    // Past IT sign-off, still being provisioned: creating the model, filling in
    // asset details, selecting the accessory, waiting on stock. Deliberately
    // one stage rather than four — those are steps in IT's own queue and the
    // row's action already names which one, so splitting them would add filter
    // entries nobody outside IT can act on.
    return "APPROVED";
  }

  return request.status;
}

/** Terminal stages: the requester actually has the thing (or the correction was
 *  applied). Everything else is still in flight — which is the whole point of
 *  the split, since RequestStatus.COMPLETED spans both. */
const DONE_STAGES = new Set(["COLLECTED", "RECEIVED", "COMPLETED"]);

export function isDoneStage(stage: string): boolean {
  return DONE_STAGES.has(stage);
}

// ── Badge primitive ──
//
//  The single badge shell. `default` matches the requests-table badge
//  (px-2 py-1, !text-sm icon); `compact` is the tighter variant for dense
//  summary rows (py-0.5, 14px icon). Border colour is currentColor
//  (Tailwind v4 default), so it always matches the text token.

export type BadgeSize = "default" | "compact";

export type BadgeProps = {
  icon: string;
  label: string;
  /** Background utility, e.g. "bg-status-success/15" */
  bg: string;
  /** Text utility, e.g. "text-status-success" */
  text: string;
  size?: BadgeSize;
  className?: string;
};

export function Badge({
  icon,
  label,
  bg,
  text,
  size = "default",
  className = "",
}: BadgeProps) {
  const pad = size === "compact" ? "px-2 py-0.5" : "px-2 py-1";
  const iconSize = size === "compact" ? "!text-[14px]" : "!text-sm";

  return (
    // max-w-full + min-w-0 let the pill shrink inside flex rows / narrow
    // cells; the label then truncates ("Ready to c…") instead of wrapping
    // onto a second line. `title` keeps the full text on hover.
    <span
      title={label}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 ${pad} text-xs font-semibold border-1 rounded-full ${bg} ${text} ${className}`}
    >
      <span className={`material-symbols-outlined shrink-0 ${iconSize}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

// ── Request status presentation ──

const labelMap: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
  AWAITING_IT: "Awaiting IT",
  // Non-standard accessory whose quote is with the manager. A distinct stage
  // rather than a plain "Approved", because the request is stalled on someone
  // outside IT and the row should say so.
  AWAITING_QUOTE: "Quote with manager",
  READY_TO_COLLECT: "Ready to collect",
  READY_TO_SHIP: "Ready to ship",
  SHIPPED: "Shipped",
  COLLECTED: "Collected",
  RECEIVED: "Received",
  ASSIGNED: "Assigned",
};

// ── Three colours, not twelve ──
//
//  Every phase resolves to one of three intents (see index.css):
//
//    done      the request has cleared IT — approved, dispatched, finished
//    progress  somebody still owes an action on it
//    stop      it is dead
//
//  This replaced a scheme where each stage carried its own hue. Eleven colours
//  across a list is not eleven pieces of information; a person scanning the
//  table is asking one question — does this row need me? — and the colour now
//  answers exactly that, with the LABEL carrying which stage it is. It also
//  ends the collision where a stage colour appeared elsewhere on the same row
//  meaning something unrelated: "Ready to collect" and the "Mark ready" action
//  shared a violet with nothing to do with each other.
//
//  ASSIGNED is the one that looks misplaced and isn't. It means fulfilled but
//  not yet prepped, so IT still owes the shipping or collection step — hence
//  progress, while everything after it is done.
const DONE = { bg: "bg-intent-done/15", text: "text-intent-done" };
const PROGRESS = { bg: "bg-intent-progress/15", text: "text-intent-progress" };
const STOP = { bg: "bg-intent-stop/15", text: "text-intent-stop" };

const styleMap: Record<string, { bg: string; text: string; icon: string }> = {
  APPROVED: { ...DONE, icon: "schedule" },
  COMPLETED: { ...DONE, icon: "check_circle" },
  REJECTED: { ...STOP, icon: "cancel" },
  PENDING: { ...PROGRESS, icon: "schedule" },
  AWAITING_IT: { ...PROGRESS, icon: "shield_person" },
  AWAITING_QUOTE: { ...PROGRESS, icon: "request_quote" },
  READY_TO_COLLECT: { ...DONE, icon: "package_2" },
  READY_TO_SHIP: { ...DONE, icon: "local_shipping" },
  SHIPPED: { ...DONE, icon: "local_shipping" },
  COLLECTED: { ...DONE, icon: "check_circle" },
  RECEIVED: { ...DONE, icon: "check_circle" },
  ASSIGNED: { ...PROGRESS, icon: "assignment_ind" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = styleMap[status] ?? styleMap.PENDING;
  const label = labelMap[status] ?? status;

  return <Badge icon={style.icon} label={label} bg={style.bg} text={style.text} />;
}