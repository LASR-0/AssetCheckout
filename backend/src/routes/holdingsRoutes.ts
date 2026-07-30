import express from "express";
import { getActorEmail } from "../config/auth.js";
import {
  findSnipeUserByEmail,
  getUserAssetHoldings,
} from "../services/snipeitassets.js";
import { getUserAccessoryHoldings } from "../services/snipeitaccessories.js";
import type { UserHoldings } from "../types/snipeTypes.js";

///  +-----------------------------------------------------------------+
///  |                       HOLDINGS ROUTES                           |
///  +-----------------------------------------------------------------+
//
//  What the signed-in user currently has checked out in Snipe-IT, for the
//  home page's holdings display.
//
//  SELF-ONLY. There is no /for-user/:id counterpart, deliberately: nothing in
//  this phase needs one, and not having it means no permissions dimension to
//  get wrong. Admins can already see holdings in Snipe directly.
//
//  ONE endpoint returning both halves rather than two, because the home page
//  needs them together and would otherwise make two round trips on every load.
//
//  QUIET ON FAILURE. Both fetches are independently caught and degrade to an
//  empty list, and the response is always 200 for an authenticated actor. The
//  home page deliberately renders nothing rather than an error state (matching
//  AccessoryQuickStart), and a Snipe blip shouldn't turn that into a visible
//  failure. `partial` tells the client something was dropped, so a future
//  surface could act on it without this one having to.
//
//  NOTE ON EXPECTED SPARSENESS: accessory results will be incomplete in
//  practice because Snipe's accessory data is incomplete — accessories get
//  handed out and never logged. That is the problem this phase exists to
//  address, not a fault in this fetch.
///  +-----------------------------------------------------------------+

const router = express.Router();

router.get("/for-me", async (req, res, next) => {
  try {
    const actorEmail = getActorEmail(req);
    if (!actorEmail) {
      return res
        .status(401)
        .json({ success: false, message: "Missing actor identity" });
    }

    const user = await findSnipeUserByEmail(actorEmail);
    if (!user) {
      // No Snipe user for this actor — nothing held, not an error.
      const empty: UserHoldings = { assets: [], accessories: [] };
      return res.json({ success: true, ...empty, partial: false });
    }

    const [assetsResult, accessoriesResult] = await Promise.allSettled([
      getUserAssetHoldings(user.id),
      getUserAccessoryHoldings(user.id),
    ]);

    if (assetsResult.status === "rejected") {
      console.error("Holdings: asset fetch failed", assetsResult.reason);
    }
    if (accessoriesResult.status === "rejected") {
      console.error(
        "Holdings: accessory fetch failed",
        accessoriesResult.reason
      );
    }

    const holdings: UserHoldings = {
      assets: assetsResult.status === "fulfilled" ? assetsResult.value : [],
      accessories:
        accessoriesResult.status === "fulfilled" ? accessoriesResult.value : [],
    };

    res.json({
      success: true,
      ...holdings,
      partial:
        assetsResult.status === "rejected" ||
        accessoriesResult.status === "rejected",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
