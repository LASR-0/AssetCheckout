import express from "express";
import { createRequest } from "../services/request.js";
import { requireApiToken } from "../middleware/apiToken.js";
import {
  findSnipeUserByEmail,
  createSnipeUser,
  getUserAssets,
  offboardSnipeUser,
  getRequestableAssetCategories,
  getAllUserPhones,
} from "../services/snipeit.js";
import { AppError } from "../utils/errors.js";

const router = express.Router();

// Every /hrt/* route is machine-to-machine (see integration docs) — apply the
// shared-secret guard once here instead of per-route.
router.use("/hrt", requireApiToken);

///  +-----------------------------------------------------------------+
///  |                   HRT INTEGRATION ROUTE                         |
///  +-----------------------------------------------------------------+
//
//  POST /api/integrations/hrt/request
//
//  Lets NextHRT create hardware requests programmatically. Authenticated by
//  API token (requireApiToken), NOT the forward-auth proxy — HRT is a service,
//  not a user. HRT is responsible for supplying valid Snipe identities
//  (userId, userName) in the payload.
//
//  Maps the incoming payload onto the same createRequest service the UI uses,
//  so HRT-origin requests behave identically once created.
///  +-----------------------------------------------------------------+

router.post("/hrt/request", async (req, res, next) => {
  try {
    const body = req.body ?? {};

    const result = await createRequest({
      userId: body.userId,
      userName: body.userName,
      categoryId: body.categoryId,
      categoryName: body.categoryName,
      requestType: body.requestType,
      reason: body.reason,
      manager: body.manager,
      managerId: body.managerId,
      callText: body.callText,
      needsData: body.needsData,
      numberOption: body.numberOption,
      reuseNumberFromEmail: body.reuseNumberFromEmail,
      reuseNumberPhone: body.reuseNumberPhone,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |              HRT INTEGRATION — CATEGORY CATALOGUE               |
///  +-----------------------------------------------------------------+
//
//  GET /api/integrations/hrt/categories
//
//  Lets HRT poll the requestable asset categories so an admin can seed /
//  reconcile HRT's own hardware catalogue against what's actually
//  requestable here. Same {id, name} shape the request payload keys on
//  (categoryId), so HRT can map a category straight onto a hardware item.
//
//  Restricted to the categories admins have whitelisted as requestable (the
//  REQUESTABLE_CATEGORIES setting) — non-requestable categories are never
//  exposed to HRT.
///  +-----------------------------------------------------------------+

router.get("/hrt/categories", async (_req, res, next) => {
  try {
    const categories = await getRequestableAssetCategories();
    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |              HRT INTEGRATION — SNIPE USER LIFECYCLE             |
///  +-----------------------------------------------------------------+
//
//  HRT owns the employee lifecycle; these routes let it mirror that
//  lifecycle into Snipe-IT without holding Snipe credentials itself:
//
//    POST /api/integrations/hrt/users              — find-or-create a user
//    GET  /api/integrations/hrt/users/lookup       — resolve by email
//    GET  /api/integrations/hrt/users/:id/assets   — what they have out
//    POST /api/integrations/hrt/users/:id/offboard — check everything in,
//                                                    deactivate the account
///  +-----------------------------------------------------------------+

/**
 * Find-or-create, keyed on email. Idempotent by design: HRT calls this from
 * retryable background jobs, so a retry after a partial failure must return
 * the existing user rather than erroring or duplicating.
 */
router.post("/hrt/users", async (req, res, next) => {
  try {
    const { firstName, lastName, email, jobTitle, notes } = req.body ?? {};

    if (typeof email !== "string" || !email.trim()) {
      throw new AppError("email is required", 400);
    }
    if (typeof firstName !== "string" || !firstName.trim()) {
      throw new AppError("firstName is required", 400);
    }
    if (typeof lastName !== "string" || !lastName.trim()) {
      throw new AppError("lastName is required", 400);
    }

    const existing = await findSnipeUserByEmail(email);
    if (existing) {
      return res.json({ success: true, created: false, user: existing });
    }

    const user = await createSnipeUser({ firstName, lastName, email, jobTitle, notes });
    res.status(201).json({ success: true, created: true, user });
  } catch (err) {
    next(err);
  }
});

router.get("/hrt/users/lookup", async (req, res, next) => {
  try {
    const email = req.query.email;
    if (typeof email !== "string" || !email.trim()) {
      throw new AppError("email query parameter is required", 400);
    }

    const user = await findSnipeUserByEmail(email);
    if (!user) {
      throw new AppError(`No Snipe user found for ${email}`, 404);
    }

    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
});

router.get("/hrt/users/:id/assets", async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError("Invalid user id", 400);
    }

    const assets = await getUserAssets(userId);
    res.json({ success: true, userId, assets });
  } catch (err) {
    next(err);
  }
});

/**
 * Exit flow: check in everything the user has out, then deactivate them.
 * Partial failures come back in `failed` with success still true — HRT
 * surfaces those for manual follow-up rather than retrying blindly (the
 * successfully checked-in assets make a naive retry non-idempotent).
 */
router.post("/hrt/users/:id/offboard", async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new AppError("Invalid user id", 400);
    }

    const note = typeof req.body?.note === "string" ? req.body.note : undefined;

    const result = await offboardSnipeUser(userId, note);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get("/hrt/users/phones", async (_req, res, next) => {
  try {
    const users = await getAllUserPhones();
    res.json({ success: true, users });
  } catch (err) {
    next(err);
  }
});

export default router;