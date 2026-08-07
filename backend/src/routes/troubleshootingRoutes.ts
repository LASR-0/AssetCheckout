import { Router, Request, Response, NextFunction } from "express";
import {
  troubleshootingRepository,
  deviceKeyForCategoryName,
  deviceKeysForCategories,
  type DeviceKey,
} from "../content/troubleshooting/index.js";
import { getSupportPhone, isSupportPhoneConfigured } from "../config/support.js";
import { getRequestableAssetCategories } from "../services/snipeitassets.js";
import { getRequestableAccessoryCategories } from "../services/snipeitaccessories.js";
import {
  analyticsEnabled,
  getAnalyticsSummary,
  isEventType,
  recordEvent,
} from "../services/troubleshootingAnalytics.js";
import { getActorEmail } from "../config/auth.js";
import { isAdminEmail } from "../config/auth.js";
import { getSetting, setSetting } from "../services/settings.js";

///  +-----------------------------------------------------------------+
///  |                   TROUBLESHOOTING ROUTES                        |
///  +-----------------------------------------------------------------+
//
//  Read-only, all of it. Troubleshooting touches no request workflow and
//  writes nothing to Snipe, so there is no admin guard here and no PUT —
//  every GET below is safe for any signed-in person, which matches the other
//  read routes in this app.
//
//  The content itself never leaves the repository interface. These handlers
//  shape responses and resolve the Snipe side of the device picker; they do
//  not reach into the content modules.
///  +-----------------------------------------------------------------+

const router = Router();

/** Express 5 types a route param as `string | string[]`. Ours are always
 *  single segments, so this narrows once instead of at every use. */
const param = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/// ── Config ───────────────────────────────────────────────────────────────

router.get("/config", (_req: Request, res: Response) => {
  res.json({
    supportPhone: getSupportPhone(),
    // Lets the UI soften the call-to-action rather than inviting somebody to
    // dial a row of X's.
    supportPhoneConfigured: isSupportPhoneConfigured(),
  });
});

/// ── Device picker ────────────────────────────────────────────────────────
//
//  Which devices get a tile is a question about this deployment, not about
//  the content — it depends on what admins have made requestable. So the
//  Snipe lookup happens here and the repository is handed the resolved keys.
//
//  DELIBERATELY QUIET ON SNIPE FAILURE. If the category fetch fails we fall
//  back to the devices we have content for rather than erroring the page.
//  Troubleshooting is where somebody lands when something is already broken;
//  handing them a second broken thing because a catalogue call timed out
//  would be the wrong trade. The same reasoning as AccessoryQuickStart on the
//  home page, which renders nothing rather than an error state.

async function requestableCategories(): Promise<{ id: number; name: string }[]> {
  try {
    const [assets, accessories] = await Promise.all([
      getRequestableAssetCategories(),
      getRequestableAccessoryCategories(),
    ]);
    // Both lists together: the nine device keys span asset categories
    // (laptop, phone, monitor) and accessory categories (headphones, mouse).
    return [...assets, ...accessories];
  } catch (err) {
    console.error("[troubleshooting] requestable categories unavailable:", err);
    return [];
  }
}

router.get("/devices", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const categories = await requestableCategories();
    const tiles = troubleshootingRepository.buildPicker(
      deviceKeysForCategories(categories)
    );

    // Which Snipe categories landed on each tile, so a caller holding a
    // category id can find its device without repeating the name-matching
    // rules on the client. The "what's wrong with it?" dialog uses this to
    // send somebody straight to the right device's symptoms.
    //
    // Attached here rather than inside the repository on purpose: a Snipe
    // category id is a fact about this deployment, not about the content, and
    // the repository is the seam that a database implementation would have to
    // satisfy.
    const categoryIds = new Map<DeviceKey, number[]>();
    for (const category of categories) {
      const key = deviceKeyForCategoryName(category.name);
      if (!key) continue;
      const existing = categoryIds.get(key);
      if (existing) existing.push(category.id);
      else categoryIds.set(key, [category.id]);
    }

    res.json({
      devices: tiles.map((tile) => ({
        ...tile,
        categoryIds: categoryIds.get(tile.key) ?? [],
      })),
    });
  } catch (err) {
    next(err);
  }
});

/// ── One device's symptom taxonomy ────────────────────────────────────────

router.get("/devices/:deviceKey", (req: Request, res: Response, next: NextFunction) => {
  try {
    const deviceKey = param(req.params.deviceKey);
    const categories = troubleshootingRepository.getDeviceCategories(deviceKey);

    // No taxonomy means no such device in the library. 404 rather than an
    // empty 200, so a mistyped URL is distinguishable from a device whose
    // articles are all still to be written.
    if (categories.length === 0) {
      return res.status(404).json({ error: "Unknown device" });
    }

    const device = troubleshootingRepository
      .listDevices()
      .find((d) => d.key === deviceKey);

    res.json({ device, categories });
  } catch (err) {
    next(err);
  }
});

/// ── One symptom ──────────────────────────────────────────────────────────
//
//  Returns 200 with `article: null` when the symptom exists but hasn't been
//  written. That is the Draft state, and it is a legitimate destination —
//  a branch can point at one, and the page still tells the user the symptom
//  is known and gives them the escape hatch. Only an unknown SYMPTOM is a 404.

router.get(
  "/devices/:deviceKey/symptoms/:symptomId",
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const deviceKey = param(req.params.deviceKey);
      const symptomId = param(req.params.symptomId);

      const category = troubleshootingRepository
        .getDeviceCategories(deviceKey)
        .find((c) => c.symptoms.some((s) => s.id === symptomId));

      if (!category) {
        return res.status(404).json({ error: "Unknown symptom" });
      }

      const symptom = category.symptoms.find((s) => s.id === symptomId)!;
      const device = troubleshootingRepository
        .listDevices()
        .find((d) => d.key === deviceKey);

      res.json({
        device,
        symptom,
        category: { id: category.id, name: category.name, glyph: category.glyph },
        article: troubleshootingRepository.getArticle(deviceKey, symptomId),
        siblings: troubleshootingRepository.getSiblingSymptoms(deviceKey, symptomId),
      });
    } catch (err) {
      next(err);
    }
  }
);

/// ── Instrumentation ──────────────────────────────────────────────────────
//
//  Whether the library deflects tickets, or whether people read four steps
//  and ring IT anyway. Without this the pilot can't answer its own question.
//
//  NEVER FAILS THE CALLER. Recording is fire-and-forget: a 202 goes back
//  regardless, and a write failure is logged server-side and swallowed. An
//  analytics write must not be able to break a page somebody opened because
//  their phone is already broken — and the client has nothing useful to do
//  with the error anyway.

router.post("/events", async (req: Request, res: Response) => {
  // Answer first, record after. Nothing downstream depends on the outcome.
  res.status(202).json({ recorded: true });

  try {
    if (!(await analyticsEnabled())) return;

    const { type, sessionId, deviceKey, symptomId, stepNumber, query, detail } =
      req.body ?? {};

    // A bad payload is dropped rather than reported: this endpoint is only
    // ever called by our own page, so a malformed body is a bug to find in
    // the logs, not something to tell the browser about.
    if (!isEventType(type) || typeof sessionId !== "string" || !sessionId.trim()) {
      console.warn("[troubleshooting] ignored malformed event:", { type, sessionId });
      return;
    }

    await recordEvent({ type, sessionId, deviceKey, symptomId, stepNumber, query, detail });
  } catch (err) {
    console.error("[troubleshooting] failed to record event:", err);
  }
});

/// ── Admin: the settings card ─────────────────────────────────────────────

const DEFAULT_WINDOW_DAYS = 90;

router.get("/analytics", async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isAdminEmail(getActorEmail(req))) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const raw = Number(req.query.days);
    const days = Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : DEFAULT_WINDOW_DAYS;

    res.json(await getAnalyticsSummary(days));
  } catch (err) {
    next(err);
  }
});

router.post("/analytics/enabled", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actorEmail = getActorEmail(req);
    if (!isAdminEmail(actorEmail)) {
      return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ success: false, message: "enabled must be a boolean" });
    }

    await setSetting("troubleshooting_analytics_enabled", String(enabled), actorEmail);
    res.json({ success: true, enabled });
  } catch (err) {
    next(err);
  }
});

router.get("/analytics/enabled", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ enabled: (await getSetting("troubleshooting_analytics_enabled")) === "true" });
  } catch (err) {
    next(err);
  }
});

export default router;
