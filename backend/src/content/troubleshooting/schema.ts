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

/// ── Subjects: devices and applications ───────────────────────────────────
//
//  What can be troubleshot. Two kinds, because half the real support load
//  isn't hardware at all — OneDrive not syncing and a locked SAP account are
//  among the most KSB-specific problems we have, and neither is a device.
//
//  ONE KEY SPACE, NOT TWO. `kind` splits them where it matters, which is the
//  picker: applications get their own section above the device tiles. Keeping
//  the keys flat means the routes, the repository and every existing deep
//  link are unchanged — /troubleshooting/onedrive/not-syncing needs no new
//  machinery, and an article can branch from a device to an app without
//  crossing a namespace.
//
//  DEVICE KEYS ARE NOT SNIPE CATEGORY IDS. Snipe category ids are
//  per-instance integers — they differ between our Snipe and anyone else's,
//  and content files on disk would be pinned to one deployment's database.
//  The app already resolves category NAME to meaning by keyword (frontend
//  lib/categoryIcon), so this follows that precedent: content is keyed on a
//  stable key and the Snipe resolution happens at the edge.
//
//  Docks and printers are here despite not being requestable. Nobody orders
//  a dock through Checkout, but docking and SAFEQ faults are among the most
//  common things people hit. The picker unions requestable categories with
//  subjects that HAVE content, so they earn their tile that way.
export const DEVICE_KEYS = [
  "laptop",
  "desktop",
  "phone",
  "tablet",
  "monitor",
  "dock",
  "printer",
  "headphones",
  "mouse",
  "keyboard",
  "webcam",
] as const;

/// Applications and services — their own section in the picker, because
/// "my OneDrive won't sync" is not a question about which laptop you have.
export const APP_KEYS = [
  "outlook",
  "onedrive",
  "sharepoint",
  "sap",
  "ess",
] as const;

export const SUBJECT_KEYS = [...DEVICE_KEYS, ...APP_KEYS] as const;

export const deviceKeySchema = z.enum(DEVICE_KEYS);
export const subjectKeySchema = z.enum(SUBJECT_KEYS);
export const subjectKindSchema = z.enum(["device", "app"]);

export type DeviceKey = z.infer<typeof deviceKeySchema>;
export type SubjectKey = z.infer<typeof subjectKeySchema>;
export type SubjectKind = z.infer<typeof subjectKindSchema>;

/// ── Step ─────────────────────────────────────────────────────────────────
//
//  `note` and `warn` are the two callout kinds. Separate optional fields
//  rather than one `callouts[]` array on purpose: a step has at most one of
//  each in every article written or sketched, and the flat shape keeps the
//  column mapping obvious.
//
//  `figure` is a CAPTION, not an image path. v1 ships no screenshots — a
//  screenshot of a superseded settings screen is worse than none, and the
//  caption alone ("Settings › Wi-Fi › Forget This Network") carries the
//  navigation the image would have. When images arrive this field gains a
//  sibling rather than changing meaning.
//
//  `branch` is the cross-over mechanism. A monitor that shows nothing is
//  often a dock fault, and the monitor article should be able to hand the
//  reader straight to the dock article rather than dead-ending. Branches may
//  cross subjects, which is what `targetSubjectKey` is for — including from
//  a device to an application.
export const branchSchema = z.object({
  /** Button label. Written as the user's situation, not as a destination. */
  label: z.string().min(1),
  /** Symptom this branch leads to. Resolved by the repository at load. */
  targetSymptomId: slug,
  /** Defaults to the article's own subject when omitted. */
  targetSubjectKey: subjectKeySchema.optional(),
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
//  ONE ARTICLE, SEVERAL SUBJECTS. `subjectKeys` is a list because the symptom
//  lists for laptops and desktops are all but identical, and a docking
//  article is the same article whether you arrived from Laptops, Monitors or
//  Docks. Writing it once and listing it three times is the difference
//  between a library that stays current and three copies that drift — which
//  is the usual way content libraries rot.
//
//  Where the steps genuinely differ, they are different articles: an iPhone
//  enrolment guide and an Android one are two symptoms with honest
//  applies-to lines, never one article with conditional steps.
//
//  `updated` is AUTHORED, not derived from git. Deriving it from file mtime
//  means a whitespace fix bumps the date a user reads as "checked recently".
//  An ISO date here and an honest review process is the trade — and it
//  matters more now that some articles are ported from vendor documentation
//  whose settings paths change without telling us.
export const articleSchema = z.object({
  /** The symptom this article answers. Must exist in every listed subject. */
  symptomId: slug,
  /** Every subject this article is listed under. At least one. */
  subjectKeys: z.array(subjectKeySchema).min(1),
  summary: z.string().min(1),
  /** Human phrasing — "About 10 minutes". Not a number: the precision would be a lie. */
  timeEstimate: z.string().min(1),
  /** "iOS 16 and later", "Windows laptops and desktops". */
  appliesTo: z.string().min(1),
  /** ISO 8601 date, authored. */
  updated: z.iso.date(),
  /** Prerequisites shown before step 1. Empty is allowed; absent is not. */
  before: z.array(z.string().min(1)),
  steps: z.array(stepSchema).min(1, "an article with no steps is a draft, not an article"),
  /**
   * Where the content came from, when it wasn't ours.
   *
   * Vendor-documented symptoms are rewritten into our step format rather
   * than linked, so people don't have to leave the site to find them. That
   * makes the staleness ours to own, so the article says where it came from
   * — both to credit the source and so a reviewer knows which page to check
   * when iOS moves a setting.
   */
  source: z
    .object({
      name: z.string().min(1),
      url: z.url(),
    })
    .optional(),
});

/// ── Taxonomy ─────────────────────────────────────────────────────────────
//
//  Only symptoms we intend to cover are listed.
//
//  That is a deliberate narrowing. The alternative — listing every symptom a
//  device can have and marking most as Draft forever — turns the Draft badge
//  from "we're getting to this" into noise, with no honest way to tell the
//  two apart. It also sharpens the no-match search metric: if we only list
//  what we mean to cover, a search that finds nothing is exactly somebody
//  asking for something we don't have.
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

//  Labels are deliberately NOT here — see SUBJECT_LABELS in subjects.ts. The
//  picker has to name subjects this file has never heard of, so the names
//  live with the key enum rather than with the taxonomy.
export const subjectSchema = z.object({
  key: subjectKeySchema,
  kind: subjectKindSchema,
  categories: z.array(symptomCategorySchema),
});

export type Branch = z.infer<typeof branchSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Symptom = z.infer<typeof symptomSchema>;
export type SymptomCategory = z.infer<typeof symptomCategorySchema>;
export type Subject = z.infer<typeof subjectSchema>;
