import { apiFetch } from "@/api/client";
import type { Request, RequestChange } from "@/types/requestType";

type GetRequestsParams = {
  status?: string;
  requestType?: string;
  page?: number;
  limit?: number;
  search?: string;
};

type GetRequestsResponse = {
  success: boolean;
  count: number;
  requests: Request[];
};

export async function getRequests(params?: GetRequestsParams): Promise<GetRequestsResponse> {
  const query = new URLSearchParams();

  if (params?.status) query.append("status", params.status);
  if (params?.requestType) query.append("requestType", params.requestType);
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));
  if (params?.search) query.append("search", params.search);

  const qs = query.toString();
  return apiFetch<GetRequestsResponse>(`/api/requests${qs ? `?${qs}` : ""}`);
}

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

/**
 * NOTE: likely dead code — RequestTablePage calls the approval endpoints
 * directly via apiFetch, and the backend derives the actor from identity
 * headers rather than the body. Converted to apiFetch for consistency;
 * grep for imports and delete in a follow-up commit if unused.
 */
export async function approveRequest(id: number) {
  return apiFetch(`/api/approval/${id}/approve`, { method: "POST" });
}

export async function rejectRequest(id: number, reason: string) {
  return apiFetch(`/api/approval/${id}/reject`, {
    method: "POST",
    body: { reason },
  });
}