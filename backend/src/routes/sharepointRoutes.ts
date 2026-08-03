import express from "express";
import { getSetting, setSetting } from "../services/settings.js";
import { getActorEmail, isAdminEmail } from "../config/auth.js";

///  +-----------------------------------------------------------------+
///  |                   SHAREPOINT-BOUND TOGGLES                      |
///  +-----------------------------------------------------------------+
//
//  Both switches on the SharePoint settings card. They share a mailbox and a
//  transport but drive two different Power Automate flows, so they are two
//  independent settings rather than one:
//
//    sharepoint_sync_enabled  the nightly ordering-ledger sweep (assets only)
//    capex_log_enabled        purchases over the threshold, lodged at the
//                             moment a manager accepts a quote
//
//  Turning one on must never imply the other. The ordering ledger deliberately
//  excludes accessories; the CAPEX ledger is accessories-only in practice. An
//  admin enabling "sync" should not silently start mailing a second flow.
///  +-----------------------------------------------------------------+

const router = express.Router();

/**
 * Build the GET/POST pair for a boolean setting.
 *
 * Written once rather than copied: the second toggle would otherwise be a
 * paste of the first, and the pair that drifts is always the admin check.
 */
function booleanSettingRoutes(path: string, key: string) {
  router.get(path, async (_req, res, next) => {
    try {
      res.json({ enabled: (await getSetting(key)) === "true" });
    } catch (err) {
      next(err);
    }
  });

  router.post(path, async (req, res, next) => {
    try {
      const actorEmail = getActorEmail(req);
      if (!isAdminEmail(actorEmail)) {
        return res
          .status(403)
          .json({ success: false, message: "Admin access required" });
      }

      const { enabled } = req.body ?? {};
      if (typeof enabled !== "boolean") {
        return res
          .status(400)
          .json({ success: false, message: "enabled must be a boolean" });
      }

      await setSetting(key, enabled ? "true" : "false", actorEmail);
      res.json({ enabled });
    } catch (err) {
      next(err);
    }
  });
}

booleanSettingRoutes("/enabled", "sharepoint_sync_enabled");
booleanSettingRoutes("/capex-enabled", "capex_log_enabled");

export default router;
