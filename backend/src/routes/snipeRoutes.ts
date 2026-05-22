import express from "express";
import {
  getCompanies,
  getLocations,
  getAllStatuses,
  getSnipeAssetDetail
} from "../services/snipeit.js";
 
const router = express.Router();
 
function readActorName(req: express.Request): string | null {
  const raw = (req.headers["x-dev-user-name"] as string | undefined)?.trim();
  return raw && raw.length > 0 ? raw : null;
}
 
///  +-----------------------------------------------------------------+
///  |          PHASE 5D-III — SNIPE READ-ONLY PASS-THROUGHS          |
///  +-----------------------------------------------------------------+
//
//  Lookup endpoints used to populate dropdowns in admin-side forms (notably
//  the Asset Details dialog). Read-only, light wrappers around Snipe's list
//  endpoints. No filtering at the API level — callers decide what to show.
//
//  End-of-project cleanup TODO: if other read-only Snipe pass-throughs accumulate
//  elsewhere (e.g., the search-models endpoint under /api/approval), consider
//  consolidating them under /api/snipe/...
///  +-----------------------------------------------------------------+

router.get("/asset/:id", async (req, res, next) => {
  try {
    const actorName = readActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }
 
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid asset id",
      });
    }
 
    const asset = await getSnipeAssetDetail(id);
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Asset not found",
      });
    }
 
    res.json({ asset });
  } catch (err) {
    next(err);
  }
});

 
router.get("/companies", async (req, res, next) => {
  try {
    const actorName = readActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }
 
    const companies = await getCompanies();
    res.json({ companies });
  } catch (err) {
    next(err);
  }
});
 
router.get("/locations", async (req, res, next) => {
  try {
    const actorName = readActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }
 
    const locations = await getLocations();
    res.json({ locations });
  } catch (err) {
    next(err);
  }
});
 
router.get("/statuses", async (req, res, next) => {
  try {
    const actorName = readActorName(req);
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }
 
    const statuses = await getAllStatuses();
    res.json({ statuses });
  } catch (err) {
    next(err);
  }
});
 
export default router;