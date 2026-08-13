import { prisma } from "../db/prisma.js";
import { contentFromDisk } from "../content/troubleshooting/index.js";
import { toRows, type ContentRows } from "../content/troubleshooting/rows.js";

///  +-----------------------------------------------------------------+
///  |         SEEDING THE LIBRARY FROM THE AUTHORED MODULES           |
///  +-----------------------------------------------------------------+
//
//  The `.ts` modules under content/troubleshooting stay in the tree as the
//  seed of record. This writes them into the tables once, and after that the
//  rows are the truth and editing a module does nothing.
//
//  IT RUNS AT BOOT, NOT ONLY AS A SCRIPT. `prisma migrate deploy` carries
//  schema, never data — so a fresh production deploy with a manual-only seed
//  would come up with an empty library and nobody would notice until somebody
//  opened Troubleshooting. This is the same posture `ensureDefaults()` takes
//  for settings, and for the same reason.
//
//  SEEDS ONLY WHEN THE TABLES ARE EMPTY. Not a marker in `Setting` — a marker
//  and the tables can disagree, and "is the library populated" is a question
//  the tables answer directly.
//
//  IT LOGS EITHER WAY, and the skip line earns its place: after the swap,
//  editing an article module has no effect, which is the exact inverse of the
//  confusion this project already recorded once about content needing a
//  restart. A boot line saying "seed skipped" is the cheapest possible answer
//  to "why isn't my edit showing".
///  +-----------------------------------------------------------------+

/** Insert a whole library. Assumes the tables are empty. */
async function insertRows(rows: ContentRows): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.troubleshootingSubject.createMany({
      data: rows.subjects.map((s) => ({
        key: s.key,
        kind: s.kind,
        position: s.position,
      })),
    });

    await tx.troubleshootingCategory.createMany({ data: rows.categories });

    // Symptoms need their category's generated id, so the slugs are resolved
    // after the categories exist rather than guessed at.
    const categories = await tx.troubleshootingCategory.findMany({
      select: { id: true, subjectKey: true, slug: true },
    });
    const categoryId = new Map(
      categories.map((c) => [`${c.subjectKey}/${c.slug}`, c.id])
    );

    await tx.troubleshootingSymptom.createMany({
      data: rows.symptoms.map((symptom) => ({
        subjectKey: symptom.subjectKey,
        categoryId: categoryId.get(`${symptom.subjectKey}/${symptom.categorySlug}`)!,
        slug: symptom.slug,
        label: symptom.label,
        position: symptom.position,
      })),
    });

    // Articles one at a time, with their memberships nested. createMany can't
    // nest, and 62 inserts inside one transaction is nothing.
    for (const article of rows.articles) {
      await tx.troubleshootingArticle.create({
        data: {
          symptomSlug: article.symptomSlug,
          body: article.body,
          hidden: article.hidden,
          publishedBy: "seed",
          subjects: {
            create: article.subjectKeys.map((subjectKey) => ({
              subjectKey,
              symptomSlug: article.symptomSlug,
            })),
          },
        },
      });
    }
  });
}

/**
 * Populate the content tables from the authored modules if, and only if, they
 * are empty. Safe to call on every boot.
 */
export async function ensureTroubleshootingContent(): Promise<void> {
  const [subjects, articles] = await Promise.all([
    prisma.troubleshootingSubject.count(),
    prisma.troubleshootingArticle.count(),
  ]);

  if (subjects > 0 || articles > 0) {
    console.log(
      `[troubleshooting] content present: ${subjects} subjects, ${articles} articles — seed skipped`
    );
    return;
  }

  const rows = toRows(contentFromDisk());
  console.log(
    `[troubleshooting] seeding content from disk modules: ` +
      `${rows.subjects.length} subjects, ${rows.articles.length} articles`
  );

  await insertRows(rows);
}

/**
 * Replace the entire library with the disk modules, discarding every admin
 * edit and every draft.
 *
 * FOR DEVELOPMENT, while the `.ts` corpus is still being iterated on. In
 * production this destroys work that exists nowhere else, which is why it
 * refuses to run without TROUBLESHOOTING_ALLOW_RESEED=1 — two deliberate acts
 * rather than one.
 */
export async function reseedTroubleshootingContent(): Promise<void> {
  if (process.env.TROUBLESHOOTING_ALLOW_RESEED !== "1") {
    throw new Error(
      "Reseeding replaces every article with the disk copy and discards all " +
        "admin edits and drafts. Set TROUBLESHOOTING_ALLOW_RESEED=1 to allow it."
    );
  }

  const rows = toRows(contentFromDisk());

  await prisma.$transaction([
    // Memberships and symptoms cascade from their parents, but being explicit
    // costs nothing and does not depend on the cascade staying configured.
    prisma.troubleshootingArticleSubject.deleteMany(),
    prisma.troubleshootingArticle.deleteMany(),
    prisma.troubleshootingSymptom.deleteMany(),
    prisma.troubleshootingCategory.deleteMany(),
    prisma.troubleshootingSubject.deleteMany(),
  ]);

  console.warn(
    `[troubleshooting] RESEED: library replaced from disk modules — ` +
      `${rows.articles.length} articles, all drafts and edits discarded`
  );

  await insertRows(rows);
}
