import type { CategoryModel, AssetCategory } from "@/types/categoriesType";
 
export async function getModelsForCategory(categoryId: number): Promise<CategoryModel[]> {
  const res = await fetch(`/api/asset-categories/${categoryId}/models`);
  if (!res.ok) throw new Error(`Failed to fetch models for category ${categoryId}`);
  const data = await res.json();
  return data.models ?? [];
}

export async function getAssetCategories(): Promise<AssetCategory[]> {
  const res = await fetch("/api/asset-categories");
  if (!res.ok) throw new Error("Failed to fetch asset categories");
  const data = await res.json();
  return data.categories;
}

export async function getAllAssetCategories(): Promise<AssetCategory[]> {
  const res = await fetch("/api/asset-categories/all");
  if (!res.ok) throw new Error("Failed to fetch all categories");
  const data = await res.json();
  return data.categories;
}