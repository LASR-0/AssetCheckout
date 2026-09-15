import express from "express";
import { getActorName } from "../config/auth.js";
import { canActAsStockKeeper } from "../config/auth.js";
import { resolveStockKeeperActor } from "../services/stockKeeper.js";
import { getAssetsByLocation } from "../services/snipeitassets.js";

///  +-----------------------------------------------------------------+
///  |                      STOCK KEEPER ROUTES                        |
///  +-----------------------------------------------------------------+
//
//  The inventory behind the stock keeper's own page: what Snipe says is at a
//  given site, which is the one question this app could never answer before.
//
//  SCOPED TO THE LOCATION ASKED FOR, and checked against the caller's own
//  assignments. This is the first endpoint in the app that returns hardware
//  the caller does not hold and did not request, so it gets an explicit
//  permission check rather than inheriting one — the holdings route next door
//  is self-only precisely to avoid having this dimension, and its comment says
//  so. Admins pass for every location, as everywhere else.
//
//  NOT CACHED. Snipe's own hardware cache is shared with the price analytics
//  and is refreshed on a schedule; a keeper looking at their shelf wants what
//  is true now, and this is a small filtered read rather than the whole table.
///  +-----------------------------------------------------------------+

const router = express.Router();

router.get("/assets", async (req, res, next) => {
  try {
    if (!getActorName(req)) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }

    const raw = req.query.locationId;
    const locationId = Number(raw);
    if (!Number.isFinite(locationId) || locationId <= 0) {
      return res.status(400).json({
        success: false,
        message: "locationId is required and must be a positive number",
      });
    }

    const actor = await resolveStockKeeperActor(req);
    if (!canActAsStockKeeper(actor, locationId)) {
      return res.status(403).json({
        success: false,
        message: "You aren't a stock keeper for this location",
      });
    }

    const assets = await getAssetsByLocation(locationId);
    res.json({ success: true, locationId, count: assets.length, assets });
  } catch (err) {
    next(err);
  }
});

export default router;
