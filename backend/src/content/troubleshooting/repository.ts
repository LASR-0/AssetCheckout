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
import desktop from "./subjects/desktop.js";
import dock from "./subjects/dock.js";
import ess from "./subjects/ess.js";
import headphones from "./subjects/headphones.js";
import keyboard from "./subjects/keyboard.js";
import laptop from "./subjects/laptop.js";
import monitor from "./subjects/monitor.js";
import mouse from "./subjects/mouse.js";
import onedrive from "./subjects/onedrive.js";
import outlook from "./subjects/outlook.js";
import phone from "./subjects/phone.js";
import printer from "./subjects/printer.js";
import sap from "./subjects/sap.js";
import sharepoint from "./subjects/sharepoint.js";
import tablet from "./subjects/tablet.js";
import webcam from "./subjects/webcam.js";
import laptopWifi from "./articles/laptop/connect-ksb-office-wifi.js";
import laptopVpn from "./articles/laptop/vpn-from-home.js";
import laptopPrintersMissing from "./articles/laptop/printers-missing.js";
import laptopPrintPin from "./articles/laptop/print-pin.js";
import laptopLockScreen from "./articles/laptop/lock-screen-blank.js";
import laptopTaskbar from "./articles/laptop/taskbar-not-responding.js";
import laptopFileType from "./articles/laptop/cannot-open-file-type.js";
import laptopAppsSlow from "./articles/laptop/apps-slow.js";
import laptopWifiDown from "./articles/laptop/wifi-down-ethernet-fine.js";
import laptopWontTurnOn from "./articles/laptop/wont-turn-on.js";
import laptopNotCharging from "./articles/laptop/not-charging.js";
import laptopOverheating from "./articles/laptop/overheating.js";
import laptopNoDisplayDock from "./articles/laptop/no-display-dock.js";
import laptopNoDisplayHdmi from "./articles/laptop/no-display-hdmi.js";
import laptopNoDisplayDp from "./articles/laptop/no-display-displayport.js";
import laptopScreensWrongSide from "./articles/laptop/screens-wrong-side.js";
import laptopScreenRotated from "./articles/laptop/screen-rotated.js";
import laptopDisplayFlickering from "./articles/laptop/display-flickering.js";
import desktopWontTurnOn from "./articles/desktop/wont-turn-on.js";
import laptopPrintCloudError from "./articles/laptop/print-cloud-error.js";
import printerSafeqConnectionError from "./articles/printer/safeq-connection-error.js";
import monitorWontTurnOn from "./articles/monitor/wont-turn-on.js";
import dockNoPower from "./articles/dock/no-power.js";
import dockUsbNotWorking from "./articles/dock/usb-not-working.js";
import dockEthernetNotWorking from "./articles/dock/ethernet-not-working.js";
import outlookEmailsNotArriving from "./articles/outlook/emails-not-arriving.js";
import outlookSlow from "./articles/outlook/outlook-slow.js";
import headsetWontConnect from "./articles/headphones/wont-connect.js";
import headsetNotInTeams from "./articles/headphones/not-in-teams.js";
import mouseWontConnect from "./articles/mouse/wont-connect.js";
import mouseNotMoving from "./articles/mouse/not-moving.js";
import mouseBattery from "./articles/mouse/battery.js";
import keyboardWontConnect from "./articles/keyboard/wont-connect.js";
import keysNotWorking from "./articles/keyboard/keys-not-working.js";
import webcamNotDetected from "./articles/webcam/not-detected.js";
import webcamNotInTeams from "./articles/webcam/not-in-teams.js";
import phoneKsbMobileIos from "./articles/phone/connect-ksb-mobile-ios.js";
import phoneKsbMobileSamsung from "./articles/phone/connect-ksb-mobile-samsung.js";
import phoneWontTurnOnIos from "./articles/phone/wont-turn-on-ios.js";
import phoneWontTurnOnSamsung from "./articles/phone/wont-turn-on-samsung.js";
import phoneNoCharge from "./articles/phone/no-charge.js";
import phoneNoDataIos from "./articles/phone/no-data-ios.js";
import phoneNoDataSamsung from "./articles/phone/no-data-samsung.js";
import phoneCracked from "./articles/phone/cracked.js";
import phoneInstallApp from "./articles/phone/install-app.js";
import phoneBatteryDrainIos from "./articles/phone/battery-drain-ios.js";
import phoneBatteryDrainSamsung from "./articles/phone/battery-drain-samsung.js";
import phoneStorage from "./articles/phone/storage.js";
import phoneSlow from "./articles/phone/slow.js";
import phoneOverheating from "./articles/phone/overheating.js";
import phoneTouchDead from "./articles/phone/touch-dead.js";
import phoneFlicker from "./articles/phone/flicker.js";
import phoneDroppedCalls from "./articles/phone/dropped-calls.js";
import phoneBluetooth from "./articles/phone/bluetooth.js";
import phoneCrash from "./articles/phone/crash.js";
import phoneNoSound from "./articles/phone/no-sound.js";
import phoneMic from "./articles/phone/mic.js";
import phoneCamera from "./articles/phone/camera.js";
import phoneNotCompliant from "./articles/phone/not-compliant.js";
import phonePortal from "./articles/phone/portal.js";

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

/// ── Visibility ───────────────────────────────────────────────────────────
//
//  Two admin switches, and they are NOT part of the draft: hiding is almost
//  always "this is wrong, get it off the site now", and making that wait
//  behind a publish would be backwards. Article text is what gets drafted.
//
//  LISTING-SHAPED METHODS FILTER; FETCH-SHAPED ONES DO NOT. Everything that
//  produces a list — the taxonomy, search, siblings, the picker counts — skips
//  hidden symptoms and disabled categories. `getArticle` and `findSymptom` do
//  not, and that is the whole reason a direct link to a hidden article still
//  opens rather than 404ing. Hidden means unlisted, not retracted.
//
//  A hidden symptom leaves the listing ENTIRELY rather than dropping back to a
//  Draft badge. The badge means "we intend to cover this", which is the
//  opposite of what hiding says, and the article does still exist and open.

/** A category as authored, plus the admin switch. */
export type CategoryContent = SymptomCategory & { disabled: boolean };

/** A subject as authored, with its categories carrying visibility. */
export type SubjectContent = Omit<Subject, "categories"> & {
  categories: CategoryContent[];
};

/** An article as authored, plus the admin switch. */
export type ArticleContent = Article & { hidden: boolean };

/**
 * Everything the query layer needs, already validated.
 *
 * The seam that lets one copy of the query logic serve both the disk modules
 * and the database: `createRepositoryOver` cares only about this shape, not
 * where it came from. Disk content has no visibility switches, so the disk
 * loader defaults both to false and behaves exactly as it always has.
 */
export type ContentSnapshot = {
  subjects: SubjectContent[];
  articles: ArticleContent[];
};

/** A symptom found without regard to whether it is listed. */
export type SymptomLocation = {
  symptom: Symptom;
  category: SymptomCategory;
  /** False when hidden, or when its category is disabled. */
  listed: boolean;
};

export interface TroubleshootingRepository {
  /** Every subject the content library knows about, in picker order. */
  listSubjects(): SubjectSummary[];
  /** The symptom taxonomy for one subject. Empty array for an unknown one. */
  getSubjectCategories(subjectKey: string): SymptomCategoryListing[];
  /**
   * Locate a symptom whether or not it is listed.
   *
   * Callers deciding whether a URL is REAL must use this rather than
   * searching `getSubjectCategories`, which filters. A hidden symptom is
   * still a valid address; the route that 404s on it is a bug.
   */
  findSymptom(subjectKey: string, symptomId: string): SymptomLocation | null;
  /** Whether the library knows this subject at all. */
  hasSubject(subjectKey: string): boolean;
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

/// ── Naming the reader's own device ───────────────────────────────────────
//
//  An article listed under several subjects is read by people holding
//  different things. "Your laptop won't turn on" is wrong under Desktops and
//  "your phone is full" is wrong under Tablets, and getting that wrong on
//  every line is worse than the mild awkwardness of neutral wording — it
//  reads as an article written for somebody else.
//
//  So content writes {device} where it means THE THING THE READER CAME HERE
//  ABOUT, and the repository fills it in with that subject's own name at the
//  moment it serves the article. Substituting here rather than in the browser
//  keeps it in one place and means the API returns text that is already
//  correct — nothing downstream has to know the mechanism exists.
//
//  DELIBERATELY NOT A BLIND RENAME OF EVERY MENTION. Plenty of articles name
//  a laptop while meaning the other end of a cable — "plug it into the
//  laptop" in a docking or mouse article, "unlike the Microsoft Store on
//  laptops" in a phone one. Those are different objects and must stay
//  literal. Only a self-reference becomes a token, which is a judgement the
//  author makes and a script cannot.
//
//  Four spellings, because English needs them at the start of a sentence and
//  in the plural. An unknown token is left alone rather than blanked: a
//  visible {typo} in review is far better than a sentence that quietly loses
//  its subject.

const SUBJECT_TOKEN = /\{(device|devices|Device|Devices)\}/g;

export function fillTokens(text: string, key: SubjectKey): string {
  const labels = SUBJECT_LABELS[key];
  const singular = labels.labelSingular;
  const plural = labels.label.toLowerCase();
  const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

  return text.replace(SUBJECT_TOKEN, (_, token: string) => {
    switch (token) {
      case "device": return singular;
      case "devices": return plural;
      case "Device": return capitalise(singular);
      default: return capitalise(plural);
    }
  });
}

/** A copy of the article speaking about the subject the reader arrived from. */
export function nameTheSubject(article: Article, subjectKey: string): Article {
  const key = subjectKey as SubjectKey;
  if (!SUBJECT_LABELS[key]) return article;

  const fill = (text: string) => fillTokens(text, key);
  const maybe = (text?: string) => (text === undefined ? undefined : fill(text));

  return {
    ...article,
    summary: fill(article.summary),
    appliesTo: fill(article.appliesTo),
    before: article.before.map(fill),
    steps: article.steps.map((step) => ({
      ...step,
      title: fill(step.title),
      body: fill(step.body),
      note: maybe(step.note),
      warn: maybe(step.warn),
      figure: step.figure && { ...step.figure, caption: fill(step.figure.caption) },
      branch: step.branch && { ...step.branch, label: fill(step.branch.label) },
    })),
  };
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

const SUBJECT_MODULES: unknown[] = [
  laptop, desktop, phone, tablet, monitor, dock, printer,
  headphones, mouse, keyboard, webcam,
  outlook, onedrive, sharepoint, sap, ess,
];

const ARTICLE_MODULES: unknown[] = [
  laptopWifi,
  laptopVpn,
  laptopPrintersMissing,
  laptopPrintPin,
  laptopLockScreen,
  laptopTaskbar,
  laptopFileType,
  laptopAppsSlow,
  laptopWifiDown,
  laptopWontTurnOn,
  laptopNotCharging,
  laptopOverheating,
  laptopNoDisplayDock,
  laptopNoDisplayHdmi,
  laptopNoDisplayDp,
  laptopScreensWrongSide,
  laptopScreenRotated,
  laptopDisplayFlickering,
  desktopWontTurnOn,
  laptopPrintCloudError,
  printerSafeqConnectionError,
  monitorWontTurnOn,
  dockNoPower,
  dockUsbNotWorking,
  dockEthernetNotWorking,
  phoneKsbMobileIos,
  phoneKsbMobileSamsung,
  phoneWontTurnOnIos,
  phoneWontTurnOnSamsung,
  phoneNoCharge,
  phoneNoDataIos,
  phoneNoDataSamsung,
  phoneCracked,
  phoneInstallApp,
  phoneBatteryDrainIos,
  phoneBatteryDrainSamsung,
  phoneStorage,
  phoneSlow,
  phoneOverheating,
  phoneTouchDead,
  phoneFlicker,
  phoneDroppedCalls,
  phoneBluetooth,
  phoneCrash,
  phoneNoSound,
  phoneMic,
  phoneCamera,
  phoneNotCompliant,
  phonePortal,
  headsetWontConnect,
  headsetNotInTeams,
  mouseWontConnect,
  mouseNotMoving,
  mouseBattery,
  keyboardWontConnect,
  keysNotWorking,
  webcamNotDetected,
  webcamNotInTeams,
  outlookEmailsNotArriving,
  outlookSlow,
];

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
//
//  The authored modules, as a snapshot. Kept after the move to a database
//  because it is what the SEED reads and what the content tests validate —
//  the corpus has to stay valid, because a fresh database is built from it.
//
//  Disk content carries no visibility switches; there is nowhere in a `.ts`
//  module to write one, and nor should there be. Both default to false, so a
//  repository built over disk behaves exactly as it always has.

export function contentFromDisk(): ContentSnapshot {
  const { subjects, articles } = parseContent();

  return {
    subjects: subjects.map((subject) => ({
      ...subject,
      categories: subject.categories.map((category) => ({
        ...category,
        disabled: false,
      })),
    })),
    articles: articles.map((article) => ({ ...article, hidden: false })),
  };
}

export function createDiskRepository(): TroubleshootingRepository {
  return createRepositoryOver(contentFromDisk());
}

/// ── The query layer ──────────────────────────────────────────────────────
//
//  One copy, over a validated snapshot. Both the disk modules and the
//  database produce a ContentSnapshot, so neither implementation owns a
//  second copy of search, siblings, the picker or token substitution — which
//  is what kept the disk-to-database migration a swap rather than a rewrite.

export function createRepositoryOver(content: ContentSnapshot): TroubleshootingRepository {
  const { subjects, articles } = content;

  const subjectsByKey = new Map<string, SubjectContent>(subjects.map((s) => [s.key, s]));

  // Articles are keyed on subject + symptom because symptom ids are only
  // unique WITHIN a subject — "wifi" is a sensible id on a phone and on a
  // laptop, and they may be different articles.
  //
  // An article listing several subjects is indexed under each. That is the
  // point of subjectKeys: the docking article is one article reachable from
  // Laptops, Monitors and Docks alike, rather than three copies that drift.
  const articleKey = (subjectKey: string, symptomId: string) =>
    `${subjectKey}/${symptomId}`;

  const articlesByKey = new Map<string, ArticleContent>();
  for (const article of articles) {
    for (const key of article.subjectKeys) {
      articlesByKey.set(articleKey(key, article.symptomId), article);
    }
  }

  const hasArticle = (subjectKey: string, symptomId: string) =>
    articlesByKey.has(articleKey(subjectKey, symptomId));

  /** Hidden is a property of the ARTICLE, so a symptom with no article
   *  written yet is never hidden — there is nothing to hide. */
  const isHidden = (subjectKey: string, symptomId: string) =>
    articlesByKey.get(articleKey(subjectKey, symptomId))?.hidden ?? false;

  /** The listed taxonomy: disabled categories gone, hidden symptoms gone. */
  const listCategories = (subjectKey: string): SymptomCategoryListing[] => {
    const subject = subjectsByKey.get(subjectKey);
    if (!subject) return [];
    return subject.categories
      .filter((category) => !category.disabled)
      .map((category) => ({
        ...category,
        symptoms: category.symptoms
          .filter((symptom) => !isHidden(subjectKey, symptom.id))
          .map((symptom) => ({
            ...symptom,
            hasArticle: hasArticle(subjectKey, symptom.id),
          })),
      }));
  };

  /** Counts for a key, whether or not the library has heard of it.
   *
   *  Counts the LISTED taxonomy — a disabled category or a hidden symptom is
   *  not something the reader can reach, so a tile claiming otherwise would
   *  be advertising content that isn't there. */
  const summarise = (key: SubjectKey): SubjectSummary => {
    const subject = subjectsByKey.get(key);
    const symptoms = listCategories(key).flatMap((c) => c.symptoms);
    return {
      key,
      // An unwritten subject has no file to declare its kind, so it falls
      // back to the key space: anything that isn't a device key is an app.
      kind: subject?.kind ?? (DEVICE_KEY_SET.has(key) ? "device" : "app"),
      ...SUBJECT_LABELS[key],
      symptomCount: symptoms.length,
      articleCount: symptoms.filter((s) => s.hasArticle).length,
    };
  };

  return {
    listSubjects() {
      return subjects.map((subject) => summarise(subject.key));
    },

    getSubjectCategories: listCategories,

    hasSubject(subjectKey) {
      return subjectsByKey.has(subjectKey);
    },

    findSymptom(subjectKey, symptomId) {
      // UNFILTERED, deliberately. This answers "is this a real address?", and
      // a hidden symptom still is one. Deciding a 404 from the listed
      // taxonomy instead would make hiding an article break its URL, which is
      // the one thing hiding must not do.
      const subject = subjectsByKey.get(subjectKey);
      if (!subject) return null;

      for (const category of subject.categories) {
        const symptom = category.symptoms.find((s) => s.id === symptomId);
        if (!symptom) continue;
        return {
          symptom,
          category,
          listed: !category.disabled && !isHidden(subjectKey, symptomId),
        };
      }

      return null;
    },

    getArticle(subjectKey, symptomId) {
      const article = articlesByKey.get(articleKey(subjectKey, symptomId));
      return article ? nameTheSubject(article, subjectKey) : null;
    },

    searchSymptoms(query, subjectKey) {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];

      const scope = subjectKey
        ? subjects.filter((s) => s.key === subjectKey)
        : subjects;

      // Over the LISTED taxonomy, not the raw one. A hidden symptom that a
      // search still surfaced would be hidden from the accordion and nowhere
      // else, which is not hidden at all.
      return scope.flatMap((subject) =>
        listCategories(subject.key).flatMap((category) =>
          category.symptoms
            .filter((symptom) => symptom.label.toLowerCase().includes(needle))
            .map((symptom) => ({
              ...symptom,
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
      // A TAXONOMY IS WHAT MAKES A SUBJECT CLICKABLE, not articles.
      //
      // An earlier version greyed out anything with no articles, reasoning
      // that a page of Drafts was nowhere to send anyone. That was wrong: we
      // list a symptom precisely because we intend to cover it, and a reader
      // who opens it learns the problem is known and recognised rather than
      // being told nothing at all. It also gives their search somewhere to
      // land instead of registering as no-match.
      //
      // Greying out is reserved for subjects with nothing behind them at all
      // — a Snipe category we can name but have never written a taxonomy for.
      // Those genuinely lead nowhere.
      const known = new Set<SubjectKey>(subjects.map((s) => s.key));
      const requestable = new Set(requestableKeys);

      // SUBJECT_KEYS order, not the order either input arrived in, so the
      // grid doesn't reshuffle when an admin edits the requestable list.
      return SUBJECT_KEYS.filter(
        (key) => known.has(key) || requestable.has(key)
      ).map((key) => ({ ...summarise(key), available: known.has(key) }));
    },
  };
}

/// ── The process-wide instance ────────────────────────────────────────────
//
//  A DELEGATING WRAPPER over a snapshot that can be swapped, rather than a
//  repository built once at import. Content used to be static; it is now
//  edited in the UI, so the library has to be replaceable without restarting
//  and without every caller re-fetching a new object.
//
//  PRISMA IS DELIBERATELY NOT IMPORTED IN THIS FILE. The content tests and
//  the row-mapping tests import the repository and run with no database at
//  all; pulling a Prisma client in here would drag one into every one of
//  them. The database loader lives in prismaContent.ts and pushes its
//  snapshot in through `setRepositoryContent`, so the dependency points the
//  right way round.
//
//  IT STARTS ON DISK CONTENT. That keeps the import-time behaviour identical
//  to what it has always been — tests and scripts that never call the loader
//  see the authored library — and it means a database that fails to load
//  leaves a working library rather than an empty one. Boot still treats that
//  failure as fatal; this is a floor, not a way to limp along unnoticed.

let query: TroubleshootingRepository = createRepositoryOver(contentFromDisk());

/** Replace the served library. Called by the database loader after any write. */
export function setRepositoryContent(content: ContentSnapshot): void {
  query = createRepositoryOver(content);
}

/**
 * Serve the authored modules rather than the database.
 *
 * The seam the tests use. `troubleshootingRoutes.test.ts` mocks Prisma away
 * to keep a database out of a route-contract test; this lets it populate the
 * library without one.
 */
export function useDiskContent(): void {
  setRepositoryContent(contentFromDisk());
}

export const troubleshootingRepository: TroubleshootingRepository = {
  listSubjects: () => query.listSubjects(),
  getSubjectCategories: (subjectKey) => query.getSubjectCategories(subjectKey),
  findSymptom: (subjectKey, symptomId) => query.findSymptom(subjectKey, symptomId),
  hasSubject: (subjectKey) => query.hasSubject(subjectKey),
  getArticle: (subjectKey, symptomId) => query.getArticle(subjectKey, symptomId),
  searchSymptoms: (search, subjectKey) => query.searchSymptoms(search, subjectKey),
  getSiblingSymptoms: (subjectKey, symptomId) =>
    query.getSiblingSymptoms(subjectKey, symptomId),
  buildPicker: (requestableKeys) => query.buildPicker(requestableKeys),
};
