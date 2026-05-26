import express from "express";
import {
  requestAssetCheckout,
  checkoutAsset,
  getAveragePricesFromSnipe,
  getTierValues,
} from "../services/snipeit.js";
import { isValidRequestStatus, isValidRequestType, isValidRole } from "../utils/validation.js";
import { prisma } from "../db/prisma.js";
import { createRequest } from "../services/request.js";

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

router.get("/models/:id/available-asset", async (req, res) => {
  try {
    const modelId = Number(req.params.id);
    

    if (Number.isNaN(modelId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid model id",
      });
    }


    const asset = null;

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "No available assets found",
      });
    }

    res.json({
      success: true,
      asset,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: "Failed to fetch available asset",
    });
  }
});

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

router.get("/", async (req, res, next) => {
  try {
    const { status, userId, requestType, viewAs, currentUserName } = req.query;

    const where = {
      ...(isValidRequestStatus(status) ? { status } : {}),
      ...(userId ? { userId: Number(userId) } : {}),
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

    // Role-based filtering done in code (SQLite case-insensitivity workaround)
    let filtered = requests;

    if (isValidRole(viewAs) && typeof currentUserName === "string") {
      const target = currentUserName.trim().toLowerCase();

      if (viewAs === "MANAGER") {
        filtered = requests.filter(
          (r) => r.manager && r.manager.trim().toLowerCase() === target
        );
      } else if (viewAs === "REQUESTER") {
        filtered = requests.filter(
          (r) => r.userName.trim().toLowerCase() === target
        );
      }
      // ADMIN → no filter, return all
    }

    res.json({
      success: true,
      count: filtered.length,
      requests: filtered,
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