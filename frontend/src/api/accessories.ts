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