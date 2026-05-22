import { Router, Request as ExpressRequest, Response, NextFunction } from "express";
import { prisma } from "../db/prisma.js";  // or wherever the file above lives
import { isAdminName, normalizeName } from "../config/auth.js";

const router = Router();

router.get("/role", async (req: ExpressRequest, res: Response, next: NextFunction) => {
  try {
    const rawName = (req.headers["x-dev-user-name"] as string | undefined) ?? "";

    if (!rawName.trim()) {
      return res.json({ role: null, name: "" });
    }

    // 1. Admin check
    if (isAdminName(rawName)) {
      return res.json({ role: "ADMIN", name: rawName });
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
      return res.json({ role: "MANAGER", name: rawName });
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
      return res.json({ role: "REQUESTER", name: rawName });
    }

    // 4. Default — no access
    return res.json({ role: null, name: rawName });
  } catch (err) {
    next(err);
  }
});

export default router;