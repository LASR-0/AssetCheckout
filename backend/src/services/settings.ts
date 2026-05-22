import { prisma } from "../db/prisma.js";

const REQUESTABLE_CATEGORIES_KEY = "requestable_categories";
const STANDARD_MODELS_KEY = "standard_models";

///  +-----------------------------------------------------------------+
///  |                            TYPES                                |
///  +-----------------------------------------------------------------+


export type CategoryStandardModels = {
  primary: number | null;
  backup: number | null;
};

export type StandardModelsConfig = Record<string, CategoryStandardModels>;

const EMPTY_CONFIG: StandardModelsConfig = {};
const SKELETON_STATUS_KEY = "skeleton_status_id";

///  +-----------------------------------------------------------------+
///  |                  REQUESTABLE CATEGORIES                         |
///  +-----------------------------------------------------------------+

/**
 * Returns the list of allowed category IDs, or null if no setting exists
 * (null means "all categories allowed" — the default).
 */
export async function getRequestableCategoryIds(): Promise<number[] | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: REQUESTABLE_CATEGORIES_KEY },
  });

  if (!setting) return null;

  try {
    const parsed = JSON.parse(setting.value);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return null;
  }
}

export async function setRequestableCategoryIds(ids: number[]): Promise<void> {
  // Validate input: all numbers, deduplicated
  const cleaned = Array.from(new Set(ids.filter((id) => typeof id === "number")));

  await prisma.setting.upsert({
    where: { key: REQUESTABLE_CATEGORIES_KEY },
    create: {
      key: REQUESTABLE_CATEGORIES_KEY,
      value: JSON.stringify(cleaned),
    },
    update: {
      value: JSON.stringify(cleaned),
    },
  });
}

/** True if the given categoryId is currently allowed for new requests. */
export async function isCategoryRequestable(categoryId: number): Promise<boolean> {
  const allowed = await getRequestableCategoryIds();
  if (allowed === null) return true; // no setting → everything allowed
  return allowed.includes(categoryId);
}

///  +-----------------------------------------------------------------+
///  |                     STANDARD MODELS CONFIG                      |
///  +-----------------------------------------------------------------+

/**
 * Returns the full standard-models config across all categories.
 * Returns an empty object if no config has been saved yet.
 *
 * Used by the admin settings UI to populate the configuration form.
 */
export async function getStandardModels(): Promise<StandardModelsConfig> {
  const setting = await prisma.setting.findUnique({
    where: { key: STANDARD_MODELS_KEY },
  });

  if (!setting) return EMPTY_CONFIG;

  try {
    const parsed = JSON.parse(setting.value);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return EMPTY_CONFIG;
    }
    // Light validation — accept entries shaped { primary, backup }, drop anything else.
    const cleaned: StandardModelsConfig = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "object" || value === null) continue;
      const v = value as Record<string, unknown>;
      const primary = typeof v.primary === "number" ? v.primary : null;
      const backup = typeof v.backup === "number" ? v.backup : null;
      cleaned[key] = { primary, backup };
    }
    return cleaned;
  } catch {
    return EMPTY_CONFIG;
  }
}

/**
 * Returns the configured standard models for a single category.
 * Returns { primary: null, backup: null } if no config exists for this category.
 */
export async function getStandardModelsForCategory(
  categoryId: number
): Promise<CategoryStandardModels> {
  const config = await getStandardModels();
  return config[String(categoryId)] ?? { primary: null, backup: null };
}

/**
 * Persist the configured standards for a single category.
 * Reads the existing config, replaces this category's entry, writes back.
 *
 * Pass `null` for primary or backup to clear that slot.
 */
export async function setStandardModelsForCategory(
  categoryId: number,
  primary: number | null,
  backup: number | null
): Promise<void> {
  const config = await getStandardModels();
  config[String(categoryId)] = { primary, backup };

  await prisma.setting.upsert({
    where: { key: STANDARD_MODELS_KEY },
    create: {
      key: STANDARD_MODELS_KEY,
      value: JSON.stringify(config),
    },
    update: {
      value: JSON.stringify(config),
    },
  });
}

/**
 * Returns the set of model IDs that are configured as standards across ALL categories.
 *
 * Used by the non-standard search to exclude configured-standard models from results.
 * Combines primary + backup IDs from every category into one set.
 */
export async function getAllConfiguredStandardModelIds(): Promise<Set<number>> {
  const config = await getStandardModels();
  const ids = new Set<number>();
  for (const entry of Object.values(config)) {
    if (entry.primary !== null) ids.add(entry.primary);
    if (entry.backup !== null) ids.add(entry.backup);
  }
  return ids;
}

export async function getSkeletonStatusId(): Promise<number | null> {
  const setting = await prisma.setting.findUnique({
    where: { key: SKELETON_STATUS_KEY },
  });
 
  if (!setting) return null;
 
  const parsed = Number(setting.value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
 
  return parsed;
}

export async function setSkeletonStatusId(statusId: number | null): Promise<void> {
  if (statusId === null) {
    await prisma.setting.deleteMany({
      where: { key: SKELETON_STATUS_KEY },
    });
    return;
  }
 
  await prisma.setting.upsert({
    where: { key: SKELETON_STATUS_KEY },
    update: { value: String(statusId) },
    create: { key: SKELETON_STATUS_KEY, value: String(statusId) },
  });
}