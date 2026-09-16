import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "@/api/client";

///  +-----------------------------------------------------------------+
///  |              WHAT IS WAITING ON THE SIGNED-IN PERSON            |
///  +-----------------------------------------------------------------+
//
//  Backs the nav badges. Lives in the Navbar, which mounts on every page, so
//  it is deliberately one small count query rather than the requests list —
//  fetching every row on every page to render two digits would be absurd.
//
//  FAILS TO ZERO, SILENTLY. A badge is an enhancement; a red error where a
//  count should be is worse than no count. A Snipe blip or an unresolvable
//  actor degrades to "nothing waiting", and the next refresh picks it up.
//
//  THREE THINGS MAKE IT REFETCH: navigation, the dev user switcher, and an
//  explicit signal from a page that has just changed something. The third
//  exists because the counts' most common change — dismissing a marker by
//  hovering a row — happens WITHOUT navigating, so the badge sat stale until
//  the next page load and looked broken.
///  +-----------------------------------------------------------------+

export type ActionCounts = {
  /** Requests blocked on this person and not yet seen by them. */
  requests: number;
  /** Devices at their site waiting to be handed over. */
  stock: number;
};

const EMPTY: ActionCounts = { requests: 0, stock: 0 };

/** Something changed that the counts depend on — reconcile with the server. */
const COUNTS_CHANGED = "action-counts-changed";
/** One counted request was just dismissed — drop the badge now, ask later. */
const SEEN_CLEARED = "action-counts-seen-cleared";

/**
 * Tell the badges to recheck. Call after anything that could change what is
 * waiting on the reader: approving, handing over, confirming a collection.
 */
export function notifyActionCountsChanged(): void {
  window.dispatchEvent(new Event(COUNTS_CHANGED));
}

/**
 * A request that WAS being counted has just been marked seen.
 *
 * Fires an optimistic decrement as well as a reconcile, because this one is
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
  window.dispatchEvent(new Event(SEEN_CLEARED));
  window.dispatchEvent(new Event(COUNTS_CHANGED));
}

/** Long enough to collapse a burst of dismissals into one request. */
const RECONCILE_MS = 1500;

export function useActionCounts(): ActionCounts {
  const [counts, setCounts] = useState<ActionCounts>(EMPTY);

  // The Navbar sits OUTSIDE <Routes> and never unmounts, so a bare [] would
  // fetch once at boot and then describe a world several actions out of date.
  const { pathname } = useLocation();
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiFetch<{ requests: number; stock: number }>(
          "/api/requests/action-counts"
        );
        if (cancelled) return;
        setCounts({
          requests: Number.isFinite(data.requests) ? data.requests : 0,
          stock: Number.isFinite(data.stock) ? data.stock : 0,
        });
      } catch {
        if (!cancelled) setCounts(EMPTY);
      }
    }

    // Debounced: dwelling down a column of rows fires one of these per row,
    // and each would otherwise be its own request.
    function scheduleReconcile() {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      reconcileTimer.current = setTimeout(() => void load(), RECONCILE_MS);
    }

    // Never below zero: the optimistic path can race the reconcile, and a
    // badge reading "-1" is a worse failure than one that is briefly high.
    function decrement() {
      setCounts((c) => ({ ...c, requests: Math.max(0, c.requests - 1) }));
    }

    void load();

    window.addEventListener("dev-user-changed", load);
    window.addEventListener(COUNTS_CHANGED, scheduleReconcile);
    window.addEventListener(SEEN_CLEARED, decrement);

    return () => {
      cancelled = true;
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
      window.removeEventListener("dev-user-changed", load);
      window.removeEventListener(COUNTS_CHANGED, scheduleReconcile);
      window.removeEventListener(SEEN_CLEARED, decrement);
    };
  }, [pathname]);

  return counts;
}
