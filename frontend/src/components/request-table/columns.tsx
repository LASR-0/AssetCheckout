import { useEffect, useRef, useState } from "react";
import type { Column, ColumnDef, Row, RowData, Table } from "@tanstack/react-table";
import type { Request } from "@/types/requestType";
import { getInitials } from "@/lib/utils";
import {
  canActAsStockKeeper,
  canEditRequest,
  isApprover,
  isRequestee,
} from "@/lib/permissions";
import { iconForCategory } from "@/lib/categoryIcon";
import { ReasonCell } from "@/components/request-table/FormatReason";
import { StatusBadge, deriveFulfilment, deriveStage } from "@/components/ui/statusbadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Role, StockKeeperLocation } from "@/types/authType";

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
  /** Snipe user id of the signed-in actor; null if it could not be resolved. */
  currentUserId: number | null;
  /**
   * Locations the actor keeps stock for. Composes with `role` rather than
   * replacing it — see canActAsStockKeeper, which admins pass for every
   * location regardless of what is in here.
   */
  stockKeeperLocations: StockKeeperLocation[];
  onApprove: (request: Request) => void;
  onReject: (request: Request) => void;
  onCreateModel: (request: Request) => void;
  onAssetDetails: (request: Request) => void;
  onSelectAccessory: (request: Request) => void;
  onAddAccessoryStock: (request: Request) => void;
  /** Non-standard accessory quote stage: IT sends it, the manager answers. */
  onSendQuote: (request: Request) => void;
  onReviewQuote: (request: Request) => void;
  /** IT decides the item is too cheap to be worth a supplier quote. */
  onSkipQuote: (request: Request) => void;
  onMarkShipped: (request: Request) => void;
  onMarkReceived: (request: Request) => void;
  onMarkReadyForCollection: (request: Request) => void;
  onManageCorrection: (request: Request) => void;
  /** Admin hands procurement off to the requester instead of selecting an
   *  accessory. */
  onMarkUserProcured: (request: Request) => void;
  /** The requester reports what they bought. */
  onSubmitSelfProcuredDetails: (request: Request) => void;
  /** Admin reviews what was bought and completes the request. */
  onReviewSelfProcured: (request: Request) => void;
  /** Admin-only: correct a request that was filed wrong, in place. */
  onEdit: (request: Request) => void;
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
    tour,
  }: {
    icon: string;
    label: string;
    color: string;
    hoverBg: string;
    title: string;
    border: string;
    onClick: () => void;
    /** Tour anchor, on the handful of actions a tour explains. */
    tour?: string;
  }) {
    // Swap the icon for a spinner briefly on click, so EVERY row action
    // acknowledges the press. The mutations themselves are fast and the table
    // refetches afterwards, so this is a fixed-duration acknowledgement rather
    // than a real progress indicator — the click, not the request, is what it
    // reports. It matters most on an admin's back-to-back approvals, where the
    // row can otherwise look untouched between the two stages.
    const [clicked, setClicked] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The row usually re-renders (or unmounts) when the refetch lands, so the
    // timeout has to be cancelled rather than left to fire into nothing.
    useEffect(
      () => () => {
        if (timer.current) clearTimeout(timer.current);
      },
      []
    );

    function handleClick() {
      if (timer.current) clearTimeout(timer.current);
      setClicked(true);
      timer.current = setTimeout(() => setClicked(false), 100);
      onClick();
    }

    return (
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleClick}
              data-tour={tour}
              className={`group/icon ${color} ${hoverBg} ${border} border-2 rounded-lg shadow-sm px-3 py-1 gap-1.5 hover:cursor-pointer transition-colors inline-flex items-center hover:shadow-md justify-center whitespace-nowrap text-xs font-semibold`}
            >
              {clicked ? (
                // Sized to match the 16px icon so the button doesn't reflow.
                <span
                  className="h-[16px] w-[16px] shrink-0 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <span className="material-symbols-outlined !text-[16px] hover:cursor-pointer icon-fill-hover transition-all">
                  {icon}
                </span>
              )}
              {label}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  /**
   * Icon-only sibling of ActionButton, for a utility that sits OUT OF FLOW
   * beside the stage actions rather than in the row with them. No label; the
   * tooltip carries the meaning.
   *
   * Deliberately quieter than ActionButton — no border, muted until hover.
   * Correcting a request is not a step in the workflow, and it must not read
   * like the buttons that actually advance the row.
   *
   * `className` is how the caller places it. See ActionsCell.
   */
  function IconAction({
    icon,
    title,
    onClick,
    className = "",
  }: {
    icon: string;
    title: string;
    onClick: () => void;
    className?: string;
  }) {
    return (
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              aria-label={title}
              className={`inline-flex items-center justify-center h-8 w-8 rounded-full text-info-light/60 hover:text-on-surface hover:bg-surface-container hover:cursor-pointer transition-colors ${className}`}
            >
              <span className="material-symbols-outlined !text-[18px]">{icon}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-center">
            {title}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

// --- Status badge with tooltip ---
type StatusBadgeStatus = React.ComponentProps<typeof StatusBadge>["status"];

// Default tooltip copy for the plain request statuses. Stage-specific copy
// for COMPLETED fulfilment badges is computed in ActionsCell (it depends on
// the derived fulfilment booleans) and passed in via `tip`.
const STATUS_TIPS: Record<string, string> = {
  PENDING: "Waiting for manager approval",
  APPROVED: "Approved — in progress with IT",
  REJECTED: "This request was rejected",
  COMPLETED: "Request fulfilled",
  AWAITING_IT: "Approved by manager — waiting for IT to approve and assign an asset",
  AWAITING_QUOTE: "Quote sent — waiting for the manager to accept the cost",
};

function BadgeWithTooltip({ status, tip }: { status: StatusBadgeStatus; tip?: string }) {
  const text = tip ?? STATUS_TIPS[status as string];
  // Unknown status with no explicit tip → render the badge plain rather
  // than showing an empty tooltip.
  if (!text) return <StatusBadge status={status} />;
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* StatusBadge may not forward refs, so anchor the trigger on a span. */}
          <span className="inline-flex">
            <StatusBadge status={status} />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// --- Stage actions / status badge ---
//
// Everything a row offers BECAUSE OF WHERE IT IS: approve, sign off, create a
// model, ship, collect — or, when the viewer has nothing to do at this stage,
// the badge saying what it is waiting on. Exactly one of those comes back, and
// nothing else belongs in here.
//
// Split out from ActionsCell below, which wraps it, because Edit is the first
// affordance that does NOT belong to a stage: an admin can correct a request
// wherever it has got to, including the several states this function answers
// with a bare badge. Threading it through a dozen early returns would have
// meant touching every one of them.
function StageActions({ row, table }: { row: Row<Request>; table: Table<Request> }) {
  const meta = table.options.meta as RequestsTableMeta;
  const request = row.original;
  const role = meta.role;

  const requestStatus = request.status;
  const modelRequestStatus = request.modelRequest?.status ?? null;
  const linkedAssetId = request.modelRequest?.linkedAssetId ?? null;

  // Accessories have no model/hardware layer, so they key off snipeAccessoryId
  // rather than linkedAssetId (which stays null for them). requestKind absent
  // means a legacy ASSET record.
  const isAccessory = request.requestKind === "ACCESSORY";
  const snipeAccessoryId = request.modelRequest?.snipeAccessoryId ?? null;
  // Live available stock of the selected accessory, enriched onto the row by
  // the requests-list endpoint. null = asset row, or accessory not yet
  // selected, or the catalog was briefly unreachable.
  const accessoryRemaining =
    typeof request.accessoryRemaining === "number"
      ? request.accessoryRemaining
      : null;

  const isPending = requestStatus === "PENDING";
  // Also a NON-STANDARD-only stage: the ModelRequest that carries it is created
  // on the manager's approval of a non-standard request and a standard one has
  // no business owning one. Stated positively for the same reason as
  // isAccessoryAwaitingSelection below — a standard request that kept an orphan
  // PENDING ModelRequest through an edit used to land here and offer IT sign-off
  // down the non-standard path.
  const isApprovedAwaitingAdmin =
    request.requestType === "NON_STANDARD" &&
    requestStatus === "APPROVED" &&
    modelRequestStatus === "PENDING";

  // Non-standard SELECTION stage (ModelRequest APPROVED, nothing linked yet).
  // For assets that's "no linked asset → Create model"; for accessories it's
  // "no linked accessory → Select accessory". Keyed off the right field per
  // kind so an accessory never shows "Create model" (its linkedAssetId is
  // always null, which would otherwise misfire the asset branch).
  const isAssetAwaitingModel =
    !isAccessory &&
    requestStatus === "APPROVED" &&
    modelRequestStatus === "APPROVED" &&
    !linkedAssetId;

  // Asset DETAILS stage — the step after a model is assigned or created.
  //
  // Both model paths land here: useExistingModelForRequest and
  // createNewModelForRequest each stamp the ModelRequest COMPLETED and set
  // linkedAssetId, while the Request itself stays APPROVED. That is exactly the
  // state loadRequestAtRow4 accepts on the backend, and fillAssetDetailsForRequest
  // is what carries it the rest of the way — it writes the fields to Snipe,
  // re-probes completeness, and checks out + completes the request the moment
  // the asset is ready.
  //
  // Without this branch the row fell through every condition to the bare
  // "Approved" badge, so a non-standard asset stopped dead right after the
  // model step with no way to finish it. The dialog, the page handler and the
  // meta callback all existed — `onAssetDetails` was simply never called from
  // anywhere.
  //
  // Deliberately NOT gated on assetReady. A linked asset that is already
  // complete still leaves the request at APPROVED, because nothing checks it
  // out at link time; the admin has to open this dialog and save to trigger
  // fulfilment. Hiding the action when assetReady is true would strand exactly
  // the requests that are closest to done.
  const isAssetAwaitingDetails =
    !isAccessory &&
    requestStatus === "APPROVED" &&
    modelRequestStatus === "COMPLETED" &&
    linkedAssetId !== null;

  /** The linked asset already has everything Snipe needs — this is a
   *  confirm-and-issue, not a fill-in-the-blanks. Wording only. */
  const assetDetailsReady =
    isAssetAwaitingDetails && request.modelRequest?.assetReady === true;

  // ── Quote stage (non-standard accessories only) ──
  // IT buys assets; departments buy non-standard accessories. So this one
  // combination gets a quote the manager signs off on, and it sits between
  // IT's approval and the accessory being selected — nothing is ordered before
  // the person paying has agreed the price.
  //
  // Like the quantity-wait below, this is derived rather than being a status
  // of its own: the request stays APPROVED throughout and the stage comes off
  // the quote's own status.
  const quote = request.quoteDetail ?? null;
  const quoteSkipped = !!request.quoteSkippedAt;
  const isAtQuoteStage =
    isAccessory &&
    request.requestType === "NON_STANDARD" &&
    requestStatus === "APPROVED" &&
    modelRequestStatus === "APPROVED" &&
    snipeAccessoryId === null;
  const isAwaitingQuote = isAtQuoteStage && !quote && !quoteSkipped;
  const isAwaitingQuoteResponse = isAtQuoteStage && quote?.status === "SENT";

  // Selection is a NON-STANDARD stage and nothing else. Stated positively on
  // purpose: this used to read `requestType !== "NON_STANDARD" || quote
  // accepted || quote skipped`, meaning "if it's non-standard, make it wait for
  // a quote" — which is the right rule, but as written a STANDARD request
  // satisfied the clause outright. The only thing keeping standards out was
  // then `modelRequestStatus === "APPROVED"`, on the assumption that a standard
  // request never has a ModelRequest. Edit a non-standard request to STANDARD
  // mid-workflow and it kept one, so a standard accessory request offered
  // "Select accessory" — and the search behind it filters on the request's
  // category, so it returned nothing for every term. editRequest now refuses
  // that flip and drops the orphan row, and this says what it means.
  //
  // Selection also waits on an accepted (or skipped) quote. The backend
  // enforces this too (loadAccessoryRequestAtSelection) — hiding the action
  // is the courtesy, the guard is what makes it true. Also hidden once the
  // request has been handed off for self-procurement instead — that's an
  // alternative to selection, not a step before it.
  const isAccessoryAwaitingSelection =
    isAccessory &&
    request.requestType === "NON_STANDARD" &&
    requestStatus === "APPROVED" &&
    modelRequestStatus === "APPROVED" &&
    snipeAccessoryId === null &&
    !request.selfProcured &&
    (quote?.status === "ACCEPTED" || quoteSkipped);

  // The self-procurement hand-off — offered alongside Select accessory, for
  // non-standard accessories only. A standard accessory is IT-stocked, so
  // there's nothing to hand off.
  // isAccessoryAwaitingSelection is now non-standard by construction, so this
  // is exactly it — kept as its own name because the two answer different
  // questions and only one of them is about self-procurement.
  const isAwaitingUserProcuredOffer = isAccessoryAwaitingSelection;

  const selfProcured = request.selfProcured ?? null;
  const isAwaitingSelfProcuredDetails = selfProcured?.status === "AWAITING_DETAILS";
  const isAwaitingProcurementReview = selfProcured?.status === "AWAITING_REVIEW";

  // Accessory FULFILMENT stage: an accessory has been selected (linked) but
  // the request hasn't completed. That is the whole condition — the live stock
  // count no longer gates it, only labels it.
  //
  // It used to require `accessoryRemaining === 0`, on the assumption that
  // stock only ever arrives through this dialog, so a linked accessory WITH
  // stock must already have been checked out. Neither half holds. Stock can
  // appear by routes this app never sees — someone types a quantity straight
  // into Snipe, a checkin returns a unit to the pool, another request's top-up
  // covers this one — and fulfilment only ever fires from inside the selection
  // or add-stock calls, so nothing re-triggers it when that happens. The
  // request then sits at APPROVED with stock sitting next to it and no action
  // on the row at all: a genuine dead end, and the one Luke hit on the Monitor
  // request. Unknown stock (null) lands here too, which is what the catalog
  // read returns when it fails or when the record is too new to be in it.
  //
  // Offering the action in all three cases is safe: the backend re-probes live
  // stock and checks out the moment there is any, so the worst case is a
  // dialog that completes the request immediately, which is the desired
  // outcome anyway.
  const isAccessoryAwaitingStock =
    isAccessory &&
    requestStatus === "APPROVED" &&
    modelRequestStatus === "COMPLETED" &&
    snipeAccessoryId !== null;

  // Stock is already there and the request simply needs pushing over the line.
  // Changes the action's wording, not whether it appears.
  const accessoryStockReady =
    isAccessoryAwaitingStock && accessoryRemaining !== null && accessoryRemaining > 0;

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
  const isOwner = isRequestee(request, meta.currentUserId, meta.currentUserName);

  // Already in the air when the handover step landed, so it keeps the ending
  // its requester was told to expect. Decided by the backend — see the field.
  const legacyShipment = request.legacyShipment ?? false;

  // Scoped to THIS request's site: keeping stock at Brisbane grants nothing
  // over a device sitting in Bundamba. Admins pass everywhere, which is what
  // stops a site with no assigned keeper from stranding its requests.
  const canKeepStock = canActAsStockKeeper(
    role,
    meta.stockKeeperLocations,
    request.userLocationId ?? null
  );

  // Stage-specific tooltip for the COMPLETED fulfilment badge, derived from
  // the same booleans that drive the badge itself.
  //
  // A shipped request that has NOT been handed over is now waiting on the
  // destination site's stock keeper, not on the requester — saying otherwise
  // sent people looking for a parcel nobody had given them yet. The legacy
  // wording is kept for shipments that predate the handover step, because for
  // those it is still true.
  const completedTip = isReceivedOrCollected
    ? needsShipping
      ? "Device received by the requester"
      : "Device collected by the requester"
    : isShipped
    ? legacyShipment
      ? "Shipped — waiting for the requester to confirm receipt"
      : "Shipped — waiting for the stock keeper to receive it"
    : isReadyToCollect
    ? "Ready — waiting for the requester to collect it from the stock keeper"
    : isShipAwaitingPrep
    ? "Fulfilled — waiting for IT to ship the device"
    : isCollectAwaitingPrep
    ? "Fulfilled — waiting for the stock keeper to make it ready"
    : undefined;

  // CORRECTIONS never offer a provisioning action. Without this branch a
  // resolved correction (status COMPLETED, nothing shipped or collected)
  // satisfies deriveFulfilment's collect-awaiting-prep case, so an admin would
  // be shown "Mark ready" — which stamps collectionReadyAt and emails the
  // requester that a device is ready to collect. Placed above every other
  // branch, and it must STAY above them: the single action offered here is
  // "Manage", which opens the correction's own dialog and nothing else.
  if (request.requestKind === "CORRECTION") {
    // Blocked: approved, but the write to Snipe couldn't happen, so the row
    // deliberately sits at APPROVED rather than claiming to be done. Named on
    // the row so it's visible without opening anything.
    const blocked = !!request.correctionDetail?.applyError;

    if (role === "ADMIN" && requestStatus !== "COMPLETED" && requestStatus !== "REJECTED") {
      return (
        <ActionRow>
          <ActionButton
            icon={blocked ? "pending_actions" : "fact_check"}
            label={blocked ? "Blocked" : "Manage"}
            color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10"
            border="border-intent-progress/40"
            title={
              blocked
                ? "This correction couldn't be applied to Snipe — review and retry"
                : "Review this correction and approve or reject it"
            }
            onClick={() => meta.onManageCorrection(request)}
          />
        </ActionRow>
      );
    }

    return (
      <BadgeWithTooltip
        status={requestStatus}
        tip={
          requestStatus === "COMPLETED"
            ? "Record correction — applied"
            : requestStatus === "REJECTED"
            ? "Record correction — rejected"
            : blocked
            ? "Record correction — approved, but not yet applied in Snipe"
            : "Record correction — waiting for IT to review"
        }
      />
    );
  }

  if (requestStatus === "REJECTED") {
    return <BadgeWithTooltip status={requestStatus} />;
  }

  // ──────────────────────────────────────────────────
  // COMPLETED — post-fulfilment stage (all roles)
  // ──────────────────────────────────────────────────
  if (isCompleted) {
    // Terminal: received/collected → badge only, everyone.
    if (isReceivedOrCollected) {
      return <BadgeWithTooltip status={completedBadgeKey} tip={completedTip} />;
    }

    // Owner receipt action takes precedence over role — an admin who is also
    // the requester can still mark their own device collected/received.
    //
    // AT THE SHIPPED STAGE THIS IS NOW ONLY FOR LEGACY SHIPMENTS. A shipment
    // dispatched after the handover step landed is waiting on the destination
    // site's stock keeper; offering its requester a "Mark received" button
    // there would have them confirm a device nobody had handed them, skipping
    // the step and leaving the keeper's queue holding a row that was already
    // closed. Anything shipped before the cutover keeps the button, because
    // that is the ending its requester was told to expect.
    if (isOwner && (isReadyToCollect || (isShipped && legacyShipment))) {
      // At ready-to-collect it is always a collection now, on both paths —
      // the shipped ones just had a courier leg first, and the requester is
      // picking it up from their stock keeper either way.
      const collecting = isReadyToCollect;
      return (
        <ActionRow>
          <ActionButton
            icon="inventory_2"
            label={collecting ? "Mark collected" : "Mark received"}
            color="text-intent-done"
            hoverBg="hover:bg-intent-done/10"
            border="border-intent-done/40"
            title={
              collecting
                ? "Confirm you've collected this device from your stock keeper"
                : "Confirm you've received this device"
            }
            onClick={() => meta.onMarkReceived(request)}
          />
        </ActionRow>
      );
    }

    // Dispatch stays with IT — shipping is a logistics action, and nothing
    // about it belongs to the destination site.
    if (role === "ADMIN" && isShipAwaitingPrep) {
      return (
        <ActionRow>
          <ActionButton
            icon="local_shipping"
            label="Mark shipped"
            color="text-intent-done"
            hoverBg="hover:bg-intent-done/10"
            border="border-intent-done/40"
            title="Mark this device as shipped to the requester"
            onClick={() => meta.onMarkShipped(request)}
          />
        </ActionRow>
      );
    }

    // THE HANDOVER, on both paths. Off the shelf at the requester's own site,
    // or out of the parcel that just arrived there — one action either way,
    // because from the requester's side the two are the same thing: the
    // device is with somebody they can collect it from.
    //
    // Excluded for a legacy shipment, whose requester can still close it
    // themselves; adding a second way to finish those would just mean two
    // people racing for the same row.
    if (canKeepStock && (isCollectAwaitingPrep || (isShipped && !legacyShipment))) {
      return (
        <ActionRow>
          <ActionButton
            icon="package_2"
            label="Mark ready to collect"
            color="text-intent-done"
            hoverBg="hover:bg-intent-done/10"
            border="border-intent-done/40"
            title={
              isShipped
                ? "Confirm this arrived at your location and is ready for the requester"
                : "Mark this device as ready for the requester to collect"
            }
            onClick={() => meta.onMarkReadyForCollection(request)}
          />
        </ActionRow>
      );
    }

    // Everyone else (manager, non-owner requester, owner at non-actionable
    // stage): the stage badge.
    return <BadgeWithTooltip status={completedBadgeKey} tip={completedTip} />;
  }

  // Owner reporting back on a self-procured item — takes precedence over
  // role, same reasoning as the receipt actions above: an admin who is also
  // the requester still needs to be the one who reports what they bought.
  if (isOwner && isAwaitingSelfProcuredDetails) {
    return (
      <ActionRow>
        <ActionButton icon="shopping_cart" label="Enter item details" color="text-intent-progress"
          hoverBg="hover:bg-intent-progress/10" border="border-intent-progress/40"
          title="Tell IT what you bought and what it cost"
          onClick={() => meta.onSubmitSelfProcuredDetails(request)} />
      </ActionRow>
    );
  }

  // ──────────────────────────────────────────────────
  // MANAGER VIEW (non-completed states)
  // ──────────────────────────────────────────────────
  if (role === "MANAGER") {
    if (isPending) {
      return (
        <ActionRow>
          <ActionButton icon="check_circle" label="Approve" color="text-intent-done" hoverBg="hover:bg-intent-done/10"
            border="border-intent-done/40" title="Approve this request"
            tour="requests-approve"
            onClick={() => meta.onApprove(request)} />
          <ActionButton icon="cancel" label="Reject" color="text-intent-stop" hoverBg="hover:bg-intent-stop/10"
            border="border-intent-stop/40" title="Reject this request"
            tour="requests-reject"
            onClick={() => meta.onReject(request)} />
        </ActionRow>
      );
    }
    // The manager's SECOND commitment. They acknowledged the budget when they
    // approved; this is them agreeing to an actual figure. Both outcomes are
    // final, so both verbs live inside the dialog rather than on the row.
    if (isAwaitingQuoteResponse) {
      return (
        <ActionRow>
          <ActionButton icon="request_quote" label="Review quote" color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10" border="border-intent-progress/40"
            title="Accept or reject the quoted cost against your department's budget"
            onClick={() => meta.onReviewQuote(request)} />
        </ActionRow>
      );
    }
    return <BadgeWithTooltip status={deriveStage(request)} />;
  }

  // ──────────────────────────────────────────────────
  // ADMIN VIEW (non-completed states)
  // ──────────────────────────────────────────────────
  if (role === "ADMIN") {
    // Stage 1 — the manager hasn't acted. An admin approving here is standing
    // in for them, which is a different act from the IT sign-off below, so the
    // two stages carry different icons and labels: supervisor_account/"Approve"
    // here, shield_person/"IT sign-off" there. That is what makes the row
    // visibly change when an approval advances it from one to the other.
    //
    // No status badge alongside either one: a row shows a badge only when the
    // viewer's role leaves them nothing to do with it. Both of these are
    // actionable, so they render actions only.
    //
    // Approving is routed through a confirmation dialog by the page; rejecting
    // is already gated by the reason dialog, which carries the on-behalf
    // notice instead.
    if (isPending) {
      return (
        <ActionRow>
          <ActionButton icon="supervisor_account" label="Approve" color="text-intent-done"
            hoverBg="hover:bg-intent-done/10" border="border-intent-done/40"
            title={`Record the manager's approval on their behalf${
              request.manager ? ` (${request.manager} hasn't responded yet)` : ""
            }`}
            onClick={() => meta.onApprove(request)} />
          <ActionButton icon="cancel" label="Reject" color="text-intent-stop" hoverBg="hover:bg-intent-stop/10"
            border="border-intent-stop/40" title="Reject this request"
            onClick={() => meta.onReject(request)} />
        </ActionRow>
      );
    }

    // Stage 2 — the manager has approved (or an admin already did so on their
    // behalf) and this is the admin's own IT sign-off. Same two affordances,
    // but the badge and the label now say which stage the request is at.
    if (isApprovedAwaitingAdmin || isStandardAwaitingIT) {
      return (
        <ActionRow>
          <ActionButton icon="shield_person" label="IT sign-off" color="text-intent-done"
            hoverBg="hover:bg-intent-done/10" border="border-intent-done/40"
            title="Approve and assign an asset"
            onClick={() => meta.onApprove(request)} />
          <ActionButton icon="cancel" label="Reject" color="text-intent-stop" hoverBg="hover:bg-intent-stop/10"
            border="border-intent-stop/40" title="Reject this request"
            onClick={() => meta.onReject(request)} />
        </ActionRow>
      );
    }
    if (isAssetAwaitingModel) {
      return (
        <ActionRow>
          <ActionButton icon="add_circle" label="Create model" color="text-intent-progress" hoverBg="hover:bg-intent-progress/10"
            border="border-intent-progress/40" title="Create the asset model for this request"
            onClick={() => meta.onCreateModel(request)} />
        </ActionRow>
      );
    }
    // The step straight after the model. Ordered before the accessory branches
    // below, though it cannot collide with them — every one of those is gated
    // on isAccessory and this is gated on its negation.
    if (isAssetAwaitingDetails) {
      return (
        <ActionRow>
          <ActionButton
            icon={assetDetailsReady ? "assignment_turned_in" : "assignment"}
            label="Asset details"
            color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10"
            border="border-intent-progress/40"
            title={
              assetDetailsReady
                ? "This asset already has everything Snipe needs — open and save to issue it and complete the request"
                : "Fill in the asset's details so it can be issued to the requester"
            }
            onClick={() => meta.onAssetDetails(request)}
          />
        </ActionRow>
      );
    }
    // Quote stage, IT's half: chase a supplier quote and send it to the
    // manager, or skip the quote entirely when the item is too cheap to be
    // worth it — the phone-case case. Ordered ahead of the selection branch
    // below, which is now gated on the quote being accepted OR skipped.
    if (isAwaitingQuote) {
      return (
        <ActionRow>
          <ActionButton icon="request_quote" label="Send quote" color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10" border="border-intent-progress/40"
            title="Record the supplier's quote and send it to the manager to approve"
            onClick={() => meta.onSendQuote(request)} />
          <ActionButton icon="fast_forward" label="Skip" color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10" border="border-intent-progress/40"
            title="Too cheap to be worth a supplier quote — skip straight to selecting the accessory"
            onClick={() => meta.onSkipQuote(request)} />
        </ActionRow>
      );
    }
    // Quote stage, waiting on the manager. The badge, and ONLY the badge.
    //
    // This is the one place an admin deliberately cannot stand in. They can at
    // the first approval, because that decision is about whether the person
    // should have the thing. This one is about spending the manager's
    // department budget, and IT is not that department — so the row reports the
    // stall and offers nothing. The backend refuses an admin's response too
    // (resolveQuoteActor), which is what makes it true rather than merely
    // unoffered.
    //
    // Exception: an admin who IS the approver here. Their role resolves to
    // ADMIN so they never reach the manager branch above, and without this they
    // could never answer a quote that is genuinely theirs to answer.
    if (isAwaitingQuoteResponse) {
      const isOwnQuote = isApprover(request, meta.currentUserId, meta.currentUserName);

      if (!isOwnQuote) {
        return <BadgeWithTooltip status="AWAITING_QUOTE" />;
      }
      return (
        <ActionRow>
          <ActionButton icon="request_quote" label="Review quote" color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10" border="border-intent-progress/40"
            title="Accept or reject the quoted cost against your department's budget"
            onClick={() => meta.onReviewQuote(request)} />
        </ActionRow>
      );
    }
    // Waiting on IT's review of a self-procured item. Ordered ahead of the
    // selection branch below — selfProcured existing already excludes that
    // branch, but this reads clearer placed where the row's history put it.
    if (isAwaitingProcurementReview) {
      return (
        <ActionRow>
          <ActionButton icon="fact_check" label="Review procurement" color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10" border="border-intent-progress/40"
            title="Review what the requester bought and decide whether to record it in Snipe"
            onClick={() => meta.onReviewSelfProcured(request)} />
        </ActionRow>
      );
    }
    if (isAccessoryAwaitingSelection) {
      return (
        <ActionRow>
          <ActionButton icon="cable" label="Select accessory" color="text-intent-progress" hoverBg="hover:bg-intent-progress/10"
            border="border-intent-progress/40" title="Select or create the accessory for this request"
            onClick={() => meta.onSelectAccessory(request)} />
          {isAwaitingUserProcuredOffer && (
            <ActionButton icon="storefront" label="User Procured" color="text-intent-progress" hoverBg="hover:bg-intent-progress/10"
              border="border-intent-progress/40" title="Too cheap to procure through IT — let the requester buy it themselves"
              onClick={() => meta.onMarkUserProcured(request)} />
          )}
        </ActionRow>
      );
    }
    if (isAccessoryAwaitingStock) {
      return (
        <ActionRow>
          <ActionButton
            icon={accessoryStockReady ? "inventory_2" : "inventory"}
            label={accessoryStockReady ? "Check out" : "Add stock"}
            color="text-intent-progress"
            hoverBg="hover:bg-intent-progress/10"
            border="border-intent-progress/40"
            title={
              accessoryStockReady
                ? "This accessory has stock — check it out and complete the request"
                : "Add the arrived quantity so the accessory can be checked out"
            }
            onClick={() => meta.onAddAccessoryStock(request)}
          />
        </ActionRow>
      );
    }
    return <BadgeWithTooltip status={deriveStage(request)} />;
  }

  // REQUESTER and others on non-completed states: badge only.
  return <BadgeWithTooltip status={deriveStage(request)} />;
}

// --- "Edited by IT" marker ---
//
// Sits in the Reason column beside the Standard / Non-standard badge, in the
// neutral kind-indicator token rather than a lifecycle colour: an edit is not
// a stage, and it must not read as one.
//
// The changes hang off the tooltip rather than the row. A row that printed
// four before/after lines would push the actions column off the screen for the
// handful of requests that were edited, at the cost of every request that
// wasn't — and the detail is only ever wanted when somebody is asking "why
// does this say phone case?".
function EditedMarker({ edit }: { edit: NonNullable<Request["lastEdit"]> }) {
  const when = new Date(edit.editedAt).toLocaleDateString();
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-kind-indicator/10 text-kind-indicator border border-kind-indicator/30 cursor-default">
            <span className="material-symbols-outlined !text-[11px]">edit_note</span>
            Edited
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          <p className="font-semibold mb-1">
            Corrected by {edit.editedBy} on {when}
          </p>
          {edit.changes.length > 0 ? (
            <ul className="space-y-0.5">
              {edit.changes.map((c) => (
                <li key={c.field}>
                  <span className="opacity-70">{c.label}:</span> {c.from} &rarr;{" "}
                  {c.to}
                </li>
              ))}
            </ul>
          ) : (
            <p className="opacity-70">Details unavailable.</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// --- "Auto-approved" marker ---
//
// Same pill treatment as EditedMarker above — small uppercase pill, neutral
// token, tooltip carries the detail — but placed under the Approver's name
// rather than in the Reason column: this is a fact ABOUT the approver (they
// didn't have to click Approve), not about the reason the request exists.
function AutoApprovedMarker({ request }: { request: Request }) {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-kind-indicator/10 text-kind-indicator border border-kind-indicator/30 cursor-default">
            <span className="material-symbols-outlined !text-[11px]">bolt</span>
            Auto-approved
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px]">
          <p>
            {request.manager || "The approver"} is {request.userName}'s direct
            manager in Snipe-IT, so this step didn't need a manual approval.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// --- Actions cell ---
//
// The stage's own actions, plus Edit — which is pinned to the top-right corner
// of the cell and taken OUT OF FLOW.
//
// That is the whole point of the absolute positioning. Edit is offered
// wherever a request has got to, including the many stages this cell answers
// with a bare badge, so laying it out in the row with the others would move
// Approve and Reject sideways on every row that has them, to leave room for a
// control most rows never use. Out of flow, the buttons land in exactly the
// same place whether the pencil is there or not, and it sits above them rather
// than beside them.
//
// The td carries `relative` (see the column's tdClass below) — without it this
// would position against the page instead of the cell.
//
// canEditRequest decides whether it appears at all: admins only, and not on a
// request that is finished, rejected, or a record correction. A courtesy —
// editRequest refuses all of it server-side, and that is what makes it true.
function ActionsCell({ row, table }: { row: Row<Request>; table: Table<Request> }) {
  const meta = table.options.meta as RequestsTableMeta;
  const request = row.original;

  return (
    <>
      <StageActions row={row} table={table} />
      {canEditRequest(request, meta.role) && (
        <IconAction
          className="absolute top-1 right-1"
          icon="edit_note"
          title="Correct this request — it keeps its place in the queue and the requester is emailed what changed"
          onClick={() => meta.onEdit(request)}
        />
      )}
    </>
  );
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
            <span className="text-requester-text bg-requester-bg/30 rounded-full py-1 px-1.5 font-bold text-sm">
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
      // A correction's requestKind is CORRECTION for every row, so asking it
      // whether this is an accessory always answers "no" and every correction
      // rendered an "Asset" badge regardless of what it was actually about.
      // What the correction is ABOUT lives on correctionDetail.subjectKind.
      const isAccessory =
        r.requestKind === "CORRECTION"
          ? r.correctionDetail?.subjectKind === "ACCESSORY"
          : r.requestKind === "ACCESSORY";
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-on-surface-variant">
              {r.categoryName}
            </span>
            {/* Kind badge — says whether the row is an asset or an accessory.
                Icon comes from the same category→icon lookup the request
                forms use, so a "Headphones" accessory badge shows
                headphones rather than a generic accessory glyph.
                Both sit on the neutral `kind-indicator` token: the word and the
                icon already say which, and these used to borrow status-model
                and status-collect — two lifecycle colours that also mean
                "Create model" and "Ready to collect" elsewhere on the same
                row. */}
            {isAccessory ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-kind-indicator/10 text-kind-indicator border border-kind-indicator/30">
                <span className="material-symbols-outlined !text-[11px]">
                  {iconForCategory(r.categoryName)}
                </span>
                Accessory
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-kind-indicator/10 text-kind-indicator border border-kind-indicator/30">
                <span className="material-symbols-outlined !text-[11px]">
                  {iconForCategory(r.categoryName)}
                </span>
                Asset
              </span>
            )}
          </div>
          {/* Line 2: the option's display label (falls back to the raw option),
              styled to match the Call & text / New number / Existing number
              rows below — check icon + text. */}
          {isAccessory && (r.accessoryOptionDisplay ?? r.accessoryOption) && (
            <span className="inline-flex items-center gap-1 text-xs text-info-light">
              <span className="material-symbols-outlined !text-[14px] text-status-success">check</span>
              {r.accessoryOptionDisplay ?? r.accessoryOption}
            </span>
          )}
          {/* Line 3: the correlating accessory — admin label, else Snipe name. */}
          {isAccessory && r.accessoryLinkedLabel && (
            <span className="text-xs text-info-light/70">
              {r.accessoryLinkedLabel}
            </span>
          )}
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
      <div className="max-w-[220px] flex flex-col gap-1 items-start">
        {/* Names what the row accent means, so the accent doesn't have to be
            learned. Lives here rather than in the Request Type cell: that
            cell already stacks up to six lines and carries the Asset /
            Accessory kind badge, and a second badge beside it would read as
            noise rather than emphasis. The reason is also the thing a
            non-standard request exists to explain, so this is its natural home. */}
        {row.original.requestType === "NON_STANDARD" && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-status-nonstandard/10 text-status-nonstandard border border-status-nonstandard/30">
            <span className="material-symbols-outlined !text-[11px]">
              tune
            </span>
            Non-standard
          </span>
        )}
        {/* Standard rows get a badge too, so the column reads as a labelled
            set rather than "some rows are marked and the rest are whatever's
            left". Guarded on requestKind as well: a correction's requestType is
            CORRECTION, but a legacy row could carry STANDARD, and a correction
            must never be labelled as an ordinary request. */}
        {row.original.requestType === "STANDARD" &&
          row.original.requestKind !== "CORRECTION" && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-status-standard/10 text-status-standard border border-status-standard/30">
              <span className="material-symbols-outlined !text-[11px]">
                verified
              </span>
              Standard
            </span>
          )}
        {/* Same treatment for corrections, in their own token — names what the
            orangey-yellow row accent means so the accent doesn't have to be
            learned. Mutually exclusive with the badge above: requestType is
            CORRECTION, never NON_STANDARD. */}
        {row.original.requestKind === "CORRECTION" && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-status-correction/10 text-status-correction border border-status-correction/30">
            <span className="material-symbols-outlined !text-[11px]">
              fact_check
            </span>
            Correction
          </span>
        )}
        {/* Corrections hard-null `reason` at creation and only gain one when
            rejected (the "REJECTED: … REQUEST: …" format ReasonCell parses).
            So an open correction shows what the requester actually reported,
            and a rejected one shows the admin's reason — which is how the
            rejection reason reaches the requester. */}
        <ReasonCell
          text={
            row.original.requestKind === "CORRECTION" && !row.original.reason
              ? row.original.correctionDetail?.description
              : row.original.reason
          }
        />
        {/* This row is not the request that was submitted — IT corrected it.
            Said on the row rather than left to the email, because the email
            went to the requester and the people reading this column are the
            approver and IT, who would otherwise have no way of knowing the
            row moved under them. The tooltip carries the same diff the
            requester was sent. */}
        {row.original.lastEdit && <EditedMarker edit={row.original.lastEdit} />}
        {/* What the requester said they had in mind. Sits under the reason
            because it's the same free-text answer split in two, and an admin
            reads both together when deciding what to issue. */}
        {row.original.preferredModel && (
          <span
            className="inline-flex max-w-full items-center gap-1 text-xs text-info-light"
            title={`Requester has this model in mind: ${row.original.preferredModel}`}
          >
            <span className="material-symbols-outlined !text-[14px] shrink-0 text-info-light">
              lightbulb
            </span>
            <span className="truncate">{row.original.preferredModel}</span>
          </span>
        )}
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
            {row.original.autoApproved && <AutoApprovedMarker request={row.original} />}
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
    // `relative` is load-bearing: it is what the Edit pencil positions against.
    // Without it the pencil escapes to the nearest positioned ancestor and
    // lands somewhere on the page rather than in this cell's corner.
    // min-w gives two full-width pills (e.g. "Send quote" + "Skip", or
    // "Select accessory" + "User Procured") room to sit side by side without
    // feeling cramped now that some stages offer a second action.
    meta: {
      headerClass: "text-center",
      tdClass: "relative text-center whitespace-nowrap min-w-[260px]",
    },
  },
];