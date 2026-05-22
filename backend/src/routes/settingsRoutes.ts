import { Router, Request, Response, NextFunction } from "express";
import { isAdminName } from "../config/auth.js";
import {
  getRequestableCategoryIds,
  setRequestableCategoryIds,
  getStandardModels,
  setStandardModelsForCategory,
  getSkeletonStatusId,
  setSkeletonStatusId
} from "../services/settings.js";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const rawName = (req.headers["x-dev-user-name"] as string | undefined) ?? "";
  if (!isAdminName(rawName)) {
    res.status(403).json({ error: "Admins only" });
    return false;
  }
  return true;
}

///  +-----------------------------------------------------------------+
///  |                  REQUESTABLE CATEGORIES                         |
///  +-----------------------------------------------------------------+

router.get("/requestable-categories", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const ids = await getRequestableCategoryIds();
    res.json({ ids });
  } catch (err) {
    next(err);
  }
});

router.put("/requestable-categories", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ error: "Expected `ids` to be an array of numbers" });
    }

    await setRequestableCategoryIds(ids);
    const saved = await getRequestableCategoryIds();
    res.json({ ids: saved });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                PHASE 4.6 — STANDARD MODELS                     |
///  +-----------------------------------------------------------------+

/**
 * Returns the full standard-models config:
 *   { config: { [categoryId: string]: { primary: number|null, backup: number|null } } }
 *
 * Returns an empty config object when nothing has been saved yet.
 * Read-only — no admin gate (still requires actor identity, but any role can read).
 */
router.get("/standard-models", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getStandardModels();
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

/**
 * Update the configured standards for ONE category.
 * Body: { categoryId: number, primary: number | null, backup: number | null }
 *
 * Pass null for either slot to clear it. Replaces just this category's entry —
 * other categories' configs are untouched.
 *
 * Admin-only.
 */
router.put("/standard-models", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { categoryId, primary, backup } = req.body ?? {};

    if (typeof categoryId !== "number" || !Number.isFinite(categoryId)) {
      return res.status(400).json({ error: "categoryId must be a number" });
    }
    if (primary !== null && (typeof primary !== "number" || !Number.isFinite(primary))) {
      return res.status(400).json({ error: "primary must be a number or null" });
    }
    if (backup !== null && (typeof backup !== "number" || !Number.isFinite(backup))) {
      return res.status(400).json({ error: "backup must be a number or null" });
    }

    await setStandardModelsForCategory(categoryId, primary, backup);
    const config = await getStandardModels();
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

router.get("/skeleton-status", async (_req, res, next) => {
  try {
    const statusId = await getSkeletonStatusId();
    res.json({ statusId });
  } catch (err) {
    next(err);
  }
});
 
router.put("/skeleton-status", async (req, res, next) => {
  try {
    const actorName = (req.headers["x-dev-user-name"] as string | undefined)?.trim();
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }
 
    const body = req.body ?? {};
    const raw = body.statusId;
 
    // Accept either a number (set), null (clear), or undefined (treat as clear).
    let parsed: number | null;
    if (raw === null || raw === undefined) {
      parsed = null;
    } else if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      parsed = raw;
    } else {
      return res.status(400).json({
        success: false,
        message: "statusId must be a positive number, null, or omitted",
      });
    }
 
    await setSkeletonStatusId(parsed);
    res.json({ success: true, statusId: parsed });
  } catch (err) {
    next(err);
  }
});

export default router;