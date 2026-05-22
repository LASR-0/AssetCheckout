import { AppError } from '../utils/errors.js';
import { getMean, removeOutliers } from "../utils/statistics.js";
import {
  getRequestableCategoryIds,
  getAllConfiguredStandardModelIds,
} from './settings.js';
import type { CheckoutInput, 
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
  CreateSkeletonAssetInput
 }
  from '../types/snipeTypes.js';

const BASE_URL = process.env.SNIPEIT_API_URL;
const API_TOKEN = process.env.SNIPEIT_BOT_TOKEN;

if (!BASE_URL || !API_TOKEN) {
  throw new Error('Missing Snipe-IT environment variables');
}

const baseUrl: string = BASE_URL;
const apiToken: string = API_TOKEN;

///  +-----------------------------------------------------------------+
///  |                     PRIMARY FUNCTION                            |
///  +-----------------------------------------------------------------+

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

export async function getAveragePricesFromSnipe(tier?: string) {
  const res = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/v1/hardware`,
    {
      method: "GET",
      headers: getHeaders(),
    }
  );

  if (!res.ok) {
    throw new Error("Failed to fetch assets from Snipe-IT");
  }

  const data = await res.json();
  const allAssets = data.rows || [];

  const ALLOWED_CATEGORIES = new Set([3, 9, 4, 5]);

  const pricesByCategory: Record<number, number[]> = {};

  for (const asset of allAssets) {
    const categoryId = Number(asset.category?.id ?? asset.category_id);

    if (Number.isNaN(categoryId)) continue;
    if (!ALLOWED_CATEGORIES.has(categoryId)) continue;

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

export async function getAllAssetCategories(): Promise<{ id: number; name: string }[]> {
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

export async function getRequestableAssetCategories(): Promise<{ id: number; name: string }[]> {
  const all = await getAllAssetCategories();
  const allowedIds = await getRequestableCategoryIds();
  if (allowedIds === null) return all;
  return all.filter((c) => allowedIds.includes(c.id));
}


///  +-----------------------------------------------------------------+
///  |                            HELPERS                              |
///  +-----------------------------------------------------------------+

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

function assetMatchesTier(asset: Asset, _tierMatch: TierMatch): boolean {
  const rawTier = asset.custom_fields?.Tier?.value;
  if (typeof rawTier !== "string") return false;

  const normalized = rawTier.trim();
  return normalized.length > 0;
}

///  +-----------------------------------------------------------------+
///  |                         API FUNCTIONS                           |
///  +-----------------------------------------------------------------+

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
///  |                    MODEL CREATION HELPERS                       |
///  +-----------------------------------------------------------------+

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

export async function searchModelsByManufacturer({
  manufacturer,
  modelName,
  categoryId,
}: SearchModelsInput): Promise<Model[]> {
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

  const availabilityChecks = await Promise.all(
    candidates.map(async (model) => {
      const asset = await getAvailableAssetFromModel(model.id, { mode: "any" });
      return { model, hasAvailable: asset !== null };
    })
  );

  return availabilityChecks
    .filter((entry) => entry.hasAvailable)
    .map((entry) => entry.model);
}

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

export async function deleteSnipeModel(modelId: number): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, "")}/api/v1/models/${modelId}`;

  const res = await fetchWithTimeout(url, {
    method: "DELETE",
    headers: getHeaders(),
  });

  if (!res.ok) {
    console.error(
      `Failed to roll back Snipe model ${modelId}: status ${res.status}. Manual cleanup may be needed.`
    );
  }
}

///  +-----------------------------------------------------------------+
///  |                      ASSET COMPLETENESS                         |
///  +-----------------------------------------------------------------+

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
///  |                      ASSET DETAILS UPDATE                       |
///  +-----------------------------------------------------------------+


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

export type { TierMatch, SnipeAssetDetail, AssetDetailsInput };