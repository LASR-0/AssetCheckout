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
import {
  createQuoteForRequest,
  acceptQuoteForRequest,
  rejectQuoteForRequest,
  getQuoteDocument,
} from "../services/quote.js";
import {
  searchModelsByManufacturer,
  searchModelsForCorrection,
  searchAssetsBySerial,
  findAssetsWithSerial,
} from "../services/snipeitassets.js";
import { searchAccessories } from "../services/snipeitaccessories.js";
import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";
import {
  getActorName,
  getActorEmail,
  isAdminEmail,
  normalizeName,
} from "../config/auth.js";

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

    // Corrections only. The Manage dialog supplies the Snipe record the admin
    // matched a free-text report to, or states they fixed Snipe by hand.
    // Ignored by every provisioning path — those derive their own targets.
    const { modelId, snipeRecordId, resolvedManually, serial } = req.body ?? {};

    const result = await approveRequest(
      requestId,
      { name: actorName, isAdmin },
      {
        modelId: typeof modelId === "number" ? modelId : null,
        snipeRecordId: typeof snipeRecordId === "number" ? snipeRecordId : null,
        // The admin's corrected serial, where they changed it. Null (not
        // undefined) leaves the service falling back to what the requester
        // reported, which is what an untouched field means.
        serial: typeof serial === "string" && serial.trim() ? serial.trim() : null,
        resolvedManually: resolvedManually === true,
      }
    );
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

///  +-----------------------------------------------------------------+
///  |               CORRECTION RESOLUTION LOOKUPS                     |
///  +-----------------------------------------------------------------+
//
//  Let an admin resolving a correction NAME the Snipe record instead of
//  typing its internal id into a number box. The accessory side already had
//  this; the asset side asked for a raw model id and a raw asset id, with no
//  lookup and no confirmation of what was picked — so a plausible-looking
//  wrong number wrote to the wrong record and reported success.
//
//  Admin-gated, not merely actor-gated. These read the asset estate, and there
//  is already a flagged gap where the accessory selection routes settle for
//  any resolved actor; this does not add to it.
///  +-----------------------------------------------------------------+

/** Models matching a name or model number, narrowed to the correction's
 *  category by default. */
router.get("/:requestId/correction/search-models", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admins only" });
    }

    const query = String(req.query.query ?? "").trim();
    if (!query) {
      return res.status(400).json({ success: false, message: "query is required" });
    }

    const request = await prisma.request.findUnique({
      where: { id: requestId },
      select: { categoryId: true },
    });
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    // allCategories=true lets the admin widen the search when the correction
    // is itself about the thing being in the wrong category — the common case
    // is still the narrowed one, so that stays the default.
    const searchAll = req.query.allCategories === "true";

    const matches = await searchModelsForCorrection({
      query,
      categoryId: searchAll ? null : request.categoryId,
    });

    res.json({ success: true, matches });
  } catch (err) {
    next(err);
  }
});

/**
 * Is this serial already on another asset? Advisory only.
 *
 * Backs the live badge on the Manage dialog so the admin finds out while
 * they're typing rather than after submitting. It does NOT replace the check
 * at apply time: this answer is seconds old by the time they click, and
 * another admin could claim the serial in between. The write-time check in
 * applyCorrectionToSnipe stays authoritative.
 *
 * The correction's own record is excluded — an admin re-entering the serial
 * the asset already carries is not a clash, it's a no-op.
 */
router.get("/:requestId/correction/serial-check", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admins only" });
    }

    const serial = String(req.query.serial ?? "").trim();
    if (!serial) {
      return res.json({ success: true, matches: [] });
    }

    const detail = await prisma.correctionDetail.findUnique({
      where: { requestId },
      select: { snipeRecordId: true },
    });

    const matches = await findAssetsWithSerial(
      serial,
      detail?.snipeRecordId ?? undefined
    );

    res.json({ success: true, matches });
  } catch (err) {
    next(err);
  }
});

/** Assets under a model whose serial matches, with their checkout state. */
router.get("/:requestId/correction/search-assets", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admins only" });
    }

    const modelId = Number(req.query.modelId);
    const serial = String(req.query.serial ?? "").trim();

    if (!Number.isFinite(modelId)) {
      return res.status(400).json({
        success: false,
        message: "modelId is required — pick the model before searching serials",
      });
    }
    if (!serial) {
      return res.status(400).json({ success: false, message: "serial is required" });
    }

    const matches = await searchAssetsBySerial({ modelId, serial });
    res.json({ success: true, matches });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       QUOTE ROUTES                              |
///  +-----------------------------------------------------------------+
//
//  Non-standard accessories come out of the requester's department budget, so
//  the manager approves the price as well as the request. Attaching a quote is
//  IT's job; ANSWERING it is the manager's alone.
//
//  This is where the quote parts company with the first approval, where an
//  admin can stand in for a silent manager. Accepting a quote spends a
//  department's money, and IT is not the department. So the two acts are gated
//  differently: an admin may VIEW the quote — they chased it, they may need to
//  re-send or explain it — but only the named approver may respond to it.
//
//  Consequence worth knowing: a quote whose manager never answers stays at
//  this stage. There is no IT override by design. Ending it means rejecting
//  the request outright, not answering the quote on someone's behalf.
///  +-----------------------------------------------------------------+

/**
 * Resolve who is acting on a quote.
 *
 * `mode` is the whole point of this function. "respond" is manager-only —
 * accepting or rejecting a price commits a budget that isn't IT's. "view" is
 * manager-or-admin, because reading the document IT itself uploaded commits
 * nothing.
 *
 * Manager identity is name-matched because that is how the request records it
 * and how /auth/role resolves the MANAGER role — see authRoutes.ts. Admin
 * identity is email-matched, which is stable across display-name changes. An
 * admin who happens to BE the approver on a request matches as the manager
 * first, and answers as themselves rather than being locked out.
 *
 * Discriminated on a STRING, not a boolean, for the same reason
 * CorrectionOutcome is: this project compiles with `strict: false`, and
 * without strictNullChecks TypeScript will not narrow a union on `ok: true` /
 * `ok: false`. A string tag narrows regardless.
 */
type QuoteActor =
  | { outcome: "allowed"; name: string; onBehalf: boolean }
  | { outcome: "denied"; status: number; message: string };

async function resolveQuoteActor(
  req: express.Request,
  requestId: number,
  mode: "respond" | "view"
): Promise<QuoteActor> {
  const actorName = getActorName(req);
  if (!actorName) {
    return { outcome: "denied", status: 401, message: "Missing actor identity" };
  }

  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { manager: true },
  });
  if (!request) {
    return { outcome: "denied", status: 404, message: "Request not found" };
  }

  const isAdmin = isAdminEmail(getActorEmail(req));
  const isManager =
    !!request.manager && normalizeName(request.manager) === normalizeName(actorName);

  if (isManager) {
    return { outcome: "allowed", name: actorName, onBehalf: false };
  }
  if (isAdmin && mode === "view") {
    return { outcome: "allowed", name: actorName, onBehalf: true };
  }

  // Named rather than generic when it's an admin being refused: they can see
  // the action isn't theirs, so the message should say why rather than read
  // as a permissions bug.
  if (isAdmin) {
    return {
      outcome: "denied",
      status: 403,
      message: `Only ${
        request.manager || "the approving manager"
      } can answer this quote — it comes out of their department's budget, not IT's.`,
    };
  }

  return {
    outcome: "denied",
    status: 403,
    message:
      mode === "respond"
        ? "Only the approving manager can respond to a quote"
        : "Only the approving manager or an admin can view a quote",
  };
}

/**
 * Attach a quote and send it to the manager. Admin only.
 *
 * The document arrives base64-encoded in the JSON body rather than as
 * multipart, which keeps the dependency list as it is; the body limit is
 * raised on this route alone so the rest of the API keeps Express's default.
 * The generous headroom over MAX_QUOTE_BYTES covers base64's ~33% inflation
 * plus the surrounding JSON, so an oversized file is rejected by the size
 * check with a useful message rather than by the parser with a bare 413.
 */
router.post(
  "/:requestId/quote",
  express.json({ limit: "15mb" }),
  async (req, res, next) => {
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
        return res.status(403).json({
          success: false,
          message: "Only an admin can attach a quote to a request",
        });
      }

      const { amount, supplier, reference, document } = req.body ?? {};

      if (typeof amount !== "number" || !Number.isFinite(amount)) {
        return res.status(400).json({
          success: false,
          message: "amount is required and must be a number",
        });
      }
      if (typeof supplier !== "string" || !supplier.trim()) {
        return res.status(400).json({
          success: false,
          message: "supplier is required",
        });
      }
      if (
        !document ||
        typeof document.base64 !== "string" ||
        typeof document.mime !== "string" ||
        typeof document.originalName !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "document is required and must carry originalName, mime and base64",
        });
      }

      const result = await createQuoteForRequest(requestId, actorName, {
        amount,
        supplier,
        reference: typeof reference === "string" ? reference : null,
        document: {
          originalName: document.originalName,
          mime: document.mime,
          base64: document.base64,
        },
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/** The manager accepts the quoted price. Theirs alone — see resolveQuoteActor. */
router.post("/:requestId/quote/accept", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }

    const actor = await resolveQuoteActor(req, requestId, "respond");
    if (actor.outcome === "denied") {
      return res.status(actor.status).json({ success: false, message: actor.message });
    }

    const result = await acceptQuoteForRequest(requestId, {
      name: actor.name,
      onBehalf: actor.onBehalf,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * The manager rejects the quoted price — terminal for the request.
 *
 * Takes a reason in the same "REJECTED: x\n REQUEST: y" shape the reject
 * dialog already produces, because the transition itself is delegated to the
 * ordinary rejectRequest path and the requester gets the existing declined
 * email, which parses that format.
 */
router.post("/:requestId/quote/reject", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }

    const actor = await resolveQuoteActor(req, requestId, "respond");
    if (actor.outcome === "denied") {
      return res.status(actor.status).json({ success: false, message: actor.message });
    }

    const { reason } = req.body ?? {};
    if (typeof reason !== "string" || !reason.trim()) {
      return res.status(400).json({
        success: false,
        message: "A reason is required when rejecting a quote",
      });
    }

    const result = await rejectQuoteForRequest(
      requestId,
      { name: actor.name, onBehalf: actor.onBehalf },
      reason
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Stream the stored quote document. Manager-or-admin — wider than responding
 * to it, deliberately: IT chased the quote and uploaded it, and reading it
 * back commits nothing. It is still not public, because the file is a
 * supplier's pricing and not something every authenticated user should be
 * able to pull by guessing a request id.
 *
 * Inline rather than an attachment: a PDF or photo opens in the browser,
 * which is what somebody clicking "view the quote" expects.
 */
router.get("/:requestId/quote/document", async (req, res, next) => {
  try {
    const requestId = Number(req.params.requestId);
    if (Number.isNaN(requestId)) {
      return res.status(400).json({ success: false, message: "Invalid requestId" });
    }

    const actor = await resolveQuoteActor(req, requestId, "view");
    if (actor.outcome === "denied") {
      return res.status(actor.status).json({ success: false, message: actor.message });
    }

    const doc = await getQuoteDocument(requestId);
    res.setHeader("Content-Type", doc.mime);
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${doc.name.replace(/"/g, "")}"`
    );
    res.send(doc.buffer);
  } catch (err) {
    next(err);
  }
});

export default router;