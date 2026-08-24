import { Router, Request as ExpressRequest, Response } from "express";
import { getActorEmail } from "../config/auth.js";
import { resolveActorUserId } from "../services/snipeitassets.js";
import { getSetting } from "../services/settings.js";
import {
  isTourId,
  listCompletedTours,
  markTourSeen,
  forgetTour,
} from "../services/tours.js";

///  +-----------------------------------------------------------------+
///  |                   THE TOUR CHECKLIST API                        |
///  +-----------------------------------------------------------------+
//
//  Three endpoints over one table: what have I already seen, I have just seen
//  this, and forget that I did.
//
//  IDENTITY IS A SNIPE USER ID, resolved from the proxy-injected email the
//  same way authRoutes does. resolveActorUserId is a ten-minute cache that
//  also caches negatives, and /api/auth/role already calls it on every page
//  load, so the lookup here is a cache read rather than a round trip.
//
//  IT NEVER FAILS THE PAGE. resolveActorUserId throws when Snipe is
//  unreachable — its docblock says so, and deliberately leaves deny-vs-fall-
//  back to the caller. This is a decorative feature sitting on the critical
//  path of every page load, so the answer here is always "fall back": an
//  unreachable directory means `identified: false`, never a 500.
//
//  `identified` IS LOAD-BEARING on the client. False means the POST could not
//  persist anything, so the client must not start a tour — otherwise it would
//  run, fail to record, and run again on the next navigation, forever. The
//  client fails closed on it.
///  +-----------------------------------------------------------------+

const router = Router();

const TOURS_ENABLED_KEY = "tours_enabled";

/**
 * The caller's Snipe user id, or null.
 *
 * Null covers all three ways this can go wrong — no email on the request, no
 * Snipe account for that address, and Snipe being down — because the client
 * does the same thing in every case: nothing.
 */
async function actorId(req: ExpressRequest): Promise<number | null> {
  const email = getActorEmail(req);
  if (!email) return null;

  try {
    return await resolveActorUserId(email);
  } catch (err) {
    console.error("[tours] could not resolve actor to a Snipe user:", err);
    return null;
  }
}

async function toursEnabled(): Promise<boolean> {
  // Absent means on, matching how the request service reads feedback_enabled:
  // a missing row is a deployment that never configured this, not one that
  // turned it off.
  return (await getSetting(TOURS_ENABLED_KEY))?.trim().toLowerCase() !== "false";
}

/// ── What have I already had? ─────────────────────────────────────────────

router.get("/", async (req: ExpressRequest, res: Response) => {
  const [enabled, userId] = await Promise.all([toursEnabled(), actorId(req)]);

  if (userId === null) {
    return res.json({ enabled, identified: false, seen: [] });
  }

  try {
    return res.json({ enabled, identified: true, seen: await listCompletedTours(userId) });
  } catch (err) {
    // A database error here must not break the page either. Reporting no
    // identity is the safe lie: the client stays quiet rather than running a
    // tour it cannot record.
    console.error("[tours] could not read completions:", err);
    return res.json({ enabled, identified: false, seen: [] });
  }
});

/// ── I have just had this one ─────────────────────────────────────────────

router.post("/:tourId/seen", async (req: ExpressRequest, res: Response) => {
  const { tourId } = req.params;

  // Checked before anything touches the database, so an unknown id cannot
  // write a row nothing will ever read.
  if (!isTourId(tourId)) {
    return res.status(400).json({ success: false, message: "Unknown tour" });
  }

  const userId = await actorId(req);

  // Nothing to key a row on. Not an error: the tour ran and was useful, we
  // just cannot remember it, and telling the browser that changes nothing it
  // would do.
  if (userId === null) return res.status(204).end();

  try {
    await markTourSeen(userId, tourId);
  } catch (err) {
    console.error("[tours] could not record completion:", err);
  }

  return res.status(204).end();
});

/// ── Forget it, so it runs again ──────────────────────────────────────────
//
//  Scoped to the caller's own id, which is what makes this safe without an
//  admin guard: the only rows you can reach are your own.

router.delete("/:tourId", async (req: ExpressRequest, res: Response) => {
  const { tourId } = req.params;

  if (!isTourId(tourId)) {
    return res.status(400).json({ success: false, message: "Unknown tour" });
  }

  const userId = await actorId(req);
  if (userId === null) return res.status(204).end();

  try {
    await forgetTour(userId, tourId);
  } catch (err) {
    console.error("[tours] could not forget completion:", err);
  }

  return res.status(204).end();
});

export default router;
