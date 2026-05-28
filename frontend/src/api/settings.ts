import { apiFetch } from "./client";
import type { StandardModelsConfig } from "@/types/settingsType";

///  +-----------------------------------------------------------------+
///  |                     STANDARD MODELS                             |
///  +-----------------------------------------------------------------+

export async function getStandardModels(): Promise<StandardModelsConfig> {
  const data = await apiFetch<{ config: StandardModelsConfig }>(
    "/api/settings/standard-models"
  );
  return data.config ?? {};
}

export async function setStandardModelsForCategory(
  categoryId: number,
  primary: number | null,
  backup: number | null
): Promise<StandardModelsConfig> {
  const data = await apiFetch<{ config: StandardModelsConfig }>(
    "/api/settings/standard-models",
    {
      method: "PUT",
      body: { categoryId, primary, backup },
    }
  );
  return data.config ?? {};
}

///  +-----------------------------------------------------------------+
///  |                  REQUESTABLE CATEGORIES                         |
///  +-----------------------------------------------------------------+

export async function getRequestableCategoryIds(): Promise<number[] | null> {
  const data = await apiFetch<{ ids: number[] | null }>(
    "/api/settings/requestable-categories"
  );
  return data.ids ?? null;
}

export async function setRequestableCategoryIds(
  ids: number[]
): Promise<number[] | null> {
  const data = await apiFetch<{ ids: number[] | null }>(
    "/api/settings/requestable-categories",
    {
      method: "PUT",
      body: { ids },
    }
  );
  return data.ids ?? null;
}

///  +-----------------------------------------------------------------+
///  |                       SKELETON STATUS                           |
///  +-----------------------------------------------------------------+

export async function getSkeletonStatusId(): Promise<number | null> {
  const data = await apiFetch<{ statusId: number | null }>(
    "/api/settings/skeleton-status"
  );
  const id = data.statusId;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

export async function setSkeletonStatusId(
  statusId: number | null
): Promise<number | null> {
  const data = await apiFetch<{ statusId: number | null }>(
    "/api/settings/skeleton-status",
    {
      method: "PUT",
      body: { statusId },
    }
  );
  return data.statusId ?? null;
}