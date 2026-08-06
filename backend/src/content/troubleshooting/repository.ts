import {
  articleSchema,
  deviceSchema,
  type Article,
  type Device,
  type DeviceKey,
  type Symptom,
  type SymptomCategory,
} from "./schema.js";
import phone from "./devices/phone.js";
import phoneWifi from "./articles/phone/wifi.js";

///  +-----------------------------------------------------------------+
///  |                 TROUBLESHOOTING REPOSITORY                      |
///  +-----------------------------------------------------------------+
//
//  The seam between the content and everything that reads it. The disk
//  implementation below is the only one today; the interface exists so it
//  isn't the only one possible. If admin-editable content is ever wanted,
//  a database implementation satisfies the same interface and the callers
//  don't change — that is the whole reason the disk-first decision is
//  reversible rather than a bet.
//
//  Nothing above this file should import a content module directly.
///  +-----------------------------------------------------------------+

/// ── The seam ─────────────────────────────────────────────────────────────

/** A symptom paired with whether an article actually exists for it. */
export type SymptomListing = Symptom & {
  /** False renders the Draft placeholder rather than hiding the symptom. */
  hasArticle: boolean;
};

export type SymptomCategoryListing = Omit<SymptomCategory, "symptoms"> & {
  symptoms: SymptomListing[];
};

/** A search hit, carrying enough context to render and link to it. */
export type SymptomSearchResult = SymptomListing & {
  deviceKey: DeviceKey;
  categoryId: string;
  categoryName: string;
};

export type DeviceSummary = Pick<Device, "key" | "label" | "labelSingular"> & {
  /** How many symptoms have an article. Drives "3 of 19 covered" style copy. */
  articleCount: number;
  symptomCount: number;
};

export interface TroubleshootingRepository {
  /** Every device the content library knows about, in picker order. */
  listDevices(): DeviceSummary[];
  /** The symptom taxonomy for one device. Empty array for an unknown device. */
  getDeviceCategories(deviceKey: string): SymptomCategoryListing[];
  /** The article for a symptom, or null when it hasn't been written yet. */
  getArticle(deviceKey: string, symptomId: string): Article | null;
  /**
   * Symptom label search. Case-insensitive substring, which is the right
   * amount of cleverness for a library this size — there is no index to
   * maintain and no ranking to tune. Pass a device key to scope it.
   */
  searchSymptoms(query: string, deviceKey?: string): SymptomSearchResult[];
  /** Sibling symptoms in the same category, for the chips under an article. */
  getSiblingSymptoms(deviceKey: string, symptomId: string): SymptomListing[];
}

/// ── Load and validate ────────────────────────────────────────────────────
//
//  Content is validated at module load, not lazily per request. A malformed
//  content file should stop the process at boot — the same posture the
//  server already takes for app links and quote storage — rather than
//  surfacing as a 500 to whoever happened to open that article first.
//
//  Registering modules explicitly rather than globbing the directory: the
//  build compiles to dist/ and a runtime glob over source paths would not
//  survive it, and an explicit list means a file that was never wired up
//  fails loudly in review instead of being quietly absent in production.

const DEVICE_MODULES: unknown[] = [phone];

const ARTICLE_MODULES: unknown[] = [phoneWifi];

/**
 * Parse and validate every registered content module.
 *
 * Exported because two other things need the validated content without
 * going through the query interface: the content test, which walks it to
 * resolve cross-references, and — if content ever moves to a database — the
 * seeding script, which is the migration path the repository interface
 * exists to keep cheap.
 */
export function parseContent(): { devices: Device[]; articles: Article[] } {
  const devices = DEVICE_MODULES.map((raw, i) => {
    const result = deviceSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `Troubleshooting content: device #${i} failed validation:\n${formatIssues(result.error)}`
      );
    }
    return result.data;
  });

  const articles = ARTICLE_MODULES.map((raw, i) => {
    const result = articleSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `Troubleshooting content: article #${i} failed validation:\n${formatIssues(result.error)}`
      );
    }
    return result.data;
  });

  return { devices, articles };
}

/** Zod issues as readable lines. Kept local — this is the only caller. */
function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/// ── Disk implementation ──────────────────────────────────────────────────

export function createDiskRepository(): TroubleshootingRepository {
  const { devices, articles } = parseContent();

  const devicesByKey = new Map<string, Device>(devices.map((d) => [d.key, d]));

  // Articles are keyed on device + symptom because symptom ids are only
  // unique WITHIN a device — "wifi" is a sensible id on a phone and on a
  // laptop, and they are different articles.
  const articleKey = (deviceKey: string, symptomId: string) => `${deviceKey}/${symptomId}`;
  const articlesByKey = new Map<string, Article>(
    articles.map((a) => [articleKey(a.deviceKey, a.symptomId), a])
  );

  const hasArticle = (deviceKey: string, symptomId: string) =>
    articlesByKey.has(articleKey(deviceKey, symptomId));

  const listCategories = (deviceKey: string): SymptomCategoryListing[] => {
    const device = devicesByKey.get(deviceKey);
    if (!device) return [];
    return device.categories.map((category) => ({
      ...category,
      symptoms: category.symptoms.map((symptom) => ({
        ...symptom,
        hasArticle: hasArticle(deviceKey, symptom.id),
      })),
    }));
  };

  return {
    listDevices() {
      return devices.map((device) => {
        const symptoms = device.categories.flatMap((c) => c.symptoms);
        return {
          key: device.key,
          label: device.label,
          labelSingular: device.labelSingular,
          symptomCount: symptoms.length,
          articleCount: symptoms.filter((s) => hasArticle(device.key, s.id)).length,
        };
      });
    },

    getDeviceCategories: listCategories,

    getArticle(deviceKey, symptomId) {
      return articlesByKey.get(articleKey(deviceKey, symptomId)) ?? null;
    },

    searchSymptoms(query, deviceKey) {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];

      const scope = deviceKey
        ? devices.filter((d) => d.key === deviceKey)
        : devices;

      return scope.flatMap((device) =>
        device.categories.flatMap((category) =>
          category.symptoms
            .filter((symptom) => symptom.label.toLowerCase().includes(needle))
            .map((symptom) => ({
              ...symptom,
              hasArticle: hasArticle(device.key, symptom.id),
              deviceKey: device.key,
              categoryId: category.id,
              categoryName: category.name,
            }))
        )
      );
    },

    getSiblingSymptoms(deviceKey, symptomId) {
      const categories = listCategories(deviceKey);
      const category = categories.find((c) =>
        c.symptoms.some((s) => s.id === symptomId)
      );
      if (!category) return [];
      return category.symptoms.filter((s) => s.id !== symptomId);
    },
  };
}

/** The process-wide instance. Content is static, so one load is enough. */
export const troubleshootingRepository: TroubleshootingRepository =
  createDiskRepository();
