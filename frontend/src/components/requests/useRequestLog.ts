import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { requestsQuery } from "@/api/queries";
import { actionFor, buildRoute, canAct, holderOf, stageMeta, type Holder, type Route, type Viewer } from "@/lib/route";
import { isUnseenAction } from "@/lib/permissions";
import { deriveLoanStage } from "@/lib/stage";
import { formatStartShort, isStartPending } from "@/lib/startDate";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                  THE REQUEST LOG'S MODEL                        |
///  +-----------------------------------------------------------------+
//
//  One pass over the shared, cached requests list (the same one Home and
//  Stock read). The server has already narrowed it to what this person may
//  see: everything for an admin, their approvals and their own for a
//  manager, their site's and their own for a stock keeper.
//
//  VIEWS overlap on purpose. "Needs you" is what this viewer can act on now;
//  "In progress" is everything still open, theirs included, which is what
//  Home's "In progress" count means and what ?status=IN_PROGRESS always
//  meant. Done and Rejected are the two ways a request closes.
//
//  STAGE narrows any view to one stage chip (the old 19-option filter, kept
//  so every stage stays reachable and old ?status= links still land).
///  +-----------------------------------------------------------------+

export type View = "needs" | "flight" | "done" | "rejected" | "all";

/** The "no narrowing" value of the site and stage filters. */
export const ANY = "ANY";

export const VIEWS: { key: View; label: string }[] = [
  { key: "needs", label: "Needs you" },
  { key: "flight", label: "In progress" },
  { key: "done", label: "Done" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

/** Something about a row worth seeing before opening it. */
export type RowFlag = { text: string; icon: string; alert: boolean };

export type LogRow = {
  r: Request;
  route: Route;
  /** The viewer can take the current step. */
  mine: boolean;
  /** Its primary action, when mine. */
  action: string | null;
  holder: Holder | null;
  /** New to this viewer and waiting on them (the nav badge's rule). */
  unseen: boolean;
  flag: RowFlag | null;
  open: boolean;
};

const NO_REQUESTS: Request[] = [];

/** The one note a row has room for, most urgent first. */
function flagOf(r: Request, route: Route, now: Date): RowFlag | null {
  const open = !route.finished && !route.rejected;
  if (open && r.correctionDetail?.applyError) return { text: "Blocked", icon: "link_off", alert: true };
  if (open && r.locationMissing) return { text: "Location missing", icon: "location_off", alert: true };
  if (open && r.loan?.checkinError) return { text: "Check-in failed", icon: "sync_problem", alert: true };
  if (open && r.loan && deriveLoanStage(r.loan, now) === "OVERDUE") return { text: "Overdue", icon: "error", alert: true };
  if (open && r.legacyShipment) return { text: "Legacy shipment", icon: "history", alert: false };
  if (r.startDate && isStartPending(r.startDate, now)) {
    return { text: `Starts ${formatStartShort(r.startDate)}`, icon: "event", alert: false };
  }
  if (r.autoApproved) return { text: "Auto-approved", icon: "verified", alert: false };
  return null;
}

/** Exceptions an admin should see without hunting: something is stuck. */
export function isException(row: LogRow): boolean {
  return row.open && !!row.flag?.alert;
}

export function useRequestLog() {
  const auth = useAuth();
  const signedIn = !auth.isLoading && !!auth.name;
  const viewer: Viewer = useMemo(
    () => ({
      userId: auth.userId,
      name: auth.name,
      role: auth.role,
      stockKeeperLocations: auth.stockKeeperLocations,
    }),
    [auth.userId, auth.name, auth.role, auth.stockKeeperLocations]
  );

  const requests = useQuery({ ...requestsQuery, enabled: signedIn });
  const all = requests.data ?? NO_REQUESTS;

  const rows = useMemo(() => {
    const now = new Date();
    return all.map((r): LogRow => {
      const route = buildRoute(r, now);
      const mine = canAct(r, route, viewer, now);
      return {
        r,
        route,
        mine,
        action: mine ? actionFor(r, route, now) : null,
        holder: holderOf(r, route, viewer),
        unseen: isUnseenAction(r, viewer.role, viewer.userId, viewer.name),
        flag: flagOf(r, route, now),
        open: !route.finished && !route.rejected,
      };
    });
  }, [all, viewer]);

  const sites = useMemo(() => {
    const byId = new Map<number, string>();
    for (const r of all) {
      if (r.userLocationId == null) continue;
      if (!byId.has(r.userLocationId)) byId.set(r.userLocationId, r.userLocationName?.trim() || `Site ${r.userLocationId}`);
    }
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [all]);

  return {
    auth,
    viewer,
    rows,
    sites,
    loading: auth.isLoading || (signedIn && requests.isPending),
    error: requests.isError,
    retry: () => void requests.refetch(),
  };
}

export function inView(row: LogRow, view: View): boolean {
  switch (view) {
    case "needs":
      return row.mine;
    case "flight":
      return row.open;
    case "done":
      return row.route.finished;
    case "rejected":
      return !!row.route.rejected;
    case "all":
      return true;
  }
}

/** Free text over what a person would type: id, names, item, site, reason. */
export function matchesQuery(row: LogRow, q: string): boolean {
  if (!q) return true;
  const r = row.r;
  const hay = [
    `#${r.id}`,
    String(r.id),
    r.userName,
    r.categoryName,
    r.manager,
    r.userLocationName,
    r.reason,
    r.accessoryOptionDisplay,
    r.modelRequest?.modelName,
    r.preferredModel,
    r.trackingCode,
    r.loan?.accessoryName,
    r.correctionDetail?.description,
    stageMeta(row.route.stage).label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((w) => hay.includes(w));
}

/** The page's subtitle: whose requests these are. */
export function scopeLine(viewer: Viewer): string {
  if (viewer.role === "ADMIN") return "Every request at every site.";
  const sites = viewer.stockKeeperLocations.map((l) => l.name).filter(Boolean);
  if (sites.length) return `Requests at ${sites.join(", ")}, plus your own.`;
  if (viewer.role === "MANAGER") return "Requests where you're the approver, and your own.";
  return "Requests you made, or that were made for you.";
}
