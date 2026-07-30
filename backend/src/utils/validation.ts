import type { RequestStatus, RequestType } from "../../generated/prisma_client/client.js";

// Must cover every member of the Prisma RequestStatus enum. APPROVED was
// missing, and the sole caller spreads the filter in only when this passes
// (requestRoutes GET /), so picking "Approved" in the table's status filter
// silently returned every request instead of the approved ones.
export const isValidRequestStatus = (value: any): value is RequestStatus => {
  return value === "PENDING" ||
         value === "APPROVED" ||
         value === "COMPLETED" ||
         value === "REJECTED";
};

export const isValidRequestType = (value: any): value is RequestType => {
  return value === "STANDARD" ||
         value === "NON_STANDARD";
};

export function isValidRole(role: unknown): role is "ADMIN" | "MANAGER" | "REQUESTER" {
  return role === "ADMIN" || role === "MANAGER" || role === "REQUESTER";
}