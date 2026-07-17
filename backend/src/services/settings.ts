import { prisma } from "../db/prisma.js";

///  +-----------------------------------------------------------------+
///  |                            TYPES                                |
///  +-----------------------------------------------------------------+

export type CategoryStandardModels = {
  primary: number | null;
  backup: number | null;
};

export type StandardModelsConfig = Record<string, CategoryStandardModels>;

// Accessories reuse the same per-category { primary, backup } shape —
// the values are Snipe accessory IDs instead of Snipe model IDs.
export type StandardAccessoriesConfig = StandardModelsConfig;

// FIXED: mobile-filter config shape — mirrors MobileNumberConfig on the frontend
export type MobileFilterConfig = {
  countryCode: string;        // digits only, e.g. "61"
  mobileLeadingDigit: string; // single digit, e.g. "4"
};

const EMPTY_CONFIG: StandardModelsConfig = {};

///  +-----------------------------------------------------------------+
///  |                       SETTING KEYS                              |
///  +-----------------------------------------------------------------+

const REQUESTABLE_CATEGORIES_KEY = "requestable_categories";
const STANDARD_MODELS_KEY = "standard_models";
const SKELETON_STATUS_KEY = "skeleton_status_id";
// FIXED: mobile number filter keys
const MOBILE_COUNTRY_CODE_KEY = "mobile_country_code";
const MOBILE_LEADING_DIGIT_KEY = "mobile_leading_digit";
// Accessories chapter
const REQUESTABLE_ACCESSORY_CATEGORIES_KEY = "requestable_accessory_categories";
const STANDARD_ACCESSORIES_KEY = "standard_accessories";

///  +-----------------------------------------------------------------+
///  |                  DEFAULTS REGISTRY + SEEDING                    |
///  +-----------------------------------------------------------------+

/**
 * Every known setting is declared here. ensureDefaults() upserts each one
 * on app startup: if no row exists, it creates one with the value from
 * the matching env var (or the hardcoded default if the env var is unset).
 * If a row already exists, only the `description` is updated — the value
 * is never overwritten. This way admins can change values via the UI and
 * env-var changes only affect fresh installs.
 *
 * Convention: empty-string value means "unset" or "use fallback". The
 * typed wrappers below interpret "" as null for the legacy settings.
 */
type SettingDefault = {
  key: string;
  envVar?: string;        // optional override from process.env
  defaultValue: string;
  description: string;
  // FIXED: optional validation/canonicalisation for env-seeded values.
  // Returns the canonical stored string, or null if the env value is
  // invalid (→ fall back to defaultValue, with a startup warning).
  normalize?: (raw: string) => string | null;
};

// FIXED: env normaliser for requestable categories. Accepts JSON ([1,2,5])
// or comma-separated ("1, 2, 5"); canonicalises to the JSON array string
// that getRequestableCategoryIds expects. Empty string = all allowed.
function normalizeCategoryIdsEnv(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let ids: number[];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    if (!parsed.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
    ids = parsed;
  } catch {
    const parts = trimmed.split(",").map((p) => Number(p.trim()));
    if (parts.length === 0 || parts.some((n) => !Number.isFinite(n))) return null;
    ids = parts;
  }
  return JSON.stringify(Array.from(new Set(ids)));
}

// FIXED: env normaliser for standard models. JSON object only, cleaned
// through the same shape rules as getStandardModels (numeric-string keys,
// { primary, backup } entries, non-numbers → null).
function normalizeStandardModelsEnv(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const cleaned: StandardModelsConfig = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^\d+$/.test(key)) continue;
      if (typeof value !== "object" || value === null) continue;
      const v = value as Record<string, unknown>;
      cleaned[key] = {
        primary: typeof v.primary === "number" ? v.primary : null,
        backup: typeof v.backup === "number" ? v.backup : null,
      };
    }
    return JSON.stringify(cleaned);
  } catch {
    return null;
  }
}

const SETTING_DEFAULTS: SettingDefault[] = [
  // ---- Existing settings ----
  {
    key: REQUESTABLE_CATEGORIES_KEY,
    envVar: "REQUESTABLE_CATEGORY_IDS",
    normalize: normalizeCategoryIdsEnv,
    defaultValue: "",
    description:
      "JSON array of Snipe-IT category IDs that are allowed for new requests. Empty string means all categories allowed.",
  },
  {
    key: STANDARD_MODELS_KEY,
    envVar: "STANDARD_MODELS_JSON",
    normalize: normalizeStandardModelsEnv,
    defaultValue: "",
    description:
      "JSON object mapping categoryId → { primary, backup } model IDs for standard request fulfilment.",
  },
  {
    key: SKELETON_STATUS_KEY,
    envVar: "SKELETON_STATUS_ID",
    defaultValue: "",
    description:
      "Snipe-IT status ID assigned to newly-created skeleton assets. Empty string falls back to looking up the 'Pending' status by name.",
  },

  // ---- Accessories ----
  // Same shapes and normalisers as the asset equivalents; the standard-
  // accessories values are Snipe accessory IDs (accessories have no
  // separate model layer).
  {
    key: REQUESTABLE_ACCESSORY_CATEGORIES_KEY,
    envVar: "REQUESTABLE_ACCESSORY_CATEGORY_IDS",
    normalize: normalizeCategoryIdsEnv,
    defaultValue: "",
    description:
      "JSON array of Snipe-IT accessory category IDs that are allowed for new accessory requests. Empty string means all accessory categories allowed.",
  },
  {
    key: STANDARD_ACCESSORIES_KEY,
    envVar: "STANDARD_ACCESSORIES_JSON",
    normalize: normalizeStandardModelsEnv,
    defaultValue: "",
    description:
      "JSON object mapping accessory categoryId → { primary, backup } Snipe accessory IDs for standard accessory fulfilment.",
  },

  // ---- Mobile number filtering ----
  // FIXED: seeded from env on fresh installs (MOBILE_COUNTRY_CODE /
  // MOBILE_LEADING_DIGIT), admin-editable thereafter. AU defaults.
  {
    key: MOBILE_COUNTRY_CODE_KEY,
    envVar: "MOBILE_COUNTRY_CODE",
    defaultValue: "61",
    description:
      "Country calling code (digits only) used to recognise mobile numbers, e.g. 61 for Australia. Mobiles match +{code}{digit}... or 0{digit}...",
  },
  {
    key: MOBILE_LEADING_DIGIT_KEY,
    envVar: "MOBILE_LEADING_DIGIT",
    defaultValue: "4",
    description:
      "The first digit after the prefix that marks a number as a mobile — 4 for Australia (+61 4xx / 04xx). Single digit.",
  },

  // ---- Background jobs ----
  {
    key: "jobs.pollIntervalMs",
    envVar: "JOBS_POLL_INTERVAL_MS",
    defaultValue: "5000",
    description: "How often the job runner polls for pending work (ms).",
  },
  {
    key: "jobs.historyRetentionDays",
    envVar: "JOBS_HISTORY_RETENTION_DAYS",
    defaultValue: "90",
    description:
      "Completed/failed BackgroundJob rows older than this many days are purged by the daily cleanup job.",
  },
  {
    key: "jobs.refreshCategoriesCron",
    envVar: "JOBS_REFRESH_CATEGORIES_CRON",
    defaultValue: "0 * * * *",
    description: "Cron expression for refreshing the Snipe categories cache (default: hourly).",
  },
  {
    key: "jobs.refreshPricesCron",
    envVar: "JOBS_REFRESH_PRICES_CRON",
    defaultValue: "*/10 * * * *",
    description: "Cron expression for refreshing the Snipe price-averages cache (default: every 10 minutes).",
  },
  {
    key: "jobs.refreshAccessoriesCron",
    envVar: "JOBS_REFRESH_ACCESSORIES_CRON",
    defaultValue: "*/10 * * * *",
    description:
      "Cron expression for refreshing the Snipe accessories and accessory-categories caches (default: every 10 minutes).",
  },
  {
    key: "jobs.cleanupStaleCron",
    envVar: "JOBS_CLEANUP_STALE_CRON",
    defaultValue: "0 0 * * *",
    description: "Cron expression for the stale-request cleanup job (default: daily at midnight).",
  },
  {
    key: "jobs.cleanupOrphanCron",
    envVar: "JOBS_CLEANUP_ORPHAN_CRON",
    defaultValue: "0 2 * * 0",
    description: "Cron expression for the orphan Snipe-model cleanup job (default: weekly Sunday 2am).",
  },
  {
    key: "jobs.purgeHistoryCron",
    envVar: "JOBS_PURGE_HISTORY_CRON",
    defaultValue: "0 3 * * *",
    description: "Cron expression for the BackgroundJob history purge (default: daily at 3am).",
  },
  {
    key: "jobs.staleRequestMonths",
    envVar: "JOBS_STALE_REQUEST_MONTHS",
    defaultValue: "6",
    description:
      "Non-terminal requests with no activity for this many months are auto-rejected by the stale-request cleanup job.",
  },
    {
    key: "jobs.orphanCleanupDryRun",
    envVar: "JOBS_ORPHAN_CLEANUP_DRY_RUN",
    defaultValue: "true",
    description:
      "When 'true' (default), the orphan-model cleanup job only reports what it would delete without deleting. Set to 'false' to enable real deletion — review a dry-run result first.",
  },
  {
    key: "jobs.orphanCleanupMaxDeletes",
    envVar: "JOBS_ORPHAN_CLEANUP_MAX_DELETES",
    defaultValue: "5",
    description:
      "Max orphaned models the cleanup job will delete in a single run, bounding the blast radius if detection misfires.",
  },
  { key: "shipping_estimate_days",
    envVar: "SHIPPING_ESTIMATE_DAYS",
    defaultValue: "5", 
    description: "Estimated delivery days shown in the 'your device has shipped' email" 
  },
  { key: "jobs.shipmentReminderCron",
    envVar: "JOBS_SHIPMENT_REMINDER_CRON",
    defaultValue: "0 10 * * *", 
    description: "Schedule for the shipped-request reminder job" 
  },
 { key: "reminder_days_1",
   envVar: "REMINDER_DAYS_1",
   defaultValue: "7",
   description: "Days after shipping to send the first received-reminder to the user" 
  },
  { key: "reminder_days_2",
   envVar: "REMINDER_DAYS_2",
   defaultValue: "14",
   description: "Days after shipping to send the second received-reminder to the user" 
  },
  { key: "reminder_days_3",
    envVar: "REMINDER_DAYS_3",
    defaultValue: "30",
    description: "Days after shipping to escalate to the user and admins (overdue)" 
  },
  { key: "feedback_enabled", 
    envVar: "FEEDBACK_ENABLED",
    defaultValue: "true", 
    description: "Whether the anonymous feedback feature is active (page, nudge, and CTA)" 
  },
  { key: "sharepoint_sync_enabled",
    envVar: "SHAREPOINT_SYNC_ENABLED",
    defaultValue: "false",
    description: "Whether the nightly SharePoint request-ledger sync is active." 
  },
];

/**
 * Seed any missing setting rows from env vars or hardcoded defaults.
 * Existing rows have their description refreshed but their value left
 * alone — admin-changed values are never overwritten by a deploy.
 *
 * Called once at server startup from server.ts.
 */
export async function ensureDefaults(): Promise<void> {
  await Promise.all(
    SETTING_DEFAULTS.map((s) => {
      // FIXED: env values pass through the setting's normalize hook when one
      // is declared — invalid values fall back to the default with a warning
      // instead of seeding garbage (or silently behaving like "unset").
      let value = s.defaultValue;
      const raw = s.envVar ? process.env[s.envVar] : undefined;
      if (raw !== undefined) {
        if (s.normalize) {
          const normalized = s.normalize(raw);
          if (normalized !== null) {
            value = normalized;
          } else {
            console.warn(
              `[settings] Invalid value for ${s.envVar} — falling back to default for "${s.key}"`
            );
          }
        } else {
          value = raw;
        }
      }

      return prisma.setting.upsert({
        where: { key: s.key },
        create: { key: s.key, value, description: s.description },
        update: { description: s.description },
      });
    })
  );
}

///  +-----------------------------------------------------------------+
///  |                     GENERIC KEY/VALUE LAYER                     |
///  +-----------------------------------------------------------------+

/**
 * Read a single setting by key. Returns null if no row exists.
 *
 * Note: with ensureDefaults() run at startup, every declared key should
 * always have a row. A null return here usually means the key was never
 * declared in SETTING_DEFAULTS.
 */
export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/**
 * Read every setting as a flat key → value map. Used by the admin UI to
 * populate the settings page in one request.
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Write a setting. Records the actor's email in updatedBy.
 *
 * Idempotent: if the new value matches the existing one, the write is
 * skipped to avoid churning updatedAt for no reason.
 */
export async function setSetting(
  key: string,
  value: string,
  actorEmail: string
): Promise<void> {
  const existing = await prisma.setting.findUnique({ where: { key } });
  if (existing?.value === value) return;

  await prisma.setting.upsert({
    where: { key },
    create: { key, value, updatedBy: actorEmail || null },
    update: { value, updatedBy: actorEmail || null },
  });
}

///  +-----------------------------------------------------------------+
///  |                  REQUESTABLE CATEGORIES                         |
///  +-----------------------------------------------------------------+

/**
 * Returns the list of allowed category IDs, or null if no setting exists
 * (null means "all categories allowed" — the default).
 *
 * After ensureDefaults(), the row always exists with value="" for the
 * "all allowed" case; we still return null for backward compatibility
 * with existing callers (isCategoryRequestable, route response shape).
 */
export async function getRequestableCategoryIds(): Promise<number[] | null> {
  const raw = await getSetting(REQUESTABLE_CATEGORIES_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return null;
  }
}

export async function setRequestableCategoryIds(
  ids: number[],
  actorEmail: string
): Promise<void> {
  // Validate input: all numbers, deduplicated
  const cleaned = Array.from(new Set(ids.filter((id) => typeof id === "number")));
  await setSetting(REQUESTABLE_CATEGORIES_KEY, JSON.stringify(cleaned), actorEmail);
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
  const raw = await getSetting(STANDARD_MODELS_KEY);
  if (!raw) return EMPTY_CONFIG;

  try {
    const parsed = JSON.parse(raw);
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
  backup: number | null,
  actorEmail: string
): Promise<void> {
  const config = await getStandardModels();
  config[String(categoryId)] = { primary, backup };
  await setSetting(STANDARD_MODELS_KEY, JSON.stringify(config), actorEmail);
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

///  +-----------------------------------------------------------------+
///  |             REQUESTABLE ACCESSORY CATEGORIES                    |
///  +-----------------------------------------------------------------+
//
//  Accessory mirrors of the asset wrappers above. Kept as separate
//  functions on separate keys (rather than generalising the asset ones)
//  so nothing in the production asset flow is touched.
///  +-----------------------------------------------------------------+

/**
 * Returns the list of allowed accessory category IDs, or null if unset
 * (null means "all accessory categories allowed" — the default).
 */
export async function getRequestableAccessoryCategoryIds(): Promise<number[] | null> {
  const raw = await getSetting(REQUESTABLE_ACCESSORY_CATEGORIES_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return null;
  }
}

export async function setRequestableAccessoryCategoryIds(
  ids: number[],
  actorEmail: string
): Promise<void> {
  // Validate input: all numbers, deduplicated
  const cleaned = Array.from(new Set(ids.filter((id) => typeof id === "number")));
  await setSetting(
    REQUESTABLE_ACCESSORY_CATEGORIES_KEY,
    JSON.stringify(cleaned),
    actorEmail
  );
}

/** True if the given accessory categoryId is currently allowed for new requests. */
export async function isAccessoryCategoryRequestable(
  categoryId: number
): Promise<boolean> {
  const allowed = await getRequestableAccessoryCategoryIds();
  if (allowed === null) return true; // no setting → everything allowed
  return allowed.includes(categoryId);
}

///  +-----------------------------------------------------------------+
///  |                  STANDARD ACCESSORIES CONFIG                    |
///  +-----------------------------------------------------------------+

/**
 * Returns the full standard-accessories config across all accessory
 * categories. Values are Snipe accessory IDs. Returns an empty object if
 * no config has been saved yet.
 */
export async function getStandardAccessories(): Promise<StandardAccessoriesConfig> {
  const raw = await getSetting(STANDARD_ACCESSORIES_KEY);
  if (!raw) return EMPTY_CONFIG;

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return EMPTY_CONFIG;
    }
    // Light validation — accept entries shaped { primary, backup }, drop anything else.
    const cleaned: StandardAccessoriesConfig = {};
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
 * Returns the configured standard accessories for a single category.
 * Returns { primary: null, backup: null } if no config exists for this category.
 */
export async function getStandardAccessoriesForCategory(
  categoryId: number
): Promise<CategoryStandardModels> {
  const config = await getStandardAccessories();
  return config[String(categoryId)] ?? { primary: null, backup: null };
}

/**
 * Persist the configured standard accessories for a single category.
 * Reads the existing config, replaces this category's entry, writes back.
 *
 * Pass `null` for primary or backup to clear that slot.
 */
export async function setStandardAccessoriesForCategory(
  categoryId: number,
  primary: number | null,
  backup: number | null,
  actorEmail: string
): Promise<void> {
  const config = await getStandardAccessories();
  config[String(categoryId)] = { primary, backup };
  await setSetting(STANDARD_ACCESSORIES_KEY, JSON.stringify(config), actorEmail);
}

/**
 * Returns the set of Snipe accessory IDs configured as standards across
 * ALL accessory categories. The accessory non-standard search will use
 * this to exclude configured standards from results, mirroring
 * getAllConfiguredStandardModelIds.
 */
export async function getAllConfiguredStandardAccessoryIds(): Promise<Set<number>> {
  const config = await getStandardAccessories();
  const ids = new Set<number>();
  for (const entry of Object.values(config)) {
    if (entry.primary !== null) ids.add(entry.primary);
    if (entry.backup !== null) ids.add(entry.backup);
  }
  return ids;
}

///  +-----------------------------------------------------------------+
///  |                       SKELETON STATUS                           |
///  +-----------------------------------------------------------------+

export async function getSkeletonStatusId(): Promise<number | null> {
  const raw = await getSetting(SKELETON_STATUS_KEY);
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/**
 * Set or clear the skeleton status. Pass null to clear — writes empty
 * string (not row deletion) so the row stays consistent with other
 * settings after ensureDefaults.
 */
export async function setSkeletonStatusId(
  statusId: number | null,
  actorEmail: string
): Promise<void> {
  const value = statusId === null ? "" : String(statusId);
  await setSetting(SKELETON_STATUS_KEY, value, actorEmail);
}

///  +-----------------------------------------------------------------+
///  |                    MOBILE NUMBER FILTERING                      |
///  +-----------------------------------------------------------------+

// FIXED: hardcoded safety net — reads fall back here if a stored value is
// missing or malformed, so a bad row can never break number resolution.
const MOBILE_FILTER_FALLBACK: MobileFilterConfig = {
  countryCode: "61",
  mobileLeadingDigit: "4",
};

const COUNTRY_CODE_RE = /^\d{1,3}$/;
const LEADING_DIGIT_RE = /^\d$/;

/**
 * The active mobile-filter config. Each field is validated independently
 * and falls back to the AU default if the stored value is empty or invalid.
 */
export async function getMobileFilterConfig(): Promise<MobileFilterConfig> {
  const [cc, digit] = await Promise.all([
    getSetting(MOBILE_COUNTRY_CODE_KEY),
    getSetting(MOBILE_LEADING_DIGIT_KEY),
  ]);

  return {
    countryCode:
      cc && COUNTRY_CODE_RE.test(cc.trim())
        ? cc.trim()
        : MOBILE_FILTER_FALLBACK.countryCode,
    mobileLeadingDigit:
      digit && LEADING_DIGIT_RE.test(digit.trim())
        ? digit.trim()
        : MOBILE_FILTER_FALLBACK.mobileLeadingDigit,
  };
}

/**
 * Persist the mobile-filter config. Values are expected pre-validated by
 * the route (digits only); this trims defensively and writes both keys.
 */
export async function setMobileFilterConfig(
  countryCode: string,
  mobileLeadingDigit: string,
  actorEmail: string
): Promise<void> {
  await Promise.all([
    setSetting(MOBILE_COUNTRY_CODE_KEY, countryCode.trim(), actorEmail),
    setSetting(MOBILE_LEADING_DIGIT_KEY, mobileLeadingDigit.trim(), actorEmail),
  ]);
}