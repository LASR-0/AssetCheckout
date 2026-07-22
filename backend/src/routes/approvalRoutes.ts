import express from "express";
import {
  approveRequest,
  rejectRequest,
  useExistingModelForRequest,
  createNewModelForRequest,
  fillAssetDetailsForRequest,
  markRequestShipped,
  markReadyForCollection,
  markRequestReceived,
  useExistingAccessoryForRequest,
  createNewAccessoryForRequest,
  addAccessoryStockForRequest,
} from "../services/request.js";
import { searchModelsByManufacturer } from "../services/snipeitassets.js";
import { searchAccessories } from "../services/snipeitaccessories.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import { getActorName, getActorEmail, isAdminEmail } from "../config/auth.js";

const router = express.Router();

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
///  |               ACCESSORY SELECTION ROUTES (phase 3c)             |
///  +-----------------------------------------------------------------+
//
//  The non-standard accessory twins of the model-creation routes above.
//  Same actor-gating pattern as those (authenticated actor required; the
//  service functions enforce kind + row-state). Mounted on the same
//  /api/approval router. The request-kind guard lives in the service
//  (loadAccessoryRequestAtSelection / ...AtQuantity) so an accessory
//  endpoint hit against an asset request returns a clean 400.
///  +-----------------------------------------------------------------+

/**
 * Search existing accessories for a non-standard request. `name` is required
 * (the primary match key); `manufacturer` is optional (most accessories have
 * none). Returns per-location records with a hasAvailable flag — the admin
 * picks one specific record, so location duplicates are shown, not grouped.
 */
router.get("/:requestId/search-accessories", async (req, res, next) => {
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

    const manufacturer = String(req.query.manufacturer ?? "").trim();
    const name = String(req.query.name ?? "").trim();

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    // Optional location filter — narrows results to one site when supplied.
    let locationId: number | undefined;
    const rawLocationId = req.query.locationId;
    if (rawLocationId !== undefined && String(rawLocationId).trim() !== "") {
      const parsed = Number(rawLocationId);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({
          success: false,
          message: "locationId, when provided, must be a positive number",
        });
      }
      locationId = parsed;
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

    const matches = await searchAccessories({
      manufacturer: manufacturer || undefined,
      name,
      categoryId: request.categoryId,
      locationId,
    });

    res.json({
      success: true,
      matches,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/:requestId/use-existing-accessory", async (req, res, next) => {
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

    const { snipeAccessoryId } = req.body ?? {};
    if (
      typeof snipeAccessoryId !== "number" ||
      !Number.isFinite(snipeAccessoryId)
    ) {
      return res.status(400).json({
        success: false,
        message: "snipeAccessoryId is required and must be a number",
      });
    }

    const result = await useExistingAccessoryForRequest(
      requestId,
      snipeAccessoryId
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/:requestId/create-accessory", async (req, res, next) => {
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

    const name = String(req.body?.name ?? "").trim();
    // Optional buffer fields — kept in the ModelRequest, not pushed to Snipe.
    const rawManufacturer = req.body?.manufacturer;
    const rawModelNumber = req.body?.modelNumber;
    const manufacturer =
      typeof rawManufacturer === "string" && rawManufacturer.trim()
        ? rawManufacturer.trim()
        : null;
    const modelNumber =
      typeof rawModelNumber === "string" && rawModelNumber.trim()
        ? rawModelNumber.trim()
        : null;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "name is required",
      });
    }

    // Location is required for a new accessory — the admin authors its site
    // at creation (Snipe won't set it on create, so the service create-then-
    // PATCHes it).
    const rawLocationId = req.body?.locationId;
    if (
      typeof rawLocationId !== "number" ||
      !Number.isFinite(rawLocationId) ||
      rawLocationId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "locationId is required and must be a positive number",
      });
    }

    const result = await createNewAccessoryForRequest(requestId, {
      name,
      locationId: rawLocationId,
      manufacturer,
      modelNumber,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                 ACCESSORY QUANTITY ROUTE (phase 3c)             |
///  +-----------------------------------------------------------------+

/**
 * Waiting-phase submit: ADD the arrived quantity to the selected accessory's
 * current stock (delta, not a set). When stock becomes available the service
 * checks out + completes automatically. The accessory twin of the asset-
 * details route. Location is NOT set here — it's authored at create time.
 */
router.post("/:requestId/accessory-stock", async (req, res, next) => {
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

    const rawQty = req.body?.arrivedQty;
    if (
      typeof rawQty !== "number" ||
      !Number.isFinite(rawQty) ||
      rawQty < 0 ||
      !Number.isInteger(rawQty)
    ) {
      return res.status(400).json({
        success: false,
        message: "arrivedQty is required and must be a non-negative integer",
      });
    }

    const result = await addAccessoryStockForRequest(requestId, {
      arrivedQty: rawQty,
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