import { Router, Request as ExpressRequest, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";  // or wherever the file above lives
import { isAdminEmail, normalizeName, getActorName, getActorEmail } from "../config/auth.js";
import { resolveActorUserId } from "../services/snipeitassets.js";

const router = Router();

router.get("/role", async (req: ExpressRequest, res: Response, next: NextFunction) => {
  try {
    // Production: Caddy injects X-User-Name/X-User-Email after validating the HRT session.
    // Development: fall back to x-dev-user-* headers set by DevAuthToggle.
    const rawName = getActorName(req);
    const rawEmail = getActorEmail(req);

    if (!rawName && !rawEmail) {
      return res.json({ role: null, name: "", email: "", userId: null });
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

    // 1. Admin check — keyed on email so it's stable across display name changes
    if (rawEmail && isAdminEmail(rawEmail)) {
      return res.json({
        role: "ADMIN",
        name: rawName || rawEmail,
        email: rawEmail,
        userId: actorId,
      });
    }

    // With neither an id nor a name there is nothing left to match on.
    if (actorId === null && !rawName) {
      return res.json({ role: null, name: rawEmail, email: rawEmail, userId: null });
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
        });
      }
    }

    // 4. Default — no access
    return res.json({ role: null, name: rawName, email: rawEmail, userId: actorId });
  } catch (err) {
    next(err);
  }
});

export default router;