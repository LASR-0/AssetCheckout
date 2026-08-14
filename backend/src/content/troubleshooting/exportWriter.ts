import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import type { ContentSnapshot } from "./repository.js";
import type { ExportPlan } from "./exportPlan.js";
import { articleModulesByKey, moduleKey } from "./articleModules.js";
import {
  rewriteArticleModule,
  newArticleModule,
  archivedArticleModule,
} from "./serialise.js";
import {
  readRegistry,
  addToRegistry,
  removeFromRegistry,
  deriveAlias,
} from "./registry.js";
import { serialiseVisibility, visibilityPath } from "./visibility.js";
import {
  editSymptomLabel,
  editCategoryText,
  appendSymptom,
  categoryBlock,
  TaxonomyEditRefused,
} from "./taxonomySource.js";
import type { Article } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |        ACTUALLY WRITING THE SEED BACK                           |
///  +-----------------------------------------------------------------+
//
//  Everything up to here reported. This is the half that touches files, and it
//  is built to be reviewable rather than clever:
//
//  IT REFUSES TO RUN ON A DIRTY TREE. `git diff` is then always the review
//  surface and `git checkout .` is always the undo. A tool that writes source
//  files earns that requirement.
//
//  IT WRITES NOTHING IT CANNOT WRITE COMPLETELY. Anything ambiguous — a new
//  category among hand-commented siblings, a comment whose anchor was deleted
//  — is collected as a HANDOVER and reported with the text to paste, rather
//  than half-applied. A partial write is worse than none, because the diff
//  looks finished.
//
//  IT VERIFIES ITS OWN WORK. `tsc --noEmit` and the content tests run
//  afterwards as child processes. If either fails the report says so and says
//  how to revert, because the failure is in files a person now has to look at.
///  +-----------------------------------------------------------------+

const CONTENT_DIR = dirname(fileURLToPath(import.meta.url));
const ARTICLES_DIR = join(CONTENT_DIR, "articles");
const SUBJECTS_DIR = join(CONTENT_DIR, "subjects");
const REPOSITORY = join(CONTENT_DIR, "repository.ts");
const BACKEND_ROOT = join(CONTENT_DIR, "..", "..", "..");

//  Outside src/ on purpose. An archived article whose symptom is gone from the
//  taxonomy cannot satisfy content.test.ts, and under src/ it would also be
//  compiled and shipped. Here it is inert, and moving a file back into src/ is
//  the recovery path.
const ARCHIVE_DIR = join(BACKEND_ROOT, "content-archive", "troubleshooting");

/** One deleted article, as the exporter needs it. */
export type ArchivedForExport = {
  id: number;
  subjectKey: string;
  symptomId: string;
  label: string;
  categoryName: string;
  position: number;
  deletedAt: string;
  deletedBy: string | null;
  reason: string | null;
  linksAtDeletion: number;
  /** The published document, or the draft if it was never published. */
  article: Article;
  wasPublished: boolean;
};

export type WriteResult = {
  /** Paths written, relative to the backend package. */
  written: string[];
  /** Things a person has to place by hand, with the text to paste. */
  handovers: { what: string; why: string; paste?: string }[];
  /** Anything that failed outright. Non-empty means the tree needs review. */
  failures: string[];
  /** Archive rows successfully materialised, to be stamped as exported. */
  exportedArchiveIds?: number[];
};

/** `phone/camera.ts` → `camera`. The file's own name, which is not the slug —
 *  twelve modules drop the subject prefix their folder already carries. */
function moduleBasename(label: string): string {
  return label.split("/")[1].replace(/\.ts$/, "");
}

/** Whether the working tree is clean, so a diff means only what this wrote. */
export function treeIsClean(): boolean {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: BACKEND_ROOT,
    encoding: "utf8",
  });
  return status.trim() === "";
}

function articleByKey(snapshot: ContentSnapshot): Map<string, Article> {
  const map = new Map<string, Article>();
  for (const article of snapshot.articles) {
    const { hidden, ...rest } = article as Article & { hidden?: boolean };
    map.set(moduleKey(article.subjectKeys[0], article.symptomId), rest as Article);
  }
  return map;
}

/**
 * Apply an export plan to the source tree.
 *
 * Ordered so the cheapest, safest edits land first and the registry — the one
 * file whose corruption stops everything loading — is touched last.
 */
export async function writeExport(
  plan: ExportPlan,
  db: ContentSnapshot,
  archived: ArchivedForExport[] = []
): Promise<WriteResult> {
  const result: WriteResult = { written: [], handovers: [], failures: [] };

  const modules = await articleModulesByKey();
  const articles = articleByKey(db);

  /// 1. Edited articles — rewritten in place, comments replayed.
  for (const change of plan.articles) {
    if (change.kind !== "edited") continue;

    const key = moduleKey(change.subjectKey, change.symptomId);
    const module = modules.get(key);
    const article = articles.get(key);
    if (!module || !article) {
      result.failures.push(`${key}: classified as edited but its file or row is missing`);
      continue;
    }

    try {
      const rewritten = await rewriteArticleModule(module.source, article);
      await writeFile(module.path, rewritten);
      result.written.push(`src/content/troubleshooting/articles/${module.label}`);
    } catch (err) {
      // An orphaned comment lands here: its anchor is gone and there is no
      // honest place to put it, so the file is left exactly as it was.
      result.handovers.push({
        what: `${key} was not rewritten`,
        why: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /// 2. New articles — a file, then a registry entry.
  const registry = readRegistry(await readFile(REPOSITORY, "utf8"));
  const taken = new Set(registry.imports.map((i) => i.name));

  for (const change of plan.articles) {
    if (change.kind !== "created") continue;

    const key = moduleKey(change.subjectKey, change.symptomId);
    const article = articles.get(key);
    if (!article) {
      result.failures.push(`${key}: classified as created but its row is missing`);
      continue;
    }

    const alias = deriveAlias(change.subjectKey, change.symptomId, taken);
    taken.add(alias);

    const relative = `${change.subjectKey}/${change.symptomId}.ts`;
    const heading = `${change.subjectKey} — ${change.symptomId.replace(/-/g, " ")}`;

    try {
      await writeFile(
        join(ARTICLES_DIR, relative),
        await newArticleModule(alias, article, heading)
      );
      result.written.push(`src/content/troubleshooting/articles/${relative}`);

      const before = await readFile(REPOSITORY, "utf8");
      await writeFile(
        REPOSITORY,
        addToRegistry(before, { name: alias, path: `./articles/${change.subjectKey}/${change.symptomId}.js` })
      );
      result.written.push("src/content/troubleshooting/repository.ts");

      result.handovers.push({
        what: `${key} was registered as \`${alias}\``,
        why:
          "The import aliases are hand-chosen and this one was derived " +
          "mechanically. Rename it if you have a better one, and replace the " +
          "stub banner at the top of the new file.",
      });
    } catch (err) {
      result.failures.push(
        `${key}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /// 3. Deleted articles — archived out of src/, then unregistered.
  //
  //  In this order deliberately. If the archive write fails, the module is
  //  still registered and still working; if it succeeded and the unregister
  //  fails, the file exists in two places, which is untidy but loses nothing.
  //  The reverse order can lose the only copy.
  const exported: number[] = [];

  for (const entry of archived) {
    const relative = `${entry.subjectKey}/${entry.symptomId}.ts`;

    try {
      await mkdir(join(ARCHIVE_DIR, entry.subjectKey), { recursive: true });
      await writeFile(
        join(ARCHIVE_DIR, relative),
        await archivedArticleModule(entry.article, entry)
      );
      result.written.push(`content-archive/troubleshooting/${relative}`);

      // The live module, if it ever had one. An article created and deleted
      // between two exports never reached the source tree at all.
      const module = modules.get(moduleKey(entry.subjectKey, entry.symptomId));
      if (module) {
        const before = await readFile(REPOSITORY, "utf8");
        const alias = readRegistry(before).imports.find(
          (i) => i.path === `./articles/${entry.subjectKey}/${moduleBasename(module.label)}.js`
        );

        if (alias) {
          await writeFile(REPOSITORY, removeFromRegistry(before, alias.name));
          result.written.push("src/content/troubleshooting/repository.ts");
        }

        await rm(module.path);
        result.written.push(`removed src/content/troubleshooting/articles/${module.label}`);
      }

      exported.push(entry.id);
    } catch (err) {
      result.failures.push(
        `archive ${entry.subjectKey}/${entry.symptomId}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  result.exportedArchiveIds = exported;

  /// 4. Taxonomy — edited in place, never regenerated. See taxonomySource.ts.
  await writeTaxonomy(plan, db, result);

  /// 5. The visibility sidecar, which a `.ts` module cannot express at all.
  if (plan.visibility.length > 0) {
    await writeFile(visibilityPath(), serialiseVisibility(plan.visibilityFile));
    result.written.push("src/content/troubleshooting/visibility.json");
  }

  return result;
}

/**
 * Subject modules, edited surgically.
 *
 * Label and category-text changes are one-string replacements. New symptoms
 * are appended. New categories are NOT written: where one belongs among
 * siblings carrying editorial comments is a judgement, so the block is handed
 * over instead.
 */
async function writeTaxonomy(
  plan: ExportPlan,
  db: ContentSnapshot,
  result: WriteResult
): Promise<void> {
  // Grouped by subject so each file is read once, edited in memory, written
  // once — rather than re-reading between every label change.
  const bySubject = new Map<string, typeof plan.taxonomy>();
  for (const change of plan.taxonomy) {
    const list = bySubject.get(change.subjectKey);
    if (list) list.push(change);
    else bySubject.set(change.subjectKey, [change]);
  }

  for (const [subjectKey, changes] of bySubject) {
    const path = join(SUBJECTS_DIR, `${subjectKey}.ts`);
    let source: string;
    try {
      source = await readFile(path, "utf8");
    } catch {
      result.failures.push(`no subject module for "${subjectKey}"`);
      continue;
    }

    const before = source;

    for (const change of changes) {
      try {
        switch (change.kind) {
          case "symptom-label": {
            const categoryId = categoryOf(db, subjectKey, change.symptomId);
            if (!categoryId) throw new TaxonomyEditRefused("its category is unclear");
            source = await editSymptomLabel(source, categoryId, change.symptomId, change.to);
            break;
          }

          case "category-text": {
            const category = categoryIn(db, subjectKey, change.categoryId);
            if (!category) throw new TaxonomyEditRefused("the category is missing");
            for (const field of change.fields as ("glyph" | "name" | "blurb")[]) {
              source = await editCategoryText(source, change.categoryId, field, category[field]);
            }
            break;
          }

          case "symptom-added": {
            const label = labelOf(db, subjectKey, change.symptomId) ?? change.label;
            source = await appendSymptom(source, change.categoryId, {
              id: change.symptomId,
              label,
            });
            break;
          }

          case "category-added": {
            const category = categoryIn(db, subjectKey, change.categoryId);
            result.handovers.push({
              what: `a new category "${change.name}" in ${subjectKey}`,
              why:
                "Where a category goes among siblings that carry editorial " +
                "comments is an editorial decision. Paste this into the " +
                `categories array in subjects/${subjectKey}.ts.`,
              paste: category
                ? await categoryBlock({
                    id: change.categoryId,
                    glyph: category.glyph,
                    name: category.name,
                    blurb: category.blurb,
                    symptoms: category.symptoms.map((s) => ({ id: s.id, label: s.label })),
                  })
                : undefined,
            });
            break;
          }

          case "symptom-removed":
            // The entry above a symptom is often a floating `// Paired: …`
            // comment explaining THAT entry. Deleting the line and leaving the
            // comment behind silently attaches somebody's reasoning to
            // whatever follows, which is worse than not editing the file.
            result.handovers.push({
              what: `remove "${change.symptomId}" from subjects/${subjectKey}.ts`,
              why:
                `It is in the "${change.categoryId}" category. Check whether the ` +
                "comment above it — if there is one — explains that entry and " +
                "should go with it, or explains the next one and should stay.",
            });
            break;

          case "category-removed":
            result.handovers.push({
              what: `remove the "${change.categoryId}" category from subjects/${subjectKey}.ts`,
              why:
                "It was deleted in the editor and is already empty — the whole " +
                "block can go. Done by hand because the comments between " +
                "category blocks belong to the gaps rather than to any node, " +
                "so nothing here can tell which one a removal would orphan.",
            });
            break;

          default:
            // Reordering: the array order IS the reading order, and re-emitting
            // the array to reorder it would reflow a file that is deliberately
            // not Prettier-clean. See taxonomySource.ts.
            result.handovers.push({
              what: `${change.kind} in ${subjectKey}`,
              why: `Not applied automatically. Adjust subjects/${subjectKey}.ts by hand.`,
            });
        }
      } catch (err) {
        result.handovers.push({
          what: `${change.kind} in ${subjectKey}`,
          why: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (source !== before) {
      await writeFile(path, source);
      result.written.push(`src/content/troubleshooting/subjects/${subjectKey}.ts`);
    }
  }
}

function categoryIn(snapshot: ContentSnapshot, subjectKey: string, categoryId: string) {
  return snapshot.subjects
    .find((s) => s.key === subjectKey)
    ?.categories.find((c) => c.id === categoryId);
}

function categoryOf(
  snapshot: ContentSnapshot,
  subjectKey: string,
  symptomId: string
): string | null {
  const subject = snapshot.subjects.find((s) => s.key === subjectKey);
  const category = subject?.categories.find((c) =>
    c.symptoms.some((symptom) => symptom.id === symptomId)
  );
  return category?.id ?? null;
}

function labelOf(
  snapshot: ContentSnapshot,
  subjectKey: string,
  symptomId: string
): string | null {
  const subject = snapshot.subjects.find((s) => s.key === subjectKey);
  for (const category of subject?.categories ?? []) {
    const symptom = category.symptoms.find((s) => s.id === symptomId);
    if (symptom) return symptom.label;
  }
  return null;
}

/**
 * Typecheck and re-validate the corpus after writing.
 *
 * Run as child processes rather than in-process: the content modules are
 * already imported into this process and would be served from the module
 * cache, so an in-process check would validate the OLD text and pass while the
 * files on disk were broken.
 */
export function verifyWrittenTree(): { ok: boolean; output: string } {
  try {
    execFileSync("node", ["node_modules/typescript/bin/tsc", "--noEmit"], {
      cwd: BACKEND_ROOT,
      encoding: "utf8",
      stdio: "pipe",
    });

    execFileSync(
      "node",
      [
        "node_modules/vitest/vitest.mjs",
        "run",
        "src/content/troubleshooting/content.test.ts",
      ],
      { cwd: BACKEND_ROOT, encoding: "utf8", stdio: "pipe" }
    );

    return { ok: true, output: "" };
  } catch (err) {
    const shell = err as { stdout?: string; stderr?: string };
    return { ok: false, output: `${shell.stdout ?? ""}${shell.stderr ?? ""}`.trim() };
  }
}
