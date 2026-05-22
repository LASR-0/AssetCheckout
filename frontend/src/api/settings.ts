import type { StandardModelsConfig } from "@/types/settingsType";
 
export async function getStandardModels(): Promise<StandardModelsConfig> {
  const res = await fetch("/api/settings/standard-models");
  if (!res.ok) throw new Error("Failed to fetch standard models config");
  const data = await res.json();
  return data.config ?? {};
}
 
export async function setStandardModelsForCategory(
  categoryId: number,
  primary: number | null,
  backup: number | null
): Promise<StandardModelsConfig> {
  const devName = localStorage.getItem("dev-user-name") ?? "";
  const res = await fetch("/api/settings/standard-models", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-dev-user-name": devName,
    },
    body: JSON.stringify({ categoryId, primary, backup }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save standard models");
  }
  const data = await res.json();
  return data.config ?? {};
}
 

export async function getRequestableCategoryIds(): Promise<number[] | null> {
  const res = await fetch("/api/settings/requestable-categories");
  if (!res.ok) throw new Error("Failed to fetch requestable categories");
  const data = await res.json();
  return data.ids ?? null;
}

export async function setRequestableCategoryIds(ids: number[]): Promise<number[] | null> {
  const devName = localStorage.getItem("dev-user-name") ?? "";
  const res = await fetch("/api/settings/requestable-categories", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-dev-user-name": devName,
    },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Failed to save");
  }
  const data = await res.json();
  return data.ids ?? null;
}

export async function getSkeletonStatusId(): Promise<number | null> {
  const res = await fetch("/api/settings/skeleton-status");
  if (!res.ok) throw new Error("Failed to fetch skeleton status setting");
  const data = await res.json();
  const id = data.statusId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}
 
export async function setSkeletonStatusId(statusId: number | null): Promise<number | null> {
  const devName = localStorage.getItem("dev-user-name") ?? "";
  const res = await fetch("/api/settings/skeleton-status", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "x-dev-user-name": devName,
    },
    body: JSON.stringify({ statusId }),
  });
 
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Failed to save skeleton status");
  }
 
  const data = await res.json();
  return data?.statusId ?? null;
}