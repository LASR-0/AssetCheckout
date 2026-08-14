import { contentFromDisk, type ContentSnapshot } from "./repository.js";
import { articlesDiffer } from "./serialise.js";
import {
  readVisibility,
  visibilityKey,
  EMPTY_VISIBILITY,
  type Visibility,
  type VisibilityEntry,
} from "./visibility.js";
import type { Article, SymptomCategory } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |          WHAT AN EXPORT WOULD DO, WITHOUT DOING IT              |
///  +-----------------------------------------------------------------+
//
//  The database is the library; the `.ts` modules are the seed a fresh
//  environment is built from. The two drift the moment anybody edits anything
//  in the UI, and this is the thing that says how far apart they are.
//
//  CLASSIFY FIRST, WRITE LATER. This module deliberately contains no file
//  writing at all. Knowing exactly which of the hard cases actually occur —
//  and today several of them cannot, because the service has no create or
//  delete — is worth more than a half-built writer aimed at a data shape
//  nobody can produce yet.
//
//  IT IS ALSO THE PERMANENT DRY RUN. The export script's default mode is this
//  report, so `--write` is always something somebody chose.
///  +-----------------------------------------------------------------+

/// ── What can be different ────────────────────────────────────────────────

export type ArticleChange =
  /** Present in both, and identical. The file is not touched at all — which
   *  is what preserves the inline comments inside its literal. */
  | { kind: "unchanged"; subjectKey: string; symptomId: string }
  /** Edited in the UI. Its object literal needs rewriting in place. */
  | {
      kind: "edited";
      subjectKey: string;
      symptomId: string;
      /** Which top-level fields differ, for the report. */
      fields: string[];
    }
  /** Created in the UI. Needs a new file and a registry entry. */
  | { kind: "created"; subjectKey: string; symptomId: string }
  /** Deleted in the UI. Its file needs archiving and unregistering. */
  | { kind: "removed"; subjectKey: string; symptomId: string };

export type TaxonomyChange =
  | { kind: "symptom-label"; subjectKey: string; symptomId: string; from: string; to: string }
  | { kind: "symptom-added"; subjectKey: string; categoryId: string; symptomId: string; label: string }
  | { kind: "symptom-removed"; subjectKey: string; categoryId: string; symptomId: string }
  | { kind: "category-text"; subjectKey: string; categoryId: string; fields: string[] }
  | { kind: "category-added"; subjectKey: string; categoryId: string; name: string }
  | { kind: "category-removed"; subjectKey: string; categoryId: string }
  | { kind: "category-reordered"; subjectKey: string }
  | { kind: "symptoms-reordered"; subjectKey: string; categoryId: string };

/**
 * A visibility switch the sidecar does not yet agree with.
 *
 * Compared against `visibility.json`, not assumed. Before the sidecar existed
 * every hidden article was a change, because a module had nowhere to say so;
 * now most of them are already recorded and only the drift is reported.
 *
 * BOTH DIRECTIONS MATTER. "hide" losing its record republishes something
 * somebody pulled — the loud failure. "unhide" losing its record leaves an
 * article hidden that an admin deliberately restored, which is quieter and
 * just as wrong.
 */
export type VisibilityChange =
  | { kind: "article-hidden"; subjectKey: string; symptomId: string }
  | { kind: "article-unhidden"; subjectKey: string; symptomId: string }
  | { kind: "category-disabled"; subjectKey: string; categoryId: string }
  | { kind: "category-enabled"; subjectKey: string; categoryId: string }
  /** A sidecar entry naming something that no longer exists. Not an error —
   *  the content moved on — but the line should go. */
  | { kind: "stale-entry"; key: string };

export type ExportPlan = {
  articles: ArticleChange[];
  taxonomy: TaxonomyChange[];
  visibility: VisibilityChange[];
  /** What visibility.json should contain after the export. */
  visibilityFile: Visibility;
  /** Images a module would reference that aren't in the repository tree. */
  missingImages: { subjectKey: string; symptomId: string; src: string }[];
};

/// ── Comparison ───────────────────────────────────────────────────────────

/**
 * An article's identity for comparison purposes.
 *
 * Its FILE lives at `articles/<subjectKeys[0]>/<symptomSlug>.ts` — verified
 * true for all 60 modules — so the first subject plus the slug is the key. It
 * is not the slug alone: "wont-turn-on" is one article under Laptops and a
 * different one under Desktops.
 */
function articleKey(article: Article): string {
  return `${article.subjectKeys[0]}/${article.symptomId}`;
}

const ARTICLE_FIELDS = [
  "subjectKeys",
  "summary",
  "timeEstimate",
  "appliesTo",
  "updated",
  "before",
  "steps",
  "source",
] as const;

/**
 * Which top-level fields differ, for the report only.
 *
 * NOT what decides "unchanged" — that is `articlesDiffer`, which asks the
 * serialiser, so the thing classifying and the thing writing the file cannot
 * disagree about what a change is. This just names the fields afterwards, so
 * the report can say WHERE to look.
 *
 * Deliberately coarse: `steps` is one changed field rather than a per-step
 * diff. `git diff` after `--write` is the real diff viewer and is better at it.
 */
function changedFields(disk: Article, db: Article): string[] {
  return ARTICLE_FIELDS.filter(
    (field) => JSON.stringify(disk[field]) !== JSON.stringify(db[field])
  );
}

function categoriesOf(snapshot: ContentSnapshot, subjectKey: string) {
  return snapshot.subjects.find((s) => s.key === subjectKey)?.categories ?? [];
}

function compareCategory(
  subjectKey: string,
  disk: SymptomCategory & { disabled: boolean },
  db: SymptomCategory & { disabled: boolean },
  out: { taxonomy: TaxonomyChange[] }
): void {
  const textFields = (["glyph", "name", "blurb"] as const).filter(
    (f) => disk[f] !== db[f]
  );
  if (textFields.length > 0) {
    out.taxonomy.push({
      kind: "category-text",
      subjectKey,
      categoryId: db.id,
      fields: textFields,
    });
  }

  const diskSymptoms = new Map(disk.symptoms.map((s) => [s.id, s]));
  const dbSymptoms = new Map(db.symptoms.map((s) => [s.id, s]));

  for (const [id, symptom] of dbSymptoms) {
    const before = diskSymptoms.get(id);
    if (!before) {
      out.taxonomy.push({
        kind: "symptom-added",
        subjectKey,
        categoryId: db.id,
        symptomId: id,
        label: symptom.label,
      });
    } else if (before.label !== symptom.label) {
      out.taxonomy.push({
        kind: "symptom-label",
        subjectKey,
        symptomId: id,
        from: before.label,
        to: symptom.label,
      });
    }
  }

  for (const id of diskSymptoms.keys()) {
    if (!dbSymptoms.has(id)) {
      out.taxonomy.push({
        kind: "symptom-removed",
        subjectKey,
        categoryId: db.id,
        symptomId: id,
      });
    }
  }

  // Order matters: it is what the reader sees, and the file's array order is
  // the only place it is recorded.
  const shared = [...dbSymptoms.keys()].filter((id) => diskSymptoms.has(id));
  const diskOrder = disk.symptoms.map((s) => s.id).filter((id) => dbSymptoms.has(id));
  const dbOrder = db.symptoms.map((s) => s.id).filter((id) => diskSymptoms.has(id));
  if (shared.length > 1 && diskOrder.join() !== dbOrder.join()) {
    out.taxonomy.push({ kind: "symptoms-reordered", subjectKey, categoryId: db.id });
  }
}

/**
 * Work out everything an export would have to do.
 *
 * Pure: takes both snapshots, touches no filesystem, reads no database. Async
 * only because Prettier is, and the comparator goes through Prettier so that
 * "changed" means exactly "would produce different text".
 */
export async function planExport(
  db: ContentSnapshot,
  disk: ContentSnapshot = contentFromDisk(),
  imageExists: (src: string) => boolean = () => true,
  sidecar: Visibility = readVisibility(),
  audit: Record<string, VisibilityEntry> = {}
): Promise<ExportPlan> {
  const plan: ExportPlan = {
    articles: [],
    taxonomy: [],
    visibility: [],
    visibilityFile: EMPTY_VISIBILITY,
    missingImages: [],
  };

  /// Articles
  const diskArticles = new Map(disk.articles.map((a) => [articleKey(a), a]));
  const dbArticles = new Map(db.articles.map((a) => [articleKey(a), a]));

  for (const [key, article] of dbArticles) {
    const [subjectKey, symptomId] = key.split("/");
    const before = diskArticles.get(key);

    if (!before) {
      plan.articles.push({ kind: "created", subjectKey, symptomId });
    } else if (await articlesDiffer(before, article)) {
      // The fields are named for the report; the decision above is the
      // serialiser's alone.
      plan.articles.push({
        kind: "edited",
        subjectKey,
        symptomId,
        fields: changedFields(before, article),
      });
    } else {
      plan.articles.push({ kind: "unchanged", subjectKey, symptomId });
    }

    // An image uploaded through the editor lands in the images directory,
    // which is a production volume in prod — so a module can easily reference
    // a file that is not in the repository tree.
    for (const step of article.steps) {
      for (const image of step.figure?.images ?? []) {
        for (const src of [image.src, image.srcDark].filter(Boolean) as string[]) {
          if (!imageExists(src)) {
            plan.missingImages.push({ subjectKey, symptomId, src });
          }
        }
      }
    }
  }

  for (const [key] of diskArticles) {
    if (dbArticles.has(key)) continue;
    const [subjectKey, symptomId] = key.split("/");
    plan.articles.push({ kind: "removed", subjectKey, symptomId });
  }

  /// Taxonomy
  for (const subject of db.subjects) {
    const diskCategories = categoriesOf(disk, subject.key);
    const byId = new Map(diskCategories.map((c) => [c.id, c]));

    for (const category of subject.categories) {
      const before = byId.get(category.id);
      if (!before) {
        plan.taxonomy.push({
          kind: "category-added",
          subjectKey: subject.key,
          categoryId: category.id,
          name: category.name,
        });
        continue;
      }
      compareCategory(subject.key, before, category, plan);
    }

    for (const category of diskCategories) {
      if (!subject.categories.some((c) => c.id === category.id)) {
        plan.taxonomy.push({
          kind: "category-removed",
          subjectKey: subject.key,
          categoryId: category.id,
        });
      }
    }

    const shared = subject.categories.filter((c) => byId.has(c.id)).map((c) => c.id);
    const diskOrder = diskCategories
      .filter((c) => subject.categories.some((x) => x.id === c.id))
      .map((c) => c.id);
    if (shared.length > 1 && shared.join() !== diskOrder.join()) {
      plan.taxonomy.push({ kind: "category-reordered", subjectKey: subject.key });
    }
  }

  /// Visibility, against the sidecar rather than against nothing.
  planVisibility(db, sidecar, audit, plan);

  return plan;
}

/**
 * What the sidecar should say, and where it currently disagrees.
 *
 * `audit` carries who switched something off and when, keyed the same way. It
 * is passed in rather than read from the snapshot because a ContentSnapshot
 * holds only the boolean — the audit columns belong to the database rows, and
 * threading them through every reader to reach this one function would be a
 * poor trade.
 *
 * The database is the truth about what is switched off; the sidecar is the
 * record that has to survive a rebuild. Entries that already agree produce no
 * change at all, which is what keeps the report to the things somebody needs
 * to act on.
 *
 * EXISTING ENTRIES ARE PRESERVED WHOLE, including who hid it and when. The
 * database has its own audit columns, but a `note` somebody typed into the
 * sidecar by hand has nowhere else to live, and an export that dropped it
 * would quietly punish anyone who used the feature.
 */
function planVisibility(
  db: ContentSnapshot,
  sidecar: Visibility,
  audit: Record<string, VisibilityEntry>,
  plan: ExportPlan
): void {
  // The sidecar wins field by field, so a note somebody typed is never
  // overwritten by the database; the audit columns fill what it doesn't say,
  // which for a newly hidden article is everything.
  const entryFor = (key: string, recorded?: VisibilityEntry): VisibilityEntry => ({
    ...audit[key],
    ...recorded,
  });

  const hiddenArticles: Record<string, VisibilityEntry> = {};
  const disabledCategories: Record<string, VisibilityEntry> = {};
  const live = new Set<string>();

  for (const article of db.articles) {
    const key = visibilityKey(article.subjectKeys[0], article.symptomId);
    live.add(key);
    const recorded = key in sidecar.hiddenArticles;

    if (article.hidden) {
      hiddenArticles[key] = entryFor(key, sidecar.hiddenArticles[key]);
      if (!recorded) {
        plan.visibility.push({
          kind: "article-hidden",
          subjectKey: article.subjectKeys[0],
          symptomId: article.symptomId,
        });
      }
    } else if (recorded) {
      plan.visibility.push({
        kind: "article-unhidden",
        subjectKey: article.subjectKeys[0],
        symptomId: article.symptomId,
      });
    }
  }

  for (const subject of db.subjects) {
    for (const category of subject.categories) {
      const key = visibilityKey(subject.key, category.id);
      live.add(key);
      const recorded = key in sidecar.disabledCategories;

      if (category.disabled) {
        disabledCategories[key] = sidecar.disabledCategories[key] ?? {};
        if (!recorded) {
          plan.visibility.push({
            kind: "category-disabled",
            subjectKey: subject.key,
            categoryId: category.id,
          });
        }
      } else if (recorded) {
        plan.visibility.push({
          kind: "category-enabled",
          subjectKey: subject.key,
          categoryId: category.id,
        });
      }
    }
  }

  // A sidecar line naming something the content no longer has. Reported so it
  // can be dropped, never treated as a reason to fail.
  for (const key of [
    ...Object.keys(sidecar.hiddenArticles),
    ...Object.keys(sidecar.disabledCategories),
  ]) {
    if (!live.has(key)) plan.visibility.push({ kind: "stale-entry", key });
  }

  plan.visibilityFile = { hiddenArticles, disabledCategories };
}

/// ── Reporting ────────────────────────────────────────────────────────────

/** Human-readable summary. Returns lines rather than printing, so the same
 *  function serves the script and any test that wants to assert on it. */
export function describeExportPlan(plan: ExportPlan): string[] {
  const lines: string[] = [];
  const count = (kind: string) =>
    plan.articles.filter((a) => a.kind === kind).length;

  lines.push(
    `articles: ${count("unchanged")} unchanged, ${count("edited")} edited, ` +
      `${count("created")} created, ${count("removed")} removed`
  );

  for (const change of plan.articles) {
    if (change.kind === "unchanged") continue;
    const where = `${change.subjectKey}/${change.symptomId}`;
    lines.push(
      change.kind === "edited"
        ? `  edited   ${where}  (${change.fields.join(", ")})`
        : `  ${change.kind.padEnd(8)} ${where}`
    );
  }

  if (plan.taxonomy.length > 0) {
    lines.push(`taxonomy: ${plan.taxonomy.length} change(s)`);
    for (const change of plan.taxonomy) {
      switch (change.kind) {
        case "symptom-label":
          lines.push(
            `  label    ${change.subjectKey}/${change.symptomId}` +
              `\n             "${change.from}"\n          -> "${change.to}"`
          );
          break;
        case "category-text":
          lines.push(
            `  category ${change.subjectKey}/${change.categoryId} (${change.fields.join(", ")})`
          );
          break;
        default:
          lines.push(`  ${change.kind.padEnd(18)} ${JSON.stringify(change)}`);
      }
    }
  }

  // Its own heading because these are the silent ones: a module has nowhere to
  // record them, so an export that ignored them would seed the content back
  // VISIBLE on a fresh environment and quietly undo somebody's decision. Only
  // the drift from visibility.json appears here — what the sidecar already
  // records is not a change.
  if (plan.visibility.length > 0) {
    lines.push(
      `visibility: ${plan.visibility.length} change(s) to visibility.json`
    );
    for (const change of plan.visibility) {
      switch (change.kind) {
        case "article-hidden":
          lines.push(`  hide     ${change.subjectKey}/${change.symptomId}`);
          break;
        case "article-unhidden":
          lines.push(`  unhide   ${change.subjectKey}/${change.symptomId}`);
          break;
        case "category-disabled":
          lines.push(`  disable  ${change.subjectKey}/${change.categoryId}`);
          break;
        case "category-enabled":
          lines.push(`  enable   ${change.subjectKey}/${change.categoryId}`);
          break;
        case "stale-entry":
          lines.push(`  stale    ${change.key}  (no longer exists — drop the line)`);
          break;
      }
    }
  }

  if (plan.missingImages.length > 0) {
    lines.push(`images: ${plan.missingImages.length} referenced but not in the repository`);
    for (const image of plan.missingImages) {
      lines.push(`  ${image.src}  (${image.subjectKey}/${image.symptomId})`);
    }
  }

  return lines;
}
