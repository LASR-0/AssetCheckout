import { mkdir, writeFile, unlink, access, readdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import {
  SUBJECT_KEYS,
  troubleshootingRepository,
} from "../content/troubleshooting/index.js";

///  +-----------------------------------------------------------------+
///  |              TROUBLESHOOTING SCREENSHOT STORAGE                 |
///  +-----------------------------------------------------------------+
//
//  Modelled on quoteStorage.ts, which already solves this shape of problem —
//  a whitelist, a size cap, a minted filename, a traversal guard and a
//  write-probe at boot that refuses to start on an unmounted volume.
//
//  THE DIRECTORY IS CONFIGURABLE BECAUSE PRODUCTION HAS NOWHERE ELSE TO PUT
//  IT. In development the images live in frontend/public/troubleshooting,
//  where Vite serves them and where dropping a file in by hand still works.
//  In production that path does not exist: Vite bakes public/ into dist/ at
//  build time and the Dockerfile copies the result into the image, so
//  anything written there is inside an ephemeral container and disappears on
//  the next deploy. /data is the only volume, so that is where uploads go.
//
//  THE FOLDER STRUCTURE IS PRESERVED EXACTLY — <subject>/<symptom>/ — and
//  created on demand, so a new article's folder appears by itself. The URL
//  space is identical either way, which is why nothing in the content or the
//  frontend had to change.
//
//  REPLACEMENT MINTS A NEW FILE AND NEVER OVERWRITES. This looks like
//  fussiness and is not: overwriting would put a swapped screenshot live
//  immediately, straight past the draft/publish gate that the article text
//  goes through. Minting Base-2-light.jpg leaves the published article on the
//  old picture until Publish swaps the text and the reference together. The
//  cost is orphaned files, which the health endpoint reports.
///  +-----------------------------------------------------------------+

/// ── Where ────────────────────────────────────────────────────────────────

const DEFAULT_DIR = "../frontend/public/troubleshooting";

export function troubleshootingImagesDir(): string {
  return path.resolve(
    process.env.TROUBLESHOOTING_IMAGES_DIR?.trim() || DEFAULT_DIR
  );
}

/**
 * Refuse to boot if screenshots cannot be written.
 *
 * Same posture as assertQuoteStorage: a read-only or unmounted volume should
 * stop the deploy, not surface when an admin has already cropped a screenshot
 * and pressed upload.
 */
export async function assertTroubleshootingImageStorage(): Promise<void> {
  const dir = troubleshootingImagesDir();

  try {
    await mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.write-probe-${process.pid}`);
    await writeFile(probe, "ok");
    await unlink(probe);
  } catch (err) {
    throw new Error(
      `Troubleshooting image directory is not writable: ${dir}. ` +
        `Set TROUBLESHOOTING_IMAGES_DIR to a writable path. ` +
        `(${err instanceof Error ? err.message : String(err)})`
    );
  }
}

/// ── Image processing, which may legitimately be unavailable ──────────────
//
//  sharp is a native dependency, and the runtime image is Alpine/musl — it
//  needs @img/sharp-linuxmusl-x64 to survive both the install and the
//  `pnpm --prod deploy` copy into the runner. The lockfile carries that
//  variant, but it is the one thing in this feature that cannot be proven
//  without building the container.
//
//  So it is imported lazily and its absence is NOT fatal. A missing image
//  library should cost you uploads, not the whole troubleshooting section —
//  reading articles is what almost everyone is here for, and it needs no
//  image processing at all.

type Sharp = (typeof import("sharp"))["default"];

let sharpModule: Sharp | null = null;
let sharpError: string | null = null;

async function loadSharp(): Promise<Sharp> {
  if (sharpModule) return sharpModule;
  if (sharpError) throw new Error(sharpError);

  try {
    sharpModule = (await import("sharp")).default;
    return sharpModule;
  } catch (err) {
    sharpError =
      `Image processing is unavailable on this server (sharp failed to load). ` +
      `Screenshots cannot be uploaded until it is fixed; everything else works. ` +
      `(${err instanceof Error ? err.message : String(err)})`;
    throw new Error(sharpError);
  }
}

/** Whether uploads can be served at all. Reported by the health endpoint. */
export async function imageProcessingAvailable(): Promise<boolean> {
  try {
    await loadSharp();
    return true;
  } catch {
    return false;
  }
}

/// ── Limits ───────────────────────────────────────────────────────────────

/** Decoded bytes. Mirrors MAX_QUOTE_BYTES in quoteStorage. */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** What we will decode. Sniffed from the bytes, not trusted from the client. */
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

/** Long edge. The widest capture in the corpus is ~1400px and the page draws
 *  at most 24rem, so this is already generous for a 2x display. */
const MAX_EDGE = 1600;

const JPEG_QUALITY = 80;

/// ── Path safety ──────────────────────────────────────────────────────────

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUBJECT_SET = new Set<string>(SUBJECT_KEYS);

/**
 * Resolve a folder for a subject and symptom, refusing anything that isn't a
 * real address in the library.
 *
 * Two guards, both needed. The slug check stops traversal at the source, and
 * the resolved-path check stops anything that got past it — a path is not
 * assumed safe because its parts looked safe.
 */
function resolveFolder(subjectKey: string, symptomId: string): string {
  if (!SUBJECT_SET.has(subjectKey)) {
    throw new Error(`Unknown subject: ${subjectKey}`);
  }
  if (!SLUG.test(symptomId)) {
    throw new Error(`Invalid symptom id: ${symptomId}`);
  }
  if (!troubleshootingRepository.findSymptom(subjectKey, symptomId)) {
    throw new Error(`No such symptom: ${subjectKey}/${symptomId}`);
  }

  const root = troubleshootingImagesDir();
  const folder = path.resolve(root, subjectKey, symptomId);

  if (folder !== path.join(root, subjectKey, symptomId)) {
    throw new Error("Refusing to write outside the image directory");
  }

  return folder;
}

/** Validate a stored `src` and turn it into an absolute path. */
export function resolveImagePath(src: string): string {
  const root = troubleshootingImagesDir();
  const full = path.resolve(root, src);

  if (src.includes("..") || path.isAbsolute(src) || !full.startsWith(root + path.sep)) {
    throw new Error(`Refusing to touch a path outside the image directory: ${src}`);
  }

  return full;
}

/** Whether a referenced screenshot is actually on disk. */
export function troubleshootingImageExists(src: string): boolean {
  try {
    return existsSync(resolveImagePath(src));
  } catch {
    return false;
  }
}

/// ── Filenames ────────────────────────────────────────────────────────────

/** "Storage settings!" -> "Storage-settings". Matches the corpus convention
 *  of a capitalised, hyphenated base with a -light/-dark suffix. */
function sanitiseBase(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  if (!cleaned) return "Figure";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/**
 * A base name not already taken in this folder.
 *
 * The LIGHT variant is what is checked, because the pair always shares a base
 * and the light one always exists — a dark-only figure is not a thing the
 * schema can express.
 */
async function mintBase(folder: string, name: string): Promise<string> {
  const base = sanitiseBase(name);

  for (let suffix = 1; suffix <= 20; suffix++) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const light = path.join(folder, `${candidate}-light.jpg`);
    try {
      await access(light);
    } catch {
      return candidate; // nothing there — it's ours
    }
  }

  throw new Error(
    `Too many screenshots already named "${base}" here. Give this one a different name.`
  );
}

/// ── Writing ──────────────────────────────────────────────────────────────

export type UploadVariant = { base64: string; mime?: string };

export type UploadRequest = {
  subjectKey: string;
  symptomId: string;
  /** Human name; becomes the filename base. */
  name: string;
  light: UploadVariant;
  /** Optional theme twin, minted with the same base so the pair cannot drift. */
  dark?: UploadVariant;
};

export type UploadResult = {
  src: string;
  srcDark?: string;
  width: number;
  height: number;
  bytes: number;
};

async function processOne(variant: UploadVariant): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  const sharp = await loadSharp();

  const input = Buffer.from(variant.base64, "base64");
  if (input.byteLength === 0) throw new Error("Empty image");
  if (input.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image is too large (${Math.round(input.byteLength / 1024 / 1024)}MB). ` +
        `The limit is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`
    );
  }

  // limitInputPixels caps a decompression bomb — a small file that expands to
  // an enormous bitmap and takes the process with it.
  const image = sharp(input, { limitInputPixels: 50_000_000 });
  const meta = await image.metadata();

  // Sniffed from the bytes rather than trusted from the declared mime, which
  // is a claim the client makes about a file it also supplied.
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new Error(
      `Unsupported image type${meta.format ? ` (${meta.format})` : ""}. ` +
        `Use JPEG, PNG or WebP.`
    );
  }

  const output = await image
    // Honour the EXIF orientation and then drop the metadata entirely. That
    // is a privacy control as much as a size one — phone screenshots carry
    // device identifiers, and these end up on a page anyone can open.
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true, progressive: true })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: output.data,
    width: output.info.width,
    height: output.info.height,
  };
}

/** Store a screenshot, and its dark twin when one is supplied. */
export async function saveTroubleshootingImage(
  request: UploadRequest
): Promise<UploadResult> {
  const folder = resolveFolder(request.subjectKey, request.symptomId);
  await mkdir(folder, { recursive: true });

  const base = await mintBase(folder, request.name);
  const relative = (variant: string) =>
    `${request.subjectKey}/${request.symptomId}/${base}-${variant}.jpg`;

  const light = await processOne(request.light);
  await writeFile(path.join(folder, `${base}-light.jpg`), light.buffer);

  let srcDark: string | undefined;
  if (request.dark) {
    const dark = await processOne(request.dark);
    await writeFile(path.join(folder, `${base}-dark.jpg`), dark.buffer);
    srcDark = relative("dark");
  }

  return {
    src: relative("light"),
    srcDark,
    width: light.width,
    height: light.height,
    bytes: light.buffer.byteLength,
  };
}

/** Remove a stored screenshot. Missing is not an error — the caller's intent
 *  was for it to be gone, and it is. */
export async function deleteTroubleshootingImage(src: string): Promise<void> {
  try {
    await unlink(resolveImagePath(src));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/** Every stored screenshot, as `src` strings. Used to find orphans. */
export async function listStoredImages(): Promise<string[]> {
  const root = troubleshootingImagesDir();
  const found: string[] = [];

  async function walk(dir: string, prefix: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // not created yet
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) found.push(rel);
    }
  }

  await walk(root, "");
  return found;
}
