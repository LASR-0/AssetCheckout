import { Router, Request, Response, NextFunction } from "express";
import { isAdminEmail, getActorEmail } from "../config/auth.js";
import {
  getRequestableCategoryIds,
  setRequestableCategoryIds,
  getStandardModels,
  setStandardModelsForCategory,
  getSkeletonStatusId,
  setSkeletonStatusId,
  getMobileFilterConfig,
  setMobileFilterConfig,
  getAssetAccessoryCategoryMap,
  setAccessoryCategoriesForAssetCategory
} from "../services/settings.js";
import { ADMIN_EMAILS } from "../config/auth.js";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const email = getActorEmail(req);
  console.log("[requireAdmin] received email:", JSON.stringify(email), "admin list:", ADMIN_EMAILS);
  if (!isAdminEmail(email)) {
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

    await setRequestableCategoryIds(ids, getActorEmail(req));
    const saved = await getRequestableCategoryIds();
    res.json({ ids: saved });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       STANDARD MODELS                           |
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

    await setStandardModelsForCategory(categoryId, primary, backup, getActorEmail(req));
    const config = await getStandardModels();
    res.json({ config });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       SKELETON STATUS                           |
///  +-----------------------------------------------------------------+

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
    if (!requireAdmin(req, res)) return;

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

    await setSkeletonStatusId(parsed, getActorEmail(req));
    res.json({ success: true, statusId: parsed });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                    MOBILE NUMBER FILTERING                      |
///  +-----------------------------------------------------------------+

/**
 * Returns the active mobile-filter config:
 *   { countryCode: string, mobileLeadingDigit: string }
 *
 * FIXED: deliberately NOT admin-gated — the request form resolves reuse
 * numbers for every user, so all roles need to read this. Invalid stored
 * values are already normalised to defaults by the service.
 */
router.get("/mobile-filter", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const config = await getMobileFilterConfig();
    res.json(config);
  } catch (err) {
    next(err);
  }
});

/**
 * Update the mobile-filter config.
 * Body: { countryCode: string, mobileLeadingDigit: string }
 *
 * countryCode: 1-3 digits (a pasted leading "+" and any spaces are
 * stripped before validation). mobileLeadingDigit: exactly one digit.
 *
 * Admin-only.
 */
router.put("/mobile-filter", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const body = req.body ?? {};

    // Normalise: tolerate "+61" or "61 " from a paste.
    const countryCode =
      typeof body.countryCode === "string"
        ? body.countryCode.replace(/[+\s]/g, "")
        : "";
    const mobileLeadingDigit =
      typeof body.mobileLeadingDigit === "string"
        ? body.mobileLeadingDigit.trim()
        : "";

    if (!/^\d{1,3}$/.test(countryCode)) {
      return res.status(400).json({
        error: "countryCode must be 1-3 digits (e.g. 61 for Australia)",
      });
    }
    if (!/^\d$/.test(mobileLeadingDigit)) {
      return res.status(400).json({
        error: "mobileLeadingDigit must be a single digit (e.g. 4 for Australia)",
      });
    }

    await setMobileFilterConfig(countryCode, mobileLeadingDigit, getActorEmail(req));
    const saved = await getMobileFilterConfig();
    res.json(saved);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |          ACCESSORY ↔ ASSET-CATEGORY MAP (L3)                    |
///  +-----------------------------------------------------------------+

router.get("/accessory-asset-map", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const map = await getAssetAccessoryCategoryMap();
    res.json({ map });
  } catch (err) {
    next(err);
  }
});

router.put("/accessory-asset-map", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { assetCategoryId, accessoryCategoryIds } = req.body ?? {};

    if (typeof assetCategoryId !== "number" || !Number.isFinite(assetCategoryId)) {
      return res.status(400).json({ error: "assetCategoryId must be a number" });
    }
    if (
      !Array.isArray(accessoryCategoryIds) ||
      !accessoryCategoryIds.every((n) => typeof n === "number" && Number.isFinite(n))
    ) {
      return res.status(400).json({ error: "accessoryCategoryIds must be an array of numbers" });
    }

    await setAccessoryCategoriesForAssetCategory(
      assetCategoryId,
      accessoryCategoryIds,
      getActorEmail(req)
    );
    const map = await getAssetAccessoryCategoryMap();
    res.json({ map });
  } catch (err) {
    next(err);
  }
});

export default router;