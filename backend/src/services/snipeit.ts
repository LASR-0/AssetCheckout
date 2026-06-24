import { AppError } from '../utils/errors.js';
import { getMean, removeOutliers } from "../utils/statistics.js";
import {
  getRequestableCategoryIds,
  getAllConfiguredStandardModelIds,
} from './settings.js';
import type {
  CheckoutInput,
  CustomField,
  Asset,
  TierMatch,
  Model,
  User,
  StatusLabel,
  SearchModelsInput,
  CreateSnipeModelInput,
  SnipeNamedRecord,
  AssetDetailsInput,
  SnipeAssetDetail,
  CreateSkeletonAssetInput,
  SnipeUserDetail,
  ModelSearchResult
} from '../types/snipeTypes.js';

const BASE_URL = process.env.SNIPEIT_API_URL;
const API_TOKEN = process.env.SNIPEIT_BOT_TOKEN;

if (!BASE_URL || !API_TOKEN) {
  throw new Error('Missing Snipe-IT environment variables');
}

const baseUrl: string = BASE_URL;
const apiToken: string = API_TOKEN;

///  +-----------------------------------------------------------------+
///  |                            HELPERS                              |
///  +-----------------------------------------------------------------+

/**
 * fetch() with a timeout. Snipe-IT can be slow or unreachable on a flaky
 * network, and we'd rather surface a clean 504/502 than hang the request.
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    clearTimeout(id);
    return res;
  } catch (err: unknown) {
    clearTimeout(id);

    if (err instanceof Error && err.name === 'AbortError') {
      throw new AppError('Snipe-IT request timed out', 504);
    }

    throw new AppError('Failed to connect to Snipe-IT', 502);
  }
}

function getHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${apiToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * Currently just checks that the asset has *some* non-empty Tier value. The
 * tierMatch param is reserved for future "must be tier X" filtering
 */
function assetMatchesTier(asset: Asset, _tierMatch: TierMatch): boolean {
  const rawTier = asset.custom_fields?.Tier?.value;
  if (typeof rawTier !== "string") return false;

  const normalized = rawTier.trim();
  return normalized.length > 0;
}

///  +-----------------------------------------------------------------+
///  |                       SNIPE-IT CACHES                           |
///  +-----------------------------------------------------------------+
//
//  Two in-memory caches reduce load on Snipe-IT for data that's read often
//  but changes rarely:
//
//    - Asset categories (the {id, name} list)
//    - The raw /hardware rows (used to compute price averages per tier)
//
//  Each cache has a TTL that acts as a safety net: if the data is older than
//  the TTL, the next read re-fetches lazily. 
//
//  Refresh-on-failure policy: the force-refresh functions fetch into a temp
//  variable and only swap it into the cache on success. A failed refresh
//  leaves the previous (stale) data in place rather than clearing it 
//
//  Caches live in process memory, so they reset on restart 
///  +-----------------------------------------------------------------+

type AssetCategory = { id: number; name: string };

const CATEGORIES_TTL_MS = 60 * 60 * 1000;   // 1 hour
const HARDWARE_TTL_MS = 10 * 60 * 1000;     // 10 minutes

let categoriesCache: { data: AssetCategory[]; fetchedAt: number } | null = null;
let hardwareCache: { rows: any[]; fetchedAt: number } | null = null;

function isFresh(fetchedAt: number, ttlMs: number): boolean {
  return Date.now() - fetchedAt < ttlMs;
}

/**
 * Raw fetch of all asset categories from Snipe-IT. Private — callers use
 * getAllAssetCategories() (cached) or refreshCategoriesCache() (forced).
 */
async function fetchAllAssetCategories(): Promise<AssetCategory[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/categories?category_type=asset&limit=500`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch categories, status: ${res.status}`, 500);
  }

  const data = await res.json();
  const rows = data.rows ?? [];

  return rows
    .filter((c: any) => (c.category_type ?? "").toLowerCase() === "asset")
    .map((c: any) => ({
      id: c.id,
      name: c.name,
    }));
}

/**
 * Force a re-fetch of asset categories and update the cache. Used by the
 * REFRESH_CATEGORIES_CACHE job. On failure, the existing cache is left
 * untouched (the error propagates so the job records a failure).
 */
export async function refreshCategoriesCache(): Promise<AssetCategory[]> {
  const fresh = await fetchAllAssetCategories();
  categoriesCache = { data: fresh, fetchedAt: Date.now() };
  return fresh;
}

/**
 * Raw fetch of the full /hardware list. Private — callers use the cached
 * accessor below or refreshPricesCache() (forced).
 */
async function fetchAllHardware(): Promise<any[]> {
  const res = await fetchWithTimeout(
    `${baseUrl.replace(/\/$/, "")}/api/v1/hardware`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  if (!res.ok) {
    throw new AppError("Failed to fetch assets from Snipe-IT", 500);
  }

  const data = await res.json();
  return data.rows || [];
}

/**
 * Return the cached /hardware rows, fetching lazily if stale or absent.
 */
async function getCachedHardware(): Promise<any[]> {
  if (hardwareCache && isFresh(hardwareCache.fetchedAt, HARDWARE_TTL_MS)) {
    return hardwareCache.rows;
  }
  const rows = await fetchAllHardware();
  hardwareCache = { rows, fetchedAt: Date.now() };
  return rows;
}

/**
 * Force a re-fetch of the /hardware list and update the cache. Used by the
 * REFRESH_PRICES_CACHE job. On failure, the existing cache is left untouched
 * (the error propagates so the job records a failure).
 */
export async function refreshPricesCache(): Promise<number> {
  const rows = await fetchAllHardware();
  hardwareCache = { rows, fetchedAt: Date.now() };
  return rows.length;
}

///  +-----------------------------------------------------------------+
///  |                       CHECKOUT FLOW                             |
///  +-----------------------------------------------------------------+

/**
 * High-level checkout orchestrator: pick a model in the category, find an
 * available asset for that model, check it out to the user.
 *
 * Note: only used as a standalone helper — the main approval flow in
 * services/requests.ts drives checkouts directly via checkoutAsset() below
 * because it needs finer control over model selection (primary/backup, etc.).
 */
export async function requestAssetCheckout({ user_id, category_id, tierMatch }: CheckoutInput) {
  if (!user_id) {
    throw new AppError('User ID is required', 400);
  }

  const models = await getModelsByCategory(category_id);

  if (!models.length) {
    throw new AppError('No models available for category', 404);
  }

  const model = models[0];

  const asset = await getAvailableAssetFromModel(model.id, tierMatch);

  if (!asset) {
    throw new AppError('No available assets for model', 404);
  }

  const result = await checkoutAsset(asset.id, user_id);

  return {
    success: true,
    user_id,
    model: model.name,
    asset: {
      id: asset.id,
      tag: asset.asset_tag,
    },
    checkout: result,
  };
}

/**
 * Low-level checkout. Assigns the asset to the user as a regular user-checkout
 * (not to a location or another asset). Always tagged with the same note so
 * Snipe's history shows checkouts originating from this app.
 */
export async function checkoutAsset(assetId: number, userId: number) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/hardware/${assetId}/checkout`;

  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      checkout_to_type: 'user',
      assigned_user: userId,
      note: 'Checked out via API',
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new AppError(`Checkout failed for asset ${assetId}`, 500);
  }

  return data;
}

///  +-----------------------------------------------------------------+
///  |                          CATEGORIES                             |
///  +-----------------------------------------------------------------+

/**
 * Every asset category in Snipe-IT, regardless of whether it's allowed for
 * new requests. The admin settings page uses this to populate the
 * requestable-categories selector.
 *
 * Cached: returns the in-memory cache when fresh (TTL 1h), otherwise fetches
 * lazily. The REFRESH_CATEGORIES_CACHE job refreshes this proactively. A
 * category added in Snipe won't appear here until the cache expires or a
 * refresh runs — use the admin "refresh now" action for immediate effect.
 */
export async function getAllAssetCategories(): Promise<AssetCategory[]> {
  if (categoriesCache && isFresh(categoriesCache.fetchedAt, CATEGORIES_TTL_MS)) {
    return categoriesCache.data;
  }
  return refreshCategoriesCache();
}

/**
 * Only the categories admins have whitelisted as requestable. If no
 * whitelist has been configured (returns null from settings), all asset
 * categories are considered requestable.
 */
export async function getRequestableAssetCategories(): Promise<AssetCategory[]> {
  const all = await getAllAssetCategories();
  const allowedIds = await getRequestableCategoryIds();
  if (allowedIds === null) return all;
  return all.filter((c) => allowedIds.includes(c.id));
}

///  +-----------------------------------------------------------------+
///  |                         MODELS — READ                           |
///  +-----------------------------------------------------------------+

 /*
 * Used by CLEANUP_ORPHAN_SNIPE_MODELS to confirm a model is empty before
 * deletion. We create exactly one skeleton asset per model, so for a candidate
 * whose linked asset is gone, this returning false is the expected confirm.
 */

export async function modelHasAnyAssets(modelId: number): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/hardware?model_id=${modelId}&limit=1`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to check assets for model ${modelId}: status ${res.status}`, 500);
  }

  const data: { rows?: unknown[] } = await res.json();
  return Array.isArray(data.rows) && data.rows.length > 0;
}


/**
 * Models in a category that currently have at least one unassigned asset.
 * Used by the standard-approval flow to find something to check out.
 */
export async function getModelsByCategory(categoryId: number): Promise<Model[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/models`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch models, status: ${res.status}`, 500);
  }

  const data: { rows: Model[] } = await res.json();

  return data.rows.filter(
    (model) =>
      model.category?.id === categoryId &&
      model.remaining >= 1
  );
}

/**
 * Every model in a category, including ones with no available assets.
 * Used by the admin settings page to populate the standard-models picker.
 */
export async function getAllModelsByCategory(categoryId: number): Promise<Model[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/models?limit=500`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch models, status: ${res.status}`, 500);
  }

  const data: { rows: Model[] } = await res.json();
  return data.rows.filter((model) => model.category?.id === categoryId);
}

/**
 * Fuzzy search for existing models when an admin is processing a non-standard
 * request. Filters:
 *
 *   - must be in the same category as the request
 *   - must NOT be a model configured as a standard (those are reserved for
 *     standard requests; non-standard shouldn't reuse them)
 *   - manufacturer name must match exactly (case-insensitive)
 *   - model name must contain the search string (case-insensitive substring)
 *   - must have at least one available asset right now
 *
 * Returns only matches that pass all five filters, so an admin clicking
 * "Select" on a result can be reasonably confident it'll succeed.
 */
export async function searchModelsByManufacturer({
  manufacturer,
  modelName,
  categoryId,
}: SearchModelsInput): Promise<ModelSearchResult[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/models?limit=500`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch models, status: ${res.status}`, 500);
  }

  const data: { rows: Model[] } = await res.json();

  const standardModelIds = await getAllConfiguredStandardModelIds();

  const targetManufacturer = manufacturer.trim().toLowerCase();
  const targetModelName = modelName.trim().toLowerCase();

  const candidates = data.rows.filter((model) => {
    if (model.category?.id !== categoryId) return false;
    if (standardModelIds.has(model.id)) return false;

    const modelManufacturer = (model.manufacturer?.name ?? "").trim().toLowerCase();
    if (modelManufacturer !== targetManufacturer) return false;

    const modelNameLower = (model.name ?? "").trim().toLowerCase();
    if (!modelNameLower.includes(targetModelName)) return false;

    return true;
  });

  // Parallel availability check — one API call per candidate. Acceptable for
  // typical search result sizes (<10); if this gets slow we could fold the
  // availability check into the initial /hardware fetch and group by model.
  const availabilityChecks = await Promise.all(
    candidates.map(async (model) => {
      const asset = await getAvailableAssetFromModel(model.id, { mode: "any" });
      return { ...model, hasAvailable: asset !== null };
    })
  );

  return availabilityChecks.sort((a, b) => Number(b.hasAvailable) - Number(a.hasAvailable));
}

///  +-----------------------------------------------------------------+
///  |                        MODELS — WRITE                           |
///  +-----------------------------------------------------------------+

/**
 * Create a new model in Snipe-IT. Resolves the manufacturer by name, creating
 * the manufacturer on the fly if it doesn't already exist.
 *
 * The fieldset MUST be provided by the caller and must match the category's
 * existing fieldset — Snipe won't surface custom fields (including Tier) on
 * a model with no fieldset, and the checkout flow depends on Tier being
 * present.
 */
export async function createSnipeModel({
  manufacturer,
  modelName,
  modelNumber,
  categoryId,
  fieldsetId,
}: CreateSnipeModelInput): Promise<number> {
  const manufacturerId = await getOrCreateManufacturerId(manufacturer);

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/models`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      name: modelName,
      model_number: modelNumber,
      manufacturer_id: manufacturerId,
      category_id: categoryId,
      fieldset_id: fieldsetId,
    }),
  });

  const data = await res.json();

  if (!res.ok || data?.status === "error") {
    throw new AppError(
      `Failed to create model in Snipe: ${data?.messages ?? res.statusText}`,
      500
    );
  }

  const newModelId = data?.payload?.id;
  if (typeof newModelId !== "number") {
    throw new AppError("Snipe model creation returned no ID", 500);
  }

  return newModelId;
}

/**
 * Private — used only by createSnipeModel. Snipe-IT doesn't let you create
 * a model with a manufacturer NAME, it needs an ID, so we resolve the name
 * to an existing manufacturer (case-insensitive exact match) or create a new
 * one and return its ID.
 */
async function getOrCreateManufacturerId(name: string): Promise<number> {
  const trimmed = name.trim();
  const target = trimmed.toLowerCase();

  const searchUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/manufacturers?limit=500`;
  const searchRes = await fetchWithTimeout(searchUrl, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!searchRes.ok) {
    throw new AppError(`Failed to fetch manufacturers, status: ${searchRes.status}`, 500);
  }

  const searchData: { rows: { id: number; name: string }[] } = await searchRes.json();
  const existing = searchData.rows.find(
    (m) => m.name.trim().toLowerCase() === target
  );
  if (existing) return existing.id;

  const createUrl = `${baseUrl.replace(/\/$/, "")}/api/v1/manufacturers`;
  const createRes = await fetchWithTimeout(createUrl, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ name: trimmed }),
  });

  const createData = await createRes.json();

  if (!createRes.ok || createData?.status === "error") {
    throw new AppError(
      `Failed to create manufacturer "${trimmed}": ${createData?.messages ?? createRes.statusText}`,
      500
    );
  }

  const newId = createData?.payload?.id;
  if (typeof newId !== "number") {
    throw new AppError("Manufacturer creation returned no ID", 500);
  }

  return newId;
}

/**
 * Create a barebones "skeleton" asset attached to a model. No serial, no
 * company, no location — admins fill those in via fillAssetDetailsForRequest
 * after this returns. The status_id should be the configured skeleton status
 * (typically something like "Pending" that isn't deployable yet).
 */
export async function createSkeletonAsset({
  modelId,
  statusId,
}: CreateSkeletonAssetInput): Promise<number> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/hardware`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({
      model_id: modelId,
      status_id: statusId,
    }),
  });

  const data = await res.json();

  if (!res.ok || data?.status === "error") {
    throw new AppError(
      `Failed to create skeleton asset in Snipe: ${data?.messages ?? res.statusText}`,
      500
    );
  }

  const newAssetId = data?.payload?.id;
  if (typeof newAssetId !== "number") {
    throw new AppError("Snipe asset creation returned no ID", 500);
  }

  return newAssetId;
}

/**
 * Rollback helper for createNewModelForRequest in services/requests.ts.
 *
 * Logs and continues on failure rather than throwing — if rollback fails
 * we'd rather complete the surrounding error path than mask the original
 * error with a cleanup error.
 */
export async function deleteSnipeModel(modelId: number): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/models/${modelId}`;

  const res = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok) {
    console.error(
      `Failed to delete Snipe model ${modelId}: status ${res.status}. Manual cleanup may be needed.`
    );
    return false;
  }

  const data = await res.json().catch(() => null);
  if (data?.status === "error") {
    console.error(
      `Snipe refused to delete model ${modelId}: ${data?.messages ?? "unknown reason"}. Manual cleanup may be needed.`
    );
    return false;
  }

  return true;
}

///  +-----------------------------------------------------------------+
///  |                        ASSETS — READ                            |
///  +-----------------------------------------------------------------+

/**
 * Pick the first available asset attached to a model. Filters:
 *
 *   - status_label must be "Ready to Deploy" (Snipe's canonical "deployable"
 *     state)
 *   - must not be checked out to anyone
 *   - must pass assetMatchesTier (currently just "has a non-empty tier")
 *
 * Returns null if nothing's available; callers decide whether that's an
 * error or a fallback signal.
 */
export async function getAvailableAssetFromModel(
  modelId: number,
  tierMatch: TierMatch
): Promise<Asset | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/hardware?model_id=${modelId}`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch assets for model ${modelId}`, 500);
  }

  const data: { rows: Asset[] } = await res.json();

  const availableAssets = data.rows.filter((asset) => {
    if (asset.status_label?.name !== 'Ready to Deploy') return false;
    if (asset.assigned_to !== null) return false;
    if (!assetMatchesTier(asset, tierMatch)) return false;
    return true;
  });

  return availableAssets[0] ?? null;
}

/**
 * Full asset detail by ID. Returns null if Snipe-IT returns 404, throws on
 * any other failure. Used both for completeness checking and for fetching
 * the latest asset_tag at checkout time.
 */
export async function getSnipeAssetDetail(assetId: number): Promise<SnipeAssetDetail | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/hardware/${assetId}`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new AppError(`Failed to fetch asset ${assetId}: status ${res.status}`, 500);
  }

  return (await res.json()) as SnipeAssetDetail;
}

/*
 * Returns false if the asset is missing (404) OR soft-deleted; true only for
 * a live asset. Used by CLEANUP_ORPHAN_SNIPE_MODELS: an admin deleting a
 * skeleton asset in the UI soft-deletes it, which is exactly the orphan trigger.
 */

export async function isSnipeAssetLive(assetId: number): Promise<boolean> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/hardware/${assetId}`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (res.status === 404) return false;

  if (!res.ok) {
    throw new AppError(`Failed to fetch asset ${assetId}: status ${res.status}`, 500);
  }

  const data = await res.json().catch(() => null);
  // A Snipe error-shaped body (e.g. not found) also counts as not-live.
  if (!data || data.status === "error") return false;

  // Live only if deleted_at is null/absent. Snipe returns deleted_at as an
  // object ({datetime, formatted}) when set, null when not.
  return data.deleted_at == null;
}

/**
 * "Is this asset fully populated and ready to deploy?" — the source of
 * truth for ModelRequest.assetReady. All of these must be true:
 *
 *   - model, company, location are set
 *   - status_label is "Ready to Deploy"
 *   - serial and asset_tag are non-empty after trimming
 *   - the Tier custom field is non-empty after trimming
 *
 * If any of these fail, the request stays at Row 4 (awaiting details) rather
 * than advancing to Row 5 (ready for checkout).
 */
export async function isSnipeAssetComplete(assetId: number): Promise<boolean> {
  const asset = await getSnipeAssetDetail(assetId);
  if (!asset) return false;

  if (!asset.model?.id) return false;
  if (!asset.company?.id) return false;
  if (!asset.location?.id) return false;

  const statusName = asset.status_label?.name?.trim().toLowerCase();
  if (statusName !== "ready to deploy") return false;

  const serial = asset.serial?.trim();
  if (!serial) return false;

  const assetTag = asset.asset_tag?.trim();
  if (!assetTag) return false;

  const tier = asset.custom_fields?.Tier?.value?.trim();
  if (!tier) return false;

  return true;
}

///  +-----------------------------------------------------------------+
///  |                        ASSETS — WRITE                           |
///  +-----------------------------------------------------------------+

/**
 * Partial-update an asset. Every field is optional from the caller's POV
 * (admins fill them in over multiple passes), but we always send something
 * for each field so Snipe-IT either updates or clears it — never leaves it
 * as "don't touch."
 *
 * The Tier value goes under whatever column name Snipe assigned to the Tier
 * custom field (typically `_snipeit_tier_N` for some N), which we look up
 * dynamically.
 */
export async function updateSnipeAsset(
  assetId: number,
  fields: AssetDetailsInput
): Promise<unknown> {

  const tierColumnName = await getTierCustomFieldColumnName();

  const body: Record<string, unknown> = {
    company_id: fields.companyId ?? null,
    status_id: fields.statusId ?? null,
    location_id: fields.locationId ?? null,
    serial: fields.serial ?? "",
    purchase_cost:
      fields.price !== undefined && fields.price !== null
        ? String(fields.price)
        : "",
    [tierColumnName]: fields.tier ?? "",
  };

  if (fields.assetTag !== undefined) {
    body.asset_tag = fields.assetTag;
  }

  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/hardware/${assetId}`;

  const res = await fetchWithTimeout(url, {
    method: "PATCH",
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok || data?.status === "error") {
    throw new AppError(
      `Failed to update asset ${assetId} in Snipe: ${data?.messages ?? res.statusText}`,
      500
    );
  }

  return data;
}

///  +-----------------------------------------------------------------+
///  |                       REFERENCE DATA                            |
///  +-----------------------------------------------------------------+
//
//  Lookup endpoints for populating dropdowns in the admin UI. Companies,
//  locations, and status labels are all small lists (typically <200 entries)
//  so we just fetch everything in one call with a high limit.
///  +-----------------------------------------------------------------+

export async function getCompanies(): Promise<SnipeNamedRecord[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/companies?limit=500`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch companies, status: ${res.status}`, 500);
  }

  const data: { rows: SnipeNamedRecord[] } = await res.json();

  return (data.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

export async function getLocations(): Promise<SnipeNamedRecord[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/locations?limit=500`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch locations, status: ${res.status}`, 500);
  }

  const data: { rows: SnipeNamedRecord[] } = await res.json();

  return (data.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

export async function getAllStatuses(): Promise<SnipeNamedRecord[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/statuslabels?limit=200`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch status labels, status: ${res.status}`, 500);
  }

  const data: { rows: SnipeNamedRecord[] } = await res.json();

  return (data.rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));
}

/**
 * Resolve a status label name to its ID. Used as a fallback when the
 * skeleton status isn't configured in settings — services/requests.ts looks
 * up "Pending" by name.
 *
 * Note: duplicates the fetch that getAllStatuses() does. Kept separate
 * because the call sites want different return shapes (ID vs full list).
 * Negligible cost at our scale.
 */
export async function getStatusIdByName(name: string): Promise<number | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/statuslabels?limit=200`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch status labels, status: ${res.status}`, 500);
  }

  const data: { rows: StatusLabel[] } = await res.json();
  const target = name.trim().toLowerCase();

  const match = data.rows.find(
    (label) => label.name.trim().toLowerCase() === target
  );

  return match?.id ?? null;
}

/**
 * Infers the fieldset for a category by looking at an existing model in that
 * category. Snipe-IT attaches custom-field definitions to fieldsets, not to
 * categories directly, so we have to ride on a sibling model's fieldset when
 * creating a new model. Returns null if no models exist in the category yet.
 */
export async function getFieldsetIdForCategory(categoryId: number): Promise<number | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/models?limit=500`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch models, status: ${res.status}`, 500);
  }

  const data: { rows: Model[] } = await res.json();

  const inCategory = data.rows.find((model) => model.category?.id === categoryId);
  if (!inCategory) return null;

  return inCategory.fieldset?.id ?? null;
}

///  +-----------------------------------------------------------------+
///  |                    CUSTOM FIELDS — TIER                         |
///  +-----------------------------------------------------------------+

/**
 * The allowed tier values, scraped from Snipe-IT's "Tier" custom field
 * definition. We don't store these locally — whatever the Snipe admin
 * configures in /fields is the source of truth.
 *
 * Tries field_values_array first (newer Snipe), falls back to splitting
 * field_values on newlines (older Snipe).
 */
export async function getTierValues(): Promise<string[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/fields`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch custom fields, status: ${res.status}`, 500);
  }

  const data: { rows: CustomField[] } = await res.json();

  const tierField = data.rows.find((field) =>
    field.name.toLowerCase().includes('tier')
  );

  if (!tierField) {
    throw new AppError('No "Tier" custom field found in Snipe-IT', 404);
  }

  if (tierField.field_values_array?.length) {
    return tierField.field_values_array
      .map((v) => v.trim())
      .filter(Boolean);
  }

  if (tierField.field_values) {
    return tierField.field_values
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * The DB column name Snipe-IT assigned to the Tier custom field (e.g.
 * `_snipeit_tier_5`). updateSnipeAsset needs this because Snipe's PATCH
 * endpoint takes custom-field values keyed by column name, not by display
 * name.
 */
export async function getTierCustomFieldColumnName(): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/fields`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new AppError(`Failed to fetch custom fields, status: ${res.status}`, 500);
  }

  const data: { rows: CustomField[] } = await res.json();

  const tierField = data.rows.find((field) =>
    field.name.toLowerCase().includes('tier')
  );

  if (!tierField) {
    throw new AppError('No "Tier" custom field found in Snipe-IT', 404);
  }

  if (!tierField.db_column_name) {
    throw new AppError('Tier custom field is missing db_column_name in Snipe response', 500);
  }

  return tierField.db_column_name;
}

///  +-----------------------------------------------------------------+
///  |                            USERS                                |
///  +-----------------------------------------------------------------+

/**
 * Trimmed-down user list for populating the "who is this for?" dropdown on
 * the request form. Users with no name are filtered out — they exist in
 * Snipe sometimes (service accounts, legacy data) but can't sensibly be
 * shown to humans.
 */
export async function getAllUsersCleaned(): Promise<User[]> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/users`;

  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: getHeaders(),
  });

  const data: { rows: User[] } = await res.json();

  if (!data?.rows) {
    throw new AppError('Failed to fetch users', 500);
  }

  return data.rows
    .filter((user) => user.name)
    .map((user) => ({
      id: user.id,
      name: user.name,
    }));
}

///  +-----------------------------------------------------------------+
///  |                       PRICE ANALYTICS                           |
///  +-----------------------------------------------------------------+

/**
 * Returns the outlier-trimmed mean purchase cost per category, optionally
 * filtered to a specific tier. Used by AssetDetailsDialog to show admins a
 * "typical price" reference next to the price input.
 *
 * Categories considered are the same set that admins have whitelisted as
 * requestable. If no whitelist is configured, ALL categories are included
 * — extra entries in the result are harmless because consumers only look
 * up the average for their own category.
 *
 * Reads the /hardware list from the in-memory cache (TTL 10m, refreshed
 * proactively by REFRESH_PRICES_CACHE). The frontend calls this once per
 * tier on page load; sharing the cached rows means those calls cost one
 * Snipe fetch between them rather than one each.
 */
export async function getAveragePricesFromSnipe(tier?: string) {
  const allAssets = await getCachedHardware();

  const allowedIds = await getRequestableCategoryIds();
  // null = no whitelist configured = include every category.
  const allowedCategorySet: Set<number> | null =
    allowedIds !== null ? new Set(allowedIds) : null;

  const pricesByCategory: Record<number, number[]> = {};

  for (const asset of allAssets) {
    const categoryId = Number(asset.category?.id ?? asset.category_id);

    if (Number.isNaN(categoryId)) continue;
    if (allowedCategorySet !== null && !allowedCategorySet.has(categoryId)) continue;

    const assetTier = asset.custom_fields?.Tier?.value;
    const normalizedTier = assetTier?.toUpperCase();

    if (tier && normalizedTier !== tier.toUpperCase()) continue;

    const rawPrice = asset.purchase_cost;

    if (rawPrice == null || rawPrice === "") continue;

    const price =
      typeof rawPrice === "string"
        ? parseFloat(rawPrice.replace(/,/g, ""))
        : rawPrice;

    if (!Number.isFinite(price)) continue;

    if (!pricesByCategory[categoryId]) {
      pricesByCategory[categoryId] = [];
    }

    pricesByCategory[categoryId].push(price);
  }

  const averages: Record<number, number> = {};

  for (const categoryId in pricesByCategory) {
    const prices = pricesByCategory[Number(categoryId)];

    if (!prices.length) continue;

    const cleaned = removeOutliers(prices);

    if (!cleaned.length) continue;

    averages[Number(categoryId)] = getMean(cleaned);
  }

  return averages;
}

/**
 * Full detail for one Snipe user by ID — email and location, which the
 * trimmed getAllUsersCleaned() list omits. Used to resolve notification
 * recipients and to compare a user's location against a device's location
 * for the ship-vs-collect branch.
 *
 * Returns null on 404. email/location may be null even for a live user
 * (Snipe allows users with no email or no location set), so callers must
 * handle null rather than assume presence.
 */
export async function getSnipeUser(userId: number): Promise<SnipeUserDetail | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/users/${userId}`;

  const res = await fetchWithTimeout(url, {
    method: "GET",
    headers: getHeaders(),
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new AppError(`Failed to fetch user ${userId}: status ${res.status}`, 500);
  }

  const data = await res.json().catch(() => null);
  if (!data || data.status === "error") return null;

  return {
    id: data.id,
    name: data.name ?? "",
    email: typeof data.email === "string" && data.email.trim() ? data.email.trim() : null,
    location: data.location
      ? { id: data.location.id, name: data.location.name }
      : null,
  };
}

/**
 * Resolve a Snipe user's email, or null if the user is missing or has no
 * email set. Notification handlers treat null as "skip, nothing to send"
 * rather than an error.
 */
export async function resolveUserEmail(userId: number): Promise<string | null> {
  const user = await getSnipeUser(userId);
  return user?.email ?? null;
}

/**
 * Compare the request user's Snipe location against the device's location to
 * decide ship-vs-collect at fulfilment time. If either location is unknown,
 * defaults to collect (needsShipping=false) and flags locationMissing so the
 * row can be reviewed.
 */
export async function getLocationComparison(
  userId: number,
  assetId: number
): Promise<{ needsShipping: boolean; locationMissing: boolean }> {
  const [user, asset] = await Promise.all([
    getSnipeUser(userId),
    getSnipeAssetDetail(assetId),
  ]);

  const userLocId = user?.location?.id ?? null;

  // Prefer rtd_location (the device's home/default location, always set for
  // stock) over location (null for un-checked-out assets, and overwritten to
  // the user's location on checkout — useless for ship-vs-collect).
  const deviceLocId =
    asset?.rtd_location?.id ?? asset?.location?.id ?? null;

  if (userLocId === null || deviceLocId === null) {
    return { needsShipping: false, locationMissing: true };
  }

  return { needsShipping: userLocId !== deviceLocId, locationMissing: false };
}

///  +-----------------------------------------------------------------+
///  |                         RE-EXPORTS                              |
///  +-----------------------------------------------------------------+

export type { TierMatch, SnipeAssetDetail, AssetDetailsInput };