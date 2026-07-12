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
