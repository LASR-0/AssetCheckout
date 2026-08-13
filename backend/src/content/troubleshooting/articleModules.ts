import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findArticleDeclaration } from "./comments.js";

///  +-----------------------------------------------------------------+
///  |        WHICH FILE HOLDS WHICH ARTICLE                           |
///  +-----------------------------------------------------------------+
//
//  The exporter has an article and needs the file to rewrite. That mapping
//  looks derivable and is not.
//
//  A FILENAME IS NOT A SYMPTOM SLUG. Twelve of the sixty modules drop the
//  subject prefix the folder already carries — `monitor/wont-turn-on.ts` holds
//  `monitor-wont-turn-on`, `laptop/apps-slow.ts` holds `laptop-apps-slow` — so
//  `articles/<subject>/<symptomId>.ts` misses a fifth of the corpus. Worse, it
//  misses them by reporting "no file", which an exporter would reasonably treat
//  as "this article is new" and answer by creating a SECOND file for an article
//  that already has one.
//
//  So the directory is scanned and each file asked what it holds, rather than
//  the path being guessed from the id. Naming stays a human's choice, which is
//  how it should be for a folder people read.
//
//  The subject comes from the folder, not from `subjectKeys[0]`, for the same
//  reason: the folder is where the file actually is.
///  +-----------------------------------------------------------------+

const ARTICLES_DIR = join(dirname(fileURLToPath(import.meta.url)), "articles");

export type ArticleModule = {
  /** Absolute path to the `.ts` file. */
  path: string;
  /** Path relative to the articles directory, for reporting: `phone/camera.ts`. */
  label: string;
  /** The folder it sits in — `phone`, `laptop`. */
  subjectKey: string;
  /** The `symptomId` the file declares. */
  symptomId: string;
  /** The identifier the article is bound to, e.g. `noDisplayDock`. Hand-chosen
   *  and not derivable, so it is read rather than reconstructed. */
  constName: string;
  source: string;
};

/**
 * The identity used to match a database article to its file.
 *
 * First subject plus slug, not the slug alone: "wont-turn-on" is one article
 * under Laptops and a different one under Desktops.
 */
export function moduleKey(subjectKey: string, symptomId: string): string {
  return `${subjectKey}/${symptomId}`;
}

/** Every article module on disk, read and identified. */
export async function loadArticleModules(): Promise<ArticleModule[]> {
  const modules: ArticleModule[] = [];

  for (const entry of await readdir(ARTICLES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    for (const file of await readdir(join(ARTICLES_DIR, entry.name))) {
      if (!file.endsWith(".ts")) continue;

      const path = join(ARTICLES_DIR, entry.name, file);
      const source = await readFile(path, "utf8");

      const declaration = findArticleDeclaration(source);
      const symptomId = symptomIdOf(source);
      // Skipped rather than thrown on: a helper file that isn't an article
      // module is a reasonable thing for somebody to add to these folders.
      if (!declaration || !symptomId) continue;

      modules.push({
        path,
        label: `${entry.name}/${file}`,
        subjectKey: entry.name,
        symptomId,
        constName: declaration.constName,
        source,
      });
    }
  }

  return modules.sort((a, b) => a.label.localeCompare(b.label));
}

/** Keyed by `<subject>/<symptomId>`, ready to look an article's file up. */
export async function articleModulesByKey(): Promise<Map<string, ArticleModule>> {
  const modules = await loadArticleModules();
  return new Map(modules.map((m) => [moduleKey(m.subjectKey, m.symptomId), m]));
}

/**
 * The `symptomId` a module declares.
 *
 * Read from the text rather than by importing the module: this runs in tooling
 * that must work on files that may not currently compile — including, after a
 * bad edit, the very files it exists to fix.
 */
function symptomIdOf(source: string): string | null {
  return /\bsymptomId:\s*"([^"]+)"/.exec(source)?.[1] ?? null;
}
