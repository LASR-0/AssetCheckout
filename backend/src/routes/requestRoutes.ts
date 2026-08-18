import express from "express";
import {
  requestAssetCheckout,
  checkoutAsset,
  getAveragePricesFromSnipe,
  getTierValues,
} from "../services/snipeitassets.js";
import { getAllAccessories } from "../services/snipeitaccessories.js";
import { findSnipeUserByEmail, resolveActorUserId } from "../services/snipeitassets.js";
import { getStandardAccessories } from "../services/settings.js";
import { isValidRequestStatus, isValidRequestType } from "../utils/validation.js";
import { prisma } from "../db/prisma.js";
import { createRequest, createCorrectionRequest } from "../services/request.js";
import {
  getActorName,
  getActorEmail,
  isAdminEmail,
  canSeeRequest,
} from "../config/auth.js";

const router = express.Router();

///  +-----------------------------------------------------------------+
///  |                     POST REQUEST                                |
///  +-----------------------------------------------------------------+

router.post("/", async (req, res, next) => {
  try {
    const result = await createRequest(req.body);

    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                    POST CORRECTION                              |
///  +-----------------------------------------------------------------+
//
//  Its own endpoint rather than a branch of POST / — createRequest's input
//  shape is a provisioning order, and routing corrections through it would put
//  a correction one mis-set field away from becoming one.
//
//  SELF-ONLY. The requester is always the signed-in actor, never taken from
//  the body: admins can already fix records directly and don't need this
//  pipeline, so there is no on-behalf-of dimension to get wrong.

router.post("/corrections", async (req, res, next) => {
  try {
    const actorEmail = getActorEmail(req);
    const actorName = getActorName(req);
    if (!actorEmail || !actorName) {
      return res
        .status(401)
        .json({ success: false, message: "Missing actor identity" });
    }

    const user = await findSnipeUserByEmail(actorEmail);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "No Snipe-IT user matches the signed-in account",
      });
    }

    const result = await createCorrectionRequest({
      ...req.body,
      // Identity is server-derived, so a crafted body can't file a correction
      // against somebody else.
      userId: user.id,
      userName: actorName,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});


///  +-----------------------------------------------------------------+
///  |                         CHECKOUT                                |
///  +-----------------------------------------------------------------+

router.post("/checkout", async (req, res, next) => {
  console.log("📥 RECEIVED PAYLOAD:", req.body);

  const { user_id, category_id } = req.body;

  if (!user_id || !category_id) {
    return res.status(400).json({
      success: false,
      error: "User and asset type are required",
    });
  }

  try {
    const result = await requestAssetCheckout(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       AVAILABLE ASSET                           |
///  +-----------------------------------------------------------------+

router.get("/averages", async (req, res, next) => {
  try {
    const tier = req.query.tier as string | undefined;

    const averages = await getAveragePricesFromSnipe(tier);

    res.json({
      success: true,
      averages,
    });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                         GET REQUESTS                            |
///  +-----------------------------------------------------------------+

/**
 * Visibility is derived entirely from the authenticated actor — nothing
 * about identity or role is accepted from the client:
 *
 *   - Admin (email in ADMIN_EMAILS): all requests.
 *   - Everyone else: requests they are the requestee of OR requests where
 *     they are the nominated approver. A "manager" is not a stored role;
 *     it's simply being named as the approver on a request.
 *
 * MATCHED ON SNIPE USER ID, NOT DISPLAY NAME. Both userId and managerId
 * come from the same Snipe picker that filled userName and manager, so
 * they identify the same people — but the id is stable and the name is
 * not. The actor arrives from SSO as an email, which resolves to an id via
 * resolveActorUserId. Matching the SSO display name against the Snipe one
 * used to hide a person's own requests from them whenever the two
 * directories spelled them differently, which is invisible from the
 * outside: the table is simply empty, with no error and no denial.
 *
 * THE NAME MATCH IS KEPT AS AN EXTRA CLAUSE, not as the primary one. An
 * offboarded-then-rehired employee gets a fresh Snipe account (see
 * findSnipeUserByEmail), so their pre-rehire requests carry an id they no
 * longer have; the name still finds those. It only ever widens what the id
 * match already returns, so it cannot hide anything.
 *
 * Its known cost, which predates this filter: two people who genuinely
 * share a display name can see each other's rows. Removing the clause
 * would close that and re-break rehires, so it is left as a deliberate
 * trade rather than an oversight.
 *
 * IF SNIPE IS UNREACHABLE the id cannot be resolved, and the filter falls
 * back to name matching alone — degraded and imperfect, but exactly what
 * this endpoint did before, which beats showing everyone an empty table
 * during a Snipe outage.
 *
 * Accessory enrichment (best-effort, one catalog read + one settings read
 * for the whole page, freshness bounded by the accessory cache TTL ~10 min):
 *   - accessoryRemaining / accessoryLocationName: for an accessory request
 *     with a SELECTED accessory (modelRequest.snipeAccessoryId), the live
 *     remaining stock + the selected record's site. Drives the "Add stock"
 *     row action, which shows whenever remaining is 0, so repeat requests for
 *     a drained accessory each re-surface it.
 *   - accessoryOptionDisplay / accessoryLinkedLabel: the request-type column's
 *     two lower lines. From the chosen option (matched by accessoryOption in
 *     standard_accessories), the option's displayLabel (line 2, falls back to
 *     the raw option label) and the linked accessory's label (line 3 — the
 *     admin's accessoryLabel, else the option primary's catalog name).
 *   - All four are null for non-accessory rows; accessoryRemaining/Location
 *     are also null for accessory rows without a selection.
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

    const isAdmin = isAdminEmail(getActorEmail(req));

    const { status, requestType } = req.query;

    const where = {
      ...(isValidRequestStatus(status) ? { status } : {}),
      ...(isValidRequestType(requestType) ? { requestType } : {}),
    };

    const requests = await prisma.request.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        modelRequest: true,
        // Null for every kind except CORRECTION. The row indicator and the
        // Manage dialog both read it, and the visibility filter below already
        // restricts corrections to their requester (manager is set to the
        // requester's own name) plus admins, so this exposes nothing new.
        correctionDetail: true,
        // Null for everything but a non-standard accessory that has reached
        // the quote stage. Drives the row's quote actions and the waiting
        // badge. Same visibility reasoning as above: the filter below already
        // limits non-admins to their own requests and the ones they approve,
        // and the approving manager is precisely who the quote is for.
        quoteDetail: true,
      },
    });

    let visible = requests;

    if (!isAdmin) {
      const actorEmail = getActorEmail(req);

      // Null covers both "no Snipe account" and "Snipe did not answer". The
      // id clause simply drops out in either case, which is why the name
      // clause below is still here.
      let actorId: number | null = null;
      if (actorEmail) {
        try {
          actorId = await resolveActorUserId(actorEmail);
        } catch (err) {
          console.error(
            "[requests] could not resolve actor to a Snipe user, falling back to name matching:",
            err
          );
        }
      }

      const actor = { id: actorId, name: actorName };
      visible = requests.filter((r) => canSeeRequest(r, actor));
    }

    // Enrich accessory rows: live stock (drives "Add stock") plus the two
    // display labels for the request-type column. One catalog read + one
    // config read for the whole page; best-effort, TTL-bounded freshness.
    const accessoryRows = visible.filter((r) => r.requestKind === "ACCESSORY");
    const needsStock = accessoryRows.some(
      (r) => r.modelRequest?.snipeAccessoryId != null
    );
    const needsLabels = accessoryRows.some((r) => r.accessoryOption != null);

    let catalogById:
      | Map<number, { remaining: number; locationName: string | null; name: string }>
      | null = null;
    let standardAccessories:
      | Awaited<ReturnType<typeof getStandardAccessories>>
      | null = null;

    if (needsStock || needsLabels) {
      try {
        const [catalog, config] = await Promise.all([
          getAllAccessories(),
          getStandardAccessories(),
        ]);
        catalogById = new Map(
          catalog.map((a) => [
            a.id,
            { remaining: a.remaining, locationName: a.locationName, name: a.name },
          ])
        );
        standardAccessories = config;
      } catch (err) {
        // Best-effort: on failure the labels/stock fall back to null rather
        // than failing the whole request list. The "Add stock" action just
        // won't re-derive until the next successful load — the request list
        // itself stays functional.
        console.error("[requests] accessory enrichment failed:", err);
      }
    }

    const enriched = visible.map((r) => {
      if (r.requestKind !== "ACCESSORY") {
        return {
          ...r,
          accessoryRemaining: null,
          accessoryLocationName: null,
          accessoryOptionDisplay: null,
          accessoryLinkedLabel: null,
        };
      }

      // Live stock of the SELECTED accessory (drives "Add stock").
      const snipeAccessoryId = r.modelRequest?.snipeAccessoryId ?? null;
      const stock =
        snipeAccessoryId != null && catalogById
          ? catalogById.get(snipeAccessoryId) ?? null
          : null;

      // Chosen option → line-2 display label + line-3 linked-accessory label.
      // Line 3 prefers the admin's accessoryLabel, else the option primary's
      // catalog name.
      let accessoryOptionDisplay: string | null = r.accessoryOption ?? null;
      let accessoryLinkedLabel: string | null = null;
      if (standardAccessories && r.accessoryOption) {
        const opt = (standardAccessories[String(r.categoryId)]?.options ?? []).find(
          (o) => o.label === r.accessoryOption
        );
        if (opt) {
          accessoryOptionDisplay = opt.displayLabel ?? r.accessoryOption;
          accessoryLinkedLabel =
            opt.accessoryLabel ??
            (opt.primary != null && catalogById
              ? catalogById.get(opt.primary)?.name ?? null
              : null);
        }
      }

      return {
        ...r,
        accessoryRemaining: stock ? stock.remaining : null,
        accessoryLocationName: stock ? stock.locationName : null,
        accessoryOptionDisplay,
        accessoryLinkedLabel,
      };
    });

    res.json({
      success: true,
      count: enriched.length,
      requests: enriched,
    });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                          GET TIERS                              |
///  +-----------------------------------------------------------------+

router.get('/tiers', async (req, res, next) => {
  try {
    const tiers = await getTierValues();
    res.json({ tiers });
  } catch (err) {
    next(err);
  }
});

export default router;