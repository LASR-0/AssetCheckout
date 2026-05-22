import type { Role } from "@/types/authType";

// Column IDs match the `id` field on each ColumnDef in components/columns.tsx
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

/** Returns a TanStack-shaped columnVisibility object: { columnId: boolean } */
export function getColumnVisibility(role: Role): Record<string, boolean> {
  if (role === null) {
    // Shouldn't happen because of the route guard, but fail-safe to nothing visible
    return Object.fromEntries(ALL_COLUMN_IDS.map((id) => [id, false]));
  }
  const allowed = new Set(ROLE_COLUMNS[role]);
  return Object.fromEntries(ALL_COLUMN_IDS.map((id) => [id, allowed.has(id)]));
}