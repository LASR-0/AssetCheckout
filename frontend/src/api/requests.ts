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
