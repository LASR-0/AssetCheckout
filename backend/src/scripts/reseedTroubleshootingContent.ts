import { prisma } from "../db/prisma.js";
import { reseedTroubleshootingContent } from "../services/troubleshootingContentSeed.js";

///  +-----------------------------------------------------------------+
///  |     REPLACE THE LIBRARY WITH THE DISK MODULES (DEVELOPMENT)     |
///  +-----------------------------------------------------------------+
//
//  For iterating on the authored `.ts` corpus after the content has already
//  been seeded. The boot-time seed only ever fills empty tables, so without
//  this there is no way to pick up a change to an article module.
//
//  THIS IS THE MOST DESTRUCTIVE THING IN THE TROUBLESHOOTING FEATURE. It
//  deletes every article row and rebuilds from disk, which in production
//  would discard every admin edit and every unpublished draft — work that by
//  then exists nowhere else, because the modules stopped being the truth the
//  moment the tables were first filled.
//
//  Hence two deliberate acts: running the script, and setting
//  TROUBLESHOOTING_ALLOW_RESEED=1. The guard lives in the service rather than
//  here so it cannot be bypassed by calling the function from somewhere else.
//
//  Run with:
//    pnpm --filter @asset-checkout/backend exec node --env-file=.env \
//      --import tsx src/scripts/reseedTroubleshootingContent.ts
///  +-----------------------------------------------------------------+

async function main(): Promise<void> {
  await reseedTroubleshootingContent();
  console.log("[troubleshooting] reseed complete");
}

main()
  .catch((err) => {
    console.error("[troubleshooting] reseed failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
