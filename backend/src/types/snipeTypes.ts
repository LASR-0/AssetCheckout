export type Model = {
  id: number;
  name: string;
  remaining: number;
  manufacturer?: { id: number; name: string };
  category?: {
    id: number;
  };
  fieldset?: { id: number; name: string };
};

export type Asset = {
  id: number;
  asset_tag: string;
  status_label?: {
    name: string;
  };
  assigned_to?: unknown;
  custom_fields?: Record<string, { value?: string }>;
};

export type SnipeAssetDetail = {
  id: number;
  asset_tag: string;
  serial?: string | null;
  model?: { id: number; name: string } | null;
  company?: { id: number; name: string } | null;
  location?: { id: number; name: string } | null;
  rtd_location?: { id: number; name: string } | null;
  status_label?: { id: number; name: string } | null;
  custom_fields?: Record<string, { value?: string | null }>;
};

export type User = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
};

export type StatusLabel = {
  id: number;
  name: string;
};

export type TierMatch = { mode: "any" };

export type CheckoutInput = {
  user_id: number;
  category_id: number;
  tierMatch: TierMatch;
};

export type CustomField = {
  id: number;
  name: string;
  db_column_name?: string;
  field_values: string | null;
  field_values_array?: string[];
};

export type SearchModelsInput = {
  manufacturer: string;
  modelName: string;
  categoryId: number;
};

export type CreateSnipeModelInput = {
  manufacturer: string;
  modelName: string;
  modelNumber: string;
  categoryId: number;
  fieldsetId: number;
};

export type CreateSkeletonAssetInput = {
  modelId: number;
  statusId: number;
};

export type SnipeNamedRecord = {
  id: number;
  name: string;
};

export type AssetDetailsInput = {
  companyId?: number | null;
  serial?: string;
  statusId?: number | null;
  locationId?: number | null;
  tier?: string;
  price?: number;
  assetTag?: string;
};

export type SnipeUserDetail = {
  id: number;
  name: string;
  email: string | null;
  location: { id: number; name: string } | null;
};

export type ModelSearchResult = Model & { hasAvailable: boolean };
export type CreateSnipeUserInput = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string;
  notes?: string;
};

export type SnipeUserAsset = {
  id: number;
  asset_tag: string;
  name: string;
  serial: string | null;
  model: string | null;
  category: string | null;
};

export type CheckinFailure = { assetId: number; assetTag: string; error: string };

export type OffboardResult = {
  userId: number;
  checkedIn: SnipeUserAsset[];
  failed: CheckinFailure[];
  userDeactivated: boolean;
};

///  +-----------------------------------------------------------------+
///  |                        ACCESSORIES                              |
///  +-----------------------------------------------------------------+

/**
 * Raw Snipe-IT /accessories row (the fields we consume — Snipe returns
 * more). Note there is no model layer: the accessory record itself
 * carries name, manufacturer, model_number, and stock quantities.
 * `remaining_qty` is canonical in current Snipe payloads; `remaining` is
 * an older alias that some versions also/only send.
 */
export type SnipeAccessory = {
  id: number;
  name: string;
  model_number?: string | null;
  manufacturer?: { id: number; name: string } | null;
  category?: { id: number; name: string } | null;
  location?: { id: number; name: string } | null;
  qty?: number;
  remaining_qty?: number;
  remaining?: number;
  purchase_cost?: string | null;
};

export type AccessoryCategory = {
  id: number;
  name: string;
};

/**
 * Normalised accessory shape served to the frontend (request form options
 * list, admin standard-accessories picker). `remaining` is the current
 * checkout-able stock.
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

///  +-----------------------------------------------------------------+
///  |               ACCESSORY FULFILMENT (phase 3b)                   |
///  +-----------------------------------------------------------------+

/**
 * The outcome of resolving a standard accessory request to a concrete
 * Snipe accessory record to check out. Returned by
 * resolveAccessoryForRequest; consumed by the admin-approval accessory
 * branch in services/request.ts.
 *
 * `accessory` is the specific location record chosen (siblings sharing a
 * product identity are per-location rows — this is the one we'll check
 * out). `needsShipping`/`locationMissing` mirror the asset flow's
 * ship-vs-collect semantics: the chosen record is at the user's site
 * (collect) or elsewhere (ship); locationMissing flags an unknown on
 * either side for manual review.
 */
export type AccessoryResolution = {
  accessory: AccessorySummary;
  needsShipping: boolean;
  locationMissing: boolean;
};

/**
 * A non-standard accessory search hit — an AccessorySummary plus a
 * `hasAvailable` flag (remaining > 0), the accessory twin of
 * ModelSearchResult. Unlike the requester-facing option list (which must
 * hide per-location duplicates), non-standard search returns each location
 * record individually: the admin is deliberately picking ONE specific
 * record and needs to see its location, so siblings are shown, not grouped.
 */
export type AccessorySearchResult = AccessorySummary & { hasAvailable: boolean };