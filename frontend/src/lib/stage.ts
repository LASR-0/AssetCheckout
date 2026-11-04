///  +-----------------------------------------------------------------+
///  |          REQUEST STAGE DERIVATION                |
///  +-----------------------------------------------------------------+
//
//  Where a request is up to, derived from the data it carries. Pure: no
//  React, no presentation. The requests log, Home, Stock and the route model
//  (lib/route.ts) all read stages from here, so they cannot disagree.
//
//  Moved out of components/ui/statusbadge.tsx, which now only draws badges.

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
  /** LOAN rows only. Present from collection onwards is what turns a
   *  finished handover into a running loan — see deriveLoanStage. */
  loan?: LoanInput | null;
};

///  +-----------------------------------------------------------------+
///  |                 WHERE A LOAN IS UP TO                           |
///  +-----------------------------------------------------------------+
//
//  A device is borrowed, not issued. Its handover half is byte-for-byte the
//  ordinary one — IT assigns, a keeper makes it ready, the requester collects
//  it — and deriveFulfilment below is left to answer that half unchanged, so
//  the stock keeper's queues pick loans up without knowing they exist.
//
//  What differs is that collection is the START of the interesting part, not
//  the end of the story. So only the BADGE diverges after receivedAt, and it
//  diverges here.
//
//  COMPARED AS CALENDAR DAYS, NOT INSTANTS. "Due back on the 5th" means the
//  whole of the 5th, and a loan due at some particular millisecond is not a
//  thing anybody asked for. The due date is written as UTC midnight of the day
//  the requester picked, so its UTC parts ARE that calendar date; today is
//  read in the viewer's local parts. Comparing those two as day numbers is
//  what stops a Brisbane keeper being told a device is overdue at 10am on the
//  day it is actually due, which is what any instant comparison gives you.
///  +-----------------------------------------------------------------+

export type LoanInput = {
  /** ISO. The due-back date — the day the return action unlocks. */
  endDate: string;
  /** Set only once Snipe agreed to the check-in. */
  returnedAt?: string | null;
};

/** A calendar date as one comparable integer, e.g. 2026-10-05 -> 20261005. */
function dayKey(year: number, month: number, day: number): number {
  return year * 10000 + month * 100 + day;
}

/** The due date's own calendar day, read from its UTC parts — see above. */
function dueDayKey(endDate: string): number {
  const d = new Date(endDate);
  if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
  return dayKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Today, in the viewer's own timezone. */
function todayKey(now: Date): number {
  return dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export type LoanStage = "ON_LOAN" | "DUE_BACK" | "OVERDUE" | "RETURNED";

/**
 * Where a collected loan is up to. `now` is injectable so the day-boundary
 * cases are testable without freezing the clock.
 *
 * DUE_BACK and OVERDUE are one decision, not two: the return unlocks on the
 * due date and stays unlocked, and the split exists only so a loan nobody has
 * brought back reads red rather than amber. Anything that asks "can this be
 * returned" should call isReturnable, not test the stage.
 */
export function deriveLoanStage(loan: LoanInput, now: Date = new Date()): LoanStage {
  if (loan.returnedAt) return "RETURNED";

  const due = dueDayKey(loan.endDate);
  const today = todayKey(now);

  if (today > due) return "OVERDUE";
  if (today === due) return "DUE_BACK";
  return "ON_LOAN";
}

/**
 * Has the loan reached its due date? This is the unlock rule for the stock
 * keeper's Return action.
 *
 * ADMINS ARE NOT HELD TO IT — see the return route. An event that finishes
 * early still ends with somebody standing at the desk holding a device, and
 * refusing to take it back because the spreadsheet says Thursday is worse
 * than the inconsistency.
 */
export function isReturnable(loan: LoanInput, now: Date = new Date()): boolean {
  if (loan.returnedAt) return false;
  return todayKey(now) >= dueDayKey(loan.endDate);
}

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
// Ship path:    assigned (awaiting dispatch) → shipped → ready to collect
//                                                      → collected
//
// THE TWO PATHS NOW CONVERGE. needsShipping used to fork the whole tail into
// two different endings; it only decides whether there is a courier leg in the
// middle. Both end at a stock keeper marking the device ready, then the
// requester collecting it — so isReadyToCollect is no longer collect-path-only,
// and a shipped request stops reading as SHIPPED the moment it is handed over.
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
    isCompleted && !!collectionReadyAt && !receivedAt;

  const isShipAwaitingPrep =
    isCompleted && needsShipping && !shippedAt && !receivedAt;
  // In transit, or delivered but not yet handed over. Ends at the stock
  // keeper's mark, which is why collectionReadyAt closes it.
  const isShipped =
    isCompleted && needsShipping && !!shippedAt && !collectionReadyAt && !receivedAt;

  const isReceivedOrCollected = isCompleted && !!receivedAt;

  // A LOAN DOES NOT END AT COLLECTION. Every boolean above stays honest for a
  // device — the handover half really is the ordinary one, which is what lets
  // the stock keeper's queues pick loans up without knowing they exist. Only
  // the badge diverges, and only from receivedAt onwards, because that is
  // where "the requester has it" stops meaning "finished" and starts meaning
  // "the clock is running".
  const loan = request.requestKind === "LOAN" ? request.loan ?? null : null;

  const badgeKey = !isCompleted
    ? request.status
    : isReceivedOrCollected
    ? (loan ? deriveLoanStage(loan) : needsShipping ? "RECEIVED" : "COLLECTED")
    // Before isShipped, which a handed-over shipment no longer satisfies
    // anyway — ordered this way so the two can't both be true by accident.
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
  selfProcured?: { status?: string | null } | null;
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

    // A loan has no manager stage, so APPROVED is where it is BORN rather than
    // somewhere it was promoted to, and adminApprovedAt is the only sign-off it
    // will ever collect. Without this it fell through to the bare "Approved"
    // below and the one row in the system that is genuinely sitting in IT's lap
    // was the one that did not say so.
    if (request.requestKind === "LOAN" && !request.adminApprovedAt)
      return "AWAITING_IT";

    // Handed off to the requester instead of an accessory being selected —
    // waiting on them to report what they bought, then on IT to review it.
    // Checked before APPROVED falls through below, on the same terms as
    // AWAITING_QUOTE above: a request sitting here would otherwise just read
    // as a bare "Approved" with nothing to say why.
    if (request.selfProcured?.status === "AWAITING_DETAILS")
      return "AWAITING_SELF_PROCUREMENT";
    if (request.selfProcured?.status === "AWAITING_REVIEW")
      return "AWAITING_PROCUREMENT_REVIEW";

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
//  RETURNED joins them and ON_LOAN deliberately does not: a running loan is a
//  request whose hardware is still out, which is the opposite of done however
//  settled it looks. DUE_BACK and OVERDUE are likewise in flight.
const DONE_STAGES = new Set(["COLLECTED", "RECEIVED", "COMPLETED", "RETURNED"]);

export function isDoneStage(stage: string): boolean {
  return DONE_STAGES.has(stage);
}
