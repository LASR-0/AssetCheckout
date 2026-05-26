import type { Role } from "@/types/authType";


export const ALL_COLUMN_IDS = [
  "userName",
  "requestType",
  "assetDetails",
  "reason",
  "manager",
  "createdAt",
  "actions",
] as const;

export type ColumnId = (typeof ALL_COLUMN_IDS)[number];

const ROLE_COLUMNS: Record<NonNullable<Role>, ColumnId[]> = {
  ADMIN: ["userName", "requestType", "assetDetails", "reason", "manager", "createdAt", "actions"],
  MANAGER: ["userName", "requestType", "reason", "manager", "createdAt", "actions"],
  REQUESTER: ["userName", "requestType", "reason", "manager", "createdAt"],
};


export function getColumnVisibility(role: Role): Record<string, boolean> {
  if (role === null) {
  
    return Object.fromEntries(ALL_COLUMN_IDS.map((id) => [id, false]));
  }
  const allowed = new Set(ROLE_COLUMNS[role]);
  return Object.fromEntries(ALL_COLUMN_IDS.map((id) => [id, allowed.has(id)]));
}