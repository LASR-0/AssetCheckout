import type { Request } from "@/types/requestType";
import type { Role, StockKeeperLocation } from "@/types/authType";
import { canActAsStockKeeper, isApprover, isRequestee } from "@/lib/permissions";
import { deriveLoanStage, deriveStage, isReturnable } from "@/lib/stage";
import { parseReason } from "@/lib/reason";
import { dayDate } from "@/lib/format";

///  +-----------------------------------------------------------------+
///  |                  THE ROUTE                                      |
///  +-----------------------------------------------------------------+
//
//  A request as a line of stations, like a parcel tracker: what has
//  happened, where it is now, who holds it, and what is still to come. The
//  route rail (full, inline and micro), the inspector's chain of custody
//  and every "whose move is it?" answer in the app are drawn from this, so
//  Home, Requests and Stock cannot tell a different story about one request.
//
//  DERIVED, NOT STORED. Every station's done-ness is a read of data the
//  request already carries (timestamps, the quote's status, the model
//  request's ids), the same way lib/stage.ts derives the single stage. The
//  steps and their order are fixed by the workflow (redesign-brief
//  core/02-workflows.md); this only reads where along them a request is.
//
//  FUTURE STATIONS ARE A FORECAST. Ship-or-collect is decided at checkout,
//  so before then the tail is drawn as the collection path; it becomes the
//  shipping path the moment fulfilment says so. Likewise a non-standard
//  accessory is drawn down the "select accessory" branch until IT hands it
//  to the requester to buy.
///  +-----------------------------------------------------------------+

export type StepKey =
  | "mgr" | "it" | "model" | "details"
  | "quote" | "review" | "select" | "stock"
  | "handoff" | "purchase" | "procrev"
  | "assign" | "ship" | "arrive" | "prep"
  | "collect" | "receive" | "lreceive" | "lcollect" | "lreturn"
  | "manage";

/** Who has to move for a step to complete. */
export type HolderRole = "manager" | "it" | "keeper" | "requestee";

export type StationState = "done" | "current" | "future" | "cut";

export type Station = {
  key: StepKey | "filed";
  /** What happened (done), or what is waiting to happen (current, future). */
  label: string;
  state: StationState;
  /** ISO timestamp, when the data records one. */
  at: string | null;
  /** Who did it, when the data records that. */
  by: string | null;
  /** The leg INTO this station is a courier leg (dashed on the rail). */
  transit: boolean;
};

export type Route = {
  stations: Station[];
  /** Index of the current (or cut) station; stations.length once finished. */
  current: number;
  finished: boolean;
  rejected: { reason: string | null; by: string | null; at: string | null } | null;
  /** A write to Snipe failed and is waiting on IT: the segment is broken. */
  blocked: string | null;
  /** The single stage key (lib/stage.ts), for the state chip and filters. */
  stage: string;
  /** The current step's key, or null once finished or rejected. */
  step: StepKey | null;
};

type StepDef = {
  holder: HolderRole;
  /** Label once done. `{site}` is the requestee's site. */
  done: string;
  /** Label while current or still to come. */
  open: string;
  /** The viewer-facing primary action for whoever holds the step. */
  action: string;
  isDone: (r: Request) => boolean;
  at?: (r: Request) => string | null | undefined;
  by?: (r: Request) => string | null | undefined;
};

const completed = (r: Request) => r.status === "COMPLETED";

const STEPS: Record<StepKey, StepDef> = {
  mgr: {
    holder: "manager",
    done: "Manager approved",
    open: "Manager approval",
    action: "Approve",
    isDone: (r) => !!r.approvedAt || !!r.autoApproved || (r.status !== "PENDING" && r.status !== "REJECTED"),
    at: (r) => r.approvedAt,
    by: (r) => r.approvedBy,
  },
  it: {
    holder: "it",
    done: "IT signed off",
    open: "IT sign-off",
    action: "IT sign-off",
    // Standard requests record the sign-off on adminApprovedAt (and it
    // fulfils in the same click); non-standard ones advance the model
    // request off PENDING instead. See deriveStage.
    isDone: (r) =>
      !!r.adminApprovedAt ||
      completed(r) ||
      (!!r.modelRequest && r.modelRequest.status !== undefined && r.modelRequest.status !== "PENDING"),
    at: (r) => r.adminApprovedAt,
    by: (r) => r.adminApprovedBy,
  },
  model: {
    holder: "it",
    done: "Model linked",
    open: "Create model",
    action: "Create model",
    isDone: (r) => r.modelRequest?.snipeModelId != null || r.modelRequest?.linkedAssetId != null || completed(r),
  },
  details: {
    holder: "it",
    done: "Asset details saved · checked out",
    open: "Asset details",
    action: "Asset details",
    isDone: completed,
    at: (r) => r.fulfilledAt,
  },
  quote: {
    holder: "it",
    done: "Quote sent",
    open: "Quote",
    action: "Send quote",
    isDone: (r) => !!r.quoteDetail || !!r.quoteSkippedAt,
    at: (r) => r.quoteDetail?.sentAt ?? r.quoteSkippedAt,
    by: (r) => r.quoteDetail?.sentBy ?? r.quoteSkippedBy,
  },
  review: {
    holder: "manager",
    done: "Quote accepted",
    open: "Quote review",
    action: "Review quote",
    isDone: (r) => r.quoteDetail?.status === "ACCEPTED",
    at: (r) => r.quoteDetail?.respondedAt,
    by: (r) => r.quoteDetail?.respondedBy,
  },
  select: {
    holder: "it",
    done: "Accessory selected",
    open: "Select accessory",
    action: "Select accessory",
    isDone: (r) => r.modelRequest?.snipeAccessoryId != null || completed(r),
  },
  stock: {
    holder: "it",
    done: "Stock added · checked out",
    open: "Stock and checkout",
    action: "Add stock",
    isDone: completed,
    at: (r) => r.fulfilledAt,
  },
  handoff: {
    holder: "it",
    done: "Handed to requester to buy",
    open: "Select accessory",
    action: "Select accessory",
    isDone: (r) => !!r.selfProcured,
    at: (r) => r.selfProcured?.markedAt,
    by: (r) => r.selfProcured?.markedBy,
  },
  purchase: {
    holder: "requestee",
    done: "Item details entered",
    open: "Purchase",
    action: "Enter item details",
    isDone: (r) => !!r.selfProcured?.submittedAt,
    at: (r) => r.selfProcured?.submittedAt,
    by: (r) => r.userName,
  },
  procrev: {
    holder: "it",
    done: "Purchase reviewed",
    open: "Purchase review",
    action: "Review procurement",
    isDone: (r) => r.selfProcured?.status === "COMPLETED",
    at: (r) => r.selfProcured?.reviewedAt,
    by: (r) => r.selfProcured?.reviewedBy,
  },
  assign: {
    holder: "it",
    done: "Device assigned",
    open: "Device assignment",
    action: "Assign device",
    isDone: completed,
    at: (r) => r.fulfilledAt ?? r.adminApprovedAt,
    by: (r) => r.adminApprovedBy,
  },
  ship: {
    holder: "it",
    done: "Shipped",
    open: "Ready to ship",
    action: "Mark shipped",
    isDone: (r) => !!r.shippedAt || !!r.receivedAt,
    at: (r) => r.shippedAt,
  },
  arrive: {
    holder: "keeper",
    done: "Arrived at {site}",
    open: "Arrival at {site}",
    action: "Mark ready to collect",
    isDone: (r) => !!r.collectionReadyAt || !!r.receivedAt,
    at: (r) => r.collectionReadyAt,
  },
  prep: {
    holder: "keeper",
    done: "Ready at {site}",
    open: "Getting it ready at {site}",
    action: "Mark ready to collect",
    isDone: (r) => !!r.collectionReadyAt || !!r.receivedAt,
    at: (r) => r.collectionReadyAt,
  },
  collect: {
    holder: "requestee",
    done: "Collected",
    open: "Collection at {site}",
    action: "Mark collected",
    isDone: (r) => !!r.receivedAt,
    at: (r) => r.receivedAt,
    by: (r) => r.userName,
  },
  receive: {
    holder: "requestee",
    done: "Received",
    open: "Collection at {site}",
    action: "Mark collected",
    isDone: (r) => !!r.receivedAt,
    at: (r) => r.receivedAt,
    by: (r) => r.userName,
  },
  // Legacy shipments predate stock keepers: the requester confirms delivery
  // directly, with no keeper station in between.
  lreceive: {
    holder: "requestee",
    done: "Received",
    open: "Delivery to {site}",
    action: "Mark received",
    isDone: (r) => !!r.receivedAt,
    at: (r) => r.receivedAt,
    by: (r) => r.userName,
  },
  lcollect: {
    holder: "requestee",
    done: "Collected · loan started",
    open: "Collection at {site}",
    action: "Mark collected",
    isDone: (r) => !!r.receivedAt,
    at: (r) => r.receivedAt,
    by: (r) => r.userName,
  },
  lreturn: {
    holder: "requestee",
    done: "Returned",
    open: "Return, due {due}",
    action: "Mark returned",
    isDone: (r) => !!r.loan?.returnedAt,
    at: (r) => r.loan?.returnedAt,
    by: (r) => r.loan?.returnedBy,
  },
  manage: {
    holder: "it",
    done: "Resolved by IT",
    open: "IT review",
    action: "Manage",
    isDone: completed,
  },
};

/** What a request is, for choosing its route. Older rows predate requestKind. */
export function kindOf(r: Request): "ASSET" | "ACCESSORY" | "LOAN" | "CORRECTION" {
  if (r.requestKind) return r.requestKind;
  if (r.requestType === "LOAN") return "LOAN";
  if (r.requestType === "CORRECTION") return "CORRECTION";
  return "ASSET";
}

/** The handover tail after checkout, ending at `final`. */
function handover(r: Request, final: StepKey): StepKey[] {
  if (!r.needsShipping) return ["prep", final];
  if (r.legacyShipment) return ["ship", final === "lcollect" ? final : "lreceive"];
  return ["ship", "arrive", final];
}

/** The fixed order of steps for this request (02-workflows.md §2). */
export function stepsFor(r: Request): StepKey[] {
  const kind = kindOf(r);
  if (kind === "CORRECTION") return ["manage"];
  if (kind === "LOAN") return ["assign", ...handover(r, "lcollect"), "lreturn"];

  const final: StepKey = r.needsShipping ? "receive" : "collect";
  if (r.requestType !== "NON_STANDARD") return ["mgr", "it", ...handover(r, final)];
  if (kind === "ASSET") return ["mgr", "it", "model", "details", ...handover(r, final)];

  // Non-standard accessory: the department pays, so there is a quote stage,
  // then either a selected accessory or the requester buying it themselves.
  const quote: StepKey[] = r.quoteSkippedAt ? ["quote"] : ["quote", "review"];
  const sourcing: StepKey[] = r.selfProcured
    ? ["handoff", "purchase", "procrev"]
    : ["select", "stock", ...handover(r, final)];
  return ["mgr", "it", ...quote, ...sourcing];
}

const FILED_LABEL = { ASSET: "Filed", ACCESSORY: "Filed", LOAN: "Booked", CORRECTION: "Reported" };

/** A loan's due date as "3 Nov". */
function dueLabel(r: Request): string {
  return dayDate(r.loan?.endDate);
}

function fill(label: string, r: Request): string {
  const site = r.userLocationName?.trim();
  return label
    .replace(/ (at|to) \{site\}/, site ? ` $1 ${site}` : "")
    .replace("{site}", site ?? "")
    .replace("{due}", dueLabel(r))
    .trim();
}

function openLabel(key: StepKey, r: Request, now: Date, isCurrent: boolean): string {
  // Only once it is out: before collection the return is still a forecast.
  if (key === "lreturn" && isCurrent && r.loan && deriveLoanStage(r.loan, now) === "ON_LOAN") {
    return fill("On loan, due {due}", r);
  }
  if (key === "quote" && r.quoteSkippedAt) return "Quote skipped";
  return fill(STEPS[key].open, r);
}

function doneLabel(key: StepKey, r: Request): string {
  if (key === "mgr" && r.autoApproved && !r.approvedBy) return "Auto-approved";
  if (key === "quote" && r.quoteSkippedAt) return "Quote skipped";
  return fill(STEPS[key].done, r);
}

export function buildRoute(r: Request, now: Date = new Date()): Route {
  const keys = stepsFor(r);
  const isRejected = r.status === "REJECTED";

  // The first step not yet done is where the request is. Steps are strictly
  // ordered, so a done step after an undone one would be a data anomaly;
  // stopping at the first gap keeps the rail honest about it.
  let current = keys.findIndex((k) => !STEPS[k].isDone(r));
  if (current === -1) current = keys.length;
  const finished = !isRejected && current === keys.length;

  const kind = kindOf(r);
  const stations: Station[] = [
    {
      key: "filed",
      label: FILED_LABEL[kind],
      state: "done",
      at: r.createdAt,
      by: null,
      transit: false,
    },
  ];

  keys.forEach((key, i) => {
    const def = STEPS[key];
    const state: StationState =
      i < current ? "done" : i === current ? (isRejected ? "cut" : "current") : "future";
    stations.push({
      key,
      label: state === "done" ? doneLabel(key, r) : state === "cut" ? "Rejected" : openLabel(key, r, now, state === "current"),
      state,
      at: state === "done" ? def.at?.(r) ?? null : state === "cut" ? r.rejectedAt ?? null : null,
      by: state === "done" ? def.by?.(r) ?? null : state === "cut" ? r.rejectedBy ?? null : null,
      transit: key === "arrive",
    });
  });

  const blocked =
    !finished && !isRejected
      ? (kind === "CORRECTION" ? r.correctionDetail?.applyError : r.loan?.checkinError) ?? null
      : null;

  return {
    stations,
    // +1 for the filed station at the head of the line.
    current: finished ? stations.length : current + 1,
    finished,
    rejected: isRejected
      ? {
          reason: parseReason(r.reason)?.rejected ?? null,
          by: r.rejectedBy ?? null,
          at: r.rejectedAt ?? null,
        }
      : null,
    blocked,
    stage: deriveStage(r),
    step: finished || isRejected ? null : keys[current],
  };
}

///  +-----------------------------------------------------------------+
///  |                  WHOSE MOVE IS IT?                              |
///  +-----------------------------------------------------------------+

export type Viewer = {
  userId: number | null;
  name: string;
  role: Role;
  stockKeeperLocations: StockKeeperLocation[];
};

export type Holder = {
  role: HolderRole;
  /** "With you", "With IT", "With the Perth stock keeper", "In transit → Perth". */
  label: string;
  /** Quiet qualifier after the label: " · manager", " · to return". */
  detail: string;
  icon: string;
};

/** Who holds the request now, worded for this viewer. Null once it's over. */
export function holderOf(r: Request, route: Route, viewer: Viewer): Holder | null {
  if (!route.step) return null;
  const step = route.step;
  const role = STEPS[step].holder;
  const site = r.userLocationName?.trim();

  if (role === "manager") {
    const mine = isApprover(r, viewer.userId, viewer.name);
    return mine
      ? { role, label: "With you", detail: "", icon: "person" }
      : { role, label: `With ${r.manager ?? "the manager"}`, detail: " · manager", icon: "person" };
  }
  if (role === "it") return { role, label: "With IT", detail: "", icon: "support_agent" };
  if (role === "keeper") {
    const keepsIt =
      r.userLocationId != null && viewer.stockKeeperLocations.some((l) => l.id === r.userLocationId);
    if (keepsIt) return { role, label: "With you", detail: "", icon: "storefront" };
    if (step === "arrive") {
      return { role, label: site ? `In transit → ${site}` : "In transit", detail: "", icon: "local_shipping" };
    }
    return {
      role,
      label: site ? `With the ${site} stock keeper` : "With the stock keeper",
      detail: "",
      icon: "storefront",
    };
  }
  const mine = isRequestee(r, viewer.userId, viewer.name);
  const detail = step === "lreturn" ? " · to return" : mine ? "" : " · requester";
  return { role, label: mine ? "With you" : `With ${r.userName}`, detail, icon: "person" };
}

/**
 * Can this viewer take the current step's action? The action matrix in
 * 02-workflows.md §5, built on the same permission helpers the backend's
 * checks mirror, so the UI never offers what the API would refuse.
 *
 * Wider than needsMyAction (lib/permissions.ts) on purpose: that one counts
 * what is BLOCKED on you for the badge; this says what you COULD do.
 */
export function canAct(r: Request, route: Route, viewer: Viewer, now: Date = new Date()): boolean {
  const step = route.step;
  if (!step) return false;
  const admin = viewer.role === "ADMIN";

  switch (STEPS[step].holder) {
    case "manager":
      // Admins may approve on a manager's behalf, but a quote comes out of
      // the approver's budget, so only the approver reviews it.
      return isApprover(r, viewer.userId, viewer.name) || (step === "mgr" && admin);
    case "it":
      return admin;
    case "keeper":
      return canActAsStockKeeper(viewer.role, viewer.stockKeeperLocations, r.userLocationId ?? null);
    case "requestee":
      if (step === "lreturn") {
        if (!r.loan) return false;
        // Admins can take a loan back early; keepers only from the due date.
        if (admin) return true;
        return (
          isReturnable(r.loan, now) &&
          canActAsStockKeeper(viewer.role, viewer.stockKeeperLocations, r.userLocationId ?? null)
        );
      }
      return isRequestee(r, viewer.userId, viewer.name);
  }
}

/** The label for the current step's primary action. */
export function actionFor(r: Request, route: Route, now: Date = new Date()): string | null {
  const step = route.step;
  if (!step) return null;
  if (step === "lreturn" && r.loan) {
    if (r.loan.checkinError) return "Retry return";
    if (deriveLoanStage(r.loan, now) === "ON_LOAN") return "Return early";
  }
  if (step === "stock" && (r.accessoryRemaining ?? 0) > 0) return "Check out";
  return STEPS[step].action;
}

///  +-----------------------------------------------------------------+
///  |                  THE STATE CHIP'S VOCABULARY                    |
///  +-----------------------------------------------------------------+
//
//  One label per stage (filters key on them), an icon, and one of three
//  intents. Terminal outcomes are done (green) or stop (red); everything a
//  person is still waiting on is progress (amber), except a running loan,
//  which is settled until its due date.

export type StageIntent = "ok" | "prog" | "stop";

export const STAGE_META: Record<string, { label: string; icon: string; intent: StageIntent }> = {
  PENDING: { label: "Pending", icon: "hourglass_top", intent: "prog" },
  AWAITING_IT: { label: "Awaiting IT", icon: "pending_actions", intent: "prog" },
  APPROVED: { label: "Approved", icon: "build", intent: "prog" },
  AWAITING_QUOTE: { label: "Quote with manager", icon: "request_quote", intent: "prog" },
  AWAITING_SELF_PROCUREMENT: { label: "Awaiting purchase", icon: "shopping_bag", intent: "prog" },
  AWAITING_PROCUREMENT_REVIEW: { label: "Awaiting IT review", icon: "fact_check", intent: "prog" },
  ASSIGNED: { label: "Assigned", icon: "inventory_2", intent: "prog" },
  SHIPPED: { label: "Shipped", icon: "local_shipping", intent: "prog" },
  READY_TO_COLLECT: { label: "Ready to collect", icon: "storefront", intent: "prog" },
  ON_LOAN: { label: "On loan", icon: "schedule", intent: "ok" },
  DUE_BACK: { label: "Due back", icon: "event_upcoming", intent: "prog" },
  OVERDUE: { label: "Overdue", icon: "error", intent: "stop" },
  COLLECTED: { label: "Collected", icon: "check_circle", intent: "ok" },
  RECEIVED: { label: "Received", icon: "check_circle", intent: "ok" },
  RETURNED: { label: "Returned", icon: "assignment_return", intent: "ok" },
  COMPLETED: { label: "Completed", icon: "check_circle", intent: "ok" },
  REJECTED: { label: "Rejected", icon: "cancel", intent: "stop" },
};

export function stageMeta(stage: string) {
  return STAGE_META[stage] ?? { label: stage, icon: "help", intent: "prog" as StageIntent };
}
