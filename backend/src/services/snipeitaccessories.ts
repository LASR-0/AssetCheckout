import { AppError } from "../utils/errors.js";
import { fetchWithTimeout, getHeaders, baseUrl } from "./snipeitassets.js";
import { getRequestableAccessoryCategoryIds } from "./settings.js";
import type {
  SnipeAccessory,
  AccessoryCategory,
  AccessorySummary,
} from "../types/snipeTypes.js";

///  +-----------------------------------------------------------------+
///  |                   SNIPE-IT ACCESSORY SERVICE                    |
///  +-----------------------------------------------------------------+
//
//  The accessory-side mirror of the asset catalog logic in snipeit.ts.
//  Kept in its own file so the accessories chapter never touches the
//  production asset flow; shared plumbing (fetchWithTimeout, getHeaders,
//  baseUrl) is imported from snipeit.ts rather than duplicated.
//
//  Key difference from assets: in Snipe-IT an accessory record IS the
//  model-level entity (name, manufacturer, model_number, qty) — there is
//  no separate hardware layer underneath it. Stock is a quantity on the
//  accessory itself (qty / remaining_qty), not a set of individual
//  asset rows.
///  +-----------------------------------------------------------------+

///  +-----------------------------------------------------------------+
///  |                          CACHES                                 |
///  +-----------------------------------------------------------------+
//
//  Same policy as the asset-side caches in snipeit.ts:
//
//    - TTL as a lazy-refresh safety net; the REFRESH_ACCESSORIES_CACHE
//      job refreshes both proactively.
//    - Refresh-on-failure: force-refresh functions fetch into a temp
//      variable and only swap on success, so a failed refresh leaves
//      the previous (stale) data in place rather than clearing it.
//    - Process-memory only; resets on restart.
///  +-----------------------------------------------------------------+

const ACCESSORY_CATEGORIES_TTL_MS = 60 * 60 * 1000; // 1 hour
const ACCESSORIES_TTL_MS = 10 * 60 * 1000;          // 10 minutes

let accessoryCategoriesCache: {
  data: AccessoryCategory[];
  fetchedAt: number;
} | null = null;

let accessoriesCache: {
  rows: SnipeAccessory[];
  fetchedAt: number;
} | null = null;

function isFresh(fetchedAt: number, ttlMs: number): boolean {
  return Date.now() - fetchedAt < ttlMs;
}

/**
 * Normalise a raw Snipe accessory row into the shape the frontend and
 * request flow consume. `remaining` prefers remaining_qty (canonical in
 * newer Snipe payloads) and falls back through the older aliases.
 */
function toAccessorySummary(row: SnipeAccessory): AccessorySummary {
  return {
    id: row.id,
    name: row.name,
    modelNumber: row.model_number ?? null,
    manufacturer: row.manufacturer?.name ?? null,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
    qty: row.qty ?? 0,
    remaining: row.remaining_qty ?? row.remaining ?? row.qty ?? 0,
    locationId: row.location?.id ?? null,
    locationName: row.location?.name ?? null,
  };
}

///  +-----------------------------------------------------------------+
///  |                    ACCESSORY CATEGORIES                         |
///  +-----------------------------------------------------------------+

/**
 * Raw fetch of all accessory categories from Snipe-IT. Private — callers
 * use getAllAccessoryCategories() (cached) or
 * refreshAccessoryCategoriesCache() (forced).
 *
 * Same endpoint as asset categories, filtered to category_type=accessory.
 * The re-filter on the response guards against Snipe treating the query
 * param as a search rather than a strict filter.
 */
async function fetchAllAccessoryCategories(): Promise<AccessoryCategory[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/categories?category_type=accessory&limit=500`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(
      `Failed to fetch accessory categories, status: ${res.status}`,
      500
    );
  }

  const data = await res.json();
  const rows = data.rows ?? [];

  return rows
    .filter((c: any) => (c.category_type ?? "").toLowerCase() === "accessory")
    .map((c: any) => ({
      id: c.id,
      name: c.name,
    }));
}

/**
 * Force a re-fetch of accessory categories and update the cache. Used by
 * the REFRESH_ACCESSORIES_CACHE job. On failure, the existing cache is
 * left untouched (the error propagates so the job records a failure).
 */
export async function refreshAccessoryCategoriesCache(): Promise<AccessoryCategory[]> {
  const fresh = await fetchAllAccessoryCategories();
  accessoryCategoriesCache = { data: fresh, fetchedAt: Date.now() };
  return fresh;
}

/**
 * Every accessory category in Snipe-IT, regardless of whether it's
 * allowed for new requests. The admin settings page uses this to populate
 * the requestable-accessory-categories selector.
 *
 * Cached (TTL 1h), lazily refetched when stale — same contract as
 * getAllAssetCategories() on the asset side.
 */
export async function getAllAccessoryCategories(): Promise<AccessoryCategory[]> {
  if (
    accessoryCategoriesCache &&
    isFresh(accessoryCategoriesCache.fetchedAt, ACCESSORY_CATEGORIES_TTL_MS)
  ) {
    return accessoryCategoriesCache.data;
  }
  return refreshAccessoryCategoriesCache();
}

/**
 * Only the accessory categories admins have whitelisted as requestable.
 * If no whitelist has been configured (settings returns null), all
 * accessory categories are considered requestable — same semantics as
 * the asset side.
 */
export async function getRequestableAccessoryCategories(): Promise<AccessoryCategory[]> {
  const all = await getAllAccessoryCategories();
  const allowedIds = await getRequestableAccessoryCategoryIds();
  if (allowedIds === null) return all;
  return all.filter((c) => allowedIds.includes(c.id));
}

///  +-----------------------------------------------------------------+
///  |                     ACCESSORIES — READ                          |
///  +-----------------------------------------------------------------+

/**
 * Raw fetch of the full /accessories list. Private — callers use the
 * cached accessor below or refreshAccessoriesCache() (forced).
 *
 * KSB currently has ~34 accessories, so limit=500 comfortably returns
 * everything in one page. If the catalog ever exceeds 500, this needs
 * real pagination (same caveat as getAllUserPhones in snipeit.ts).
 */
async function fetchAllAccessories(): Promise<SnipeAccessory[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/accessories?limit=500`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(
      `Failed to fetch accessories from Snipe-IT, status: ${res.status}`,
      500
    );
  }

  const data = await res.json();
  return data.rows ?? [];
}

/**
 * Force a re-fetch of the /accessories list and update the cache. Used by
 * the REFRESH_ACCESSORIES_CACHE job. On failure, the existing cache is
 * left untouched (the error propagates so the job records a failure).
 */
export async function refreshAccessoriesCache(): Promise<number> {
  const rows = await fetchAllAccessories();
  accessoriesCache = { rows, fetchedAt: Date.now() };
  return rows.length;
}

/**
 * Return the cached /accessories rows, fetching lazily if stale or absent.
 */
async function getCachedAccessories(): Promise<SnipeAccessory[]> {
  if (accessoriesCache && isFresh(accessoriesCache.fetchedAt, ACCESSORIES_TTL_MS)) {
    return accessoriesCache.rows;
  }
  const rows = await fetchAllAccessories();
  accessoriesCache = { rows, fetchedAt: Date.now() };
  return rows;
}

/**
 * Every accessory in the catalog, normalised. Used by the admin settings
 * page to populate the standard-accessories picker across categories.
 */
export async function getAllAccessories(): Promise<AccessorySummary[]> {
  const rows = await getCachedAccessories();
  return rows
    .map(toAccessorySummary)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Accessories in a single category, normalised and including stock
 * (`remaining`). The accessory request form uses this to populate the
 * options list once a category is chosen — the frontend can grey out
 * rows with remaining === 0 rather than hiding them.
 */
export async function getAccessoriesByCategory(
  categoryId: number
): Promise<AccessorySummary[]> {
  const rows = await getCachedAccessories();
  return rows
    .filter((row) => row.category?.id === categoryId)
    .map(toAccessorySummary)
    .sort((a, b) => a.name.localeCompare(b.name));
}