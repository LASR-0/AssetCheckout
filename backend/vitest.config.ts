import { defineConfig } from "vitest/config";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

///  +-----------------------------------------------------------------+
///  |        TESTS GET THEIR OWN DATABASE. ALWAYS.                    |
///  +-----------------------------------------------------------------+
//
//  Most of the suite is pure and touches nothing. The content-creation tests
//  are not: they insert symptoms, articles and categories, and they only mean
//  anything against a real database, because what they are testing is largely
//  the database's own behaviour — position ordering, the compound unique on
//  subject + slug, what a null body does to the snapshot.
//
//  Pointed at a THROWAWAY FILE rather than the developer's database. Running
//  `pnpm test` must never be a thing you think twice about, and a suite that
//  writes to the database you are also clicking around in fails that on the
//  first run where teardown does not complete.
//
//  Provisioned in globalSetup: migrate a fresh file, seed it from the disk
//  modules. That also makes the suite reproducible — it starts from the
//  corpus, not from whatever state a developer's database drifted into.
///  +-----------------------------------------------------------------+

const databaseFile = join(mkdtempSync(join(tmpdir(), "assetcheckout-test-")), "test.db");
const databaseUrl = `file:${databaseFile}`;

// Set on this process as well as declared for the workers below. `test.env`
// reaches the test workers only, and globalSetup runs in the main process —
// which is the one that has to migrate the file before any worker opens it.
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  test: {
    globalSetup: ["./test/provisionDatabase.ts"],
    env: {
      DATABASE_URL: databaseUrl,
      // Tests assert production behaviour by default; the auth tests override
      // this per-case by re-importing the module under a stubbed value.
      NODE_ENV: "test",
    },
    // The creation tests share one database and assert on ordering, so they
    // cannot run concurrently with each other.
    fileParallelism: false,
  },
});
