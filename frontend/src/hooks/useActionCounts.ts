import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { actionCountsQuery, type ActionCounts } from "@/api/queries";
import { queryClient } from "@/api/queryClient";

///  +-----------------------------------------------------------------+
///  |              WHAT IS WAITING ON THE SIGNED-IN PERSON            |
///  +-----------------------------------------------------------------+
//
//  Backs the nav badges. Lives in the Navbar, which mounts on every page, so
//  it is deliberately one small count query rather than the requests list —
//  fetching every row on every page to render two digits would be absurd.
//
//  WHEN IT REFETCHES. The query is workflow-fresh (30 s, and on window
//  focus). Navigating rechecks it only once it has gone stale; it used to
//  refetch on every navigation whether or not anything could have moved.
//  Anything that changes the counts says so through the two helpers below,
//  and switching the dev user resets the whole cache.
///  +-----------------------------------------------------------------+

export type { ActionCounts };

const EMPTY: ActionCounts = { requests: 0, stock: 0 };

/** Long enough to collapse a burst of dismissals into one request. */
const RECONCILE_MS = 1500;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

// Debounced: dwelling down a column of rows fires one of these per row, and
// each would otherwise be its own request.
function scheduleReconcile(): void {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    void queryClient.invalidateQueries({ queryKey: actionCountsQuery.queryKey });
  }, RECONCILE_MS);
}

/**
 * Tell the badges to recheck. Call after anything that could change what is
 * waiting on the reader: approving, handing over, confirming a collection.
 */
export function notifyActionCountsChanged(): void {
  scheduleReconcile();
}

/**
 * A request that WAS being counted has just been marked seen.
 *
 * Drops the badge optimistically as well as reconciling, because this one is
 * triggered by the reader's own pointer resting on a row — they are looking
 * straight at the badge when it happens, and a round trip's worth of delay
 * reads as the number being stuck. The reconcile behind it corrects any
 * drift, including from another tab.
 *
 * Only call this for a row that was actually counted. The dwell fires on
 * every unseen row, most of which were never in the badge, and decrementing
 * for those would run the number to zero while work remained.
 */
export function notifySeenCleared(): void {
  // Never below zero: the optimistic path can race the reconcile, and a
  // badge reading "-1" is a worse failure than one that is briefly high.
  queryClient.setQueryData(actionCountsQuery.queryKey, (c) =>
    c ? { ...c, requests: Math.max(0, c.requests - 1) } : c
  );
  scheduleReconcile();
}

export function useActionCounts(): ActionCounts {
  const { data } = useQuery(actionCountsQuery);

  // The Navbar sits OUTSIDE <Routes> and never unmounts, so nothing would
  // otherwise recheck the counts between window focuses.
  const { pathname } = useLocation();
  useEffect(() => {
    void queryClient.refetchQueries({ queryKey: actionCountsQuery.queryKey, stale: true, type: "active" });
  }, [pathname]);

  return data ?? EMPTY;
}
