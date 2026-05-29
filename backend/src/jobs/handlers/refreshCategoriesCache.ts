import { refreshCategoriesCache } from "../../services/snipeit.js";

export async function refreshCategoriesCacheHandler(): Promise<Record<string, unknown>> {
  const categories = await refreshCategoriesCache();
  return { categoriesCached: categories.length };
}