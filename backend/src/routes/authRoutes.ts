import { Router, Request as ExpressRequest, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";  // or wherever the file above lives
import { isAdminEmail, normalizeName, getActorName, getActorEmail } from "../config/auth.js";
import { resolveActorUserId } from "../services/snipeitassets.js";
import { getStockKeeperLocationsForUser } from "../services/settings.js";

const router = Router();

router.get("/role", async (req: ExpressRequest, res: Response, next: NextFunction) => {
  try {
    // Production: Caddy injects X-User-Name/X-User-Email after validating the HRT session.
    // Development: fall back to x-dev-user-* headers set by DevAuthToggle.
    const rawName = getActorName(req);
    const rawEmail = getActorEmail(req);

    if (!rawName && !rawEmail) {
      return res.json({
        role: null,
        name: "",
        email: "",
        userId: null,
        stockKeeperLocations: [],
      });
    }

    // Resolve the actor to their Snipe user id, which is what requests
    // actually store. Matching on display name alone used to strand anyone
    // whose Entra spelling differs from their Snipe one at role null, and a
    // null role hides every column in the requests table — so their rows
    // were fetched, returned, and then rendered into nothing.
    //
    // Resolved BEFORE the admin check, even though admin is decided on email
    // alone: the id is returned to the client either way, and an admin who is
    // also the approver on a request needs it to answer their own quote.
    let actorId: number | null = null;
    if (rawEmail) {
      try {
        actorId = await resolveActorUserId(rawEmail);
      } catch (err) {
        console.error(
          "[auth] could not resolve actor to a Snipe user, falling back to name matching:",
          err
        );
      }
    }

    ///  +-----------------------------------------------------------------+
    ///  |                   STOCK KEEPER ASSIGNMENTS                      |
    ///  +-----------------------------------------------------------------+
    //
    //  ORTHOGONAL TO `role`, NOT A FOURTH VALUE OF IT. A stock keeper is
    //  almost always also a requester, and may be an approver too; folding
    //  the assignment into the single role field would take those away — the
    //  requester who keeps stock would lose the button to confirm they
    //  collected their OWN device, because every gate in the client switches
    //  on that one value.
    //
    //  Resolved from the settings config by Snipe user id. No Snipe call:
    //  this endpoint runs on every page load, and getLocations() is an
    //  uncached request, so the location NAMES come from the snapshot stored
    //  with each assignment instead.
    //
    //  Returned for admins as well, and listing only what they are explicitly
    //  assigned. Their ability to act at any location comes from the role, so
    //  the two stay separable — and an admin who really is their site's
    //  keeper still shows as such.
    //
    //  Best-effort: a failure here degrades to "keeps nothing", which costs
    //  the actor some visibility but never their existing role.
    ///  +-----------------------------------------------------------------+
    let stockKeeperLocations: { id: number; name: string | null }[] = [];
    if (actorId !== null) {
      try {
        stockKeeperLocations = await getStockKeeperLocationsForUser(actorId);
      } catch (err) {
        console.error("[auth] could not resolve stock keeper locations:", err);
      }
    }

    // 1. Admin check — keyed on email so it's stable across display name changes
    if (rawEmail && isAdminEmail(rawEmail)) {
      return res.json({
        role: "ADMIN",
        name: rawName || rawEmail,
        email: rawEmail,
        userId: actorId,
        stockKeeperLocations,
      });
    }

    // With neither an id nor a name there is nothing left to match on.
    if (actorId === null && !rawName) {
      return res.json({
        role: null,
        name: rawEmail,
        email: rawEmail,
        userId: null,
        stockKeeperLocations,
      });
    }

    const target = rawName ? normalizeName(rawName) : null;
    const displayName = rawName || rawEmail;

    // 2. Manager check — nominated as approver on at least one request.
    // The id lookup is a filtered count; the name scan stays as a fallback
    // for approvers whose Snipe account was recreated after a rehire.
    if (actorId !== null) {
      const approves = await prisma.request.findFirst({
        where: { managerId: actorId },
        select: { id: true },
      });
      if (approves) {
        return res.json({
          role: "MANAGER",
          name: displayName,
          email: rawEmail,
          userId: actorId,
          stockKeeperLocations,
        });
      }
    }

    if (target !== null) {
      const managers = await prisma.request.findMany({
        where: { manager: { not: null } },
        select: { manager: true },
        distinct: ["manager"],
      });
      const isManager = managers.some(
        (r) => r.manager && normalizeName(r.manager) === target
      );
      if (isManager) {
        return res.json({
          role: "MANAGER",
          name: displayName,
          email: rawEmail,
          userId: actorId,
          stockKeeperLocations,
        });
      }
    }

    // 3. Requester check — the requestee on at least one request. Note this
    // is who the request is FOR, not who submitted it, so somebody who has
    // only ever had requests raised on their behalf still counts.
    if (actorId !== null) {
      const requested = await prisma.request.findFirst({
        where: { userId: actorId },
        select: { id: true },
      });
      if (requested) {
        return res.json({
          role: "REQUESTER",
          name: displayName,
          email: rawEmail,
          userId: actorId,
          stockKeeperLocations,
        });
      }
    }

    if (target !== null) {
      const requesters = await prisma.request.findMany({
        select: { userName: true },
        distinct: ["userName"],
      });
      const isRequester = requesters.some(
        (r) => normalizeName(r.userName) === target
      );
      if (isRequester) {
        return res.json({
          role: "REQUESTER",
          name: displayName,
          email: rawEmail,
          userId: actorId,
          stockKeeperLocations,
        });
      }
    }

    // 4. Default — no access
    return res.json({
      role: null,
      name: rawName,
      email: rawEmail,
      userId: actorId,
      stockKeeperLocations,
    });
  } catch (err) {
    next(err);
  }
});

export default router;