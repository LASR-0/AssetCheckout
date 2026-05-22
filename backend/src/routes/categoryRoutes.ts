import { Router, Request, Response, NextFunction } from "express";
import {
  getAllAssetCategories,
  getRequestableAssetCategories,
  getAllModelsByCategory,
} from "../services/snipeit.js";

const router = Router();

/** Categories filtered by the requestable allowlist — used by the request form. */
router.get("/asset-categories", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await getRequestableAssetCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

/** All asset categories from Snipe — used by the admin settings UI. */
router.get("/asset-categories/all", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await getAllAssetCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

/**
 * All models in a given category, no availability filter.
 *
 * Used by the standard-models settings UI so admins can pick from every model
 * (including currently-exhausted ones — they may restock later). The standard
 * checkout's primary→backup→fallback handles runtime exhaustion separately.
 */
router.get("/asset-categories/:id/models", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid category id" });
    }

    const models = await getAllModelsByCategory(id);
    // Strip down to the fields the frontend actually needs.
    const cleaned = models.map((m) => ({ id: m.id, name: m.name }));
    res.json({ models: cleaned });
  } catch (err) {
    next(err);
  }
});

export default router;