import { prisma } from "../db/prisma.js";
import { contentFromDisk } from "../content/troubleshooting/index.js";
import { articleBodySchema } from "../content/troubleshooting/schema.js";
import { reloadTroubleshootingContent } from "../content/troubleshooting/prismaContent.js";

///  +-----------------------------------------------------------------+
///  |        PUSH ONE ARTICLE FROM DISK INTO THE DATABASE             |
///  +-----------------------------------------------------------------+
//
//  The database is the live library and the `.ts` modules are only the seed,
//  which is correct but surprising while WRITING content: you edit a module,
//  restart, and the app shows exactly what it showed before, because seeding
//  only ever runs on an empty database.
//
//  The blunt instrument is `reseedTroubleshootingContent()`, which replaces
//  everything and throws away every edit anybody made in the UI. That is the
//  right tool for resetting a scratch database and the wrong one for "I just
//  rewrote a step".
//
//  SO THIS DOES ONE ARTICLE, AND REFUSES WHEN IT WOULD DESTROY SOMETHING.
//  A row that carries an unpublished draft, or that somebody has published
//  from the editor, holds work that exists nowhere else — the module on disk
//  is by definition older. Those need `--force` and a moment's thought.
//
//    pnpm --filter @asset-checkout/backend exec node --env-file=.env \
//      --import tsx src/scripts/refreshTroubleshootingArticle.ts outlook outlook-slow
///  +-----------------------------------------------------------------+

/** Published by the seeder rather than by a person, so nothing is at stake. */
const SEEDED = "seed";

async function main(): Promise<void> {
  const [subjectKey, symptomId] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const force = process.argv.includes("--force");

  if (!subjectKey || !symptomId) {
    console.error("usage: refreshTroubleshootingArticle.ts <subjectKey> <symptomId> [--force]");
    process.exitCode = 1;
    return;
  }

  const onDisk = contentFromDisk().articles.find(
    (a) => a.symptomId === symptomId && a.subjectKeys.includes(subjectKey as never)
  );

  if (!onDisk) {
    console.error(`No module on disk for ${subjectKey}/${symptomId}`);
    process.exitCode = 1;
    return;
  }

  const membership = await prisma.troubleshootingArticleSubject.findUnique({
    where: { subjectKey_symptomSlug: { subjectKey, symptomSlug: symptomId } },
    include: { article: true },
  });

  // A brand new module has no row yet, and a full reseed to introduce one
  // would discard every UI edit in the database. Created here instead, exactly
  // as the seeder would, with a membership row per subject it is listed under.
  if (!membership) {
    const { symptomId: _s, subjectKeys, hidden: _h, ...body } = onDisk as Record<
      string,
      unknown
    >;

    await prisma.troubleshootingArticle.create({
      data: {
        symptomSlug: symptomId,
        body: JSON.stringify(articleBodySchema.parse(body)),
        publishedBy: SEEDED,
        subjects: {
          create: (subjectKeys as string[]).map((key) => ({
            subjectKey: key,
            symptomSlug: symptomId,
          })),
        },
      },
    });

    await reloadTroubleshootingContent();
    console.log(
      `Created ${subjectKey}/${symptomId} from disk` +
        ((subjectKeys as string[]).length > 1
          ? ` (listed under ${(subjectKeys as string[]).join(", ")})`
          : "")
    );
    return;
  }

  const { article } = membership;

  // The guard that makes this safe to run without thinking.
  const risks: string[] = [];
  if (article.draftBody !== null) risks.push("it has unpublished changes");
  if (article.publishedBy && article.publishedBy !== SEEDED) {
    risks.push(`it was last published by ${article.publishedBy}`);
  }

  if (risks.length > 0 && !force) {
    console.error(
      `Refusing to overwrite ${subjectKey}/${symptomId}: ${risks.join(", ")}.\n` +
        `  The database copy is newer than the module by definition. Re-run with ` +
        `--force only if you are sure the module is what you want.`
    );
    process.exitCode = 1;
    return;
  }

  // Peeled the same way toRows does — `hidden` is ours, not the document's,
  // and the identity fields are relational rather than part of the body.
  const { symptomId: _s, subjectKeys: _k, hidden: _h, ...body } = onDisk as Record<
    string,
    unknown
  >;

  await prisma.troubleshootingArticle.update({
    where: { id: article.id },
    data: { body: JSON.stringify(articleBodySchema.parse(body)) },
  });

  await reloadTroubleshootingContent();

  console.log(
    `Refreshed ${subjectKey}/${symptomId} from disk` +
      (risks.length > 0 ? ` (forced over: ${risks.join(", ")})` : "")
  );
}

main()
  .catch((err) => {
    console.error("refresh failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
