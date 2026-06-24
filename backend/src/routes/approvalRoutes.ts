import express from "express";
import {
  approveRequest,
  rejectRequest,
  useExistingModelForRequest,
  createNewModelForRequest,
  fillAssetDetailsForRequest,
  markRequestShipped,
  markReadyForCollection,
  markRequestReceived 
} from "../services/request.js";
import { searchModelsByManufacturer } from "../services/snipeit.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import { getActorName, getActorEmail, isAdminEmail } from "../config/auth.js";

const router = express.Router();

function readActorName(req: express.Request): string | null {
  const raw = (req.headers["x-dev-user-name"] as string | undefined)?.trim();
  return raw && raw.length > 0 ? raw : null;
}

router.post("/:requestId/approve", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = getActorName(req);

    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    if (Number.isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requestId",
      });
    }

    const actorEmail = getActorEmail(req);
    const isAdmin = isAdminEmail(actorEmail);

    const result = await approveRequest(requestId, { name: actorName, isAdmin });
    res.json(result);
  } catch (err) {
    next(err);
  }
});


router.get("/pending", async (req, res, next) => {
  try {
    const requests = await prisma.request.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      requests,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:requestId/reject", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const { reason } = req.body;
    const actorName = readActorName(req);

    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    if (Number.isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requestId",
      });
    }

    const result = await rejectRequest(requestId, actorName, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                 MODEL CREATION ROUTES                           |
///  +-----------------------------------------------------------------+

router.get("/:requestId/search-models", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = readActorName(req);

    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    if (Number.isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requestId",
      });
    }

    const manufacturer = String(req.query.manufacturer ?? "").trim();
    const modelName = String(req.query.modelName ?? "").trim();

    if (!manufacturer || !modelName) {
      return res.status(400).json({
        success: false,
        message: "manufacturer and modelName are both required",
      });
    }

    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { categoryId: true },
    });

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    const matches = await searchModelsByManufacturer({
      manufacturer,
      modelName,
      categoryId: request.categoryId,
    });

    res.json({
      success: true,
      matches,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:requestId/use-existing-model", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = readActorName(req);

    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    if (Number.isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requestId",
      });
    }

    const { snipeModelId } = req.body ?? {};
    if (typeof snipeModelId !== "number" || !Number.isFinite(snipeModelId)) {
      return res.status(400).json({
        success: false,
        message: "snipeModelId is required and must be a number",
      });
    }

    const result = await useExistingModelForRequest(requestId, snipeModelId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:requestId/create-model", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = readActorName(req);

    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }

    if (Number.isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requestId",
      });
    }

    const manufacturer = String(req.body?.manufacturer ?? "").trim();
    const modelName = String(req.body?.modelName ?? "").trim();
    const modelNumber = String(req.body?.modelNumber ?? "").trim();

    if (!manufacturer || !modelName || !modelNumber) {
      return res.status(400).json({
        success: false,
        message: "manufacturer, modelName, and modelNumber are all required",
      });
    }

    const result = await createNewModelForRequest(requestId, {
      manufacturer,
      modelName,
      modelNumber,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                     ASSET DETAILS ROUTE                         |
///  +-----------------------------------------------------------------+


router.post("/:requestId/asset-details", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = readActorName(req);
 
    if (!actorName) {
      return res.status(401).json({
        success: false,
        message: "Missing actor identity",
      });
    }
 
    if (Number.isNaN(requestId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid requestId",
      });
    }
 
    const body = req.body ?? {};

    function asOptionalNumber(value: unknown, fieldName: string): number | undefined | null {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new AppError(`${fieldName} must be a number`, 400);
      }
      return value;
    }
 

    function asOptionalString(value: unknown): string | undefined {
      if (value === undefined || value === null) return undefined;
      if (typeof value !== "string") {
        throw new AppError("Expected string", 400);
      }
      return value;
    }
 
    let companyId: number | undefined | null;
    let statusId: number | undefined | null;
    let locationId: number | undefined | null;
    let price: number | undefined;
    let serial: string | undefined;
    let tier: string | undefined;
    let assetTag: string | undefined;
 
    try {
      companyId = asOptionalNumber(body.companyId, "companyId") ?? undefined;
      statusId = asOptionalNumber(body.statusId, "statusId") ?? undefined;
      locationId = asOptionalNumber(body.locationId, "locationId") ?? undefined;
 
      const priceValue = asOptionalNumber(body.price, "price");
      if (priceValue !== undefined && priceValue !== null && priceValue < 0) {
        return res.status(400).json({
          success: false,
          message: "price must be a non-negative number",
        });
      }
      price = priceValue ?? undefined;
      serial = asOptionalString(body.serial);
      tier = asOptionalString(body.tier);
      assetTag = asOptionalString(body.assetTag);
    } catch (err) {
      if (err instanceof AppError) {
        return res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
      }
      throw err;
    }
 
    const result = await fillAssetDetailsForRequest(requestId, {
      companyId,
      serial,
      statusId,
      locationId,
      tier,
      price,
      assetTag,
    });
 
    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                   SHIPPING / RECEIPT ROUTES                     |
///  +-----------------------------------------------------------------+

/**
 * Admin marks a shipped-path request as dispatched. Admin-only: shipping is
 * an IT/logistics action.
 */
router.post("/:requestId/ship", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = getActorName(req);

    if (!actorName) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const rawCode = req.body?.trackingCode;
    const rawUrl = req.body?.trackingUrl;
    const trackingCode = typeof rawCode === "string" && rawCode.trim() ? rawCode.trim() : undefined;
    const trackingUrl = typeof rawUrl === "string" && rawUrl.trim() ? rawUrl.trim() : undefined;
    
    const result = await markRequestShipped(requestId, trackingCode, trackingUrl);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Admin marks a collect-path request as ready for pickup. Admin-only.
 */
router.post("/:requestId/ready-for-collection", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = getActorName(req);

    if (!actorName) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const result = await markReadyForCollection(requestId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Mark a request received/collected. Ownership-gated: the actor must be the
 * request's user, OR an admin acting on their behalf. This is the requester's
 * confirmation that the device arrived; it gates the feedback nudge.
 */
router.post("/:requestId/receive", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    const actorName = getActorName(req);

    if (!actorName) {
      return res.status(401).json({ success: false, message: "Missing actor identity" });
    }
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }

    // Ownership check: load the request, confirm actor is its user or an admin.
    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { userName: true },
    });
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    const isAdmin = isAdminEmail(getActorEmail(req));
    const isOwner = request.userName === actorName;
    if (!isAdmin && !isOwner) {
      return res.status(403).json({
        success: false,
        message: "Only the request's owner or an admin can mark it received",
      });
    }

    const result = await markRequestReceived(requestId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;