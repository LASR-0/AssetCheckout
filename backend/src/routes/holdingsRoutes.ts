import express from "express";
import { getActorEmail, isAdminEmail } from "../config/auth.js";
import {
  findSnipeUserByEmail,
  getUserAssetHoldings,
} from "../services/snipeitassets.js";
import {
  getUserAccessoryHoldings,
  getAllAccessories,
  getAllAccessoryCategories,
} from "../services/snipeitaccessories.js";
import {
  getAssetAccessoryCategoryMap,
  getRequestableAccessoryCategoryIds,
} from "../services/settings.js";
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

///  +-----------------------------------------------------------------+
///  |         DIAGNOSTIC: HOLDINGS NOBODY CAN SEE (admin)             |
///  +-----------------------------------------------------------------+
//
//  Accessory categories that people are actually holding, but which no user
//  can request — so those holdings appear on nobody's home page.
//
//  A category is REACHABLE when it survives both layers: present in the
//  requestable whitelist (L1; unset means no restriction) AND mapped from at
//  least one asset category (L3). Anything else is invisible no matter what is
//  configured on it. Holdings in an unreachable category are therefore a
//  symptom of a mapping gap, and this reports the gap rather than the app
//  quietly hiding the holding from its owner.
//
//  COSTS NOTHING EXTRA. Verified against the live instance that
//  `qty - remaining` equals the real checkout count for every accessory in
//  the catalog (37/37, cross-checked against /accessories/{id}/checkedout), so
//  the already-cached catalog answers "is anyone holding this?" without a
//  per-accessory call.
//
//  NB: the qty/remaining on GET /users/{id}/accessories is NOT adjusted for
//  checkouts — that endpoint reported qty 2 / remaining 2 for an accessory the
//  canonical record showed as qty 2 / remaining 1. This uses the catalog, not
//  that endpoint.
///  +-----------------------------------------------------------------+

router.get("/unreachable", async (req, res, next) => {
  try {
    const actorEmail = getActorEmail(req);
    if (!isAdminEmail(actorEmail)) {
      return res
        .status(403)
        .json({ success: false, message: "Admin access required" });
    }

    const [l1, l3, accessories, categories] = await Promise.all([
      getRequestableAccessoryCategoryIds(),
      getAssetAccessoryCategoryMap(),
      getAllAccessories(),
      getAllAccessoryCategories(),
    ]);

    // L3 is the base — the union of everything any asset category unlocks.
    const mapped = new Set<number>();
    for (const ids of Object.values(l3)) {
      for (const id of ids) mapped.add(id);
    }

    // L1 only filters. Null means no site-wide restriction.
    const allowed = l1 === null ? null : new Set(l1);
    const isReachable = (categoryId: number) =>
      mapped.has(categoryId) && (allowed === null || allowed.has(categoryId));

    // Units currently checked out, per category, for unreachable categories.
    const heldByCategory = new Map<number, number>();
    for (const acc of accessories) {
      if (acc.categoryId === null || isReachable(acc.categoryId)) continue;
      const out = Math.max(0, (acc.qty ?? 0) - (acc.remaining ?? 0));
      if (out === 0) continue;
      heldByCategory.set(
        acc.categoryId,
        (heldByCategory.get(acc.categoryId) ?? 0) + out
      );
    }

    const nameById = new Map(categories.map((c) => [c.id, c.name]));
    const unreachable = Array.from(heldByCategory.entries())
      .map(([categoryId, heldCount]) => ({
        categoryId,
        categoryName: nameById.get(categoryId) ?? `Category ${categoryId}`,
        heldCount,
        // Which layer is missing, so the admin knows where to go.
        requestable: allowed === null || allowed.has(categoryId),
        mapped: mapped.has(categoryId),
      }))
      .sort((a, b) => b.heldCount - a.heldCount);

    res.json({ success: true, unreachable });
  } catch (err) {
    next(err);
  }
});

export default router;
