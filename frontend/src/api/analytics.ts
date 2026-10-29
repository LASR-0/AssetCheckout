import { apiFetch } from "@/api/client";

export async function getPriceAverages(tier: string, signal?: AbortSignal) {
  const data = await apiFetch<{ averages?: Record<number, number> }>(
    `/api/requests/averages?tier=${encodeURIComponent(tier)}`,
    { signal }
  );
  return data.averages ?? {};
}

export async function getTiers(signal?: AbortSignal): Promise<string[]> {
  const data = await apiFetch<{ tiers: string[] }>("/api/requests/tiers", { signal });
  return data.tiers;
}
