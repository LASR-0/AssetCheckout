/**
 * Snipe-IT read-only lookups: the dropdowns in the Asset Details dialog, the
 * stock keeper pickers. All three endpoints return the same shape: {id, name}[].
 * Cached through api/queries.ts, so repeat opens cost nothing.
 */
import { apiFetch } from "@/api/client";
import type { SnipeNamedRecord } from "@/types/snipeTypes";

export async function getCompanies(signal?: AbortSignal): Promise<SnipeNamedRecord[]> {
  const data = await apiFetch<{ companies?: SnipeNamedRecord[] }>("/api/snipe/companies", { signal });
  return data.companies ?? [];
}

export async function getLocations(signal?: AbortSignal): Promise<SnipeNamedRecord[]> {
  const data = await apiFetch<{ locations?: SnipeNamedRecord[] }>("/api/snipe/locations", { signal });
  return data.locations ?? [];
}

export async function getStatuses(signal?: AbortSignal): Promise<SnipeNamedRecord[]> {
  const data = await apiFetch<{ statuses?: SnipeNamedRecord[] }>("/api/snipe/statuses", { signal });
  return data.statuses ?? [];
}
