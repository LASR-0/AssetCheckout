import { randomUUID } from "node:crypto";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";

///  +-----------------------------------------------------------------+
///  |                            TYPES                                |
///  +-----------------------------------------------------------------+

export type CategoryStandardModels = {
  primary: number | null;
  backup: number | null;
};

export type StandardModelsConfig = Record<string, CategoryStandardModels>;

// Accessories: each category carries a list of NAMED options ("USB-C to
// Lightning", "Case", ...), and each option has its own standard — a
// representative Snipe accessory ID (fulfilment expands location-siblings
// by product identity at approval time). Categories with one option render
// no choice on the form; the option labels are what requesters see.
export type AccessoryOptionConfig = {
  /**
   * Stable identity, minted once and never rewritten — not derived from the
   * label, so renaming an option keeps every request filed under it bound.
   *
   * Optional in the TYPE because two callers legitimately have no id yet: a
   * brand-new row from the admin UI, and a config written before this existed.
   * Both get one on the next write. Everything that READS the config after
   * backfillAccessoryOptionIds() has run can rely on it being present.
   */
  id?: string;
  label: string;
  displayLabel?: string | null;
  accessoryLabel?: string | null;
  primary: number | null; // representative Snipe accessory ID
  backup: number | null;
};

// assetCategoryId (numeric-string key) → accessory category IDs.
export type AssetAccessoryCategoryMap = Record<string, number[]>;

export type CategoryAccessoryOptions = {
  options: AccessoryOptionConfig[];
};

export type StandardAccessoriesConfig = Record<string, CategoryAccessoryOptions>;

// Stock keepers: the people who physically hold and hand out hardware at a
// site. Keyed by Snipe LOCATION id (numeric-string, same convention as the
// category-keyed configs above), each carrying a small snapshot of the person
// rather than a bare id — the settings UI, the notification recipients, and
// the "collect from" line on a request all need a name and an email, and none
// of them should have to reach Snipe to render one.
//
// The snapshot is deliberately NOT the source of truth for the person: userId
// is. A renamed or re-emailed user is re-snapshotted on the next write, and
// anything that must be current (notification delivery) resolves through Snipe
// by id anyway.
export type StockKeeperEntry = {
  /** Snipe user id — the identity. Everything else here is a display snapshot. */
  userId: number;
  name: string;
  email: string | null;
};

/**
 * One location's assignment. The wrapper-object-around-a-list shape mirrors
 * CategoryAccessoryOptions above rather than storing a bare array, because the
 * location needs a display snapshot of its own.
 *
 * WHY THE NAME IS STORED: /api/auth/role reports which sites the signed-in
 * user keeps, and it is called on every page load. getLocations() is an
 * uncached Snipe request, so resolving names there would put a Snipe round
 * trip on the hot path and make role resolution fail whenever Snipe blips.
 * The name is captured when the assignment is made — where the admin UI
 * already has it — and refreshed on every subsequent write.
 */
export type LocationStockKeepers = {
  /** Snipe location name when the assignment was last written. */
  locationName: string | null;
  keepers: StockKeeperEntry[];
};

// locationId (numeric-string key) → the people keeping stock there.
export type StockKeepersConfig = Record<string, LocationStockKeepers>;

/**
 * Cap per location. Three, so a site has cover when the usual keeper is away
 * without the role quietly becoming "most of the office". Enforced in
 * setStockKeepersForLocation rather than only in the UI, so it holds for the
 * env-seeded config and any future caller too.
 */
export const MAX_STOCK_KEEPERS_PER_LOCATION = 3;

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
const ACCESSORY_ASSET_CATEGORY_MAP_KEY = "accessory_asset_category_map";
// Stock keepers chapter
const STOCK_KEEPERS_KEY = "stock_keepers";
const STOCK_KEEPER_FLOW_CUTOVER_KEY = "stock_keeper_flow_enabled_at";

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

/**
 * Shared cleaner for one category's accessory-options entry. Drops
 * malformed entries, trims labels, discards empty labels, and dedupes
 * labels case-insensitively (first occurrence wins). Returns null when
 * the value isn't shaped { options: [...] } at all.
 *
 * IDS ARE PRESERVED, NEVER REGENERATED HERE. This runs on every READ of the
 * config, so minting inside it would hand out a different id each time it was
 * called and bind nothing to anything. Only `mintIds` — passed by the write
 * path and the backfill — creates them, and only for options that arrive
 * without one. An existing id is carried through untouched no matter what
 * happens to the label beside it; that is the entire point.
 */
function cleanAccessoryOptions(
  value: unknown,
  { mintIds = false }: { mintIds?: boolean } = {}
): CategoryAccessoryOptions | null {
  if (typeof value !== "object" || value === null) return null;
  const rawOptions = (value as Record<string, unknown>).options;
  if (!Array.isArray(rawOptions)) return null;

  const options: AccessoryOptionConfig[] = [];
  const seen = new Set<string>();
  const seenIds = new Set<string>();

  for (const entry of rawOptions) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;

    const label = typeof e.label === "string" ? e.label.trim() : "";
    if (!label) continue;

    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // A duplicate id would make two options indistinguishable to fulfilment,
    // so a repeat is treated as absent and re-minted rather than trusted.
    const rawId = typeof e.id === "string" ? e.id.trim() : "";
    let id = rawId && !seenIds.has(rawId) ? rawId : undefined;
    if (!id && mintIds) id = randomUUID();
    if (id) seenIds.add(id);

    options.push({
      ...(id ? { id } : {}),
      label,
      displayLabel:
        typeof e.displayLabel === "string" && e.displayLabel.trim()
          ? e.displayLabel.trim()
          : null,
      accessoryLabel:
        typeof e.accessoryLabel === "string" && e.accessoryLabel.trim()
          ? e.accessoryLabel.trim()
          : null,
      primary: typeof e.primary === "number" ? e.primary : null,
      backup: typeof e.backup === "number" ? e.backup : null,
    });
  }

  return { options };
}

// Env normaliser for standard accessories. JSON object of
// categoryId → { options: [{ label, primary, backup }] }, cleaned through
// the same rules as getStandardAccessories.
function normalizeStandardAccessoriesEnv(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const cleaned: StandardAccessoriesConfig = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!/^\d+$/.test(key)) continue;
      const entry = cleanAccessoryOptions(value);
      if (entry === null) continue;
      cleaned[key] = entry;
    }
    return JSON.stringify(cleaned);
  } catch {
    return null;
  }
}

/**
 * The starting wording for a support message.
 *
 * WRITTEN AS THE USER, not as the app, because the user is the one sending
 * it — it lands in a public channel under their name, and a message that
 * reads like a form submission invites a form-shaped reply.
 *
 * It leads with what they have already tried. Somebody reaching this point
 * has exhausted the article, so the single most useful thing for whoever picks
 * it up is knowing which ground is already covered — that is the round-trip
 * this whole feature exists to save.
 *
 * `{stepsTried}` and `{notes}` expand to nothing when empty, and the composer
 * collapses the blank lines, so a message with neither still reads properly.
 *
 * EXPORTED because it is also the fallback, not only the seed. A setting that
 * is missing — never seeded, deleted, a fresh database somebody forgot to run
 * defaults on — must degrade to the shipped wording. Falling back to "" hands
 * somebody a blank message to post under their own name, which is worse than
 * any wording could be.
 */
//  NO NAME AND NO ARTICLE LINK, deliberately — both were noise.
//
//  The name appeared twice, in the subject line and again in the sign-off,
//  and Teams was already showing it a third time: the post carries the
//  sender's identity, because they post it themselves from their own client.
//  Three copies of an answer nobody asked for.
//
//  The article link went the same way. It addresses the page the sender has
//  just finished failing to use, so it tells whoever picks the message up the
//  one thing they can be sure did not work. The symptom is named in the first
//  line, which is the part they actually triage on.
//
//  {article} went with them, though not because it was asked for: it resolves
//  to the same symptom label {symptom} does, so the first two lines read
//  "I need a hand with X on my phone. I followed X and it hasn't fixed it."
//  Naming the symptom once and then saying the steps didn't work says the
//  same thing without the reader parsing the same title twice.
//
//  {name}, {article} and {url} all still resolve — see MESSAGE_PLACEHOLDERS.
//  They are gone from the default wording, not from the template language, so
//  an org that wants them back only has to edit this setting.
export const DEFAULT_MESSAGE_TEMPLATE = `Hi team — I need a hand with {symptom} on my {subject}.

I've been through the troubleshooting steps and it still isn't fixed.

{stepsTried}

{notes}

— {email}`;

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
      "JSON array of Snipe-IT accessory category IDs that are allowed for new accessory requests. Empty (either an empty string or an empty array) means no site-wide restriction — every accessory category is allowed. Note this only filters; which categories a given user actually sees is driven by the asset-to-accessory map (ACCESSORY_ASSET_CATEGORY_MAP_JSON).",
  },
  {
    key: STANDARD_ACCESSORIES_KEY,
    envVar: "STANDARD_ACCESSORIES_JSON",
    normalize: normalizeStandardAccessoriesEnv,
    defaultValue: "",
    description:
      "JSON object mapping accessory categoryId → { options: [{ label, primary, backup }] }. Each named option is a requester-facing choice whose primary/backup are representative Snipe accessory IDs.",
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
  { key: "tours_enabled",
    envVar: "TOURS_ENABLED",
    defaultValue: "true",
    description:
      "Whether the first-visit product tours run. Turning this off stops tours starting; it does not erase who has already had one, so switching it back on does not replay them."
  },
  { key: "troubleshooting_analytics_enabled",
    envVar: "TROUBLESHOOTING_ANALYTICS_ENABLED",
    defaultValue: "true",
    description:
      "Whether troubleshooting usage events are recorded (articles opened, steps reached, escapes taken, searches with no match). Events are anonymous and grouped only by a per-visit session id."
  },
  { key: "troubleshooting.messageTemplate",
    envVar: "TROUBLESHOOTING_MESSAGE_TEMPLATE",
    defaultValue: DEFAULT_MESSAGE_TEMPLATE,
    description:
      "The message somebody sends to the IT support channel when the article did not fix it. A setting rather than code because the wording is the organisation's, not the app's — the tone IT wants, the details they need first. Placeholders: {name}, {email}, {subject}, {symptom}, {article}, {url}, {stepsTried}, {notes}."
  },
  { key: "troubleshooting.retentionDays",
    envVar: "TROUBLESHOOTING_RETENTION_DAYS",
    defaultValue: "365",
    description:
      "TroubleshootingEvent rows older than this many days are purged by the daily cleanup job. A year, rather than the 90 days job history keeps, because the question these answer is 'which articles earned their place' and that needs seasons, not weeks."
  },
  { key: "sharepoint_sync_enabled",
    envVar: "SHAREPOINT_SYNC_ENABLED",
    defaultValue: "false",
    description: "Whether the nightly SharePoint request-ledger sync is active." 
  },
  { key: "jobs.sharepointSyncCron",
    envVar: "JOBS_SHAREPOINT_SYNC_CRON",
    defaultValue: "0 1 * * *",
    description: "Cron expression for the nightly SharePoint request-ledger sync (default: daily at 1am). Also gated by sharepoint_sync_enabled + SHAREPOINT_SYNC_TO — this only controls when the scan fires.",
  },
  { key: "capex_log_enabled",
    envVar: "CAPEX_LOG_ENABLED",
    defaultValue: "false",
    description:
      "Whether accepted quotes over the purchase threshold are lodged in the CAPEX ledger. Off by default: the payload goes to the SharePoint service mailbox under its own CAPEX marker, so leave this off until the Power Automate flow that reads that marker exists.",
  },
  { key: "purchase_log_threshold",
    envVar: "PURCHASE_LOG_THRESHOLD",
    defaultValue: "1000",
    description:
      "Dollar figure a purchase must EXCEED to be lodged in the CAPEX ledger. Compared strictly greater-than against the accepted quote amount, so a purchase exactly at the threshold is not logged.",
  },
  { key: ACCESSORY_ASSET_CATEGORY_MAP_KEY,
    envVar: "ACCESSORY_ASSET_CATEGORY_MAP_JSON",
    normalize: normalizeAssetAccessoryMapEnv,
    defaultValue: "",
    description: "JSON object mapping Snipe-IT ASSET category IDs → array of accessory category IDs that holders of that asset category may request (L3). Empty string means no asset-derived mapping is configured.",
  },

  {
    key: "jobs.locationBackfillMaxRows",
    defaultValue: "500",
    description:
      "Maximum requests BACKFILL_REQUEST_LOCATIONS will fill in one run, newest first. Caps how many Snipe user lookups a single run can make; run the job again to continue through a large backlog.",
  },

  // ---- Stock keepers ----
  {
    key: STOCK_KEEPER_FLOW_CUTOVER_KEY,
    defaultValue: "",
    description:
      "ISO timestamp of the first boot after stock keepers shipped. Requests dispatched BEFORE this keep the old ending, where the requester confirms receipt directly; those dispatched after route through a stock keeper first. Stamped automatically at startup — do not set it by hand unless you are deliberately moving the cutover.",
  },
  {
    key: STOCK_KEEPERS_KEY,
    envVar: "STOCK_KEEPERS_JSON",
    normalize: normalizeStockKeepersEnv,
    defaultValue: "",
    description:
      "JSON object mapping Snipe-IT LOCATION IDs → up to 3 stock keepers, each { userId, name, email }. Stock keepers mark requests ready to collect at their site. Empty string means no site has an assigned keeper, which leaves admins covering every location.",
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
 *
 * An EMPTY list resolves to null as well, i.e. no restriction. Previously it
 * didn't: clearing every checkbox stored "[]", which is truthy, so the
 * whitelist became an empty allow-set and
 * getRequestableAccessoryCategoryIdsForAssetCategories filtered the entire L3
 * union away — no user could request any accessory. That state was
 * indistinguishable in the UI from never having configured the setting, which
 * allows everything, so the same empty screen meant two opposite things.
 *
 * NOTE: the asset-category equivalent (getRequestableCategoryIds) still has
 * this behaviour. Deliberately left alone — it gates the main asset request
 * path, so changing it is a separate, more consequential decision.
 */
export async function getRequestableAccessoryCategoryIds(): Promise<number[] | null> {
  const raw = await getSetting(REQUESTABLE_ACCESSORY_CATEGORIES_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((id): id is number => typeof id === "number");
    return ids.length > 0 ? ids : null;
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
  // Persist "" rather than "[]" for an empty selection so the stored value
  // matches SETTING_DEFAULTS and reads unambiguously as "no restriction". The
  // getter already treats the two identically; this keeps the row honest for
  // anyone reading the DB or seeding from .env.
  await setSetting(
    REQUESTABLE_ACCESSORY_CATEGORIES_KEY,
    cleaned.length > 0 ? JSON.stringify(cleaned) : "",
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
 * categories: categoryId → { options: [{ label, primary, backup }] }.
 * Returns an empty object if no config has been saved yet. Entries are
 * cleaned on the way out, so callers always see well-shaped options.
 */
export async function getStandardAccessories(): Promise<StandardAccessoriesConfig> {
  const raw = await getSetting(STANDARD_ACCESSORIES_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const cleaned: StandardAccessoriesConfig = {};
    for (const [key, value] of Object.entries(parsed)) {
      const entry = cleanAccessoryOptions(value);
      if (entry === null) continue;
      cleaned[key] = entry;
    }
    return cleaned;
  } catch {
    return {};
  }
}

/**
 * Returns the configured options for a single accessory category.
 * Returns { options: [] } if no config exists for this category.
 */
export async function getStandardAccessoriesForCategory(
  categoryId: number
): Promise<CategoryAccessoryOptions> {
  const config = await getStandardAccessories();
  return config[String(categoryId)] ?? { options: [] };
}

/**
 * Persist the full option list for a single accessory category (replace
 * semantics — the admin UI edits a category's options as a unit). Options
 * are cleaned (trimmed labels, empties dropped, case-insensitive dedupe)
 * before writing.
 */
export async function setStandardAccessoriesForCategory(
  categoryId: number,
  options: AccessoryOptionConfig[],
  actorEmail: string
): Promise<void> {
  const config = await getStandardAccessories();
  // mintIds: this is a write, so anything arriving without an identity gets one
  // now. The admin UI round-trips the ids it was given, so only genuinely new
  // rows mint — a rename carries its id through and stays bound to its
  // in-flight requests.
  config[String(categoryId)] =
    cleanAccessoryOptions({ options }, { mintIds: true }) ?? { options: [] };
  await setSetting(STANDARD_ACCESSORIES_KEY, JSON.stringify(config), actorEmail);
}

/**
 * Requester-facing options for a category: stable id + the label to show. The
 * accessory IDs behind them are never exposed, so which product is the
 * configured standard stays unrevealed (consistent with the asset flow never
 * showing standard models to requesters). Backs GET /api/accessories/options/:id.
 *
 * The id is what the submitted request stores. The label travels with it only
 * so the request can record what the requester actually read on the form.
 */
export async function getAccessoryOptions(
  categoryId: number
): Promise<{ id: string; label: string }[]> {
  const entry = await getStandardAccessoriesForCategory(categoryId);
  return entry.options
    .filter((o): o is AccessoryOptionConfig & { id: string } => !!o.id)
    .map((o) => ({ id: o.id, label: o.label }));
}

/**
 * Labels alone, for the places that only need to render or validate names.
 */
export async function getAccessoryOptionLabels(categoryId: number): Promise<string[]> {
  const entry = await getStandardAccessoriesForCategory(categoryId);
  return entry.options.map((o) => o.label);
}

/**
 * The configured option a request is filed under.
 *
 * BY ID FIRST, ALWAYS. That is the binding that survives a rename, which is
 * the whole reason the id exists.
 *
 * The label is a FALLBACK FOR LEGACY ROWS ONLY — requests filed before the id
 * column existed, and any the backfill could not bind because their option had
 * already been renamed out from under them. Matching on a name is exactly the
 * fragility being removed here, so it is never consulted for a row that has an
 * id: a request whose option was deleted must resolve to nothing rather than
 * silently landing on a different option that happens to share a name.
 */
export async function findAccessoryOption(
  categoryId: number,
  optionId: string | null,
  legacyLabel: string | null
): Promise<AccessoryOptionConfig | null> {
  const entry = await getStandardAccessoriesForCategory(categoryId);

  if (optionId) {
    return entry.options.find((o) => o.id === optionId) ?? null;
  }
  if (legacyLabel) {
    return entry.options.find((o) => o.label === legacyLabel) ?? null;
  }
  return null;
}

/**
 * Give every configured option an id, and bind every standard accessory
 * request that does not have one yet.
 *
 * Runs at startup, after ensureDefaults. Idempotent and cheap: it writes the
 * setting only when an option actually gained an id, and touches only requests
 * whose accessoryOptionId is null.
 *
 * BINDING IS BY LABEL, once, here — the one place where that is the right
 * thing to do, because a request filed before the id existed has nothing else
 * to go on. A row whose label no longer matches any configured option is left
 * unbound rather than guessed at; fulfilment still falls back to the label for
 * it, so it behaves exactly as it did before, and it binds itself on the next
 * successful match if an admin restores the name.
 */
export async function backfillAccessoryOptionIds(): Promise<{
  optionsStamped: number;
  requestsBound: number;
}> {
  const raw = await getSetting(STANDARD_ACCESSORIES_KEY);
  const before = raw ?? "";

  const config = await getStandardAccessories();
  const stamped: StandardAccessoriesConfig = {};
  let optionsStamped = 0;

  for (const [categoryKey, entry] of Object.entries(config)) {
    optionsStamped += entry.options.filter((o) => !o.id).length;
    stamped[categoryKey] = cleanAccessoryOptions(entry, { mintIds: true }) ?? {
      options: [],
    };
  }

  const next = JSON.stringify(stamped);
  if (next !== before) {
    await setSetting(STANDARD_ACCESSORIES_KEY, next, "system:backfill");
  }

  // Only STANDARD accessory requests carry an option at all.
  const unbound = await prisma.request.findMany({
    where: {
      requestKind: "ACCESSORY",
      accessoryOptionId: null,
      accessoryOption: { not: null },
    },
    select: { id: true, categoryId: true, accessoryOption: true },
  });

  let requestsBound = 0;
  for (const row of unbound) {
    const option = stamped[String(row.categoryId)]?.options.find(
      (o) => o.label === row.accessoryOption
    );
    if (!option?.id) continue;
    await prisma.request.update({
      where: { id: row.id },
      data: { accessoryOptionId: option.id },
    });
    requestsBound++;
  }

  return { optionsStamped, requestsBound };
}

/**
 * Returns the set of Snipe accessory IDs configured as standards across
 * ALL accessory categories and options. The accessory non-standard search
 * will use this to exclude configured standards from results, mirroring
 * getAllConfiguredStandardModelIds.
 */
export async function getAllConfiguredStandardAccessoryIds(): Promise<Set<number>> {
  const config = await getStandardAccessories();
  const ids = new Set<number>();
  for (const entry of Object.values(config)) {
    for (const option of entry.options) {
      if (option.primary !== null) ids.add(option.primary);
      if (option.backup !== null) ids.add(option.backup);
    }
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

/**
 * Shared cleaner for the L3 asset→accessory-category map. Keeps only
 * numeric-string asset-category keys whose value is an array; within each,
 * keeps finite numbers, dedupes, and DROPS entries that end up empty (an
 * empty tag list means "this asset category unlocks nothing" = absent).
 */
function cleanAssetAccessoryMap(value: unknown): AssetAccessoryCategoryMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const cleaned: AssetAccessoryCategoryMap = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(key)) continue;
    if (!Array.isArray(raw)) continue;
    const ids = Array.from(
      new Set(raw.filter((n): n is number => typeof n === "number" && Number.isFinite(n)))
    );
    if (ids.length === 0) continue;
    cleaned[key] = ids;
  }
  return cleaned;
}

// Env normaliser for the L3 map. JSON object only, cleaned through the same
// rules as getAssetAccessoryCategoryMap. Empty string = unset.
function normalizeAssetAccessoryMapEnv(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return JSON.stringify(cleanAssetAccessoryMap(parsed));
  } catch {
    return null;
  }
}

///  +-----------------------------------------------------------------+
///  |          ACCESSORY ↔ ASSET-CATEGORY MAP (L3)                    |
///  +-----------------------------------------------------------------+

/**
 * Full L3 map: assetCategoryId → [accessoryCategoryId]. Empty object if
 * nothing configured. Cleaned on the way out, so callers always see
 * well-shaped arrays.
 */
export async function getAssetAccessoryCategoryMap(): Promise<AssetAccessoryCategoryMap> {
  const raw = await getSetting(ACCESSORY_ASSET_CATEGORY_MAP_KEY);
  if (!raw) return {};
  try {
    return cleanAssetAccessoryMap(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** The accessory category IDs a single asset category unlocks. [] if none. */
export async function getAccessoryCategoriesForAssetCategory(
  assetCategoryId: number
): Promise<number[]> {
  const map = await getAssetAccessoryCategoryMap();
  return map[String(assetCategoryId)] ?? [];
}

/**
 * Replace the accessory-category list for ONE asset category (the admin
 * table edits a row as a unit). An empty array clears the row entirely.
 */
export async function setAccessoryCategoriesForAssetCategory(
  assetCategoryId: number,
  accessoryCategoryIds: number[],
  actorEmail: string
): Promise<void> {
  const map = await getAssetAccessoryCategoryMap();
  const ids = Array.from(
    new Set(accessoryCategoryIds.filter((n) => typeof n === "number" && Number.isFinite(n)))
  );
  if (ids.length === 0) {
    delete map[String(assetCategoryId)];
  } else {
    map[String(assetCategoryId)] = ids;
  }
  await setSetting(ACCESSORY_ASSET_CATEGORY_MAP_KEY, JSON.stringify(map), actorEmail);
}

export async function getRequestableAccessoryCategoryIdsForAssetCategories(
  assetCategoryIds: number[]
): Promise<number[]> {
  const [map, l1] = await Promise.all([
    getAssetAccessoryCategoryMap(),
    getRequestableAccessoryCategoryIds(),
  ]);

  const union = new Set<number>();
  for (const assetCatId of assetCategoryIds) {
    const accIds = map[String(assetCatId)];
    if (!accIds) continue;
    for (const id of accIds) union.add(id);
  }

  if (l1 === null) return Array.from(union); // no whitelist → all allowed
  const allowed = new Set(l1);
  return Array.from(union).filter((id) => allowed.has(id));
}
///  +-----------------------------------------------------------------+
///  |                        STOCK KEEPERS                            |
///  +-----------------------------------------------------------------+
//
//  WHO HANDS OUT HARDWARE AT EACH SITE. Assigned here rather than inferred
//  from a user's Snipe location, deliberately: this is authorisation data —
//  it decides who may mark a request ready to collect — and a Snipe location
//  is an ordinary profile field that drifts when someone moves desks. An
//  explicit assignment also lets a site be covered by someone who is not
//  themselves posted there.
//
//  SHAPED LIKE THE CATEGORY CONFIGS ABOVE (numeric-string keys, cleaned on
//  read, replace-semantics per key on write) so there is one JSON-config
//  idiom in this file rather than two.
//
//  ADMINS ARE NOT LISTED HERE. They can act as stock keeper anywhere, which
//  is what stops a site with no assigned keeper from stranding its requests;
//  that rule lives with the permission check, not with this data, so an
//  empty config degrades to "IT does it" rather than to a deadlock.
///  +-----------------------------------------------------------------+

/**
 * Shape-check one location's keepers. Entries without a usable Snipe user id
 * or a name are dropped rather than repaired: a keeper the app can neither
 * identify nor display is not a keeper.
 *
 * Deduplicates by userId — the same person listed twice would otherwise eat
 * two of the three slots and be emailed twice per reminder.
 *
 * Does NOT enforce the cap. Truncating on READ would silently disenfranchise
 * whoever sorted last in a config that was over the limit, and the read path
 * is not where an admin would find out. setStockKeepersForLocation rejects
 * instead, so the error lands on the write that caused it.
 */
function cleanStockKeepers(value: unknown): StockKeeperEntry[] {
  if (!Array.isArray(value)) return [];

  const keepers: StockKeeperEntry[] = [];
  const seen = new Set<number>();

  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;

    const userId = typeof e.userId === "number" ? e.userId : Number(e.userId);
    if (!Number.isFinite(userId) || userId <= 0) continue;
    if (seen.has(userId)) continue;

    const name = typeof e.name === "string" ? e.name.trim() : "";
    if (!name) continue;

    seen.add(userId);
    keepers.push({
      userId,
      name,
      email:
        typeof e.email === "string" && e.email.trim()
          ? e.email.trim().toLowerCase()
          : null,
    });
  }

  return keepers;
}

/**
 * Shape-check one location's whole entry. Returns null for a location with
 * nothing usable left, which the callers drop — so a key in the config always
 * means at least one real keeper.
 *
 * Accepts a BARE ARRAY as well as the wrapper object. Nothing has shipped in
 * the older shape, but the config is env-seedable and hand-editable, and
 * `[{...}]` is the obvious thing to write for "the keepers at this site";
 * reading it as a nameless entry costs one line and beats discarding an
 * admin's config silently.
 */
function cleanLocationStockKeepers(value: unknown): LocationStockKeepers | null {
  const rawKeepers = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null
    ? (value as Record<string, unknown>).keepers
    : null;

  const keepers = cleanStockKeepers(rawKeepers);
  if (keepers.length === 0) return null;

  const rawName =
    !Array.isArray(value) && typeof value === "object" && value !== null
      ? (value as Record<string, unknown>).locationName
      : null;

  return {
    locationName:
      typeof rawName === "string" && rawName.trim() ? rawName.trim() : null,
    keepers,
  };
}

/** Env normaliser: JSON object only, cleaned through the same rules as the getter. */
function normalizeStockKeepersEnv(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const cleaned: StockKeepersConfig = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d+$/.test(key)) continue;
      // Over-cap env values are rejected outright rather than trimmed — seeding
      // a config the UI would then refuse to save back is worse than starting
      // from the default and being told why.
      const entry = cleanLocationStockKeepers(value);
      if (entry === null) continue;
      if (entry.keepers.length > MAX_STOCK_KEEPERS_PER_LOCATION) return null;
      cleaned[key] = entry;
    }
    return JSON.stringify(cleaned);
  } catch {
    return null;
  }
}

/**
 * The full assignment map: locationId → keepers. `{}` when unset, which means
 * no location has a keeper and admins are covering everywhere.
 *
 * Locations with an empty list are dropped on the way out, so callers can read
 * "has a key" as "has at least one keeper".
 */
export async function getStockKeepers(): Promise<StockKeepersConfig> {
  const raw = await getSetting(STOCK_KEEPERS_KEY);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    const cleaned: StockKeepersConfig = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!/^\d+$/.test(key)) continue;
      const entry = cleanLocationStockKeepers(value);
      if (entry === null) continue;
      cleaned[key] = entry;
    }
    return cleaned;
  } catch {
    return {};
  }
}

/** The keepers at one location — `[]` when it has none. */
export async function getStockKeepersForLocation(
  locationId: number
): Promise<StockKeeperEntry[]> {
  const config = await getStockKeepers();
  return config[String(locationId)]?.keepers ?? [];
}

/**
 * Replace one location's keeper list (the admin UI edits a site as a unit).
 * An empty list clears the site, which hands it back to admin cover.
 *
 * Throws 400 when the list exceeds the cap, counted AFTER deduplication so
 * that submitting the same person twice is a no-op rather than an error the
 * admin can't make sense of.
 */
export async function setStockKeepersForLocation(
  locationId: number,
  keepers: StockKeeperEntry[],
  actorEmail: string,
  locationName?: string | null
): Promise<void> {
  const cleaned = cleanStockKeepers(keepers);

  if (cleaned.length > MAX_STOCK_KEEPERS_PER_LOCATION) {
    throw new AppError(
      `A location can have at most ${MAX_STOCK_KEEPERS_PER_LOCATION} stock keepers.`,
      400
    );
  }

  const config = await getStockKeepers();
  const key = String(locationId);

  if (cleaned.length === 0) {
    delete config[key];
  } else {
    const name =
      typeof locationName === "string" && locationName.trim()
        ? locationName.trim()
        : // Caller didn't supply one (or supplied a blank): keep whatever
          // snapshot is already stored rather than blanking a good name.
          config[key]?.locationName ?? null;
    config[key] = { locationName: name, keepers: cleaned };
  }

  await setSetting(STOCK_KEEPERS_KEY, JSON.stringify(config), actorEmail);
}

/**
 * Which locations this Snipe user keeps stock for. The answer for an ADMIN is
 * still whatever they are explicitly assigned — their ability to act anywhere
 * comes from their role, not from this list, so the two stay separable and an
 * admin's own site still shows them as its named keeper.
 *
 * Returns location ids as numbers, ascending, so callers get a stable order.
 */
export async function getStockKeeperLocationIdsForUser(
  userId: number
): Promise<number[]> {
  if (!Number.isFinite(userId)) return [];

  const config = await getStockKeepers();
  const ids: number[] = [];
  for (const [locationId, entry] of Object.entries(config)) {
    if (entry.keepers.some((k) => k.userId === userId)) ids.push(Number(locationId));
  }
  return ids.sort((a, b) => a - b);
}

/**
 * The sites this user keeps stock for, with the names the assignments were
 * written under. What /api/auth/role hands the client, so the UI can say which
 * locations somebody covers without resolving anything against Snipe.
 *
 * A location whose snapshot predates the name being stored comes back with
 * `name: null` rather than being dropped — the id is the part that carries
 * authority, and a nameless entry still grants it.
 */
export async function getStockKeeperLocationsForUser(
  userId: number
): Promise<{ id: number; name: string | null }[]> {
  if (!Number.isFinite(userId)) return [];

  const config = await getStockKeepers();
  const locations: { id: number; name: string | null }[] = [];
  for (const [locationId, entry] of Object.entries(config)) {
    if (entry.keepers.some((k) => k.userId === userId)) {
      locations.push({ id: Number(locationId), name: entry.locationName });
    }
  }
  return locations.sort((a, b) => a.id - b.id);
}

///  +-----------------------------------------------------------------+
///  |              THE STOCK KEEPER FLOW CUTOVER                      |
///  +-----------------------------------------------------------------+
//
//  Marking a request ready to collect became a stock keeper's step on EVERY
//  path, shipping included. That inserts a new actor between "dispatched" and
//  "the requester has it" — which is correct for everything filed from here
//  on, and unfair to everything already in the air.
//
//  A request that was shipped last week has a requester who was told to
//  confirm receipt themselves, and a site that may have no keeper assigned
//  yet. Applying the new rule retroactively would take the button away from
//  the one person who can see the parcel and hand the job to somebody who
//  does not know they have it.
//
//  So the flow changes for shipments dispatched AFTER this instant, and not
//  before. Recorded as a setting rather than a migration constant because it
//  has to be the moment this version actually went live in a given
//  environment — which differs between dev, staging and production, and is
//  not knowable when the migration is written.
///  +-----------------------------------------------------------------+

/**
 * When the stock keeper flow took effect here, or null if it has not been
 * stamped yet.
 *
 * Null is read as "the new flow applies to everything" by the callers, not as
 * "nothing has changed". A missing marker must not silently disable the
 * feature, and it cannot strand anything: admins can act as stock keeper
 * anywhere, so the worst case is that an in-flight shipment needs one click
 * from IT rather than from its requester.
 */
export async function getStockKeeperFlowCutover(): Promise<Date | null> {
  const raw = await getSetting(STOCK_KEEPER_FLOW_CUTOVER_KEY);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Stamp the cutover on first boot after this version lands. Idempotent: once
 * set, the value is never rewritten, so a restart does not move the line and
 * re-grandfather requests that have already changed hands.
 *
 * Returns the effective cutover, whether it was just written or already there.
 */
export async function ensureStockKeeperFlowCutover(): Promise<Date> {
  const existing = await getStockKeeperFlowCutover();
  if (existing !== null) return existing;

  const now = new Date();
  await setSetting(
    STOCK_KEEPER_FLOW_CUTOVER_KEY,
    now.toISOString(),
    "system:startup"
  );
  return now;
}

/**
 * Does this request keep the OLD ending — requester confirms receipt with no
 * stock keeper in between?
 *
 * True only for a shipment already dispatched when the flow changed. Three
 * things deliberately do NOT qualify:
 *
 *   - A collect-path request awaiting preparation. Its requester could never
 *     act at that stage anyway, so routing it through a keeper takes nothing
 *     away from anyone.
 *   - A shipment dispatched after the cutover, however old the request is.
 *     What matters is when it went in the van, not when it was asked for.
 *   - Anything already marked ready or received. Those have passed the point
 *     where the two flows differ.
 */
export function isLegacyShipment(
  request: {
    needsShipping: boolean;
    shippedAt: Date | null;
    collectionReadyAt: Date | null;
  },
  cutover: Date | null
): boolean {
  if (cutover === null) return false;
  if (!request.needsShipping) return false;
  if (request.shippedAt === null) return false;
  if (request.collectionReadyAt !== null) return false;
  return request.shippedAt < cutover;
}
