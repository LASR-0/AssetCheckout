import {
  refreshAccessoriesCache,
  refreshAccessoryCategoriesCache,
} from "../../services/snipeitaccessories.js";

/**
 * REFRESH_ACCESSORIES_CACHE — one job refreshes both accessory-side
 * caches (the catalog and the accessory categories). They're cheap
 * fetches against the same Snipe instance, and combining them means one
 * JobType, one cron setting, and one row in the jobs timeline.
 *
 * On partial failure the whole job records as failed and the previous
 * cache contents stay in place (refresh functions only swap on success);
 * the lazy TTL fallback in the service covers the gap until the next run.
 */
export async function refreshAccessoriesCacheHandler(): Promise<Record<string, unknown>> {
  const [accessoriesCached, categories] = await Promise.all([
    refreshAccessoriesCache(),
    refreshAccessoryCategoriesCache(),
  ]);

  return {
    accessoriesCached,
    accessoryCategoriesCached: categories.length,
  };
}