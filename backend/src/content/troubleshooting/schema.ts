import { z } from "zod";

///  +-----------------------------------------------------------------+
///  |               TROUBLESHOOTING CONTENT SCHEMA                    |
///  +-----------------------------------------------------------------+
//
//  Troubleshooting articles are records, not prose: a step has a title, a
//  body, an optional note, an optional warning, an optional figure caption
//  and an optional branch pointing at another symptom. Markdown would mean
//  inventing frontmatter for the metadata and directives for the callouts,
//  then maintaining a parser for both. So the content lives as typed data on
//  disk and this schema is what makes it trustworthy.
//
//  The schema is deliberately also the TABLE SHAPE. If admin-editable
//  content is ever needed, the migration is a seeding script that reads the
//  validated files and writes rows, plus a second implementation of the
//  repository interface — not a rewrite. Keep it that way: no field here
//  should be a shape a database column couldn't hold.
//
//  Everything is validated at module load (see repository.ts) and again by
//  the test suite, which additionally resolves every cross-reference.
///  +-----------------------------------------------------------------+

/// ── Identifiers ──────────────────────────────────────────────────────────
//
//  Slugs, because these end up in URLs: /troubleshooting/phone/wifi. Kept
//  strict so a typo in a content file can't produce a route that 404s only
//  for some users.
const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be a lowercase kebab-case slug");

/// ── Device keys ──────────────────────────────────────────────────────────
//
//  NOT the Snipe category id. Snipe category ids are per-instance integers —
//  they differ between our Snipe and anyone else's, and content files on
//  disk would be pinned to one deployment's database. The app already
//  resolves category NAME to meaning by keyword (frontend lib/categoryIcon:
//  iconForCategory, isPhoneCategory), so this follows that precedent: content
//  is keyed on a stable device key, and the Snipe-category-to-device-key
//  resolution happens at the edge when the device picker is built.
//
//  The nine keys are the mockup's, spanning both asset categories (laptop,
//  desktop, phone, tablet, monitor) and accessory categories (headphones,
//  mouse, keyboard, webcam).
export const DEVICE_KEYS = [
  "laptop",
  "desktop",
  "phone",
  "tablet",
  "monitor",
  "headphones",
  "mouse",
  "keyboard",
  "webcam",
] as const;

export const deviceKeySchema = z.enum(DEVICE_KEYS);
export type DeviceKey = z.infer<typeof deviceKeySchema>;

/// ── Step ─────────────────────────────────────────────────────────────────
//
//  `note` and `warn` are the two callout kinds. They are separate optional
//  fields rather than one `callouts[]` array on purpose: a step has at most
//  one of each in every article we've written or sketched, and the flat
//  shape keeps the column mapping obvious.
//
//  `figure` is a CAPTION, not an image path. v1 ships no screenshots — a
//  screenshot of a superseded iOS settings screen is worse than no
//  screenshot, and the caption alone ("Settings › Wi-Fi › Forget This
//  Network") carries the navigation the image would have. When images do
//  arrive this field gains a sibling rather than changing meaning.
export const branchSchema = z.object({
  /** Button label. Written as the user's situation, not as a destination. */
  label: z.string().min(1),
  /** Symptom this branch leads to. Resolved by the repository at load. */
  targetSymptomId: slug,
  /** Defaults to the article's own device when omitted. */
  targetDeviceKey: deviceKeySchema.optional(),
});

export const stepSchema = z.object({
  title: z.string().min(1),
  /** Prose. Markdown is permitted here; it is the only place it is. */
  body: z.string().min(1),
  note: z.string().min(1).optional(),
  warn: z.string().min(1).optional(),
  figure: z.string().min(1).optional(),
  branch: branchSchema.optional(),
});

/// ── Article ──────────────────────────────────────────────────────────────
//
//  `updated` is AUTHORED, not derived from git. Deriving it from file mtime
//  means a whitespace fix bumps the date a user reads as "this was checked
//  recently". An ISO date here and an honest review process is the trade.
export const articleSchema = z.object({
  /** The symptom this article answers. Must exist in the device taxonomy. */
  symptomId: slug,
  deviceKey: deviceKeySchema,
  summary: z.string().min(1),
  /** Human phrasing — "About 10 minutes". Not a number: the precision would be a lie. */
  timeEstimate: z.string().min(1),
  /** "iOS 16 and later". Narrow it rather than writing conditional steps. */
  appliesTo: z.string().min(1),
  /** ISO 8601 date, authored. */
  updated: z.iso.date(),
  /** Prerequisites shown before step 1. Empty is allowed; absent is not. */
  before: z.array(z.string().min(1)),
  steps: z.array(stepSchema).min(1, "an article with no steps is a draft, not an article"),
});

/// ── Taxonomy ─────────────────────────────────────────────────────────────
//
//  Symptoms are listed whether or not an article exists for them. A symptom
//  with no article renders as a Draft rather than disappearing, which makes
//  the gaps in the library visible instead of silent.
export const symptomSchema = z.object({
  id: slug,
  label: z.string().min(1),
});

export const symptomCategorySchema = z.object({
  id: slug,
  /** Single character shown in the category tile. */
  glyph: z.string().min(1),
  name: z.string().min(1),
  blurb: z.string().min(1),
  symptoms: z.array(symptomSchema).min(1),
});

//  Labels are deliberately NOT here — see DEVICE_LABELS in deviceKeys.ts. The
//  picker has to name devices this file has never heard of, so the names live
//  with the key enum rather than with the taxonomy.
export const deviceSchema = z.object({
  key: deviceKeySchema,
  categories: z.array(symptomCategorySchema),
});

export type Branch = z.infer<typeof branchSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Symptom = z.infer<typeof symptomSchema>;
export type SymptomCategory = z.infer<typeof symptomCategorySchema>;
export type Device = z.infer<typeof deviceSchema>;
