import { prisma } from "../db/prisma.js";
import { loadContentFromDatabase } from "../content/troubleshooting/prismaContent.js";
import {
  planExport,
  describeExportPlan,
} from "../content/troubleshooting/exportPlan.js";
import { troubleshootingImageExists } from "../services/troubleshootingImages.js";
import {
  serialiseVisibility,
  visibilityPath,
  visibilityKey,
  type VisibilityEntry,
} from "../content/troubleshooting/visibility.js";
import {
  writeExport,
  treeIsClean,
  verifyWrittenTree,
  type ArchivedForExport,
} from "../content/troubleshooting/exportWriter.js";
import { articleSchema } from "../content/troubleshooting/schema.js";

///  +-----------------------------------------------------------------+
///  |        EXPORT THE LIBRARY BACK TO THE SEED MODULES              |
///  +-----------------------------------------------------------------+
//
//  The database is the library; the `.ts` modules under content/troubleshooting
//  are the seed a fresh environment is built from. Anything written or edited
//  in the UI lives only in the database until this runs, which means a rebuild
//  would silently discard it.
//
//  REPORTING IS THE DEFAULT. Run with no arguments and it prints what it would
//  do and writes nothing, so `--write` is always something somebody chose.
//
//  `--write` REQUIRES A CLEAN GIT TREE, so `git diff` is the review surface and
//  `git checkout .` is the undo. It writes nothing it cannot write completely:
//  a new category among hand-commented siblings, or a comment whose anchor was
//  deleted, is handed over with the text to paste rather than half-applied.
//  Afterwards it typechecks and re-validates the corpus, and says how to revert
//  if either fails.
//
//  Run against production data by copying the database down first — the
//  export writes source files, so it belongs on a developer's machine:
//
//    scp <prod>:/assetc/data/database.db /tmp/prod.db
//    DATABASE_URL=file:/tmp/prod.db pnpm --filter @asset-checkout/backend \
//      exec node --env-file=.env --import tsx \
//      src/scripts/exportTroubleshootingContent.ts
//
//  Or against the local database:
//
//    pnpm --filter @asset-checkout/backend exec node --env-file=.env \
//      --import tsx src/scripts/exportTroubleshootingContent.ts
///  +-----------------------------------------------------------------+

/**
 * Who switched each thing off, and when, from the database's audit columns.
 *
 * Read here rather than inside the planner because a ContentSnapshot carries
 * only the boolean — these columns belong to the rows, and the sidecar is the
 * one place they need to survive to. A hidden article whose entry says nothing
 * about who hid it is a line nobody can act on six months later.
 */
async function visibilityAudit(): Promise<Record<string, VisibilityEntry>> {
  const audit: Record<string, VisibilityEntry> = {};

  const entry = (at: Date | null, by: string | null): VisibilityEntry => ({
    ...(at ? { at: at.toISOString().slice(0, 10) } : {}),
    ...(by ? { by } : {}),
  });

  // Registered under EVERY subject the article lists, not just one. Which
  // subject the sidecar keys on is decided by `subjectKeys[0]` after
  // canonicalisation, and that order is not a database fact — the join table
  // has no position column — so guessing it here would miss.
  const hidden = await prisma.troubleshootingArticleSubject.findMany({
    where: { article: { hidden: true } },
    select: {
      subjectKey: true,
      symptomSlug: true,
      article: { select: { hiddenAt: true, hiddenBy: true } },
    },
  });

  for (const row of hidden) {
    audit[visibilityKey(row.subjectKey, row.symptomSlug)] = entry(
      row.article.hiddenAt,
      row.article.hiddenBy
    );
  }

  const categories = await prisma.troubleshootingCategory.findMany({
    where: { disabled: true },
    select: { subjectKey: true, slug: true, disabledAt: true, disabledBy: true },
  });

  for (const category of categories) {
    audit[visibilityKey(category.subjectKey, category.slug)] = entry(
      category.disabledAt,
      category.disabledBy
    );
  }

  return audit;
}

/**
 * Deleted articles that have not yet been written out to content-archive/.
 *
 * `exportedAt` is the marker, so re-running does not rewrite files that are
 * already committed — and a row whose write failed is picked up next time
 * rather than being silently skipped forever.
 *
 * A row that will not parse is REPORTED AND SKIPPED, never dropped: it stays
 * in the table with `exportedAt` null, so nothing is lost and the next run
 * complains again.
 */
async function pendingArchives(): Promise<{
  entries: ArchivedForExport[];
  unreadable: string[];
}> {
  const rows = await prisma.troubleshootingArchivedArticle.findMany({
    where: { exportedAt: null },
    orderBy: { deletedAt: "asc" },
  });

  const entries: ArchivedForExport[] = [];
  const unreadable: string[] = [];

  for (const row of rows) {
    // The published text if there was any, otherwise whatever was being
    // written when it was deleted. An unfinished article is still worth
    // keeping — it is somebody's work and it exists nowhere else.
    const json = row.body ?? row.draftBody;
    if (!json) {
      unreadable.push(`${row.subjectKey}/${row.symptomSlug}: no body or draft`);
      continue;
    }

    const parsed = articleSchema.safeParse({
      symptomId: row.symptomSlug,
      subjectKeys: JSON.parse(row.subjectKeys),
      ...JSON.parse(json),
    });

    if (!parsed.success) {
      unreadable.push(
        `${row.subjectKey}/${row.symptomSlug}: ${parsed.error.issues[0]?.message ?? "invalid"}`
      );
      continue;
    }

    entries.push({
      id: row.id,
      subjectKey: row.subjectKey,
      symptomId: row.symptomSlug,
      label: row.label,
      categoryName: row.categoryName,
      position: row.position,
      deletedAt: row.deletedAt.toISOString(),
      deletedBy: row.deletedBy,
      reason: row.reason,
      linksAtDeletion: row.linksAtDeletion,
      article: parsed.data,
      wasPublished: row.body !== null,
    });
  }

  return { entries, unreadable };
}

async function main(): Promise<void> {
  const db = await loadContentFromDatabase();

  // The images check is real rather than assumed: an admin upload lands in the
  // images directory, which is a production volume in production, so a module
  // can reference a file that is not in the repository tree at all.
  const plan = await planExport(
    db,
    undefined,
    troubleshootingImageExists,
    undefined,
    await visibilityAudit()
  );

  const archives = await pendingArchives();

  console.log("[troubleshooting] export plan (nothing will be written)\n");
  for (const line of describeExportPlan(plan)) console.log(line);

  if (archives.entries.length > 0) {
    console.log(`archive: ${archives.entries.length} deleted article(s) to write out`);
    for (const entry of archives.entries) {
      console.log(
        `  archive  ${entry.subjectKey}/${entry.symptomId}` +
          `  (deleted ${entry.deletedAt.slice(0, 10)}` +
          (entry.deletedBy ? ` by ${entry.deletedBy}` : "") +
          ")"
      );
    }
  }

  // Reported loudly rather than skipped quietly: the row stays in the table
  // with exportedAt null, so nothing is lost, but somebody has to look.
  if (archives.unreadable.length > 0) {
    console.error(
      `\n[troubleshooting] ${archives.unreadable.length} archived article(s) could not be read:`
    );
    for (const line of archives.unreadable) console.error(`  ${line}`);
    console.error("  They remain in the database and will be reported again next run.");
  }

  // Shown whenever there is drift, because a visibility line is the one change
  // whose loss is silent: the article comes back visible on a rebuild and
  // nothing anywhere says why.
  if (plan.visibility.length > 0) {
    console.log(`\n[troubleshooting] ${visibilityPath()} would become:\n`);
    console.log(serialiseVisibility(plan.visibilityFile));
  }

  const needsWork =
    plan.articles.some((a) => a.kind !== "unchanged") ||
    plan.taxonomy.length > 0 ||
    plan.visibility.length > 0 ||
    archives.entries.length > 0;

  if (!needsWork) {
    console.log("\n[troubleshooting] the seed matches the database exactly — nothing to do");
    return;
  }

  if (!process.argv.includes("--write")) {
    console.log(
      "\n[troubleshooting] the seed is BEHIND the database — the above would be written" +
        "\n[troubleshooting] re-run with --write to apply it"
    );
    return;
  }

  if (!treeIsClean()) {
    console.error(
      "\n[troubleshooting] refusing to write: the git tree has uncommitted changes." +
        "\n  This export edits source files, and a clean tree is what makes" +
        "\n  `git diff` the review and `git checkout .` the undo."
    );
    process.exitCode = 1;
    return;
  }

  console.log("\n[troubleshooting] writing…\n");
  const result = await writeExport(plan, db, archives.entries);

  // Stamped only for rows whose file was actually written, so a failure is
  // retried next run rather than being marked done.
  if (result.exportedArchiveIds?.length) {
    await prisma.troubleshootingArchivedArticle.updateMany({
      where: { id: { in: result.exportedArchiveIds } },
      data: { exportedAt: new Date() },
    });
  }

  for (const path of result.written) console.log(`  wrote     ${path}`);

  if (result.failures.length > 0) {
    console.error("\n[troubleshooting] FAILED:");
    for (const failure of result.failures) console.error(`  ${failure}`);
  }

  if (result.handovers.length > 0) {
    console.log("\n[troubleshooting] needs a person:\n");
    for (const handover of result.handovers) {
      console.log(`  ${handover.what}`);
      console.log(`    ${handover.why}`);
      if (handover.paste) {
        console.log(`\n${handover.paste.split("\n").map((l) => `      ${l}`).join("\n")}\n`);
      }
    }
  }

  // Checked rather than assumed: these are source files, and the failure mode
  // of getting one wrong is the whole section refusing to load.
  console.log("\n[troubleshooting] verifying…");
  const verified = verifyWrittenTree();

  if (verified.ok) {
    console.log("[troubleshooting] typecheck and content tests pass — review with `git diff`");
  } else {
    console.error(
      "\n[troubleshooting] THE WRITTEN TREE DOES NOT BUILD:\n" +
        verified.output +
        "\n\n  Revert with: git checkout -- backend/src/content/troubleshooting"
    );
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(
      "[troubleshooting] export failed:",
      err instanceof Error ? err.message : err
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
