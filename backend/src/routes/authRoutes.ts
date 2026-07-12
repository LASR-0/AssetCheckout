import { Router, Request as ExpressRequest, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";  // or wherever the file above lives
import { isAdminEmail, normalizeName, getActorName, getActorEmail } from "../config/auth.js";

const router = Router();

router.get("/role", async (req: ExpressRequest, res: Response, next: NextFunction) => {
  try {
    // Production: Caddy injects X-User-Name/X-User-Email after validating the HRT session.
    // Development: fall back to x-dev-user-* headers set by DevAuthToggle.
    const rawName = getActorName(req);
    const rawEmail = getActorEmail(req);

    if (!rawName && !rawEmail) {
      return res.json({ role: null, name: "", email: "" });
    }

    // 1. Admin check — keyed on email so it's stable across display name changes
    if (rawEmail && isAdminEmail(rawEmail)) {
      return res.json({ role: "ADMIN", name: rawName || rawEmail, email: rawEmail });
    }

    // Manager/requester checks require a name — if there's only an email and
    // it didn't match admin, there's nothing left to resolve.
    if (!rawName) {
      return res.json({ role: null, name: rawEmail, email: rawEmail });
    }

    const target = normalizeName(rawName);

    // 2. Manager check — appears as `manager` on at least one request
    const managers = await prisma.request.findMany({
      where: { manager: { not: null } },
      select: { manager: true },
      distinct: ["manager"],
    });
    const isManager = managers.some(
      (r) => r.manager && normalizeName(r.manager) === target
    );
    if (isManager) {
      return res.json({ role: "MANAGER", name: rawName, email: rawEmail });
    }

    // 3. Requester check — appears as `userName` on at least one request
    const requesters = await prisma.request.findMany({
      select: { userName: true },
      distinct: ["userName"],
    });
    const isRequester = requesters.some(
      (r) => normalizeName(r.userName) === target
    );
    if (isRequester) {
      return res.json({ role: "REQUESTER", name: rawName, email: rawEmail });
    }

    // 4. Default — no access
    return res.json({ role: null, name: rawName, email: rawEmail });
  } catch (err) {
    next(err);
  }
});

export default router;