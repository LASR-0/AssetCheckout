export type AccessoryCategory = {
  id: number;
  name: string;
};

///  +-----------------------------------------------------------------+
///  |                 STANDARD ACCESSORIES CONFIG                     |
///  +-----------------------------------------------------------------+
//
//  Frontend mirror of the backend settings shapes. Unlike assets (one
//  primary+backup per category), each accessory category carries a LIST of
//  named options, and each option has its own primary+backup — a
//  representative Snipe accessory id whose location-siblings fulfilment
//  expands at approval time.
///  +-----------------------------------------------------------------+

export type AccessoryOptionConfig = {
  label: string;
  primary: number | null;
  backup: number | null;
};

export type CategoryAccessoryOptions = {
  options: AccessoryOptionConfig[];
};

export type StandardAccessoriesConfig = Record<string, CategoryAccessoryOptions>;

/**
 * The bundled admin settings payload — GET /api/accessories/settings returns
 * both the requestable whitelist (null = all allowed) and the per-category
 * option config in one call.
 */
export type AccessorySettings = {
  requestableCategoryIds: number[] | null;
  standardAccessories: StandardAccessoriesConfig;
};

///  +-----------------------------------------------------------------+
///  |                     ACCESSORY SUMMARY                           |
///  +-----------------------------------------------------------------+

/**
 * Normalised accessory record (matches the backend AccessorySummary). Used
 * to build the product picker. Accessories are per-location rows, so the
 * picker groups these by product identity and sums stock — see
 * AccessoryProductOption below.
 */
export type AccessorySummary = {
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
};

/**
 * One entry in the deduplicated product picker: a product identity
 * (manufacturer + normalised name) with stock summed across its location
 * records, and a representative id to store in the option config. `memberIds`
 * lets a saved id (which may be any location-sibling) resolve back to its
 * group so the picker can show the friendly label on reload.
 */
export type AccessoryProductOption = {
  key: string;
  representativeId: number;
  memberIds: number[];
  label: string;
  manufacturer: string | null;
  aggregateRemaining: number;
  aggregateQty: number;
};

export type AssetAccessoryCategoryMap = Record<string, number[]>;