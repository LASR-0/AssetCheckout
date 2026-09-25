import { apiFetch } from "@/api/client";
import type { HotspotLoan, Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                  HOTSPOT LOAN ENDPOINTS                         |
///  +-----------------------------------------------------------------+
//
//  Three calls, because the middle of a loan is the ordinary flow: marking it
//  ready to collect and marking it collected go through the SAME approval
//  endpoints every other request uses, and are deliberately not wrapped here.
//  Adding hotspot-shaped aliases for them would invite the two paths to drift.
///  +-----------------------------------------------------------------+

/** A loanable hotspot as the assign dialog sees it. */
export type HotspotOption = {
  id: number;
  name: string;
  manufacturer: string | null;
  modelNumber: string | null;
  qty: number;
  /** Units free right now. Zero is shown, not hidden — see the route. */
  remaining: number;
  locationId: number | null;
  locationName: string | null;
};

/**
 * Another loan already out over the same window. The pool is a single unit, so
 * this is not trivia — it is the reason to stop and check before assigning.
 */
export type HotspotClash = {
  requestId: number;
  userName: string;
  accessoryId: number | null;
  accessoryName: string | null;
  startDate: string;
  endDate: string;
  /** False when it is assigned but the borrower hasn't picked it up yet. */
  collected: boolean;
};

export type CreateHotspotPayload = {
  userId: number;
  userName: string;
  /** "YYYY-MM-DD". A full ISO timestamp is refused — the server's timezone
   *  must not be what decides which calendar day the loan falls on. */
  startDate: string;
  endDate: string;
  reason: string;
  eventName?: string | null;
};

export async function createHotspotRequest(
  payload: CreateHotspotPayload
): Promise<{ success: boolean; request: Request; loan: HotspotLoan; message: string }> {
  return apiFetch("/api/requests/hotspots", { method: "POST", body: payload });
}

/** What IT can assign, plus anything already promised over the same dates. */
export async function getHotspotOptions(
  requestId: number
): Promise<{ options: HotspotOption[]; clashes: HotspotClash[] }> {
  const data = await apiFetch<{
    success: boolean;
    options: HotspotOption[];
    clashes: HotspotClash[];
  }>(`/api/approval/${requestId}/hotspot/options`);
  return { options: data.options ?? [], clashes: data.clashes ?? [] };
}

/** IT's sign-off: assign this hotspot and check it out of Snipe. */
export async function assignHotspot(
  requestId: number,
  accessoryId: number
): Promise<{ success: boolean; request: Request; loan: HotspotLoan; message: string }> {
  return apiFetch(`/api/approval/${requestId}/hotspot/assign`, {
    method: "POST",
    body: { accessoryId },
  });
}

/**
 * The hotspot is back. Resolves even when Snipe refuses the check-in —
 * `checkedIn: false` with the reason in `message` is a real outcome, not an
 * error, and the caller must show it rather than claiming the loan is closed.
 */
export async function returnHotspot(
  requestId: number
): Promise<{
  success: boolean;
  request: Request;
  loan: HotspotLoan;
  checkedIn: boolean;
  message: string;
}> {
  return apiFetch(`/api/approval/${requestId}/hotspot/return`, { method: "POST" });
}
