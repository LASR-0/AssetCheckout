import type { Role } from "@/types/authType";
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


export const ALL_COLUMN_IDS = [
  "userName",
  "requestType",
  "assetDetails",
  "reason",
  "manager",
  "createdAt",
  "actions",
] as const;

export type ColumnId = (typeof ALL_COLUMN_IDS)[number];

//  THE ACTIONS COLUMN IS NOT AN ADMIN COLUMN. A requester has exactly one
//  action in the whole workflow, and it is the last one: confirming they
//  collected or received their device. Withholding the column left those
//  requests parked at "ready to collect" with nobody able to close them —
//  the requester could see the row, could see the badge telling them to
//  collect it, and had no button.
//
//  Safe because the cell gates every branch itself (columns.tsx): the
//  correction, manager and admin actions are each behind a role check, and
//  the collect/receive button is behind ownership. A requester who is not
//  the owner, or is at a stage with nothing to do, gets the stage badge —
//  which is what the column already showed everyone else.
const ROLE_COLUMNS: Record<NonNullable<Role>, ColumnId[]> = {
  ADMIN: ["userName", "requestType", "assetDetails", "reason", "manager", "createdAt", "actions"],
  MANAGER: ["userName", "requestType", "reason", "manager", "createdAt", "actions"],
  REQUESTER: ["userName", "requestType", "reason", "manager", "createdAt", "actions"],
};


export function getColumnVisibility(role: Role): Record<string, boolean> {
  if (role === null) {
  
    return Object.fromEntries(ALL_COLUMN_IDS.map((id) => [id, false]));
  }
  const allowed = new Set(ROLE_COLUMNS[role]);
  return Object.fromEntries(ALL_COLUMN_IDS.map((id) => [id, allowed.has(id)]));
}