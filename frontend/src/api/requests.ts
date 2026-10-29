import { apiFetch } from "@/api/client";
import type { Request, RequestChange } from "@/types/requestType";

/**
 * Clear the "new" marker on one request, for the signed-in viewer only.
 *
 * Fire-and-forget by design: it is called from a hover, it changes nothing
 * the reader can see beyond a dot the UI has already removed optimistically,
 * and a failed call simply means the marker returns on the next load. Raising
 * an error for that would be noise about nothing.
 */
export async function markRequestSeen(requestId: number): Promise<void> {
  try {
    await apiFetch<void>(`/api/requests/${requestId}/seen`, { method: "POST" });
  } catch {
    // Intentionally silent — see above.
  }
}

/**
 * A sparse set of corrections to an existing request. An omitted key means
 * "leave it alone"; `null` is a real value and clears the column.
 *
 * Deliberately narrower than the create payload: the requester, the status and
 * every approval timestamp are not here, because editing must not move the
 * request in the workflow. See editRequest in the backend service.
 */
export type EditRequestPayload = {
  requestKind?: "ASSET" | "ACCESSORY";
  categoryId?: number;
  categoryName?: string;
  requestType?: "STANDARD" | "NON_STANDARD";
  accessoryOption?: string | null;
  reason?: string | null;
  preferredModel?: string | null;
  manager?: string | null;
  managerId?: number;
  callText?: boolean;
  needsData?: boolean;
  numberOption?: "NEW" | "REUSE" | "NONE" | null;
  reuseNumberFromEmail?: string | null;
  reuseNumberPhone?: string | null;
};

export type EditRequestResponse = {
  success: boolean;
  request: Request;
  /** Empty when nothing actually moved — the backend writes nothing and sends
   *  no email in that case, so the caller should say so rather than claim a
   *  save. */
  changes: RequestChange[];
  message: string;
};

/** Admin-only. Corrects a request in place, leaving its workflow position
 *  untouched and emailing the requester the diff. */
export async function editRequest(
  id: number,
  payload: EditRequestPayload
): Promise<EditRequestResponse> {
  return apiFetch<EditRequestResponse>(`/api/requests/${id}`, {
    method: "PATCH",
    body: payload,
  });
}

/** Admin-only. Sets or clears a new starter's start date ("YYYY-MM-DD" or
 *  null). Works on fulfilled requests; logged, and emails nobody. */
export async function setRequestStartDate(
  id: number,
  startDate: string | null
): Promise<{ success: true; request: Request; message: string }> {
  return apiFetch(`/api/requests/${id}/start-date`, {
    method: "PATCH",
    body: { startDate },
  });
}

///  +-----------------------------------------------------------------+
///  |                  MOVING A REQUEST ALONG                         |
///  +-----------------------------------------------------------------+
//
//  The workflow's own steps. Each throws on refusal with the server's
//  message, so the step that called it can say why where the person is
//  looking. Refreshing afterwards is the caller's job (invalidateWorkflow).

export type ApproveResult = {
  type: "STANDARD" | "NON_STANDARD";
  stage?: "MANAGER" | "ADMIN";
  message: string;
};

/** The manager's approval, or IT's sign-off: the server knows which. A
 *  standard sign-off also assigns stock and checks it out. */
export async function approveRequest(id: number): Promise<ApproveResult> {
  return apiFetch<ApproveResult>(`/api/approval/${id}/approve`, { method: "POST" });
}

/**
 * Ends a request. The rejection is written into the reason column ahead of
 * the original ("REJECTED: …\n REQUEST: …", see lib/reason), so a correction
 * passes its description: corrections store no reason of their own.
 */
export async function rejectRequest(r: Request, why: string): Promise<void> {
  const original = r.requestKind === "CORRECTION" ? r.correctionDetail?.description ?? "" : r.reason ?? "";
  await apiFetch(`/api/approval/${r.id}/reject`, {
    method: "POST",
    body: { reason: `REJECTED: ${why}\n REQUEST: ${original}` },
  });
}

export async function markShipped(id: number, trackingCode: string, trackingUrl: string): Promise<void> {
  await apiFetch(`/api/approval/${id}/ship`, {
    method: "POST",
    body: {
      ...(trackingCode ? { trackingCode } : {}),
      ...(trackingUrl ? { trackingUrl } : {}),
    },
  });
}

export async function markReadyToCollect(id: number): Promise<void> {
  await apiFetch(`/api/approval/${id}/ready-for-collection`, { method: "POST" });
}

/** Collected, received, or a loan picked up. `promptFeedback` when the
 *  requester should be asked how it went. */
export async function markReceived(id: number): Promise<{ promptFeedback?: boolean; message?: string }> {
  return apiFetch(`/api/approval/${id}/receive`, { method: "POST" });
}
