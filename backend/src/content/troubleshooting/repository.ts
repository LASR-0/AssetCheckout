import {
  articleSchema,
  subjectSchema,
  DEVICE_KEYS,
  SUBJECT_KEYS,
  type Article,
  type Subject,
  type SubjectKey,
  type SubjectKind,
  type Symptom,
  type SymptomCategory,
} from "./schema.js";
import { SUBJECT_LABELS } from "./subjects.js";
import phone from "./subjects/phone.js";
import phoneWifi from "./articles/phone/wifi.js";

///  +-----------------------------------------------------------------+
///  |                 TROUBLESHOOTING REPOSITORY                      |
///  +-----------------------------------------------------------------+
//
//  The seam between the content and everything that reads it. The disk
//  implementation below is the only one today; the interface exists so it
//  isn't the only one possible. If admin-editable content is ever wanted, a
//  database implementation satisfies the same interface and the callers
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
  subjectKey: SubjectKey;
  categoryId: string;
  categoryName: string;
};

export type SubjectSummary = {
  key: SubjectKey;
  /** Splits the picker: devices get tiles, applications their own section. */
  kind: SubjectKind;
  /** Plural, for the picker tile: "Phones". */
  label: string;
  /** Singular, for the page heading: "Troubleshoot your phone". */
  labelSingular: string;
  /** How many symptoms have an article. */
  articleCount: number;
  symptomCount: number;
};

/**
 * An entry in the picker.
 *
 * `available` is what makes it clickable. A subject earns a place either
 * because its Snipe category is requestable or because we have written
 * articles for it, but only the second makes it worth opening.
 */
export type SubjectPickerTile = SubjectSummary & {
  available: boolean;
};

export interface TroubleshootingRepository {
  /** Every subject the content library knows about, in picker order. */
  listSubjects(): SubjectSummary[];
  /** The symptom taxonomy for one subject. Empty array for an unknown one. */
  getSubjectCategories(subjectKey: string): SymptomCategoryListing[];
  /** The article for a symptom, or null when it hasn't been written yet. */
  getArticle(subjectKey: string, symptomId: string): Article | null;
  /**
   * Symptom label search. Case-insensitive substring, which is the right
   * amount of cleverness for a library this size — no index to maintain and
   * no ranking to tune. Pass a key to scope it.
   */
  searchSymptoms(query: string, subjectKey?: string): SymptomSearchResult[];
  /** Sibling symptoms in the same category, for the chips under an article. */
  getSiblingSymptoms(subjectKey: string, symptomId: string): SymptomListing[];
  /**
   * The picker, given the device keys this deployment can request.
   *
   * The union of those keys and the subjects we have articles for.
   * Requestable decides who gets a tile; content decides whether it opens.
   * Content is unioned in rather than filtered by requestable so an article
   * can never become unreachable — people keep holding a device long after
   * it stops being orderable, and docks, printers and every application were
   * never requestable in the first place.
   */
  buildPicker(requestableKeys: SubjectKey[]): SubjectPickerTile[];
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

const SUBJECT_MODULES: unknown[] = [phone];

const ARTICLE_MODULES: unknown[] = [phoneWifi];

/**
 * Parse and validate every registered content module.
 *
 * Exported because two other things need the validated content without going
 * through the query interface: the content test, which walks it to resolve
 * cross-references, and — if content ever moves to a database — the seeding
 * script, which is the migration path the repository interface exists to
 * keep cheap.
 */
export function parseContent(): { subjects: Subject[]; articles: Article[] } {
  const subjects = SUBJECT_MODULES.map((raw, i) => {
    const result = subjectSchema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `Troubleshooting content: subject #${i} failed validation:\n${formatIssues(result.error)}`
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

  return { subjects, articles };
}

/** Zod issues as readable lines. Kept local — this is the only caller. */
function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

/** Derived from DEVICE_KEYS rather than listed again, so the enum stays the
 *  one declaration of what counts as a device. */
const DEVICE_KEY_SET: Set<string> = new Set(DEVICE_KEYS);

/// ── Disk implementation ──────────────────────────────────────────────────

export function createDiskRepository(): TroubleshootingRepository {
  const { subjects, articles } = parseContent();

  const subjectsByKey = new Map<string, Subject>(subjects.map((s) => [s.key, s]));

  // Articles are keyed on subject + symptom because symptom ids are only
  // unique WITHIN a subject — "wifi" is a sensible id on a phone and on a
  // laptop, and they may be different articles.
  //
  // An article listing several subjects is indexed under each. That is the
  // point of subjectKeys: the docking article is one article reachable from
  // Laptops, Monitors and Docks alike, rather than three copies that drift.
  const articleKey = (subjectKey: string, symptomId: string) =>
    `${subjectKey}/${symptomId}`;

  const articlesByKey = new Map<string, Article>();
  for (const article of articles) {
    for (const key of article.subjectKeys) {
      articlesByKey.set(articleKey(key, article.symptomId), article);
    }
  }

  const hasArticle = (subjectKey: string, symptomId: string) =>
    articlesByKey.has(articleKey(subjectKey, symptomId));

  const listCategories = (subjectKey: string): SymptomCategoryListing[] => {
    const subject = subjectsByKey.get(subjectKey);
    if (!subject) return [];
    return subject.categories.map((category) => ({
      ...category,
      symptoms: category.symptoms.map((symptom) => ({
        ...symptom,
        hasArticle: hasArticle(subjectKey, symptom.id),
      })),
    }));
  };

  /** Counts for a key, whether or not the library has heard of it. */
  const summarise = (key: SubjectKey): SubjectSummary => {
    const subject = subjectsByKey.get(key);
    const symptoms = subject?.categories.flatMap((c) => c.symptoms) ?? [];
    return {
      key,
      // An unwritten subject has no file to declare its kind, so it falls
      // back to the key space: anything that isn't a device key is an app.
      kind: subject?.kind ?? (DEVICE_KEY_SET.has(key) ? "device" : "app"),
      ...SUBJECT_LABELS[key],
      symptomCount: symptoms.length,
      articleCount: symptoms.filter((s) => hasArticle(key, s.id)).length,
    };
  };

  return {
    listSubjects() {
      return subjects.map((subject) => summarise(subject.key));
    },

    getSubjectCategories: listCategories,

    getArticle(subjectKey, symptomId) {
      return articlesByKey.get(articleKey(subjectKey, symptomId)) ?? null;
    },

    searchSymptoms(query, subjectKey) {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];

      const scope = subjectKey
        ? subjects.filter((s) => s.key === subjectKey)
        : subjects;

      return scope.flatMap((subject) =>
        subject.categories.flatMap((category) =>
          category.symptoms
            .filter((symptom) => symptom.label.toLowerCase().includes(needle))
            .map((symptom) => ({
              ...symptom,
              hasArticle: hasArticle(subject.key, symptom.id),
              subjectKey: subject.key,
              categoryId: category.id,
              categoryName: category.name,
            }))
        )
      );
    },

    getSiblingSymptoms(subjectKey, symptomId) {
      const categories = listCategories(subjectKey);
      const category = categories.find((c) =>
        c.symptoms.some((s) => s.id === symptomId)
      );
      if (!category) return [];
      return category.symptoms.filter((s) => s.id !== symptomId);
    },

    buildPicker(requestableKeys) {
      // A subject with a taxonomy but no articles is a page of Drafts, which
      // is not somewhere to send anyone — so coverage, not mere presence in
      // the library, is what counts as content here.
      const covered = new Set(
        subjects.map((s) => s.key).filter((key) => summarise(key).articleCount > 0)
      );
      const requestable = new Set(requestableKeys);

      // SUBJECT_KEYS order, not the order either input arrived in, so the
      // grid doesn't reshuffle when an admin edits the requestable list.
      return SUBJECT_KEYS.filter(
        (key) => covered.has(key) || requestable.has(key)
      ).map((key) => ({ ...summarise(key), available: covered.has(key) }));
    },
  };
}

/** The process-wide instance. Content is static, so one load is enough. */
export const troubleshootingRepository: TroubleshootingRepository =
  createDiskRepository();
