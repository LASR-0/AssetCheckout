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
//  `figure` is a caption and, optionally, a screenshot.
//
//  THE CAPTION IS REQUIRED AND THE IMAGE IS NOT. A caption carries the
//  navigation path in words ("Settings › Wi-Fi › Forget This Network"), which
//  survives a redesign of the screen it describes and is readable by someone
//  using a screen reader. An image goes stale silently and says nothing to
//  anyone who can't see it. So the words are the content and the picture is
//  the aid — never the other way round — and a figure whose image is later
//  pulled still reads correctly.
//
//  One object rather than two sibling fields (an earlier note here proposed a
//  sibling): a bare image path with no caption is never valid, and two
//  independent optional fields can't express that.
//
//  `branch` is the cross-over mechanism. A monitor that shows nothing is
//  often a dock fault, and the monitor article should be able to hand the
//  reader straight to the dock article rather than dead-ending. Branches may
//  cross subjects, which is what `targetSubjectKey` is for — including from
//  a device to an application.
/**
 * One picture, with an optional dark-theme twin.
 *
 * Split out from the figure so a figure can hold a SEQUENCE. A settings path
 * three levels deep is far easier to follow as "here is the menu, here is the
 * screen you land on" than as one screenshot of the destination with no
 * indication of how you got there — the reader has to recognise a screen they
 * have never seen before. Phone captures need this most: iOS and One UI both
 * bury things several taps down, and every one of those taps is invisible in
 * a single shot of the final screen.
 */
export const figureImageSchema = z.object({
  /**
   * Path to the screenshot, relative to the troubleshooting image root
   * (frontend/public/troubleshooting/) — e.g.
   * "laptop/connect-ksb-office-wifi/wifi-menu.png".
   *
   * Relative rather than a full URL because WHERE the images are served from
   * is a frontend concern, and because an article can be listed under several
   * subjects — so the path can't be derived from one of them.
   *
   * A content test asserts every one of these resolves to a file that exists.
   * A broken image path is otherwise found by a user, not by us.
   */
  src: z.string().min(1),
  /**
   * Optional dark-theme variant of the same screenshot.
   *
   * Screenshots of an OS or an app carry that app's own light or dark
   * chrome, so a light-mode capture sitting in a dark article is a bright
   * rectangle in the middle of the page — legible, but jarring enough to
   * read as a mistake. When both exist the page shows whichever matches.
   *
   * `src` alone stays valid and is used in both themes. That is deliberate:
   * requiring a pair would mean no screenshot at all until somebody produced
   * two, and one image is worth more than none.
   */
  srcDark: z.string().min(1).optional(),
});

export const figureSchema = z.object({
  /**
   * The pictures, IN THE ORDER THE READER WALKS THEM.
   *
   * Usually one. Two where the destination is buried and needs a route: the
   * menu that gets you there first, then the screen you land on. They render
   * side by side, so the reader sees the journey rather than having to
   * recognise an unfamiliar screen out of context.
   *
   * Optional in full — a caption alone is a valid figure, and the commonest
   * state while somebody is still capturing screenshots.
   */
  images: z.array(figureImageSchema).min(1).optional(),
  /**
   * How much room the picture needs to be readable. Omitted means a small UI
   * flyout — a tray menu, a right-click menu, the Windows + P pane.
   *
   *   "window"  an application window: Task Manager, File Explorer, an
   *             installer. Roughly double a flyout.
   *   "full"    a whole-screen capture, where the thing being pointed at is
   *             a small control inside a large window. Fills the column.
   *
   * A NAME RATHER THAN A PIXEL WIDTH. Only the author knows whether the
   * detail in a screenshot matters; nobody authoring content should be
   * choosing layout numbers, and a number here would also have to be
   * re-chosen every time the page's column width changed.
   *
   * "full" is the third size this field's previous note said to add "only
   * when a real image needs one" — and one did. Full-screen Settings and
   * Vantage captures are about 1400x760, so at window width they render
   * under 300px tall and the highlighted control is illegible. It replaced a
   * boolean `wide`, which had no room left to say this.
   */
  size: z.enum(["window", "full"]).optional(),
  /** Always required — see the note above. */
  caption: z.string().min(1),
});

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
  figure: figureSchema.optional(),
  branch: branchSchema.optional(),
  /**
   * The order the optional blocks are shown in, when it is not the default.
   *
   * A DISPLAY HINT OVER A FIXED SET, not a content model. The blocks are still
   * four named optional fields; this only says which order to read them in.
   * The alternative — an ordered array of typed blocks — is what you would
   * design from scratch, and it would mean rewriting the schema, all sixty
   * modules and the export path to let somebody move a note below a
   * screenshot. Not worth it.
   *
   * ABSENT MEANS THE DEFAULT, which is the order the reader hardcoded before
   * this existed, so every article written up to now is unaffected and stays
   * byte-identical on export.
   *
   * Deliberately NOT validated against which blocks are present. A step whose
   * order names a block it does not have is not broken, it is stale — and
   * `orderedBlocks` treats it as a hint precisely so that a wrong entry can
   * never make content vanish.
   */
  blockOrder: z.array(z.enum(["note", "warn", "figure", "branch"])).optional(),
});

/** The blocks a step can carry, in the order they are shown unless told
 *  otherwise. Exported so the reader, the editor and the schema cannot
 *  disagree about what "default" means. */
export const DEFAULT_BLOCK_ORDER = ["note", "warn", "figure", "branch"] as const;

export type BlockKind = (typeof DEFAULT_BLOCK_ORDER)[number];

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
  /**
   * ISO 8601 date. STAMPED WHEN THE ARTICLE IS PUBLISHED.
   *
   * Not derived from git, which would bump it on a whitespace fix and show a
   * reader a fresh date on stale content. Publishing is the deliberate act
   * that means "this text is ready", so that is what it tracks. It was
   * authored by hand while the corpus was written in an editor; expecting
   * somebody to type an ISO date into a browser would only guarantee it went
   * stale. See publishDraft.
   */
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

/**
 * An article without its identity — everything except which symptom it
 * answers and which subjects list it.
 *
 * This is what gets stored as JSON when content lives in a database. Derived
 * from `articleSchema` rather than declared again so the stored document and
 * the served one cannot drift: add a field to an article and it is
 * automatically part of the body, validated by the same rules on write as on
 * load.
 *
 * `symptomId` and `subjectKeys` are omitted because they are relational —
 * they are the article's address, enforced by unique constraints and foreign
 * keys rather than by whatever a JSON blob happens to say.
 */
export const articleBodySchema = articleSchema.omit({
  symptomId: true,
  subjectKeys: true,
});

export type ArticleBody = z.infer<typeof articleBodySchema>;
export type FigureImage = z.infer<typeof figureImageSchema>;
export type Figure = z.infer<typeof figureSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Article = z.infer<typeof articleSchema>;
export type Symptom = z.infer<typeof symptomSchema>;
export type SymptomCategory = z.infer<typeof symptomCategorySchema>;
export type Subject = z.infer<typeof subjectSchema>;
