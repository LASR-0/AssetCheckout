import express from "express";
import {
  getAllAccessoryCategories,
  getRequestableAccessoryCategories,
  getAllAccessories,
  getAccessoriesByCategory,
} from "../services/snipeitaccessories.js";
import {
  getRequestableAccessoryCategoryIds,
  setRequestableAccessoryCategoryIds,
  getStandardAccessories,
  setStandardAccessoriesForCategory,
  getAccessoryOptionLabels,
  getRequestableAccessoryCategoryIdsForAssetCategories,
  type AccessoryOptionConfig,
} from "../services/settings.js";
import { getActorName, getActorEmail, isAdminEmail } from "../config/auth.js";
import { getUserAssetCategoryIds, findSnipeUserByEmail } from "../services/snipeitassets.js";

const router = express.Router();

///  +-----------------------------------------------------------------+
///  |                      ACCESSORY ROUTES                           |
///  +-----------------------------------------------------------------+
//
//  The accessory-side mirror of the asset catalog/category routes.
//  Mounted at /api/accessories. Accessory settings endpoints live here
//  rather than in settingsRoutes so this chapter stays self-contained —
//  reads require an authenticated actor, writes require an admin.
///  +-----------------------------------------------------------------+

///  +-----------------------------------------------------------------+
///  |                         CATEGORIES                              |
///  +-----------------------------------------------------------------+

/**
 * Every accessory category in Snipe-IT. Used by the admin settings page
 * to populate the requestable-categories selector.
 */
router.get("/categories", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    const categories = await getAllAccessoryCategories();
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

/**
 * Only the accessory categories whitelisted as requestable (or all, if
 * no whitelist is configured). Used by the accessory request form.
 */
router.get("/categories/requestable", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    const categories = await getRequestableAccessoryCategories();
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       OPTION LABELS                             |
///  +-----------------------------------------------------------------+

/**
 * The requester-facing option labels for a category ("USB-C to Lightning",
 * "Case", ...). Labels ONLY — the accessory IDs each label resolves to are
 * deliberately not exposed, so the configured standards stay hidden from
 * requesters, consistent with the asset flow. Non-admin: any authenticated
 * actor (the request form calls this).
 */
router.get("/options/:categoryId", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    const categoryId = Number(req.params.categoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid categoryId",
      });
    }

    const options = await getAccessoryOptionLabels(categoryId);
    res.json({ success: true, options });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                          CATALOG                                |
///  +-----------------------------------------------------------------+

/**
 * The accessory catalog, normalised with stock counts.
 *
 *   GET /api/accessories                → every accessory
 *   GET /api/accessories?categoryId=16  → accessories in one category
 *
 * The admin settings page (standard-accessories picker) uses these;
 * requesters never see raw accessory records.
 */
router.get("/", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    const rawCategoryId = req.query.categoryId;

    if (rawCategoryId === undefined) {
      const accessories = await getAllAccessories();
      return res.json({ success: true, accessories });
    }

    const categoryId = Number(rawCategoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid categoryId",
      });
    }

    const accessories = await getAccessoriesByCategory(categoryId);
    res.json({ success: true, accessories });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                    ACCESSORY SETTINGS                           |
///  +-----------------------------------------------------------------+

/**
 * Current accessory configuration in one call — the requestable-category
 * whitelist (null = all allowed) and the per-category option config.
 * Admin settings page only.
 */
router.get("/settings", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const [requestableCategoryIds, standardAccessories] = await Promise.all([
      getRequestableAccessoryCategoryIds(),
      getStandardAccessories(),
    ]);

    res.json({
      success: true,
      requestableCategoryIds,
      standardAccessories,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Replace the requestable-accessory-categories whitelist.
 * Body: { ids: number[] }.
 */
router.put("/settings/requestable-categories", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    const actorEmail = getActorEmail(req);
    if (!isAdminEmail(actorEmail)) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const { ids } = req.body ?? {};
    if (
      !Array.isArray(ids) ||
      !ids.every((id) => typeof id === "number" && Number.isFinite(id))
    ) {
      return res.status(400).json({
        success: false,
        message: "Body must be { ids: number[] }",
      });
    }

    await setRequestableAccessoryCategoryIds(ids, actorEmail ?? "");

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * Replace the full option list for one accessory category.
 * Body: { options: [{ label: string, primary: number|null, backup: number|null }] }
 * — replace semantics; the admin UI edits a category's options as a unit.
 * Pass { options: [] } to clear a category.
 */
router.put("/settings/standard-accessories/:categoryId", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    const actorEmail = getActorEmail(req);
    if (!isAdminEmail(actorEmail)) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    const categoryId = Number(req.params.categoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid categoryId",
      });
    }

    const { options } = req.body ?? {};
    const validSlot = (v: unknown) =>
      v === null || v === undefined || (typeof v === "number" && Number.isFinite(v));
    const validOption = (o: unknown) =>
      typeof o === "object" &&
      o !== null &&
      typeof (o as any).label === "string" &&
      (o as any).label.trim().length > 0 &&
      validSlot((o as any).primary) &&
      validSlot((o as any).backup);

    if (!Array.isArray(options) || !options.every(validOption)) {
      return res.status(400).json({
        success: false,
        message:
          "Body must be { options: [{ label: string, primary: number|null, backup: number|null }] }",
      });
    }

    const cleaned: AccessoryOptionConfig[] = options.map((o: any) => ({
      label: o.label,
      primary: o.primary ?? null,
      backup: o.backup ?? null,
    }));

    await setStandardAccessoriesForCategory(categoryId, cleaned, actorEmail ?? "");

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get("/categories/for-user/:userId", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }

    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "Invalid userId" });
    }

    const assetCategoryIds = await getUserAssetCategoryIds(userId);
    const allowedIds =
      await getRequestableAccessoryCategoryIdsForAssetCategories(assetCategoryIds);

    const allowedSet = new Set(allowedIds);
    const allCategories = await getAllAccessoryCategories();
    const categories = allCategories.filter((c) => allowedSet.has(c.id));

    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

router.get("/categories/for-me", async (req, res, next) => {
  try {
    const actorName = getActorName(req);
    if (!actorName) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }

    const actorEmail = getActorEmail(req);
    const user = actorEmail ? await findSnipeUserByEmail(actorEmail) : null;
    if (!user) {
      return res.json({ success: true, categories: [] });
    }

    const assetCategoryIds = await getUserAssetCategoryIds(user.id);
    const allowedIds =
      await getRequestableAccessoryCategoryIdsForAssetCategories(assetCategoryIds);

    const allowedSet = new Set(allowedIds);
    const allCategories = await getAllAccessoryCategories();
    const categories = allCategories.filter((c) => allowedSet.has(c.id));

    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

export default router;