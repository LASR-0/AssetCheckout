import { apiFetch } from "@/api/client";
import type { CategoryModel, AssetCategory } from "@/types/categoriesType";

export async function getModelsForCategory(categoryId: number, signal?: AbortSignal): Promise<CategoryModel[]> {
  const data = await apiFetch<{ models?: CategoryModel[] }>(`/api/asset-categories/${categoryId}/models`, { signal });
  return data.models ?? [];
}

export async function getAssetCategories(signal?: AbortSignal): Promise<AssetCategory[]> {
  const data = await apiFetch<{ categories: AssetCategory[] }>("/api/asset-categories", { signal });
  return data.categories;
}

export async function getAllAssetCategories(signal?: AbortSignal): Promise<AssetCategory[]> {
  const data = await apiFetch<{ categories: AssetCategory[] }>("/api/asset-categories/all", { signal });
  return data.categories;
}
