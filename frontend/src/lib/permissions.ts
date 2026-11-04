import type { Role, StockKeeperLocation } from "@/types/authType";
import type { Request } from "@/types/requestType";

/**
 * "Is this request mine?" — as requestee, and as nominated approver.
 *
 * Compares Snipe user ids, because that is what the request stores and it is
 * the only identifier the two directories agree on. The display name from SSO
 * and the one on the request come from different systems, so a name
 * comparison quietly fails for anyone they spell differently.
 *
 * The name comparison is kept as a fallback for two cases: a rehired employee
 * whose older requests carry their previous Snipe id, and a session where the
 * id could not be resolved at all (userId null). It mirrors what the backend
 * does in requestRoutes and resolveQuoteActor — these must agree, or the UI
 * offers an action the API then refuses.
 */
function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a ?? "").trim().toLowerCase();
  return left.length > 0 && left === (b ?? "").trim().toLowerCase();
}

export function isRequestee(
  request: Pick<Request, "userId" | "userName">,
  userId: number | null,
  userName: string
): boolean {
  if (userId !== null && request.userId === userId) return true;
  return sameName(request.userName, userName);
}

export function isApprover(
  request: Pick<Request, "managerId" | "manager">,
  userId: number | null,
  userName: string
): boolean {
  if (userId !== null && request.managerId === userId) return true;
  return sameName(request.manager, userName);
}


///  +-----------------------------------------------------------------+
///  |                   WHAT IS WAITING ON YOU                        |
///  +-----------------------------------------------------------------+
//
//  The nav badge says "5 requests need you" and then leaves the reader to
//  find them in a table of a hundred rows. This is the predicate that closes
//  that loop — it drives the row marker and the "Needs you" filter, so the
//  number, the dots and the filtered list are three views of one rule rather
//  than three rules that happen to agree today.
//
//  MIRRORS /api/requests/action-counts. If the two drift, the badge counts
//  rows the filter won't show, which is worse than having no badge: it sends
//  somebody hunting for work that isn't there.
//
//  DELIBERATELY NARROW. It is not "rows you could act on" — an admin can
//  touch almost anything, and a badge that counts the whole table is
//  furniture. These are the states where somebody is actually blocked waiting
//  for a reply. Stock-keeper handovers are excluded on purpose: they have
//  their own badge on the Stock tab, and counting them here would double up.
///  +-----------------------------------------------------------------+

export function needsMyAction(
  request: Request,
  role: Role,
  userId: number | null,
  userName: string
): boolean {
  // Your approval, and the requester is waiting on it.
  if (request.status === "PENDING" && isApprover(request, userId, userName)) {
    return true;
  }

  // Your device, marked ready, and nobody has confirmed you picked it up.
  if (
    request.status === "COMPLETED" &&
    !!request.collectionReadyAt &&
    !request.receivedAt &&
    isRequestee(request, userId, userName)
  ) {
    return true;
  }

  // IT sign-off outstanding after the manager approved it.
  if (
    role === "ADMIN" &&
    request.status === "APPROVED" &&
    !request.adminApprovedAt
  ) {
    return true;
  }

  return false;
}

/**
 * Should this row carry the "new and yours" marker?
 *
 * BOTH HALVES, deliberately. Workflow state alone would nag somebody for a
 * fortnight about a request that is blocked on a supplier, not on them —
 * which is how an indicator gets tuned out. Read state alone would mark
 * everything new, including rows that are none of their business.
 *
 * The marker is dismissible; the WORK is not. Hovering clears this, and the
 * "Needs you" filter — which is needsMyAction on its own — still finds the
 * request afterwards. That separation is the whole point: stop the nudge
 * without hiding the job.
 *
 * Note this is the requests log's rule only. The stock page's queues stay
 * purely state-based and cannot be dismissed, because a device waiting to be
 * handed over is never blocked on anybody but its keeper.
 */
export function isUnseenAction(
  request: Request,
  role: Role,
  userId: number | null,
  userName: string
): boolean {
  if (request.seenByMe) return false;
  return needsMyAction(request, role, userId, userName);
}

///  +-----------------------------------------------------------------+
///  |                   ACTING AS A STOCK KEEPER                      |
///  +-----------------------------------------------------------------+
//
//  Mirrors canActAsStockKeeper in the backend's config/auth.ts, and is held
//  to the same contract as isApprover above: the two must agree, or a row
//  offers a button the API then refuses.
//
//  ADMINS EVERYWHERE. Not a shortcut — it is what stops a location with no
//  assigned keeper from stranding its requests at "waiting to be made ready"
//  with nobody able to advance them, and it covers head office, where the IT
//  admin genuinely is the stock keeper.
//
//  A NULL LOCATION IS ADMIN-ONLY. A request with no location recorded (filed
//  before locations were stamped, or a requester with no Snipe location) has
//  no site for an assignment to match. Falling open there would hand every
//  keeper every unplaceable request in the system.
///  +-----------------------------------------------------------------+

export function canActAsStockKeeper(
  role: Role,
  stockKeeperLocations: StockKeeperLocation[],
  locationId: number | null
): boolean {
  if (role === "ADMIN") return true;
  if (locationId === null) return false;
  return stockKeeperLocations.some((l) => l.id === locationId);
}

/**
 * Does this actor keep stock anywhere at all? Drives whether stock-keeper
 * surfaces are offered in the first place — a location filter, a stock page —
 * as distinct from whether they may act on one particular request.
 *
 * An admin with no assignment is NOT a stock keeper by this test, and that is
 * intentional: they can act anywhere, but they have no home site, so a
 * "requests at my location" view would have nothing to scope to. Their route
 * into that work is the admin view, which already shows everything.
 */
export function isStockKeeper(
  stockKeeperLocations: StockKeeperLocation[]
): boolean {
  return stockKeeperLocations.length > 0;
}

///  +-----------------------------------------------------------------+
///  |                      WHO CAN EDIT A REQUEST                     |
///  +-----------------------------------------------------------------+
//
//  Mirrors the guards in the backend's editRequest. These two must agree, or
//  the row offers a pencil the API then refuses — the same contract the
//  approver checks above are held to.
//
//  The backend is what MAKES it true; this is what stops the UI lying about
//  it. Neither is redundant.
///  +-----------------------------------------------------------------+

/**
 * Can this request be corrected at all?
 *
 * Admins only: editing is IT fixing somebody else's request on their behalf,
 * which is why the requester gets emailed the diff afterwards.
 *
 * Corrections are excluded (they carry their own detail row and their own
 * dialog, and none of the editable fields apply). So are finished and rejected
 * requests: a completed request has hardware checked out against it in Snipe,
 * and editing the paperwork afterwards only makes the two disagree.
 */
export function canEditRequest(request: Request, role: Role): boolean {
  if (role !== "ADMIN") return false;
  if (request.requestKind === "CORRECTION" || request.requestType === "CORRECTION") {
    return false;
  }
  return request.status !== "COMPLETED" && request.status !== "REJECTED";
}

/**
 * Can WHAT is being requested still change — the kind, the category, the spec
 * level, the accessory option?
 *
 * False once IT has built something from those fields: a Snipe model, a
 * skeleton asset, a linked accessory, or a supplier's quote for one specific
 * item. Rewriting them then would leave the request describing one thing and
 * pointing at another. The softer fields (approver, reason, preferred model,
 * phone options) stay editable either way.
 *
 * A bare ModelRequest with no Snipe id on it does NOT count: one is created
 * the moment a non-standard request is approved, and it is empty at that
 * point.
 */
export function canEditRequestShape(request: Request): boolean {
  const mr = request.modelRequest;
  const linked =
    !!mr &&
    ((mr.snipeModelId ?? null) !== null ||
      (mr.linkedAssetId ?? null) !== null ||
      (mr.snipeAccessoryId ?? null) !== null);
  return !linked && !request.quoteDetail;
}
