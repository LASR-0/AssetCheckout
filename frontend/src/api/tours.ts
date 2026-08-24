import { apiFetch } from "@/api/client";
import type { TourId } from "@/lib/tours/types";

///  +-----------------------------------------------------------------+
///  |                    THE TOUR CHECKLIST                           |
///  +-----------------------------------------------------------------+
//
//  Three calls over one table. See backend/src/routes/tourRoutes.ts for why
//  `identified` matters more than it looks: false means the server could not
//  work out who is asking, so a completion could not be recorded — and a tour
//  that runs but cannot be recorded runs again on the next navigation, and the
//  one after that. The provider fails closed on it.
///  +-----------------------------------------------------------------+

export type TourState = {
  /** The feature switch. False stops tours starting; it forgets nobody. */
  enabled: boolean;
  /** Whether the server resolved the caller to a Snipe user. */
  identified: boolean;
  seen: TourId[];
};

/** Everything the client needs to decide whether to start a tour. */
export async function getTourState(): Promise<TourState> {
  return apiFetch<TourState>("/api/tours");
}

/**
 * Record that somebody has had a tour.
 *
 * Fire and forget by design — the server answers 204 whether or not the write
 * landed, because there is nothing a browser could usefully do about a failed
 * one. The caller updates its own copy of `seen` optimistically so the tour
 * does not restart within the session either way.
 */
export async function markTourSeen(tourId: TourId): Promise<void> {
  await apiFetch<void>(`/api/tours/${encodeURIComponent(tourId)}/seen`, { method: "POST" });
}

/** Forget one, so it runs again. For testing a tour against a real account. */
export async function forgetTour(tourId: TourId): Promise<void> {
  await apiFetch<void>(`/api/tours/${encodeURIComponent(tourId)}`, { method: "DELETE" });
}
