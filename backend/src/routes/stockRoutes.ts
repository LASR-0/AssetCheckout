import express from "express";
import { getActorName } from "../config/auth.js";
import { canActAsStockKeeper } from "../config/auth.js";
import { resolveStockKeeperActor } from "../services/stockKeeper.js";
import { getAssetsByLocation } from "../services/snipeitassets.js";
import { getAllAccessories } from "../services/snipeitaccessories.js";

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

///  +-----------------------------------------------------------------+
///  |                  ACCESSORIES AT A LOCATION                      |
///  +-----------------------------------------------------------------+
//
//  The accessory half of the keeper's ledger. Shaped nothing like the asset
//  half, because accessories are not serialised: Snipe records a LINE with a
//  quantity ("24 USB-C docks at Bundamba"), not 24 individually tracked
//  things. So there is no tag, no serial, and no single holder — the useful
//  numbers are how many exist and how many are left.
//
//  SERVED FROM THE SHARED CACHE, unlike the asset side which queries Snipe
//  per location. Snipe's accessory endpoint has no location filter worth
//  using, and the whole catalogue is already held in memory for the request
//  form and the fulfilment path, so this filters what is there rather than
//  adding a fetch. Freshness is that cache's TTL (~10 min), which is right
//  for stock levels that move a few times a day.
///  +-----------------------------------------------------------------+

router.get("/accessories", async (req, res, next) => {
  try {
    if (!getActorName(req)) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }

    const locationId = Number(req.query.locationId);
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

    const all = await getAllAccessories();
    const accessories = all.filter((a) => a.locationId === locationId);

    res.json({ success: true, locationId, count: accessories.length, accessories });
  } catch (err) {
    next(err);
  }
});

export default router;
