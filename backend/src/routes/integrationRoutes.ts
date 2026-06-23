import express from "express";
import { createRequest } from "../services/request.js";
import { requireApiToken } from "../middleware/apiToken.js";

const router = express.Router();

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

router.post("/hrt/request", requireApiToken, async (req, res, next) => {
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
      newNumber: body.newNumber,
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;