import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getTourState, markTourSeen } from "@/api/tours";
import { planTour, TOURS } from "@/lib/tours/registry";
import { startTour, stopTour, isTourRunning } from "@/lib/tours/driverAdapter";
import type { TourId } from "@/lib/tours/types";

///  +-----------------------------------------------------------------+
///  |             WHEN A TOUR RUNS, AND WHO SAYS SO                   |
///  +-----------------------------------------------------------------+
//
//  A context, even though useAuth deliberately is not one, because two
//  separate things have to agree on a single answer: the navbar button asking
//  "what would I run here?" and the page asking "should something start?".
//  Fetching the checklist once rather than per consumer is the other half.
//
//  IT FAILS CLOSED, EVERYWHERE. A tour that starts but cannot be recorded
//  starts again on the next navigation, and the one after that, forever —
//  which is a far worse failure than a tour that never runs. So every unknown
//  is treated as "do not start": the fetch failed, the server could not
//  identify the caller, the feature is off, auth has not resolved yet.
//
//  IT WAITS FOR THE PAGE. Steps resolve against the DOM once, at start, so a
//  tour that begins before a fetch lands silently drops every step pointing at
//  the result — it still runs, still looks fine, and is quietly missing its
//  best half. That is not hypothetical: the first version of this shipped with
//  a single five-second deadline, and on the request log — which fetches
//  through Snipe — the deadline beat the fetch. The two manager steps both
//  fell back to the actions column header, dedupeAdjacent quite correctly
//  folded them into one, and a manager's tour was one step where it should
//  have been two. Pressing the button afterwards showed both, because by then
//  the rows were there.
//
//  SO THERE ARE TWO WAITS, and the difference is whether anybody promised to
//  report. A page that never calls useTourReady has nothing to wait for and
//  gets a token delay for the first paint. A page that HAS called it, and said
//  not yet, is waited on properly — up to a ceiling that exists only so a hung
//  request cannot withhold the tour forever.
///  +-----------------------------------------------------------------+

/** No page registered a readiness signal: just let the first paint land. */
const NO_SIGNAL_DELAY_MS = 600;

/**
 * A page said "not yet". How long to believe it.
 *
 * Long enough that a slow Snipe round trip finishes first, which is the whole
 * point — but not unbounded, or a request that never settles would mean the
 * tour never runs and nothing would say why.
 */
const SLOW_PAGE_CEILING_MS = 20000;

type TourContextValue = {
  /** What the button would run here. Null hides it. */
  tourId: TourId | null;
  isRunning: boolean;
  /** Run this page's tour now, whether or not it has been seen. */
  run: () => void;
  /** Pages call this to report whether their async content has landed. */
  reportReady: (ready: boolean) => void;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside a TourProvider");
  return ctx;
}

/**
 * Report whether this page's content has arrived.
 *
 * Pages with nothing to wait for need not call it — the deadline covers them.
 */
export function useTourReady(ready: boolean): void {
  const { reportReady } = useTour();

  useEffect(() => {
    reportReady(ready);
  }, [ready, reportReady]);
}

export default function TourProvider({ children }: { children: React.ReactNode }) {
  const { role, isLoading } = useAuth();
  const { pathname } = useLocation();

  const [seen, setSeen] = useState<TourId[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [identified, setIdentified] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);

  // null: no page has claimed it has anything to wait for.
  // false: a page has, and it has not arrived.
  // true:  go.
  const [ready, setReady] = useState<boolean | null>(null);

  // Which pathname has already had its shot this session. Without it, any
  // re-render between starting and recording would start a second tour.
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getTourState()
      .then((state) => {
        if (cancelled) return;
        setSeen(state.seen);
        setEnabled(state.enabled);
        setIdentified(state.identified);
      })
      .catch(() => {
        // Stay quiet rather than guess. See the header.
        if (!cancelled) setIdentified(false);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // A new page is a new decision, and a new readiness question — including
  // whether anybody is going to answer it.
  useEffect(() => {
    setReady(null);
  }, [pathname]);

  // Leaving the page mid-tour would strand an overlay pointing at elements
  // that no longer exist.
  useEffect(() => {
    return () => {
      if (isTourRunning()) stopTour();
    };
  }, [pathname]);

  const plan = useMemo(
    () => planTour({ pathname, role, seen }),
    [pathname, role, seen]
  );

  const begin = useCallback(
    (ids: TourId[]) => {
      if (ids.length === 0) return;

      const steps = ids.flatMap((id) => TOURS[id].steps);

      const started = startTour({
        steps,
        onDone: () => {
          setRunning(false);

          // Optimistic, and not only for responsiveness: it is what stops a
          // failed POST restarting the tour on the next navigation.
          setSeen((current) => [...new Set([...current, ...ids])]);

          for (const id of ids) {
            // Fire and forget — the server answers 204 either way, and there
            // is nothing useful to do with a failure here.
            void markTourSeen(id).catch(() => {});
          }
        },
      });

      // Nothing survived resolution: the page is barer than any fallback
      // anticipated. Not marked as seen, so it can try again another day.
      if (started) setRunning(true);
    },
    []
  );

  const run = useCallback(() => {
    const manual = planTour({ pathname, role, seen, manual: true });
    startedFor.current = pathname;
    begin(manual.run);
  }, [pathname, role, seen, begin]);

  // ── Auto-run ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || !loaded) return;
    if (!enabled || !identified) return;
    if (plan.run.length === 0) return;
    if (startedFor.current === pathname) return;
    if (isTourRunning()) return;

    // Never over an open dialog: Radix portals to the body at z-50 and the
    // tour's overlay sits far above it, so the tour would paint over the
    // thing the user is actually looking at.
    if (document.querySelector('[data-slot="dialog-overlay"]')) return;

    if (ready !== true) {
      // A page that promised to report gets the long wait; one that never
      // registered gets just enough time to paint.
      const delay = ready === null ? NO_SIGNAL_DELAY_MS : SLOW_PAGE_CEILING_MS;
      const timer = window.setTimeout(() => setReady(true), delay);
      return () => window.clearTimeout(timer);
    }

    startedFor.current = pathname;
    begin(plan.run);
  }, [isLoading, loaded, enabled, identified, plan, pathname, ready, begin]);

  const value = useMemo<TourContextValue>(
    () => ({ tourId: plan.tourId, isRunning: running, run, reportReady: setReady }),
    [plan.tourId, running, run]
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}
