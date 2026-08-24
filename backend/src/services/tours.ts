import { prisma } from "../db/prisma.js";

///  +-----------------------------------------------------------------+
///  |            WHO HAS ALREADY BEEN SHOWN AROUND                    |
///  +-----------------------------------------------------------------+
//
//  A checklist. One row per (person, tour), written once they have had it, and
//  read on page load to decide whether a tour should run. See the
//  TourCompletion model for why it holds a Snipe user id and nothing else.
//
//  THE TOUR IDS LIVE HERE, not in the database. What tours exist is a fact
//  about the frontend — a route gains one, a page is redesigned and its tour
//  is retired — and putting that in an enum would mean a migration every time
//  somebody wrote a new one. Validating against this list is what keeps the
//  table free of ids nothing will ever read.
//
//  RECORDING IS IDEMPOTENT, and that is the whole reason for the compound key.
//  Somebody who finishes the home tour twice (a second browser, a replay from
//  the navbar) must not produce a second row, and the first completedAt is the
//  more interesting of the two dates — so the upsert's `update` is empty.
///  +-----------------------------------------------------------------+

export const TOUR_IDS = [
  "home",
  "requests",
  "requests-manager",
  "settings",
  "troubleshooting",
] as const;

export type TourId = (typeof TOUR_IDS)[number];

export function isTourId(value: unknown): value is TourId {
  return typeof value === "string" && (TOUR_IDS as readonly string[]).includes(value);
}

/** Which tours this person has already had. Empty for somebody new. */
export async function listCompletedTours(userId: number): Promise<TourId[]> {
  const rows = await prisma.tourCompletion.findMany({
    where: { userId },
    select: { tourId: true },
  });

  // Filtered rather than cast: a row written by an older build for a tour that
  // has since been retired is not something the client should be told about,
  // and it is not worth a migration to delete.
  return rows.map((r) => r.tourId).filter(isTourId);
}

/**
 * Record that somebody has had a tour.
 *
 * The empty `update` is deliberate — see the header. A second call is a no-op
 * that leaves the original completedAt alone.
 */
export async function markTourSeen(userId: number, tourId: TourId): Promise<void> {
  await prisma.tourCompletion.upsert({
    where: { userId_tourId: { userId, tourId } },
    create: { userId, tourId },
    update: {},
  });
}

/**
 * Forget one tour for one person, so it runs again.
 *
 * Exists for testing a tour against a real account without inventing one, and
 * as the thing a "show me this again" control would call. Scoped to a single
 * id: there is no "forget everything", because the only caller that would want
 * it is a mistake.
 */
export async function forgetTour(userId: number, tourId: TourId): Promise<void> {
  await prisma.tourCompletion.deleteMany({ where: { userId, tourId } });
}
