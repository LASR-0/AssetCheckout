import { prisma } from "../db/prisma.js";
import { loadContentFromDatabase } from "../content/troubleshooting/prismaContent.js";
import {
  planExport,
  describeExportPlan,
} from "../content/troubleshooting/exportPlan.js";
import { troubleshootingImageExists } from "../services/troubleshootingImages.js";

///  +-----------------------------------------------------------------+
///  |        EXPORT THE LIBRARY BACK TO THE SEED MODULES              |
///  +-----------------------------------------------------------------+
//
//  The database is the library; the `.ts` modules under content/troubleshooting
//  are the seed a fresh environment is built from. Anything written or edited
//  in the UI lives only in the database until this runs, which means a rebuild
//  would silently discard it.
//
//  REPORT ONLY, FOR NOW. This prints what an export would have to do and
//  writes nothing. That is deliberate rather than unfinished: several of the
//  cases it can report — a created article, a deleted one, a new category —
//  cannot occur yet, because the content service has no create or delete. It
//  is worth knowing from real data which cases exist before building a writer
//  aimed at them.
//
//  When writing lands, THIS STAYS THE DEFAULT and `--write` becomes the
//  explicit opt-in.
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

async function main(): Promise<void> {
  const db = await loadContentFromDatabase();

  // The images check is real rather than assumed: an admin upload lands in the
  // images directory, which is a production volume in production, so a module
  // can reference a file that is not in the repository tree at all.
  const plan = await planExport(db, undefined, troubleshootingImageExists);

  console.log("[troubleshooting] export plan (nothing will be written)\n");
  for (const line of describeExportPlan(plan)) console.log(line);

  const needsWork =
    plan.articles.some((a) => a.kind !== "unchanged") ||
    plan.taxonomy.length > 0 ||
    plan.visibility.length > 0;

  console.log(
    needsWork
      ? "\n[troubleshooting] the seed is BEHIND the database — the above would be written"
      : "\n[troubleshooting] the seed matches the database exactly — nothing to do"
  );
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
