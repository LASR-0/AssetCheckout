import type { Role } from "@/types/authType";
import type { TourDefinition, TourId } from "./types";
import { homeTour } from "./home";
import { requestsTour, requestsManagerTour } from "./requests";
import { settingsTour } from "./settings";
import { troubleshootingTour } from "./troubleshooting";

///  +-----------------------------------------------------------------+
///  |          WHICH TOUR, AND WHETHER IT RUNS BY ITSELF              |
///  +-----------------------------------------------------------------+
//
//  Every decision about tours meets here, and this file is pure so that every
//  one of them is testable without a browser.
//
//  ROLE null GETS THE HOME TOUR. Tempting to require REQUESTER, and wrong:
//  /api/auth/role only returns REQUESTER once a request exists that names the
//  person, so somebody on their genuinely first visit is null. Gating on
//  REQUESTER would show the tour to everybody except the people it was
//  written for. Only ADMIN is excluded, by request.
//
//  MANAGERS ARE NOT DETECTED, THEY EMERGE. There is no manager attribute in
//  Snipe; the role appears the first time a request nominates somebody as
//  approver. So the manager tour cannot run at first login — at first login
//  they are not a manager yet. It runs on the visit after they become one,
//  which is also the first visit where there is anything for them to approve.
///  +-----------------------------------------------------------------+

export const TOURS: Record<TourId, TourDefinition> = {
  home: homeTour,
  requests: requestsTour,
  "requests-manager": requestsManagerTour,
  settings: settingsTour,
  troubleshooting: troubleshootingTour,
};

export type TourPlan = {
  /** What the navbar button would run here. Null hides the button. */
  tourId: TourId | null;
  /** What should start on its own, right now. Empty means nothing. */
  run: TourId[];
};

export type PlanInput = {
  pathname: string;
  role: Role;
  /** Tours this person has already had, from the server checklist. */
  seen: readonly TourId[];
  /** True when the user pressed the button, which ignores `seen`. */
  manual?: boolean;
};

/**
 * Tours that never start by themselves.
 *
 * Troubleshooting is the whole list. That page is where somebody lands when
 * their device is already broken and they are trying to fix it — the same
 * reasoning lib/troubleshootingAnalytics.ts uses to justify failing silently
 * there. A tour interrupting at that exact moment is worse than no tour, so
 * it exists only behind the button, for somebody who asked.
 */
const NEVER_AUTO: readonly TourId[] = ["troubleshooting"];

function baseTourFor(pathname: string): TourId | null {
  if (pathname === "/") return "home";
  if (pathname === "/requests") return "requests";
  if (pathname === "/settings") return "settings";
  if (pathname === "/troubleshooting" || pathname.startsWith("/troubleshooting/")) {
    return "troubleshooting";
  }
  return null;
}

export function planTour({ pathname, role, seen, manual = false }: PlanInput): TourPlan {
  // Admins read the documentation.
  if (role === "ADMIN") return { tourId: null, run: [] };

  const base = baseTourFor(pathname);
  if (base === null) return { tourId: null, run: [] };

  // A manager on the requests page gets the approvals tour as the thing the
  // button offers, because it is the part of that page only they can act on.
  const isManagerRequests = role === "MANAGER" && base === "requests";
  const tourId: TourId = isManagerRequests ? "requests-manager" : base;

  // The full sequence for this route. A manager who has never seen either
  // gets the page explained and then the approvals on top, as one run — the
  // approvals tour alone would leave them never told what the search box does.
  const sequence: TourId[] = isManagerRequests ? ["requests", "requests-manager"] : [base];

  if (manual) return { tourId, run: sequence };

  if (NEVER_AUTO.includes(base)) return { tourId, run: [] };

  return { tourId, run: sequence.filter((id) => !seen.includes(id)) };
}
