import { Router, Request, Response, NextFunction } from "express";
import { isAdminEmail, getActorEmail } from "../config/auth.js";
import { prisma } from "../db/prisma.js";
import { enqueue } from "../jobs/jobQueue.js";
import type { JobType, JobStatus } from "../../generated/prisma_client/client.js";
import { maxAttemptsFor, DRY_RUN_JOBS } from "../jobs/policy.js";
import { getSetting, setSetting } from "../services/settings.js";
import { SCHEDULE_KEYS } from "../jobs/scheduler.js";
import nodeCron from "node-cron";

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const email = getActorEmail(req);
  if (!isAdminEmail(email)) {
    res.status(403).json({ error: "Admins only" });
    return false;
  }
  return true;
}

// Valid enum values, used to validate query/body params before they reach
// Prisma (which would otherwise throw an opaque error on a bad value).
const JOB_STATUSES: JobStatus[] = ["Pending", "Running", "Completed", "Failed"];
const JOB_TYPES: JobType[] = [
  "SEND_REQUEST_NOTIFICATION",
  "SYNC_REQUEST_TO_SHAREPOINT",
  "REFRESH_CATEGORIES_CACHE",
  "REFRESH_PRICES_CACHE",
  "CLEANUP_STALE_REQUESTS",
  "CLEANUP_ORPHAN_SNIPE_MODELS",
  "PURGE_OLD_JOB_HISTORY",
];

// Job types an admin is allowed to trigger manually from the UI. Excludes
// types whose handlers aren't implemented yet, so the "Run now" button can't
// queue a guaranteed "no handler" failure. Expand as handlers land.
const MANUALLY_TRIGGERABLE: Set<JobType> = new Set([
  "REFRESH_CATEGORIES_CACHE",
  "REFRESH_PRICES_CACHE",
  "PURGE_OLD_JOB_HISTORY",
  "CLEANUP_STALE_REQUESTS",
  "CLEANUP_ORPHAN_SNIPE_MODELS"
]);

///  +-----------------------------------------------------------------+
///  |                       LIST JOBS                                 |
///  +-----------------------------------------------------------------+

/**
 * GET /api/jobs
 *
 * Paginated list of BackgroundJob rows, newest first. Admin-only.
 *
 * Query params (all optional):
 *   status   — filter by JobStatus
 *   type     — filter by JobType
 *   page     — 1-based page number (default 1)
 *   pageSize — rows per page (default 20, capped at 100)
 *
 * Response: { jobs, total, page, pageSize }
 */
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const statusParam = req.query.status as string | undefined;
    const typeParam = req.query.type as string | undefined;

    const page = Math.max(1, parseInt((req.query.page as string) ?? "1", 10) || 1);
    const rawPageSize = parseInt((req.query.pageSize as string) ?? "20", 10) || 20;
    const pageSize = Math.min(Math.max(1, rawPageSize), 100);

    const where: { status?: JobStatus; type?: JobType } = {};

    if (statusParam) {
      if (!JOB_STATUSES.includes(statusParam as JobStatus)) {
        return res.status(400).json({ error: `Invalid status: ${statusParam}` });
      }
      where.status = statusParam as JobStatus;
    }

    if (typeParam) {
      if (!JOB_TYPES.includes(typeParam as JobType)) {
        return res.status(400).json({ error: `Invalid type: ${typeParam}` });
      }
      where.type = typeParam as JobType;
    }

    const [jobs, total] = await Promise.all([
      prisma.backgroundJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.backgroundJob.count({ where }),
    ]);

    res.json({ jobs, total, page, pageSize });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       ENQUEUE JOB                               |
///  +-----------------------------------------------------------------+

/**
 * POST /api/jobs
 *
 * Manually enqueue a job (the "Run now" button). Admin-only.
 *
 * Body: { type: JobType }
 *
 * Manual triggers jump the queue (priority) so they run ahead of any
 * cron-fired jobs waiting their turn. Dedup applies: if an identical job is
 * already Pending, no new row is created and the response says so, so the
 * UI can show "already queued" rather than stacking duplicates.
 *
 * Only types in MANUALLY_TRIGGERABLE are accepted — types without a handler
 * yet are rejected up front rather than queued to fail.
 */
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { type } = (req.body ?? {}) as { type?: string };

    if (!type) {
      return res.status(400).json({ error: "Missing required field: type" });
    }

    if (!JOB_TYPES.includes(type as JobType)) {
      return res.status(400).json({ error: `Invalid job type: ${type}` });
    }

    if (!MANUALLY_TRIGGERABLE.has(type as JobType)) {
      return res.status(400).json({
        error: `Job type ${type} can't be triggered manually (no handler implemented yet)`,
      });
    }

    const created = await enqueue(type as JobType, undefined, {
      priority: true,
      maxAttempts: maxAttemptsFor(type as JobType),
    });

    if (!created) {
      return res.json({
        success: true,
        enqueued: false,
        message: `${type} is already queued`,
      });
    }

    res.json({
      success: true,
      enqueued: true,
      message: `${type} enqueued`,
    });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                       JOB SCHEDULES                             |
///  +-----------------------------------------------------------------+

/**
 * GET /api/job/schedules
 *
 * Returns the current cron expression for each scheduled job, read live from
 * the Setting table. Drives the schedule badges (and, later, the schedule
 * editor) in the Background Jobs UI. Admin-only.
 *
 * Derived from SCHEDULE_KEYS so a newly-added scheduled job appears here
 * automatically. Raw cron is returned; the frontend translates for display.
 */
router.get("/schedules", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const entries = await Promise.all(
      Object.entries(SCHEDULE_KEYS).map(async ([settingKey, jobType]) => ({
        jobType,
        settingKey,
        cron: (await getSetting(settingKey)) ?? "",
      }))
    );

    res.json({ schedules: entries });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/job/schedule
 * Body: { settingKey, cron }
 *
 * Updates a scheduled job's cron expression. Admin-only.
 *
 * NOTE: the new schedule takes effect on the next server restart — schedules
 * are registered once at startup.
 */

router.post("/schedule", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { settingKey, cron: expression } = (req.body ?? {}) as {
      settingKey?: string;
      cron?: string;
    };

    if (!settingKey || !(settingKey in SCHEDULE_KEYS)) {
      return res.status(400).json({ error: `Unknown schedule key: ${settingKey}` });
    }

    if (typeof expression !== "string" || !expression.trim()) {
      return res.status(400).json({ error: "Missing cron expression" });
    }

    if (!nodeCron.validate(expression.trim())) {
      return res.status(400).json({ error: `Invalid cron expression: ${expression}` });
    }

    await setSetting(settingKey, expression.trim(), getActorEmail(req));

    res.json({
      settingKey,
      cron: expression.trim(),
      note: "Schedule updated — takes effect after the next server restart.",
    });
  } catch (err) {
    next(err);
  }
});

///  +-----------------------------------------------------------------+
///  |                    DRY-RUN STATES                               |
///  +-----------------------------------------------------------------+

/**
 * GET /api/job/dry-run-states
 *
 * Current dry-run state for every job that supports it (from DRY_RUN_JOBS),
 * read live from settings. Drives the dry-run/live badge + toggle in the UI.
 * Defaults a missing/unset value to true (dry-run) — the safe default.
 */
router.get("/dry-run-states", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const entries = await Promise.all(
      Object.entries(DRY_RUN_JOBS).map(async ([jobType, settingKey]) => {
        const raw = await getSetting(settingKey as string);
        const dryRun = (raw ?? "true").toLowerCase() !== "false";
        return [jobType, dryRun] as const;
      })
    );

    res.json({ states: Object.fromEntries(entries) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/job/dry-run
 * Body: { jobType, dryRun }
 **/

router.post("/dry-run", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { jobType, dryRun } = (req.body ?? {}) as { jobType?: string; dryRun?: boolean };

    if (typeof dryRun !== "boolean") {
      return res.status(400).json({ error: "dryRun must be a boolean" });
    }

    const settingKey = jobType ? DRY_RUN_JOBS[jobType as JobType] : undefined;
    if (!settingKey) {
      return res.status(400).json({ error: `Job type ${jobType} has no dry-run setting` });
    }

    await setSetting(settingKey, dryRun ? "true" : "false", getActorEmail(req));
    res.json({ jobType, dryRun });
  } catch (err) {
    next(err);
  }
});

export default router;