import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import {
  accessoryCategoriesForMeQuery,
  assetCategoriesQuery,
  holdingsQuery,
  requestsQuery,
} from "@/api/queries";
import { buildRoute, canAct, type Route, type Viewer } from "@/lib/route";
import { isRequestee, needsMyAction } from "@/lib/permissions";
import { REQUESTEE_ACTIONS } from "@/lib/routeCopy";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                  EVERYTHING HOME KNOWS                          |
///  +-----------------------------------------------------------------+
//
//  One pass over the shared, cached requests list (the same one Requests
//  and Stock read), plus holdings and the catalogue. Each part fails on its
//  own: Snipe-IT being down empties "What you have" and the catalogue, but
//  your requests still show, because they come from our own database.
//
//  YOUR REQUESTS are the ones you are the requestee of, matched by Snipe id
//  first and name second (lib/permissions.isRequestee), so a display name
//  that differs between directories still finds them.
///  +-----------------------------------------------------------------+

export type Row = { r: Request; route: Route };

const NO_REQUESTS: Request[] = [];

/** Newest event first: when it closed for a finished one, when filed otherwise. */
function closedAt(x: Row): string {
  return x.route.rejected?.at ?? x.route.stations.at(-1)?.at ?? x.r.createdAt;
}

export function useHome() {
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
  const holdings = useQuery({ ...holdingsQuery, enabled: signedIn });
  const assetCategories = useQuery(assetCategoriesQuery);
  const accessoryCategories = useQuery({ ...accessoryCategoriesForMeQuery, enabled: signedIn });

  const all = requests.data ?? NO_REQUESTS;

  const derived = useMemo(() => {
    const now = new Date();
    const mine: Row[] = all
      .filter((r) => isRequestee(r, viewer.userId, viewer.name))
      .map((r) => ({ r, route: buildRoute(r, now) }));

    const open = mine
      .filter((x) => !x.route.finished && !x.route.rejected)
      .sort((a, b) => b.r.createdAt.localeCompare(a.r.createdAt));
    const finished = mine
      .filter((x) => x.route.finished || x.route.rejected)
      .sort((a, b) => closedAt(b).localeCompare(closedAt(a)));

    // Yours to do, from here: collect it, confirm it arrived, enter what you
    // bought. Anything else waiting on you is approver work, which lives on
    // Requests and is only counted here.
    const needs = open.filter(
      (x) => x.route.step && REQUESTEE_ACTIONS.has(x.route.step) && canAct(x.r, x.route, viewer, now)
    );
    const approvals = all.filter(
      (r) => needsMyAction(r, viewer.role, viewer.userId, viewer.name) && !isRequestee(r, viewer.userId, viewer.name)
    ).length;

    return {
      open,
      finished,
      needs,
      approvals,
      counts: {
        inProgress: open.length,
        completed: finished.filter((x) => !x.route.rejected).length,
        rejected: finished.filter((x) => x.route.rejected).length,
      },
      total: mine.length,
    };
  }, [all, viewer]);

  return {
    auth,
    viewer,
    // Signed out (dev) never fetches, so it is not loading either.
    loadingRequests: auth.isLoading || (signedIn && requests.isPending),
    holdings,
    assetCategories,
    accessoryCategories,
    ...derived,
  };
}
