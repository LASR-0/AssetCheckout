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