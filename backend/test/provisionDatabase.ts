import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname } from "node:path";

///  +-----------------------------------------------------------------+
///  |        A REAL DATABASE, BUILT THE WAY PRODUCTION IS             |
///  +-----------------------------------------------------------------+
//
//  Migrated with `prisma migrate deploy` rather than `db push`, so the tests
//  run against the schema the migrations actually produce. A push-built schema
//  can pass while the migration that has to create it in production is broken,
//  which is the one difference worth not having.
//
//  Then seeded from the disk modules, so the fixtures are the real corpus:
//  sixteen subjects, a hundred-odd symptoms, sixty articles. Writing fixtures
//  by hand would mean a smaller, less representative library that drifts from
//  the one being shipped.
///  +-----------------------------------------------------------------+

export default async function provision(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("provisionDatabase: DATABASE_URL was not set by vitest.config.ts");

  execFileSync("node", ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  // Imported only now: prisma.ts reads DATABASE_URL at import time, so pulling
  // it in at the top of the file would bind it before the migration has run.
  const { ensureTroubleshootingContent } = await import(
    "../src/services/troubleshootingContentSeed.js"
  );
  const { ensureDefaults } = await import("../src/services/settings.js");
  const { prisma } = await import("../src/db/prisma.js");

  // Settings defaults as well as content: server.ts runs both at startup, and
  // a test database missing them behaves like a deployment nobody booted.
  await ensureDefaults();
  await ensureTroubleshootingContent();
  await prisma.$disconnect();

  return async () => {
    // The whole temporary directory, including the -wal and -shm files SQLite
    // leaves beside the database.
    rmSync(dirname(url.replace(/^file:/, "")), { recursive: true, force: true });
  };
}
