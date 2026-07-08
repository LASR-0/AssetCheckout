import express from "express";
import { prisma } from "../db/prisma.js";
import { getSetting } from "../services/settings.js";
import { getActorEmail, isAdminEmail } from "../config/auth.js";
import { setSetting } from "../services/settings.js";

const router = express.Router();

const ALLOWED = ["improved", "no_change", "worse"];

///  +-----------------------------------------------------------------+
///  |                      FEEDBACK ROUTES                            |
///  +-----------------------------------------------------------------+
//
//  Anonymous internal feedback. Behind forward-auth (any authenticated staff
//  member) but role-unrestricted, and deliberately stores NOTHING about who
//  submitted — no userId, no actor, no request link. The submit endpoint and
//  the page both gate on the feedback_enabled setting.
///  +-----------------------------------------------------------------+

/**
 * Whether feedback collection is currently active. The page, post-receipt
 * nudge, and landing CTA all read this to decide whether to surface feedback.
 */
router.get("/enabled", async (_req, res, next) => {
  try {
    const enabled = (await getSetting("feedback_enabled")) === "true";
    res.json({ enabled });
  } catch (err) {
    next(err);
  }
});

/**
 * Submit anonymous feedback. Both yes/no questions are required; the comment
 * is optional. Records no submitter identity by design. Rejected when the
 * feature is disabled (server-side enforcement — the client also hides it,
 * but this is the actual guarantee).
 */

router.post("/", async (req, res, next) => {
  try {
    const enabled = (await getSetting("feedback_enabled")) === "true";
    if (!enabled) {
      return res.status(403).json({
        success: false,
        message: "Feedback is not currently being collected.",
      });
    }

    const { improvedRequesting, improvesItOverall, comments } = req.body ?? {};

    if (
      !ALLOWED.includes(improvedRequesting) ||
      !ALLOWED.includes(improvesItOverall)
    ) {
      return res.status(400).json({
        success: false,
        message: "Both questions must be answered with a valid response.",
      });
    }

    const trimmedComments =
      typeof comments === "string" && comments.trim().length > 0
        ? comments.trim()
        : null;

    await prisma.feedback.create({
      data: {
        improvedRequesting,
        improvesItOverall,
        comments: trimmedComments,
      },
    });

    res.json({ success: true, message: "Thank you for your feedback." });
  } catch (err) {
    next(err);
  }
});

router.get("/all", async (req, res, next) => {
  try {
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }
    const rows = await prisma.feedback.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ feedback: rows });
  } catch (err) {
    next(err);
  }
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
    await setSetting("feedback_enabled", enabled ? "true" : "false", actorEmail);
    res.json({ enabled });
  } catch (err) {
    next(err);
  }
});

/** RFC-4180 field escaping: wrap in quotes if the value contains a comma,
 * quote, or newline, and double any internal quotes. */
function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

router.get("/export", async (req, res, next) => {
  try {
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const rows = await prisma.feedback.findMany({ orderBy: { createdAt: "desc" } });

    const header = ["id", "improvedRequesting", "improvesItOverall", "comments", "createdAt"];
    const lines = [header.join(",")];

    for (const r of rows) {
      lines.push(
        [
          String(r.id),
          csvField(r.improvedRequesting),
          csvField(r.improvesItOverall),
          csvField(r.comments ?? ""),
          csvField(r.createdAt.toISOString()),
        ].join(",")
      );
    }

    const csv = lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="feedback-export-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;