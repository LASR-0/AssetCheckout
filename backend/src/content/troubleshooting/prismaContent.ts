import { prisma } from "../../db/prisma.js";
import { setRepositoryContent, type ContentSnapshot } from "./repository.js";
import { fromRows } from "./rows.js";

///  +-----------------------------------------------------------------+
///  |          THE LIBRARY, LOADED FROM THE DATABASE                  |
///  +-----------------------------------------------------------------+
//
//  The other half of the seam. repository.ts owns the query logic and knows
//  nothing about storage; this file knows about storage and nothing about
//  querying, and hands the result over through `setRepositoryContent`.
//
//  A SNAPSHOT, NOT A CACHE. Every read of this library is "give me the whole
//  taxonomy" or "scan every symptom" — search and the picker both walk
//  everything — so holding it in memory is the natural shape of the data
//  rather than an optimisation bolted on afterwards. It is 60 articles.
//
//  INVALIDATION IS DETERMINISTIC AND HAS NO TTL. Writes go through the
//  content service, which reloads when it finishes; nobody else owns this
//  data, so there is no staleness to expire. A TTL would only create a window
//  in which an admin's publish had not appeared yet, which is precisely the
//  bug it would look like it was preventing.
//
//  ONE PROCESS. The snapshot lives in this process's memory, which is correct
//  while the deployment is a single container running a single node process.
//  If that ever becomes several, the fix is a version counter in `Setting`
//  bumped on write and checked on a short interval — not worth building for a
//  shape the deployment does not have.
///  +-----------------------------------------------------------------+

/**
 * Read the whole library out of the database.
 *
 * A row that fails validation is SKIPPED AND LOGGED rather than thrown. This
 * is the opposite of how the disk loader behaves, and deliberately: a bad
 * module is a code bug that should stop the build, but a bad row is
 * user-edited data, and one malformed article must not take the whole
 * troubleshooting section down for everybody else. The publish gate is what
 * keeps a bad row from being written in the first place.
 */
export async function loadContentFromDatabase(): Promise<ContentSnapshot> {
  const [subjects, categories, symptoms, articles] = await Promise.all([
    prisma.troubleshootingSubject.findMany({ orderBy: { position: "asc" } }),
    prisma.troubleshootingCategory.findMany({ orderBy: { position: "asc" } }),
    prisma.troubleshootingSymptom.findMany({
      orderBy: { position: "asc" },
      include: { category: { select: { slug: true } } },
    }),
    prisma.troubleshootingArticle.findMany({
      include: { subjects: { select: { subjectKey: true } } },
    }),
  ]);

  const skipped: string[] = [];

  const content = fromRows(
    {
      subjects: subjects.map((s) => ({
        key: s.key,
        kind: s.kind,
        position: s.position,
      })),
      categories: categories.map((c) => ({
        subjectKey: c.subjectKey,
        slug: c.slug,
        glyph: c.glyph,
        name: c.name,
        blurb: c.blurb,
        position: c.position,
        disabled: c.disabled,
      })),
      symptoms: symptoms.map((s) => ({
        subjectKey: s.subjectKey,
        categorySlug: s.category.slug,
        slug: s.slug,
        label: s.label,
        position: s.position,
      })),
      articles: articles.map((a) => ({
        symptomSlug: a.symptomSlug,
        // The draft is never read here. The public library serves `body`, and
        // that is the whole reason draft lives in its own column: serving
        // unpublished text is not a mistake this code can make.
        body: a.body,
        hidden: a.hidden,
        subjectKeys: a.subjects.map((m) => m.subjectKey),
      })),
    },
    (symptomSlug, err) => {
      skipped.push(symptomSlug);
      console.error(
        `[troubleshooting] article "${symptomSlug}" failed validation and was skipped:`,
        err instanceof Error ? err.message : err
      );
    }
  );

  if (skipped.length > 0) {
    console.error(
      `[troubleshooting] ${skipped.length} article(s) skipped: ${skipped.join(", ")}`
    );
  }

  return content;
}

/**
 * Reload the served library from the database.
 *
 * Called once at boot, and by the content service after every write. Routes
 * never call it — a route that forgot would leave an admin staring at their
 * own unapplied edit, so the obligation sits with the one place that writes.
 */
export async function reloadTroubleshootingContent(): Promise<void> {
  setRepositoryContent(await loadContentFromDatabase());
}
