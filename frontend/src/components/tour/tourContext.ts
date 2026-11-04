import { createContext, useContext, useEffect } from "react";
import type { TourId } from "@/lib/tours/types";

///  The tour's context and the two hooks pages use, apart from the provider
///  (a component file may only export components).

export type TourContextValue = {
  /** What the button would run here. Null hides it. */
  tourId: TourId | null;
  isRunning: boolean;
  /** Run this page's tour now, whether or not it has been seen. */
  run: () => void;
  /** Pages call this to report whether their async content has landed. */
  reportReady: (ready: boolean) => void;
};

export const TourContext = createContext<TourContextValue | null>(null);

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

