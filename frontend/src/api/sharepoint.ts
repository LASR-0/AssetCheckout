import { apiFetch } from "./client";

export async function getSharepointSyncEnabled(): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>("/api/sharepoint/enabled");
}

export async function setSharepointSyncEnabled(enabled: boolean): Promise<{ enabled: boolean }> {
  return apiFetch("/api/sharepoint/enabled", { method: "POST", body: { enabled } });
}