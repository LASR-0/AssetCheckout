import { apiFetch } from "@/api/client";

///  +-----------------------------------------------------------------+
///  |               SELF-PROCUREMENT API WRAPPERS                     |
///  +-----------------------------------------------------------------+
//
//  The alternative to accessory selection for a non-standard accessory too
//  cheap to be worth IT procuring — see backend/src/services/selfProcurement.ts.
///  +-----------------------------------------------------------------+

type SimpleResponse = { success: boolean; message: string };

/** IT hands procurement off to the requester instead of selecting an accessory. */
export async function markUserProcured(requestId: number): Promise<SimpleResponse> {
  return apiFetch(`/api/approval/${requestId}/self-procured/mark`, { method: "POST" });
}

/** The requester reports what they bought. */
export async function submitSelfProcuredDetails(
  requestId: number,
  input: { itemName: string; cost: number }
): Promise<SimpleResponse> {
  return apiFetch(`/api/approval/${requestId}/self-procured/details`, {
    method: "POST",
    body: input,
  });
}

/** IT reviews what was bought and completes the request. */
export async function reviewSelfProcured(
  requestId: number,
  input: { recordInSnipe: boolean; locationId?: number }
): Promise<SimpleResponse> {
  return apiFetch(`/api/approval/${requestId}/self-procured/review`, {
    method: "POST",
    body: input,
  });
}
