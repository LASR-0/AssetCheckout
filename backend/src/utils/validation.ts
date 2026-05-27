import type { RequestStatus, RequestType } from "../../generated/prisma_client/client.js";

export const isValidRequestStatus = (value: any): value is RequestStatus => {
  return value === "PENDING" ||
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