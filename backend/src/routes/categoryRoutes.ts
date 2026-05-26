import { Router, Request, Response, NextFunction } from "express";
import {
  getAllAssetCategories,
  getRequestableAssetCategories,
  getAllModelsByCategory,
} from "../services/snipeit.js";

const router = Router();

router.get("/asset-categories", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await getRequestableAssetCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

router.get("/asset-categories/all", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await getAllAssetCategories();
    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

router.get("/asset-categories/:id/models", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid category id" });
    }

    const models = await getAllModelsByCategory(id);
    const cleaned = models.map((m) => ({ id: m.id, name: m.name }));
    res.json({ models: cleaned });
  } catch (err) {
    next(err);
  }
});

export default router;