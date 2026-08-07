import { Router, Request, Response, NextFunction } from "express";
import {
  troubleshootingRepository,
  deviceKeysForCategories,
  type DeviceKey,
} from "../content/troubleshooting/index.js";
import { getSupportPhone, isSupportPhoneConfigured } from "../config/support.js";
import { getRequestableAssetCategories } from "../services/snipeitassets.js";
import { getRequestableAccessoryCategories } from "../services/snipeitaccessories.js";

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

async function requestableDeviceKeys(): Promise<DeviceKey[]> {
  try {
    const [assets, accessories] = await Promise.all([
      getRequestableAssetCategories(),
      getRequestableAccessoryCategories(),
    ]);
    // Both lists together: the nine device keys span asset categories
    // (laptop, phone, monitor) and accessory categories (headphones, mouse).
    return deviceKeysForCategories([...assets, ...accessories]);
  } catch (err) {
    console.error("[troubleshooting] requestable categories unavailable:", err);
    return [];
  }
}

router.get("/devices", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const devices = troubleshootingRepository.buildPicker(await requestableDeviceKeys());
    res.json({ devices });
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

export default router;
