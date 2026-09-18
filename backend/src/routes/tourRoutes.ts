import { Router, Request as ExpressRequest, Response } from "express";
import { getActorEmail } from "../config/auth.js";
import { getSetting } from "../services/settings.js";
import {
  isTourId,
  normalizeActor,
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
//  IDENTITY IS THE PROXY-INJECTED EMAIL, used as the key and nothing more.
//  This used to resolve that address into a Snipe user id first, which was a
//  directory lookup on the read path of every page load for a decorative
//  feature, and which failed in three ordinary ways — no Snipe account for the
//  address, Snipe unreachable on a cache miss, a cached negative. Every one of
//  them meant the completion could not be recorded, so the tour ran again on
//  the next navigation and the one after that. There is nothing left to look
//  up: if the proxy sent an address, this works.
//
//  IT NEVER FAILS THE PAGE. The database can still be unreachable, and this
//  still sits on the critical path of every page load, so the answer there is
//  what it always was: go quiet, never 500.
//
//  `identified` IS LOAD-BEARING on the client, and its meaning is unchanged —
//  "a completion posted now would be recorded". False means the client must
//  not start a tour, because one that runs and cannot be recorded runs again
//  forever. What changed is how rarely it is false: only a request with no
//  email on it at all, or a checklist read that threw.
///  +-----------------------------------------------------------------+

const router = Router();

const TOURS_ENABLED_KEY = "tours_enabled";

/**
 * The caller's normalised email, or null when the request carries none.
 *
 * Null is a request the proxy did not stamp — an unauthenticated probe, or a
 * dev session with no impersonation header set. The client does nothing in
 * that case, same as before.
 */
function actorEmail(req: ExpressRequest): string | null {
  return normalizeActor(getActorEmail(req));
}

async function toursEnabled(): Promise<boolean> {
  // Absent means on, matching how the request service reads feedback_enabled:
  // a missing row is a deployment that never configured this, not one that
  // turned it off.
  return (await getSetting(TOURS_ENABLED_KEY))?.trim().toLowerCase() !== "false";
}

/// ── What have I already had? ─────────────────────────────────────────────

router.get("/", async (req: ExpressRequest, res: Response) => {
  const enabled = await toursEnabled();
  const email = actorEmail(req);

  if (email === null) {
    return res.json({ enabled, identified: false, seen: [] });
  }

  try {
    return res.json({ enabled, identified: true, seen: await listCompletedTours(email) });
  } catch (err) {
    // A database error here must not break the page. Reporting no identity is
    // the safe lie: the client stays quiet rather than running a tour it
    // cannot record.
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

  const email = actorEmail(req);

  // Nothing to key a row on. Not an error: the tour ran and was useful, we
  // just cannot remember it, and telling the browser that changes nothing it
  // would do.
  if (email === null) return res.status(204).end();

  try {
    await markTourSeen(email, tourId);
  } catch (err) {
    console.error("[tours] could not record completion:", err);
  }

  return res.status(204).end();
});

/// ── Forget it, so it runs again ──────────────────────────────────────────
//
//  Scoped to the caller's own address, which is what makes this safe without
//  an admin guard: the only rows you can reach are your own.

router.delete("/:tourId", async (req: ExpressRequest, res: Response) => {
  const { tourId } = req.params;

  if (!isTourId(tourId)) {
    return res.status(400).json({ success: false, message: "Unknown tour" });
  }

  const email = actorEmail(req);
  if (email === null) return res.status(204).end();

  try {
    await forgetTour(email, tourId);
  } catch (err) {
    console.error("[tours] could not forget completion:", err);
  }

  return res.status(204).end();
});

export default router;
