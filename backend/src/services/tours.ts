import { prisma } from "../db/prisma.js";

///  +-----------------------------------------------------------------+
///  |            WHO HAS ALREADY BEEN SHOWN AROUND                    |
///  +-----------------------------------------------------------------+
//
//  A checklist. One row per (person, tour), written once they have had it, and
//  read on page load to decide whether a tour should run. See the
//  TourCompletion model for why it holds an email and nothing else.
//
//  IDENTITY IS THE ADDRESS THE PROXY INJECTED, used as the key directly. It
//  used to be resolved through Snipe into a user id first, which put a
//  directory round trip on the read path of every page load and meant anybody
//  Snipe did not know could not be recorded at all — so their tours ran, and
//  ran again. Reading the checklist is now one indexed lookup on this table.
//
//  NORMALISED IN ONE PLACE. Every exported function funnels its email through
//  normalizeActor, because the three of them have to agree about what counts
//  as the same person: if the read lowercased and the write did not, a proxy
//  that changed its header casing would hand somebody an empty checklist and
//  replay every tour they had already had.
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

/**
 * The key a row is stored under, or null when there is no usable identity.
 *
 * Null for an absent or blank email, which is the only way this can fail now
 * that nothing is looked up: an unauthenticated request, or a proxy that did
 * not inject the header. Callers treat it the way they treated an unresolvable
 * Snipe id — accept the request, record nothing.
 */
export function normalizeActor(email: string | null | undefined): string | null {
  const key = (email ?? "").trim().toLowerCase();
  return key.length > 0 ? key : null;
}

/** Which tours this person has already had. Empty for somebody new. */
export async function listCompletedTours(email: string): Promise<TourId[]> {
  const userEmail = normalizeActor(email);
  if (!userEmail) return [];

  const rows = await prisma.tourCompletion.findMany({
    where: { userEmail },
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
export async function markTourSeen(email: string, tourId: TourId): Promise<void> {
  const userEmail = normalizeActor(email);
  if (!userEmail) return;

  await prisma.tourCompletion.upsert({
    where: { userEmail_tourId: { userEmail, tourId } },
    create: { userEmail, tourId },
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
export async function forgetTour(email: string, tourId: TourId): Promise<void> {
  const userEmail = normalizeActor(email);
  if (!userEmail) return;

  await prisma.tourCompletion.deleteMany({ where: { userEmail, tourId } });
}
