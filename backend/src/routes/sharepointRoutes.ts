import express from "express";
import { getSetting, setSetting } from "../services/settings.js";
import { getActorEmail, isAdminEmail } from "../config/auth.js";

const router = express.Router();

router.get("/enabled", async (_req, res, next) => {
  try {
    const enabled = (await getSetting("sharepoint_sync_enabled")) === "true";
    res.json({ enabled });
  } catch (err) { next(err); }
});

router.post("/enabled", async (req, res, next) => {
  try {
    const actorEmail = getActorEmail(req);
    if (!isAdminEmail(actorEmail)) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, message: "enabled must be a boolean" });
    }
    await setSetting("sharepoint_sync_enabled", enabled ? "true" : "false", actorEmail);
    res.json({ enabled });
  } catch (err) { next(err); }
});

export default router;