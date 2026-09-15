import { prisma } from "../../db/prisma.js";
import { getSnipeUser } from "../../services/snipeitassets.js";
import { getSetting } from "../../services/settings.js";

///  +-----------------------------------------------------------------+
///  |        FILLING IN WHERE EXISTING REQUESTERS ACTUALLY ARE         |
///  +-----------------------------------------------------------------+
//
//  userLocationId is stamped at creation, so every request filed from now on
//  has one. Everything already in the table does not — and those are exactly
//  the requests in flight when the feature ships, which is when a stock keeper
//  most needs to see their site's work.
//
//  NOT A SCHEDULED JOB. It is a one-off chore, and a cron version would
//  re-scan the rows it can never fill — a requester with no Snipe location at
//  all — on every single tick, forever. An admin runs it once from Settings
//  after deploying, and can run it again safely.
//
//  ONE SNIPE CALL PER DISTINCT REQUESTER, not per row: a person with fifteen
//  historical requests is looked up once. Bounded by a row cap per run so a
//  large table can be worked through in batches rather than opening hundreds
//  of connections to Snipe in one burst.
//
//  NEWEST FIRST. If the cap stops a run short, the rows that got filled are
//  the recent ones — the in-flight requests a keeper is waiting on — rather
//  than a page of history from three years ago.
//
//  A REQUESTER WITH NO SNIPE LOCATION STAYS NULL, and is indistinguishable
//  from one that was never attempted. That is inherent: null means the same
//  thing either way, and it is handled the same way everywhere else — the
//  request stays actionable by admins. The summary counts them separately so
//  an admin can tell a finished run from a capped one.
///  +-----------------------------------------------------------------+

const DEFAULT_MAX_ROWS = 500;

function readMaxRows(raw: string | null): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_MAX_ROWS;
}

export async function backfillRequestLocationsHandler(): Promise<
  Record<string, unknown>
> {
  const maxRows = readMaxRows(await getSetting("jobs.locationBackfillMaxRows"));

  const rows = await prisma.request.findMany({
    where: { userLocationId: null },
    select: { id: true, userId: true },
    orderBy: { createdAt: "desc" },
    take: maxRows,
  });

  if (rows.length === 0) {
    return { scanned: 0, updated: 0, noLocation: 0, distinctUsers: 0, remaining: 0 };
  }

  // Resolved once per person, then reused for every row they own.
  const locationByUser = new Map<
    number,
    { id: number; name: string } | null
  >();
  const failedUsers: number[] = [];

  for (const userId of new Set(rows.map((r) => r.userId))) {
    try {
      const user = await getSnipeUser(userId);
      locationByUser.set(userId, user?.location ?? null);
    } catch (err) {
      // Left out of the map entirely rather than cached as null: a lookup that
      // failed is not evidence the person has no location, and caching it as
      // one would write that wrong answer to every row they own.
      failedUsers.push(userId);
      console.error(`[backfill] user ${userId} lookup failed:`, err);
    }
  }

  let updated = 0;
  let noLocation = 0;

  for (const row of rows) {
    if (!locationByUser.has(row.userId)) continue; // lookup failed — leave for a re-run
    const location = locationByUser.get(row.userId) ?? null;
    if (location === null) {
      noLocation++;
      continue;
    }

    await prisma.request.update({
      where: { id: row.id },
      data: { userLocationId: location.id, userLocationName: location.name },
    });
    updated++;
  }

  // What a second run would still find. Non-zero after a full sweep is normal
  // — it is the rows whose requester has no Snipe location — so this is a
  // progress signal, not an error count.
  const remaining = await prisma.request.count({
    where: { userLocationId: null },
  });

  return {
    scanned: rows.length,
    distinctUsers: locationByUser.size + failedUsers.length,
    updated,
    noLocation,
    lookupFailures: failedUsers.length,
    remaining,
    cappedAt: rows.length === maxRows ? maxRows : undefined,
  };
}
