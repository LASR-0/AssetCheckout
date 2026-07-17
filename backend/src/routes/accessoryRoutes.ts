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
} from "../services/settings.js";
import { getActorName, getActorEmail, isAdminEmail } from "../config/auth.js";

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
///  |                          CATALOG                                |
///  +-----------------------------------------------------------------+

/**
 * The accessory catalog, normalised with stock counts.
 *
 *   GET /api/accessories                → every accessory
 *   GET /api/accessories?categoryId=16  → accessories in one category
 *
 * The request form uses the categoryId form; the admin settings page
 * (standard-accessories picker) uses the unfiltered form.
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
 * whitelist (null = all allowed) and the per-category standard
 * accessories map. Admin settings page only.
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
 * Body: { ids: number[] } — an empty array means "nothing requestable";
 * to return to "all allowed", the admin clears the setting via the same
 * endpoint semantics as the asset side (empty stored value), which the
 * UI models as selecting every category.
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
 * Set (or clear) the standard accessories for one category.
 * Body: { primary: number | null, backup: number | null } — Snipe
 * accessory IDs. Pass null to clear a slot.
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

    const { primary, backup } = req.body ?? {};
    const validSlot = (v: unknown) =>
      v === null || (typeof v === "number" && Number.isFinite(v));

    if (!validSlot(primary) || !validSlot(backup)) {
      return res.status(400).json({
        success: false,
        message: "Body must be { primary: number|null, backup: number|null }",
      });
    }

    await setStandardAccessoriesForCategory(
      categoryId,
      primary,
      backup,
      actorEmail ?? ""
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;