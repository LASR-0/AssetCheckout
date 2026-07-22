import { apiFetch } from "@/api/client";
import type {
  AccessoryCategory,
  AccessorySettings,
  AccessoryOptionConfig,
  StandardAccessoriesConfig,
  AccessorySummary,
} from "@/types/accessoriesType";

///  +-----------------------------------------------------------------+
///  |                     ACCESSORY API WRAPPERS                      |
///  +-----------------------------------------------------------------+
//
//  All calls go through apiFetch so dev identity headers are injected —
//  the accessory endpoints are actor-gated, unlike the legacy asset
//  category endpoints, so raw fetch() would 401 in dev.
//
//  Note the envelope asymmetry vs the asset settings API: the accessory
//  settings GET bundles the whitelist AND the option config in one admin
//  call, and the PUTs return only { success } (no echoed config). So
//  callers keep the authoritative config in local state and update it
//  optimistically rather than replacing state from a PUT response.
///  +-----------------------------------------------------------------+

type CategoriesResponse = {
  success: boolean;
  categories: AccessoryCategory[];
};

type OptionLabelsResponse = {
  success: boolean;
  options: string[];
};

type SettingsResponse = {
  success: boolean;
  requestableCategoryIds: number[] | null;
  standardAccessories: StandardAccessoriesConfig;
};

type AccessoriesResponse = {
  success: boolean;
  accessories: AccessorySummary[];
};

/**
 * The accessory categories requesters are allowed to pick from (the
 * admin whitelist, or all accessory categories when none is configured).
 */
export async function getAccessoryCategories(): Promise<AccessoryCategory[]> {
  const data = await apiFetch<CategoriesResponse>(
    "/api/accessories/categories/requestable"
  );
  return data.categories ?? [];
}

/**
 * Every accessory category in Snipe-IT (admin view — not filtered to the
 * requestable whitelist). Backs the requestable-categories selector.
 */
export async function getAllAccessoryCategories(): Promise<AccessoryCategory[]> {
  const data = await apiFetch<CategoriesResponse>("/api/accessories/categories");
  return data.categories ?? [];
}

/**
 * The named options configured for a category ("USB-C to Lightning",
 * "Case", ...). Labels only — the standards they resolve to are never
 * exposed to requesters. Empty array = no options configured yet.
 */
export async function getAccessoryOptionLabels(
  categoryId: number
): Promise<string[]> {
  const data = await apiFetch<OptionLabelsResponse>(
    `/api/accessories/options/${categoryId}`
  );
  return data.options ?? [];
}

///  +-----------------------------------------------------------------+
///  |                    ADMIN SETTINGS (bundled)                     |
///  +-----------------------------------------------------------------+

/**
 * The bundled accessory settings — requestable whitelist (null = all
 * allowed) plus the per-category option config. One admin call populates
 * the whole Accessory Configuration section.
 */
export async function getAccessorySettings(): Promise<AccessorySettings> {
  const data = await apiFetch<SettingsResponse>("/api/accessories/settings");
  return {
    requestableCategoryIds: data.requestableCategoryIds ?? null,
    standardAccessories: data.standardAccessories ?? {},
  };
}

/**
 * Replace the requestable-accessory-categories whitelist. Returns nothing
 * meaningful (the endpoint echoes only { success }); callers hold state
 * optimistically.
 */
export async function setRequestableAccessoryCategoryIds(
  ids: number[]
): Promise<void> {
  await apiFetch<{ success: boolean }>(
    "/api/accessories/settings/requestable-categories",
    { method: "PUT", body: { ids } }
  );
}

/**
 * Replace the full option list for one accessory category (replace
 * semantics — send the whole array). Echoes only { success }.
 */
export async function setStandardAccessoriesForCategory(
  categoryId: number,
  options: AccessoryOptionConfig[]
): Promise<void> {
  await apiFetch<{ success: boolean }>(
    `/api/accessories/settings/standard-accessories/${categoryId}`,
    { method: "PUT", body: { options } }
  );
}

///  +-----------------------------------------------------------------+
///  |                          CATALOG                                |
///  +-----------------------------------------------------------------+

/**
 * The accessory records in one category, normalised with stock. Feeds the
 * product picker, which groups these per-location rows by product identity.
 */
export async function getAccessoriesByCategory(
  categoryId: number
): Promise<AccessorySummary[]> {
  const data = await apiFetch<AccessoriesResponse>(
    `/api/accessories?categoryId=${categoryId}`
  );
  return data.accessories ?? [];
}

///  +-----------------------------------------------------------------+
///  |          NON-STANDARD APPROVAL FLOW (3d-dialog)                 |
///  +-----------------------------------------------------------------+
//
//  The accessory twins of the model-selection API calls. All go through
//  apiFetch (the approval flow's convention) rather than the raw fetch the
//  legacy CreateModelDialog uses.
///  +-----------------------------------------------------------------+

export type AccessorySearchMatch = {
  id: number;
  name: string;
  modelNumber: string | null;
  manufacturer: string | null;
  categoryId: number | null;
  categoryName: string | null;
  qty: number;
  remaining: number;
  locationId: number | null;
  locationName: string | null;
  hasAvailable: boolean;
};

type SearchResponse = {
  success: boolean;
  matches: AccessorySearchMatch[];
};

/**
 * Search existing accessories for a non-standard request. `name` is the
 * primary key (required); `manufacturer` and `locationId` optional filters.
 * Returns per-location records with a hasAvailable flag — the admin picks one
 * specific record, so location duplicates are shown (unless a locationId
 * narrows to a single site).
 */
export async function searchAccessoriesForRequest(
  requestId: number,
  params: { name: string; manufacturer?: string; locationId?: number }
): Promise<AccessorySearchMatch[]> {
  const qs = new URLSearchParams({ name: params.name });
  if (params.manufacturer) qs.set("manufacturer", params.manufacturer);
  if (params.locationId !== undefined) {
    qs.set("locationId", String(params.locationId));
  }
  const data = await apiFetch<SearchResponse>(
    `/api/approval/${requestId}/search-accessories?${qs.toString()}`
  );
  return data.matches ?? [];
}

/**
 * Select an existing accessory for the request. If it has stock, the backend
 * checks out + completes immediately; otherwise the request lands in the
 * quantity-waiting phase (assetReady false).
 */
export async function useExistingAccessory(
  requestId: number,
  snipeAccessoryId: number
): Promise<unknown> {
  return apiFetch(`/api/approval/${requestId}/use-existing-accessory`, {
    method: "POST",
    body: { snipeAccessoryId },
  });
}

/**
 * Create a new accessory (qty 0) for the request and link it. Always lands in
 * the quantity-waiting phase. `locationId` is required — the admin authors the
 * new record's site (the backend create-then-PATCHes it, since Snipe drops
 * location on create). manufacturer/modelNumber are optional buffer fields
 * (kept on the ModelRequest, not pushed to Snipe).
 */
export async function createAccessoryForRequest(
  requestId: number,
  input: {
    name: string;
    locationId: number;
    manufacturer?: string | null;
    modelNumber?: string | null;
  }
): Promise<unknown> {
  return apiFetch(`/api/approval/${requestId}/create-accessory`, {
    method: "POST",
    body: input,
  });
}

/**
 * Add stock to the selected accessory — the quantity-waiting submit.
 * `arrivedQty` is how many MORE units arrived (a delta); the backend adds it
 * to the record's current total. When stock becomes available the backend
 * checks out + completes. Returns the updated request/modelRequest so the
 * caller can read assetReady.
 */
export async function addAccessoryStock(
  requestId: number,
  input: { arrivedQty: number }
): Promise<{ modelRequest?: { assetReady?: boolean }; message?: string }> {
  return apiFetch(`/api/approval/${requestId}/accessory-stock`, {
    method: "POST",
    body: input,
  });
}

/**
 * The accessory categories a specific user may request, derived from the
 * asset categories they hold in Snipe (L3 ∩ L1). Backs the device-driven
 * request form: pick the requester first, then show only what their devices
 * unlock.
 */
export async function getAccessoryCategoriesForUser(
  userId: string | number
): Promise<AccessoryCategory[]> {
  const data = await apiFetch<CategoriesResponse>(
    `/api/accessories/categories/for-user/${userId}`
  );
  return data.categories ?? [];
}

export async function getAccessoryCategoriesForMe(): Promise<AccessoryCategory[]> {
  const data = await apiFetch<CategoriesResponse>(
    "/api/accessories/categories/for-me"
  );
  return data.categories ?? [];
}