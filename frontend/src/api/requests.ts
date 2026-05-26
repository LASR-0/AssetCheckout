import type { Role } from "@/types/authType";

type GetRequestsParams = {
  status?: string;
  userId?: number;
  requestType?: string;
  page?: number;
  limit?: number;
  search?: string;
  viewAs?: Role;
  currentUserName?: string;
};

export async function getRequests(params?: GetRequestsParams) {

  const query = new URLSearchParams();

  if (params?.status) query.append("status", params.status);
  if (params?.userId) query.append("userId", String(params.userId));
  if (params?.requestType) query.append("requestType", params.requestType);
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));
  if (params?.search) query.append("search", params.search);
  if (params?.viewAs) query.append("viewAs", params.viewAs);
  if (params?.currentUserName) query.append("currentUserName", params.currentUserName);

  const res = await fetch(`/api/requests?${query.toString()}`);

  if (!res.ok) {
    throw new Error("Failed to fetch requests");
  }

  const data = await res.json();

  console.log("✅ RESPONSE RAW:", data);
  console.log("📦 REQUESTS:", data.requests);
  console.log("🧠 MODEL REQUEST CHECK:",
    data.requests?.map((r: any) => ({
      id: r.id,
      hasModelRequest: !!r.modelRequest,
      modelRequest: r.modelRequest,
    }))
  );

  return data;
}

export async function approveRequest(id: number, approverName: string) {
  const res = await fetch(`/api/approval/${id}/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ approverName }),
  });

  if (!res.ok) {
    throw new Error("Failed to approve request");
  }

  return res.json();
}

export async function rejectRequest(id: number, approverName: string) {
  const res = await fetch(`/api/approval/${id}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ approverName }),
  });

  if (!res.ok) {
    throw new Error("Failed to reject request");
  }

  return res.json();
}