import { apiFetch } from "@/api/client";
import type { Request } from "@/types/requestType";

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