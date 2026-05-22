/**
 * Phase 5d-iii: frontend API helpers for Snipe-IT read-only lookups.
 *
 * These power the dropdowns in the Asset Details dialog. All three endpoints
 * return the same shape: {id, name}[]. No caching at this layer — the form
 * fetches on open. If repeat opens become noticeable, consider an in-memory
 * cache or React Query later.
 */
import type { SnipeNamedRecord } from "@/types/snipeTypes";

function authHeaders(): HeadersInit {
  const devName = localStorage.getItem("dev-user-name") ?? "";
  return {
    "Content-Type": "application/json",
    "x-dev-user-name": devName,
  };
}

export async function getCompanies(): Promise<SnipeNamedRecord[]> {
  const res = await fetch("/api/snipe/companies", { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch companies");
  const data = await res.json();
  return data.companies ?? [];
}

export async function getLocations(): Promise<SnipeNamedRecord[]> {
  const res = await fetch("/api/snipe/locations", { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch locations");
  const data = await res.json();
  return data.locations ?? [];
}

export async function getStatuses(): Promise<SnipeNamedRecord[]> {
  const res = await fetch("/api/snipe/statuses", { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch statuses");
  const data = await res.json();
  return data.statuses ?? [];
}