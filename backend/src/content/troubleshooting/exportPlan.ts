import { contentFromDisk, type ContentSnapshot } from "./repository.js";
import { articlesDiffer } from "./serialise.js";
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

/** State an admin set that a `.ts` module has nowhere to record. */
export type VisibilityChange =
  | { kind: "article-hidden"; subjectKey: string; symptomId: string }
  | { kind: "category-disabled"; subjectKey: string; categoryId: string };

export type ExportPlan = {
  articles: ArticleChange[];
  taxonomy: TaxonomyChange[];
  visibility: VisibilityChange[];
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
  out: { taxonomy: TaxonomyChange[]; visibility: VisibilityChange[] }
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

  if (db.disabled) {
    out.visibility.push({ kind: "category-disabled", subjectKey, categoryId: db.id });
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
  imageExists: (src: string) => boolean = () => true
): Promise<ExportPlan> {
  const plan: ExportPlan = {
    articles: [],
    taxonomy: [],
    visibility: [],
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

    if (article.hidden) {
      plan.visibility.push({ kind: "article-hidden", subjectKey, symptomId });
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
        if (category.disabled) {
          plan.visibility.push({
            kind: "category-disabled",
            subjectKey: subject.key,
            categoryId: category.id,
          });
        }
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

  return plan;
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

  // These two get their own heading because they are the silent ones: a module
  // has nowhere to record them, so an export that ignored them would seed the
  // content back VISIBLE on a fresh environment and quietly undo the decision.
  if (plan.visibility.length > 0) {
    lines.push(
      `visibility: ${plan.visibility.length} setting(s) with no representation in a .ts module`
    );
    for (const change of plan.visibility) {
      lines.push(
        change.kind === "article-hidden"
          ? `  hidden   ${change.subjectKey}/${change.symptomId}`
          : `  disabled ${change.subjectKey}/${change.categoryId}`
      );
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
