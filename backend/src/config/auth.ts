import { Request } from "express";

const raw = process.env.ADMIN_EMAILS ?? "";

export const ADMIN_EMAILS: string[] = raw
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const DEV_AUTH_ENABLED = process.env.NODE_ENV === "development";

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

///  +-----------------------------------------------------------------+
///  |                     WHOSE REQUEST IS THIS?                      |
///  +-----------------------------------------------------------------+
//
//  ONE PREDICATE, TWO CALLERS. The requests list and the role endpoint have
//  to agree about what "mine" means; when they disagreed, the answer was a
//  table of rows rendered with every column hidden.
//
//  ID FIRST, NAME SECOND. A request stores the Snipe user id of both the
//  requestee and the approver, picked from the same directory. The actor
//  arrives from SSO as an email that resolves to that same id. The display
//  names, by contrast, come from two systems that spell people differently
//  (middle names, "Last, First", a surname changed in one and not the other)
//  and matching on them hid people's own requests from them.
//
//  THE NAME CLAUSE STAYS as a widening fallback, never a narrowing one. It
//  covers a rehired employee, whose older requests carry the Snipe id of an
//  account they no longer have, and any session where the id could not be
//  resolved at all. It carries a known cost that predates it: two people who
//  genuinely share a display name match each other. Dropping it would close
//  that and re-break rehires, so it is a deliberate trade.
///  +-----------------------------------------------------------------+

export type Actor = {
  /** Snipe user id, or null when it could not be resolved. */
  id: number | null;
  /** SSO display name; "" when absent. */
  name: string;
};

/** A request row, reduced to the four fields that carry identity. */
export type RequestIdentity = {
  userId: number;
  userName: string;
  managerId: number;
  manager: string | null;
};

function sameName(a: string | null, b: string): boolean {
  if (!a) return false;
  const left = normalizeName(a);
  return left.length > 0 && left === normalizeName(b);
}

// Each predicate asks for only the fields it reads, so a caller that has
// selected half the row (resolveQuoteActor wants the approver alone) can use
// it without inventing the other half.

/** Is the actor the person this request is FOR? Not who submitted it. */
export function isRequestee(
  request: Pick<RequestIdentity, "userId" | "userName">,
  actor: Actor
): boolean {
  if (actor.id !== null && request.userId === actor.id) return true;
  return sameName(request.userName, actor.name);
}

/** Is the actor the approver nominated on this request? */
export function isApprover(
  request: Pick<RequestIdentity, "managerId" | "manager">,
  actor: Actor
): boolean {
  if (actor.id !== null && request.managerId === actor.id) return true;
  return sameName(request.manager, actor.name);
}

/** Non-admin visibility: your own requests, plus the ones you approve. */
export function canSeeRequest(request: RequestIdentity, actor: Actor): boolean {
  return isRequestee(request, actor) || isApprover(request, actor);
}

///  +-----------------------------------------------------------------+
///  |                   ACTING AS A STOCK KEEPER                      |
///  +-----------------------------------------------------------------+
//
//  ADMINS CAN ACT ANYWHERE. That disjunct is not a convenience — it is what
//  stops a location with no assigned keeper from stranding its requests at
//  "fulfilled, waiting to be made ready" with nobody able to advance them.
//  It also covers the ordinary case at head office, where the IT admin IS the
//  stock keeper.
//
//  Kept pure, and kept here beside isRequestee/isApprover, for the reason
//  this file already gives: the route that ENFORCES this and the client that
//  decides whether to render the button must agree, or the UI offers an
//  action the API then refuses. Both call this.
//
//  Resolving WHICH locations somebody keeps is a settings read, so callers do
//  that themselves and pass the answer in. This function does not reach the
//  database, which is what lets the frontend mirror it exactly.
///  +-----------------------------------------------------------------+

export type StockKeeperActor = {
  /** Admin by email, per ADMIN_EMAILS. Grants every location at once. */
  isAdmin: boolean;
  /** Snipe location ids this actor is explicitly assigned to keep. */
  stockKeeperLocationIds: number[];
};

/**
 * May this actor perform stock-keeper actions for the given location?
 *
 * A null locationId means the request has no location recorded — rows filed
 * before locations were stamped, or a requester with no Snipe location set.
 * Only an admin can act on those: there is no site to match, so no assignment
 * can grant it, and falling open would hand every keeper every unplaceable
 * request in the system.
 */
export function canActAsStockKeeper(
  actor: StockKeeperActor,
  locationId: number | null
): boolean {
  if (actor.isAdmin) return true;
  if (locationId === null) return false;
  return actor.stockKeeperLocationIds.includes(locationId);
}

/** A request row, reduced to the four fields stock-keeper visibility reads. */
export type KeeperVisibleRequest = {
  userLocationId: number | null;
  status: string;
  requestKind: string;
  /** The self-procurement detail row, when there is one. */
  selfProcured: unknown | null;
};

/**
 * Does this request belong to one of the sites the actor keeps stock for?
 *
 * THE ONLY RULE IN THE APP that shows somebody a request they neither raised
 * nor approve, so it is deliberately narrow. It WIDENS what canSeeRequest
 * already returns and never narrows it — a keeper's own requests and the ones
 * they approve reach them through that predicate regardless of this one.
 *
 * FULFILMENT-STAGE ROWS ONLY. A keeper is not an approver and has no business
 * reading why somebody asked for a laptop: `reason` is free text that carries
 * things like a replacement tied to somebody being performance-managed.
 * Requiring COMPLETED means there is something physical at their site, and
 * everything earlier stays between the requester, their approver and IT.
 *
 * COLLECTED ROWS STAY VISIBLE. A keeper needs a record of what they handed
 * out; hiding a row the moment it closes makes the one question they will
 * actually be asked — "did I ever get that?" — unanswerable.
 *
 * EXCLUDED: corrections (nothing is ever collected for one, and a resolved
 * correction is COMPLETED with no fulfilment stamps) and self-procured items
 * (the requester bought it themselves; it never passes through a keeper's
 * hands). A null location matches nothing, for the same reason it does in
 * canActAsStockKeeper.
 *
 * Takes the keeper's sites as a set rather than resolving them, so it stays
 * pure and one settings read covers a whole page of rows.
 */
export function stockKeeperCanSeeRequest(
  request: KeeperVisibleRequest,
  keeperSites: Set<number>
): boolean {
  if (keeperSites.size === 0) return false;
  if (request.userLocationId === null) return false;
  if (!keeperSites.has(request.userLocationId)) return false;
  if (request.status !== "COMPLETED") return false;
  if (request.requestKind === "CORRECTION") return false;
  if (request.selfProcured !== null) return false;
  return true;
}

/*
 * Returns an empty string when no email is available — callers that
 * require an email (e.g. for `updatedBy` in settings) should treat empty
 * as "unknown actor" rather than throwing.
 */
export function getActorEmail(req: Request): string {
  const sso = (req.headers["x-user-email"] as string | undefined)?.trim();
  if (sso) return sso;

  if (DEV_AUTH_ENABLED) {
    const dev = (req.headers["x-dev-user-email"] as string | undefined)?.trim();
    if (dev) return dev;
  }

  return "";
}

/*
 * The actor's display name, used for role resolution (manager/requester are
 * matched by name appearing in requests). Same gating as getActorEmail:
 * production honours only the SSO header (x-user-name); dev allows the
 * x-dev-user-name fallback for DevAuthToggle impersonation.
 */

export function getActorName(req: Request): string {
  const sso = (req.headers["x-user-name"] as string | undefined)?.trim();
  if (sso) return sso;

  if (DEV_AUTH_ENABLED) {
    const dev = (req.headers["x-dev-user-name"] as string | undefined)?.trim();
    if (dev) return dev;
  }

  return "";
}