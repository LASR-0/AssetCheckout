import { prisma } from "../db/prisma.js";

///  +-----------------------------------------------------------------+
///  |                            TYPES                                |
///  +-----------------------------------------------------------------+

export type CategoryStandardModels = {
  primary: number | null;
  backup: number | null;
};

export type StandardModelsConfig = Record<string, CategoryStandardModels>;

const EMPTY_CONFIG: StandardModelsConfig = {};

///  +-----------------------------------------------------------------+
///  |                       SETTING KEYS                              |
///  +-----------------------------------------------------------------+

const REQUESTABLE_CATEGORIES_KEY = "requestable_categories";
const STANDARD_MODELS_KEY = "standard_models";
const SKELETON_STATUS_KEY = "skeleton_status_id";

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
};

const SETTING_DEFAULTS: SettingDefault[] = [
  // ---- Existing settings ----
  {
    key: REQUESTABLE_CATEGORIES_KEY,
    defaultValue: "",
    description:
      "JSON array of Snipe-IT category IDs that are allowed for new requests. Empty string means all categories allowed.",
  },
  {
    key: STANDARD_MODELS_KEY,
    defaultValue: "",
    description:
      "JSON object mapping categoryId → { primary, backup } model IDs for standard request fulfilment.",
  },
  {
    key: SKELETON_STATUS_KEY,
    defaultValue: "",
    description:
      "Snipe-IT status ID assigned to newly-created skeleton assets. Empty string falls back to looking up the 'Pending' status by name.",
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
      const value = s.envVar ? process.env[s.envVar] ?? s.defaultValue : s.defaultValue;
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