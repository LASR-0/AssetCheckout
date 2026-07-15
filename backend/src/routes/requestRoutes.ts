import express from "express";
import {
  requestAssetCheckout,
  checkoutAsset,
  getAveragePricesFromSnipe,
  getTierValues,
} from "../services/snipeit.js";
import { isValidRequestStatus, isValidRequestType } from "../utils/validation.js";
import { prisma } from "../db/prisma.js";
import { createRequest } from "../services/request.js";
import { getActorName, getActorEmail, isAdminEmail, normalizeName } from "../config/auth.js";

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
 *   - Everyone else: requests they submitted OR requests where they are
 *     the nominated approver. A "manager" is not a stored role; it's
 *     simply having your name in the manager field of a request.
 *
 * Name matching is done in code with normalizeName (SQLite
 * case-insensitivity workaround), consistent with how manager/requester
 * matching works elsewhere.
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
      },
    });

    let visible = requests;

    if (!isAdmin) {
      const actor = normalizeName(actorName);
      visible = requests.filter(
        (r) =>
          normalizeName(r.userName) === actor ||
          (r.manager !== null && normalizeName(r.manager) === actor)
      );
    }

    res.json({
      success: true,
      count: visible.length,
      requests: visible,
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