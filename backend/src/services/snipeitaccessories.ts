import { AppError } from "../utils/errors.js";
import { fetchWithTimeout, getHeaders, baseUrl, getSnipeUser } from "./snipeitassets.js";
import {
  getRequestableAccessoryCategoryIds,
  getStandardAccessoriesForCategory,
  getAllConfiguredStandardAccessoryIds,
} from "./settings.js";
import type {
  SnipeAccessory,
  AccessoryCategory,
  AccessorySummary,
  AccessoryResolution,
  AccessorySearchResult,
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

///  +-----------------------------------------------------------------+
///  |               PRODUCT IDENTITY / LOCATION SIBLINGS              |
///  +-----------------------------------------------------------------+
//
//  Snipe accessories are per-location records: the same product stocked at
//  two sites is two rows with the same manufacturer + name (+ model_number
//  when present) but different location and id. Standards are configured
//  against ONE representative id per option; fulfilment expands that id to
//  its location-siblings so we can pick the row at the user's site
//  (collect) or, failing that, any site with stock (ship).
//
//  The identity key deliberately excludes location and id (the things that
//  vary between siblings) and stock (which varies over time). model_number
//  is folded in only when present — most accessories lack one, so relying
//  on it would over-split; including it when it exists tightens matches for
//  the few that carry it. Everything is trimmed + lowercased so casing and
//  the agreed data-tidy (siblings sharing an exact name) don't cause misses.
///  +-----------------------------------------------------------------+

/**
 * Canonical product-identity key for grouping location-siblings.
 * manufacturer + normalised name + model_number (when present).
 */
function productIdentityKey(a: AccessorySummary): string {
  const manufacturer = (a.manufacturer ?? "").trim().toLowerCase();
  const name = a.name.trim().toLowerCase().replace(/\s+/g, " ");
  const modelNumber = (a.modelNumber ?? "").trim().toLowerCase();
  return `${manufacturer}|${name}|${modelNumber}`;
}

/**
 * All accessory records sharing a product identity with the given seed id
 * — the seed's location-siblings (including the seed itself, if it's still
 * in the catalog). Returns [] if the seed id isn't found at all.
 */
async function getLocationSiblings(seedId: number): Promise<AccessorySummary[]> {
  const all = await getAllAccessories();
  const seed = all.find((a) => a.id === seedId);
  if (!seed) return [];

  const key = productIdentityKey(seed);
  return all.filter((a) => productIdentityKey(a) === key);
}

/**
 * From a set of location-siblings, pick the record to check out and derive
 * ship-vs-collect against the user's location:
 *
 *   - Only siblings with remaining > 0 are eligible.
 *   - Prefer the eligible sibling AT the user's location → collect.
 *   - Else the first eligible sibling elsewhere → ship.
 *   - locationMissing flags an unknown location on the user's side or on
 *     the chosen record, mirroring getLocationComparison on the asset side
 *     (defaults to collect for the flag-for-review case).
 *
 * Returns null when no sibling has stock.
 */
function chooseSibling(
  siblings: AccessorySummary[],
  userLocId: number | null
): AccessoryResolution | null {
  const inStock = siblings.filter((s) => s.remaining > 0);
  if (inStock.length === 0) return null;

  const atUserSite =
    userLocId !== null ? inStock.find((s) => s.locationId === userLocId) : undefined;

  if (atUserSite) {
    const locationMissing = userLocId === null || atUserSite.locationId === null;
    return { accessory: atUserSite, needsShipping: false, locationMissing };
  }

  const chosen = inStock[0];
  const locationMissing = userLocId === null || chosen.locationId === null;
  // Unknown location on either side → default to collect + flag, matching
  // getLocationComparison. Otherwise a different-site record means ship.
  const needsShipping = !locationMissing;
  return { accessory: chosen, needsShipping, locationMissing };
}

///  +-----------------------------------------------------------------+
///  |                    ACCESSORY FULFILMENT                         |
///  +-----------------------------------------------------------------+

/**
 * Resolve a standard accessory request to a concrete Snipe accessory
 * record to check out.
 *
 * Chain (mirrors the asset flow's primary → backup → scan-any):
 *   1. Look up the category's configured options. Find the option whose
 *      label matches the request's accessoryOption.
 *   2. Try that option's primary id → expand to location-siblings →
 *      chooseSibling. If it yields a record, done.
 *   3. Else try the option's backup id the same way.
 *   4. Zero-config fallback: if the category has NO configured options at
 *      all, scan every accessory in the category, group by product
 *      identity, and try each product group (in name order) until one has
 *      stock. This lets a category with unseeded settings still fulfil,
 *      symmetric with the asset flow scanning all models in a category.
 *
 * Returns null when nothing in any candidate path has stock — the caller
 * turns that into the "no stock" error.
 *
 * NB: operates entirely on the cached, normalised catalog — no per-record
 * Snipe fetches. Stock counts are as fresh as the accessories cache (TTL
 * 10m, proactively refreshed). A checkout race (stock gone between resolve
 * and checkout) surfaces as a checkoutAccessory error, handled by caller.
 */
export async function resolveAccessoryForRequest(
  categoryId: number,
  accessoryOption: string | null,
  userId: number
): Promise<AccessoryResolution | null> {
  const user = await getSnipeUser(userId);
  const userLocId = user?.location?.id ?? null;

  const config = await getStandardAccessoriesForCategory(categoryId);

  // ---- Configured-option path ----
  if (config.options.length > 0) {
    // A standard request in a configured category must carry a matching
    // option label (createAccessoryRequest enforces this at submit; we
    // re-check rather than assume). No match → nothing to resolve here.
    const option =
      accessoryOption !== null
        ? config.options.find((o) => o.label === accessoryOption)
        : undefined;

    if (!option) return null;

    for (const seedId of [option.primary, option.backup]) {
      if (seedId === null) continue;
      const siblings = await getLocationSiblings(seedId);
      const resolution = chooseSibling(siblings, userLocId);
      if (resolution) return resolution;
    }

    // Configured option exhausted (primary + backup both out of stock, or
    // their ids no longer in the catalog). Do NOT silently fall through to
    // scanning the whole category — the admin configured specific standards
    // and an unrelated accessory shouldn't be substituted.
    return null;
  }

  // ---- Zero-config fallback: scan the category by product identity ----
  const inCategory = await getAccessoriesByCategory(categoryId);

  const groups = new Map<string, AccessorySummary[]>();
  for (const acc of inCategory) {
    const key = productIdentityKey(acc);
    const existing = groups.get(key);
    if (existing) existing.push(acc);
    else groups.set(key, [acc]);
  }

  for (const siblings of groups.values()) {
    const resolution = chooseSibling(siblings, userLocId);
    if (resolution) return resolution;
  }

  return null;
}

/**
 * Check an accessory out to a user in Snipe-IT.
 *
 * Defensive against Snipe's two failure modes, exactly like checkoutAsset
 * and createSnipeModel on the asset side: a non-2xx response, OR a 2xx with
 * a `status: "error"` body (Snipe sometimes 200s an error). Either throws.
 *
 * The endpoint is POST /accessories/{id}/checkout with an assigned_to user
 * id. We send checkout_to_type + assigned_user alongside assigned_to to be
 * robust to Snipe version differences in the expected field name (extra
 * fields are ignored by versions that don't read them).
 */
export async function checkoutAccessory(
  accessoryId: number,
  userId: number,
  note = "Checked out via API (AssetCheckout)"
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/accessories/${accessoryId}/checkout`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      assigned_to: userId,
      checkout_to_type: "user",
      assigned_user: userId,
      note,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.status === "error") {
    throw new AppError(
      `Accessory checkout failed for ${accessoryId}: ${
        data?.messages ? JSON.stringify(data.messages) : res.statusText
      }`,
      500
    );
  }

  return data;
}

///  +-----------------------------------------------------------------+
///  |          NON-STANDARD SUPPORT (phase 3c): READ / SEARCH         |
///  +-----------------------------------------------------------------+

/**
 * A single accessory by id, fetched DIRECTLY from Snipe (not the cache) and
 * normalised. Used by the non-standard flow at points where freshness
 * matters more than cache-cheapness — right after a stock PATCH, and at
 * checkout time — so a just-written quantity is reflected immediately rather
 * than waiting out the 10-minute cache TTL.
 *
 * Returns null on 404 or a Snipe error-shaped body, matching getSnipeUser /
 * getSnipeAssetDetail on the asset side.
 */
export async function getAccessoryById(
  accessoryId: number
): Promise<AccessorySummary | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/accessories/${accessoryId}`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new AppError(
      `Failed to fetch accessory ${accessoryId}: status ${res.status}`,
      500
    );
  }

  const data = await res.json().catch(() => null);
  if (!data || data.status === "error") return null;

  return toAccessorySummary(data as SnipeAccessory);
}

/**
 * Non-standard accessory search — the accessory twin of
 * searchModelsByManufacturer. Filters the cached catalog to:
 *
 *   - the request's category
 *   - name substring match (case-insensitive) — the primary key, since most
 *     accessories carry neither manufacturer nor model_number
 *   - manufacturer match ONLY when a manufacturer term is given AND the
 *     record has a manufacturer; records with a null manufacturer are never
 *     excluded by a manufacturer term (they'd otherwise all vanish)
 *   - excludes ids configured as standards (getAllConfiguredStandardAccessoryIds),
 *     mirroring how the asset search hides configured-standard models — a
 *     non-standard request shouldn't reuse a standard
 *
 * Results are the raw per-location records (NOT grouped by product identity):
 * the admin is picking one specific record and needs its location visible,
 * the deliberate opposite of the requester-facing option list. In-stock
 * records sort first, then by name.
 */
export async function searchAccessories({
  manufacturer,
  name,
  categoryId,
}: {
  manufacturer?: string;
  name: string;
  categoryId: number;
}): Promise<AccessorySearchResult[]> {
  const all = await getAllAccessories();
  const standardIds = await getAllConfiguredStandardAccessoryIds();

  const targetManufacturer = (manufacturer ?? "").trim().toLowerCase();
  const targetName = name.trim().toLowerCase();

  const matches = all.filter((a) => {
    if (a.categoryId !== categoryId) return false;
    if (standardIds.has(a.id)) return false;
    if (!a.name.trim().toLowerCase().includes(targetName)) return false;
    if (targetManufacturer && a.manufacturer) {
      if (a.manufacturer.trim().toLowerCase() !== targetManufacturer) return false;
    }
    return true;
  });

  return matches
    .map((a) => ({ ...a, hasAvailable: a.remaining > 0 }))
    .sort(
      (x, y) =>
        Number(y.hasAvailable) - Number(x.hasAvailable) ||
        x.name.localeCompare(y.name)
    );
}

///  +-----------------------------------------------------------------+
///  |         NON-STANDARD SUPPORT (phase 3c): WRITES                 |
///  +-----------------------------------------------------------------+
//
//  All three guard Snipe's two failure modes (non-2xx OR a 2xx body with
//  status:"error"), the same convention as checkoutAccessory / checkoutAsset
//  / createSnipeModel.
//
//  Verified field shapes (Postman): create accepts { name, category_id, qty }
//  and returns payload.id; PATCH persists qty and location_id. company_id was
//  observed NOT to persist on either call, so it isn't sent. manufacturer /
//  model_number were NOT verified on create, so they're deliberately not
//  pushed here — they live in the ModelRequest working buffer instead, and
//  pushing them to Snipe is a verified-later follow-up.
///  +-----------------------------------------------------------------+

/**
 * Create a zero-stock accessory record in Snipe (the accessory twin of
 * createSnipeModel). Non-standard "create new" authors the record at qty 0;
 * the actual quantity is added later, in the waiting phase, once stock
 * physically arrives. Returns the new accessory id.
 */
export async function createAccessory(input: {
  name: string;
  categoryId: number;
  qty: number;
}): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/accessories`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      name: input.name,
      category_id: input.categoryId,
      qty: input.qty,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.status === "error") {
    throw new AppError(
      `Failed to create accessory in Snipe: ${
        data?.messages ? JSON.stringify(data.messages) : res.statusText
      }`,
      500
    );
  }

  const newId = data?.payload?.id;
  if (typeof newId !== "number") {
    throw new AppError("Snipe accessory creation returned no ID", 500);
  }

  return newId;
}

/**
 * Set an accessory's stock quantity (and optionally its location) via PATCH.
 * The waiting-phase write: `qty` is the total quantity that has arrived;
 * `locationId`, when given, sets the record's site (used by "create new",
 * which authors location here since it doesn't persist at create time). For
 * an existing record, omit locationId to leave its site untouched.
 */
export async function updateAccessoryStock(
  accessoryId: number,
  input: { qty: number; locationId?: number }
): Promise<unknown> {
  const body: Record<string, unknown> = { qty: input.qty };
  if (input.locationId !== undefined) body.location_id = input.locationId;

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/accessories/${accessoryId}`;

  const res = await fetchWithTimeout(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok || data?.status === "error") {
    throw new AppError(
      `Failed to update accessory ${accessoryId}: ${
        data?.messages ? JSON.stringify(data.messages) : res.statusText
      }`,
      500
    );
  }

  return data;
}

/**
 * Rollback helper for createNewAccessoryForRequest — the accessory twin of
 * deleteSnipeModel. Logs and continues on failure rather than throwing, so a
 * cleanup failure never masks the original error that triggered the rollback.
 */
export async function deleteAccessory(accessoryId: number): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/accessories/${accessoryId}`;

  const res = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok) {
    console.error(
      `Failed to delete accessory ${accessoryId}: status ${res.status}. Manual cleanup may be needed.`
    );
    return false;
  }

  const data = await res.json().catch(() => null);
  if (data?.status === "error") {
    console.error(
      `Snipe refused to delete accessory ${accessoryId}: ${
        data?.messages ?? "unknown reason"
      }. Manual cleanup may be needed.`
    );
    return false;
  }

  return true;
}