import { prisma } from "../db/prisma.js";
import {
  articleBodySchema,
  articleSchema,
  type ArticleBody,
} from "../content/troubleshooting/schema.js";
import {
  troubleshootingRepository,
  nameTheSubject,
  type SubjectKey,
} from "../content/troubleshooting/index.js";
import { reloadTroubleshootingContent } from "../content/troubleshooting/prismaContent.js";
import {
  troubleshootingImageExists,
  listStoredImages,
  imageProcessingAvailable,
} from "./troubleshootingImages.js";

///  +-----------------------------------------------------------------+
///  |            TROUBLESHOOTING CONTENT — ADMIN WRITES               |
///  +-----------------------------------------------------------------+
//
//  Every write to the library goes through here, and every one of them ends
//  by reloading the served snapshot. That obligation sits in this file rather
//  than in the routes on purpose: a route that forgot would leave an admin
//  staring at their own edit not appearing, and there is no way to notice
//  that in review.
//
//  READS HERE ARE RAW. The repository substitutes {device} at serve time so
//  readers get "your phone" or "your tablet"; an editor must see and keep the
//  token. So the editor reads Prisma directly rather than going through the
//  repository, and the two never get confused with each other.
//
//  THE PUBLISH GATE IS WHERE content.test.ts GOES TO LIVE. Those checks —
//  branches resolving from every subject, no unfilled token, sane image paths
//  — were build-time guarantees over authored files. Once content is edited
//  in a browser they have to be enforced at the moment of publishing, or they
//  stop being enforced at all.
///  +-----------------------------------------------------------------+

export class ContentError extends Error {
  statusCode: number;
  details?: { path: string; message: string }[];

  constructor(
    message: string,
    statusCode = 400,
    details?: { path: string; message: string }[]
  ) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

/// ── Locating an article ──────────────────────────────────────────────────

async function findArticle(subjectKey: string, symptomId: string) {
  const membership = await prisma.troubleshootingArticleSubject.findUnique({
    where: { subjectKey_symptomSlug: { subjectKey, symptomSlug: symptomId } },
    include: { article: { include: { subjects: { select: { subjectKey: true } } } } },
  });

  return membership?.article ?? null;
}

async function requireArticle(subjectKey: string, symptomId: string) {
  const article = await findArticle(subjectKey, symptomId);
  if (!article) {
    throw new ContentError(`No article for ${subjectKey}/${symptomId}`, 404);
  }
  return article;
}

/// ── Reading, for the editor ──────────────────────────────────────────────

export type EditableArticle = {
  symptomId: string;
  subjectKeys: string[];
  hidden: boolean;
  /**
   * The live text. Raw — {device} tokens intact.
   *
   * NULL for an article created in the UI and never published. The editor
   * shows the draft in that case; there is nothing else to show.
   */
  published: ArticleBody | null;
  /** Unpublished edits, or null when there are none. */
  draft: ArticleBody | null;
  publishedAt: string;
  publishedBy: string | null;
  draftUpdatedAt: string | null;
  draftUpdatedBy: string | null;
};

export async function getEditableArticle(
  subjectKey: string,
  symptomId: string
): Promise<EditableArticle | null> {
  const article = await findArticle(subjectKey, symptomId);
  if (!article) return null;

  return {
    symptomId: article.symptomSlug,
    subjectKeys: article.subjects.map((s) => s.subjectKey),
    hidden: article.hidden,
    // Not `JSON.parse(article.body)` unguarded: `body` is nullable now, and
    // this package compiles with `strict: false`, so nothing would have
    // flagged it — `JSON.parse(null)` returns null and the editor would open
    // on an empty article with no clue why.
    published: article.body ? (JSON.parse(article.body) as ArticleBody) : null,
    draft: article.draftBody ? (JSON.parse(article.draftBody) as ArticleBody) : null,
    publishedAt: article.publishedAt.toISOString(),
    publishedBy: article.publishedBy,
    draftUpdatedAt: article.draftUpdatedAt?.toISOString() ?? null,
    draftUpdatedBy: article.draftUpdatedBy,
  };
}

/**
 * The taxonomy for one subject, UNFILTERED.
 *
 * The editor has to show hidden symptoms and disabled categories — they
 * cannot be turned back on otherwise — so this deliberately does not go
 * through the repository, whose listing methods exist to hide them.
 */
export async function getEditableSubject(subjectKey: string) {
  const categories = await prisma.troubleshootingCategory.findMany({
    where: { subjectKey },
    orderBy: { position: "asc" },
    include: { symptoms: { orderBy: { position: "asc" } } },
  });

  const articles = await prisma.troubleshootingArticleSubject.findMany({
    where: { subjectKey },
    include: {
      article: { select: { hidden: true, draftBody: true, body: true } },
    },
  });

  const byId = new Map(
    articles.map((m) => [
      m.symptomSlug,
      {
        hidden: m.article.hidden,
        hasDraft: m.article.draftBody !== null,
        published: m.article.body !== null,
      },
    ])
  );

  return categories.map((category) => ({
    id: category.slug,
    glyph: category.glyph,
    name: category.name,
    blurb: category.blurb,
    disabled: category.disabled,
    symptoms: category.symptoms.map((symptom) => ({
      id: symptom.slug,
      label: symptom.label,
      hasArticle: byId.has(symptom.slug),
      hidden: byId.get(symptom.slug)?.hidden ?? false,
      hasDraft: byId.get(symptom.slug)?.hasDraft ?? false,
      // Started but never published. Readers still see Draft — the article is
      // not in the served snapshot at all — so the editor has to distinguish
      // this from a finished article, or an admin will think they shipped
      // something they only started.
      published: byId.get(symptom.slug)?.published ?? false,
    })),
  }));
}

/// ── Drafts ───────────────────────────────────────────────────────────────

export async function saveDraft(
  subjectKey: string,
  symptomId: string,
  body: unknown,
  actorEmail: string,
  expectedPublishedAt?: string
): Promise<{ draftUpdatedAt: string; hasDraft: true }> {
  const article = await requireArticle(subjectKey, symptomId);

  // Cheap optimistic concurrency. The realistic collision here is not two
  // admins but one admin with the article open in two tabs, and losing an
  // afternoon's edits to your own stale tab is a miserable way to find out
  // there was no check.
  if (expectedPublishedAt && article.publishedAt.toISOString() !== expectedPublishedAt) {
    throw new ContentError(
      "This article changed somewhere else since you opened it. Reload before editing.",
      409
    );
  }

  const parsed = articleBodySchema.safeParse(body);
  if (!parsed.success) {
    throw new ContentError(
      "That article isn't valid",
      400,
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
    );
  }

  const saved = await prisma.troubleshootingArticle.update({
    where: { id: article.id },
    data: {
      draftBody: JSON.stringify(parsed.data),
      draftUpdatedAt: new Date(),
      draftUpdatedBy: actorEmail || null,
    },
  });

  // No reload: a draft changes nothing a reader can see, which is the point.
  return { draftUpdatedAt: saved.draftUpdatedAt!.toISOString(), hasDraft: true };
}

/**
 * Throw away unpublished changes.
 *
 * FOR AN ARTICLE THAT WAS NEVER PUBLISHED, this removes the article entirely
 * rather than emptying it. Clearing the draft alone would leave a row with no
 * body and no draft: invisible to readers, showing as "not written" in the
 * editor, and impossible to open or remove through the UI ever again.
 *
 * That is not the deletion this feature is careful about. Nothing was ever
 * published, so nothing a reader saw is lost, no link can point at it — branch
 * targets are symptoms, and the symptom stays exactly where it was. It is an
 * undo of "start writing", which is what the button meant.
 */
export async function discardDraft(
  subjectKey: string,
  symptomId: string
): Promise<{ hasDraft: false; articleRemoved: boolean }> {
  const article = await requireArticle(subjectKey, symptomId);

  if (article.body === null) {
    await prisma.$transaction([
      prisma.troubleshootingArticleSubject.deleteMany({
        where: { articleId: article.id },
      }),
      prisma.troubleshootingArticle.delete({ where: { id: article.id } }),
    ]);

    await reloadTroubleshootingContent();
    return { hasDraft: false, articleRemoved: true };
  }

  await prisma.troubleshootingArticle.update({
    where: { id: article.id },
    data: { draftBody: null, draftUpdatedAt: null, draftUpdatedBy: null },
  });

  return { hasDraft: false, articleRemoved: false };
}

/// ── The publish gate ─────────────────────────────────────────────────────

const IMAGE_SRC = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\/[A-Za-z0-9._-]+$/;

/**
 * Everything content.test.ts used to guarantee at build time.
 *
 * Blocking problems are the ones a reader would experience as the page being
 * broken: a branch button that leads nowhere, a sentence that lost its noun,
 * a path that escapes the image directory. Warnings are things that degrade —
 * a missing screenshot still leaves a caption, which the schema has always
 * held to be the actual content.
 */
function checkPublishable(
  body: ArticleBody,
  symptomId: string,
  subjectKeys: string[]
): { errors: { path: string; message: string }[]; warnings: string[] } {
  const errors: { path: string; message: string }[] = [];
  const warnings: string[] = [];

  body.steps.forEach((step, index) => {
    const where = `step ${index + 1}`;

    if (step.branch) {
      // Must resolve from EVERY subject the article is listed under, or the
      // button dead-ends for the readers who arrived from the other one.
      const targets = step.branch.targetSubjectKey
        ? [step.branch.targetSubjectKey]
        : subjectKeys;

      for (const target of targets) {
        if (!troubleshootingRepository.findSymptom(target, step.branch.targetSymptomId)) {
          errors.push({
            path: `steps.${index}.branch`,
            message:
              `${where}: the link "${step.branch.label}" points at ` +
              `${target}/${step.branch.targetSymptomId}, which doesn't exist.`,
          });
        }
      }
    }

    for (const image of step.figure?.images ?? []) {
      for (const src of [image.src, image.srcDark].filter(Boolean) as string[]) {
        if (!IMAGE_SRC.test(src) || src.includes("..")) {
          errors.push({
            path: `steps.${index}.figure`,
            message: `${where}: "${src}" isn't a valid image path.`,
          });
        } else if (!troubleshootingImageExists(src)) {
          warnings.push(`${where}: the image ${src} is missing. The caption still shows.`);
        }
      }
    }
  });

  // No token may survive substitution, under any subject this article serves.
  // A stray {devise} is visible nonsense on a live page.
  const article = articleSchema.parse({ symptomId, subjectKeys, ...body });
  for (const key of subjectKeys) {
    const served = nameTheSubject(article, key as SubjectKey);
    const text = [
      served.summary,
      served.appliesTo,
      ...served.before,
      ...served.steps.flatMap((s) => [
        s.title,
        s.body,
        s.note,
        s.warn,
        s.figure?.caption,
        s.branch?.label,
      ]),
    ]
      .filter((t): t is string => !!t)
      .join(" ");

    for (const match of text.matchAll(/\{[^}]*\}/g)) {
      errors.push({
        path: "tokens",
        message:
          `"${match[0]}" isn't a placeholder we recognise — it would show ` +
          `literally under ${key}. Use {device} or {devices}.`,
      });
    }
  }

  return { errors, warnings };
}

export async function publishDraft(
  subjectKey: string,
  symptomId: string,
  actorEmail: string
): Promise<{ publishedAt: string; hasDraft: false; warnings: string[] }> {
  const article = await requireArticle(subjectKey, symptomId);

  if (!article.draftBody) {
    throw new ContentError("There are no unpublished changes to publish", 400);
  }

  const parsed = articleBodySchema.safeParse(JSON.parse(article.draftBody));
  if (!parsed.success) {
    throw new ContentError(
      "That draft isn't valid and can't be published",
      400,
      parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }))
    );
  }

  const subjectKeys = article.subjects.map((s) => s.subjectKey);
  const { errors, warnings } = checkPublishable(parsed.data, article.symptomSlug, subjectKeys);

  if (errors.length > 0) {
    throw new ContentError("This can't be published yet", 409, errors);
  }

  const published = await prisma.troubleshootingArticle.update({
    where: { id: article.id },
    data: {
      body: article.draftBody,
      draftBody: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      publishedAt: new Date(),
      publishedBy: actorEmail || null,
    },
  });

  await reloadTroubleshootingContent();

  return {
    publishedAt: published.publishedAt.toISOString(),
    hasDraft: false,
    warnings,
  };
}

/// ── Visibility, applied immediately ──────────────────────────────────────
//
//  Not drafted. Hiding is almost always "this is wrong, get it off the site
//  now", and a checkbox has no draft worth previewing.

export async function setArticleHidden(
  subjectKey: string,
  symptomId: string,
  hidden: boolean,
  actorEmail: string
): Promise<{ hidden: boolean; subjectKeys: string[] }> {
  const article = await requireArticle(subjectKey, symptomId);

  await prisma.troubleshootingArticle.update({
    where: { id: article.id },
    data: {
      hidden,
      hiddenAt: hidden ? new Date() : null,
      hiddenBy: hidden ? actorEmail || null : null,
    },
  });

  await reloadTroubleshootingContent();

  // Returned so the editor can say "this also appears under Tablets" — one
  // article, one row, so hiding it hides it everywhere it is listed.
  return { hidden, subjectKeys: article.subjects.map((s) => s.subjectKey) };
}

export async function setCategoryDisabled(
  subjectKey: string,
  categoryId: string,
  disabled: boolean,
  actorEmail: string
): Promise<{ disabled: boolean; symptomCount: number }> {
  const category = await prisma.troubleshootingCategory.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: categoryId } },
    include: { _count: { select: { symptoms: true } } },
  });

  if (!category) {
    throw new ContentError(`No category ${subjectKey}/${categoryId}`, 404);
  }

  await prisma.troubleshootingCategory.update({
    where: { id: category.id },
    data: {
      disabled,
      disabledAt: disabled ? new Date() : null,
      disabledBy: disabled ? actorEmail || null : null,
    },
  });

  await reloadTroubleshootingContent();

  return { disabled, symptomCount: category._count.symptoms };
}

/// ── Taxonomy wording ─────────────────────────────────────────────────────
//
//  The label is what the index shows, what search matches and what the
//  analytics card reports, so "the article is right but the symptom wording
//  is wrong" is a real and early complaint. Editable, applied immediately.
//
//  SLUGS ARE NOT EDITABLE and are not exposed here. They are URLs, branch
//  targets and analytics keys; changing one would break links IT has already
//  sent and silently split a symptom's history in two.

export async function setSymptomLabel(
  subjectKey: string,
  symptomId: string,
  label: string
): Promise<{ label: string }> {
  const trimmed = label.trim();
  if (!trimmed) throw new ContentError("A symptom needs a label", 400);

  const symptom = await prisma.troubleshootingSymptom.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: symptomId } },
  });
  if (!symptom) throw new ContentError(`No symptom ${subjectKey}/${symptomId}`, 404);

  await prisma.troubleshootingSymptom.update({
    where: { id: symptom.id },
    data: { label: trimmed },
  });

  await reloadTroubleshootingContent();
  return { label: trimmed };
}

export async function setCategoryText(
  subjectKey: string,
  categoryId: string,
  fields: { name?: string; blurb?: string; glyph?: string }
): Promise<{ name: string; blurb: string; glyph: string }> {
  const category = await prisma.troubleshootingCategory.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: categoryId } },
  });
  if (!category) throw new ContentError(`No category ${subjectKey}/${categoryId}`, 404);

  const next = {
    name: fields.name?.trim() || category.name,
    blurb: fields.blurb?.trim() || category.blurb,
    glyph: fields.glyph?.trim() || category.glyph,
  };

  await prisma.troubleshootingCategory.update({
    where: { id: category.id },
    data: next,
  });

  await reloadTroubleshootingContent();
  return next;
}

/// ── Slugs ────────────────────────────────────────────────────────────────
//
//  A slug is a URL, a branch target and an analytics key. It is the one thing
//  in this whole editor that CANNOT be changed later: renaming it breaks every
//  link IT has ever sent somebody, silently orphans branch buttons in other
//  articles, and splits the analytics for one symptom across two names.
//
//  So it is derived from the label, SHOWN BEFORE ANYTHING IS CREATED, and
//  frozen from then on. The label stays editable; the slug never is. That
//  asymmetry is the point — wording changes all the time, identity must not.

const MAX_SLUG = 60;

/**
 * A label as a slug.
 *
 * Deliberately lossy and deliberately boring: lowercase, ASCII, hyphens. The
 * corpus is all `dropped-calls` and `no-display-dock`, and a slug that tried
 * to preserve more would produce identifiers nobody can type or say aloud.
 */
export function slugifyLabel(label: string): string {
  return label
    .normalize("NFKD")
    // Strip combining marks, so "café" becomes "cafe" rather than "caf".
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Apostrophes close up ("won't" → "wont") rather than becoming a break,
    // which is what the existing slugs do.
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
}

/**
 * What the slug for this label would be, and whether it can be used.
 *
 * Called by the UI before creating anything, so the permanent decision is
 * visible at the moment it is made rather than discovered afterwards.
 */
export async function previewSymptomSlug(
  subjectKey: string,
  label: string
): Promise<{ slug: string; available: boolean; reason?: string }> {
  const slug = slugifyLabel(label);

  if (!slug) {
    return {
      slug: "",
      available: false,
      reason: "That label has no letters or numbers to make an address from",
    };
  }

  const existing = await prisma.troubleshootingSymptom.findUnique({
    where: { subjectKey_slug: { subjectKey, slug } },
  });

  return existing
    ? {
        slug,
        available: false,
        reason: `"${slug}" is already used by "${existing.label}" in this subject`,
      }
    : { slug, available: true };
}

/// ── Creating ─────────────────────────────────────────────────────────────
//
//  A symptom with no article is a legitimate, deliberate state: it renders as
//  Draft, which makes a gap in the library VISIBLE rather than silent. Ten of
//  the symptoms shipped today are exactly that — the four application subjects,
//  which have no articles yet. So creating a symptom
//  and starting its article are two operations, not one — and the second works
//  just as well on a symptom that has been sitting empty since the taxonomy
//  was written.

export type CreatedSymptom = {
  subjectKey: string;
  categoryId: string;
  symptomId: string;
  label: string;
  position: number;
};

/**
 * Add a symptom to an existing category.
 *
 * Appended to the end. Where it belongs in the reading order is a judgement,
 * and there is a reorder control for making it — guessing here would put it
 * somewhere arbitrary and call it a decision.
 */
export async function createSymptom(
  subjectKey: string,
  categoryId: string,
  label: string
): Promise<CreatedSymptom> {
  const trimmed = label.trim();
  if (!trimmed) throw new ContentError("A symptom needs a label", 400);

  const category = await prisma.troubleshootingCategory.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: categoryId } },
  });
  if (!category) {
    throw new ContentError(`No category "${categoryId}" in ${subjectKey}`, 404);
  }

  const { slug, available, reason } = await previewSymptomSlug(subjectKey, trimmed);
  if (!available) throw new ContentError(reason ?? "That label can't be used", 409);

  const last = await prisma.troubleshootingSymptom.findFirst({
    where: { categoryId: category.id },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await prisma.troubleshootingSymptom.create({
    data: {
      subjectKey,
      categoryId: category.id,
      slug,
      label: trimmed,
      position: (last?.position ?? -1) + 1,
    },
  });

  await reloadTroubleshootingContent();

  return {
    subjectKey,
    categoryId,
    symptomId: created.slug,
    label: created.label,
    position: created.position,
  };
}

/**
 * The starting point for a new article.
 *
 * EVERY FIELD THE SCHEMA DEMANDS, with nothing left empty. `appliesTo` began
 * as `""` here and the schema requires at least one character, so the very
 * first save failed with a validation error about a field the admin had never
 * seen — a bad first thirty seconds with a new feature. The placeholders are
 * obviously placeholders, which is the point: they prompt a rewrite rather
 * than passing for content.
 */
function skeletonBody(label: string): ArticleBody {
  return {
    summary: label,
    timeEstimate: "About 5 minutes",
    appliesTo: "Everyone",
    updated: new Date().toISOString().slice(0, 10),
    before: [],
    steps: [{ title: "First step", body: "What the reader should do first." }],
  };
}

/**
 * Start writing an article for a symptom that has none.
 *
 * Created UNPUBLISHED: `body` is null and the text lives in `draftBody`, so it
 * is invisible to readers until somebody publishes it. That is what makes the
 * nullable column worth having — without it, creating an article would mean
 * publishing a skeleton to the whole company and racing to fill it in.
 */
export async function createArticleDraft(
  subjectKey: string,
  symptomId: string,
  actorEmail: string
): Promise<{ symptomId: string; draftUpdatedAt: string }> {
  const symptom = await prisma.troubleshootingSymptom.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: symptomId } },
  });
  if (!symptom) {
    throw new ContentError(`No symptom ${subjectKey}/${symptomId}`, 404);
  }

  const existing = await findArticle(subjectKey, symptomId);
  if (existing) {
    throw new ContentError(
      "That symptom already has an article — open it to edit instead",
      409
    );
  }

  const created = await prisma.troubleshootingArticle.create({
    data: {
      symptomSlug: symptomId,
      body: null,
      draftBody: JSON.stringify(skeletonBody(symptom.label)),
      draftUpdatedAt: new Date(),
      draftUpdatedBy: actorEmail || null,
      subjects: { create: [{ subjectKey, symptomSlug: symptomId }] },
    },
  });

  // Reloaded even though nothing reader-facing changed: the snapshot is what
  // the rest of the service reads, and leaving it stale here would make the
  // very next call behave as though the article did not exist.
  await reloadTroubleshootingContent();

  return {
    symptomId,
    draftUpdatedAt: created.draftUpdatedAt!.toISOString(),
  };
}

export type CreatedCategory = {
  subjectKey: string;
  categoryId: string;
  name: string;
  position: number;
};

/**
 * Add a category to a subject.
 *
 * Appended, like a symptom, and for the same reason. Note that the EXPORT
 * cannot place this into the `.ts` module by itself — where a category belongs
 * among hand-commented siblings is an editorial decision — so it reports a
 * block to paste. Creating one here is cheap; landing it in the seed needs a
 * person.
 */
export async function createCategory(
  subjectKey: string,
  input: { name: string; glyph: string; blurb: string }
): Promise<CreatedCategory> {
  const name = input.name.trim();
  const glyph = input.glyph.trim();
  const blurb = input.blurb.trim();

  if (!name) throw new ContentError("A category needs a name", 400);
  if (!glyph) throw new ContentError("A category needs a glyph", 400);

  const subject = await prisma.troubleshootingSubject.findUnique({
    where: { key: subjectKey },
  });
  if (!subject) throw new ContentError(`No subject "${subjectKey}"`, 404);

  const slug = slugifyLabel(name);
  if (!slug) {
    throw new ContentError(
      "That name has no letters or numbers to make an address from",
      400
    );
  }

  // BOTH the slug and the name, because they can collide independently. The
  // authored categories have hand-written slugs that bear no relation to their
  // names — "Power & charging" is `power`, not `power-charging` — so checking
  // the slug alone happily creates a second category with an identical name
  // sitting right beside the first.
  const existing = await prisma.troubleshootingCategory.findMany({
    where: { subjectKey },
    select: { slug: true, name: true },
  });

  const clash = existing.find(
    (c) => c.slug === slug || c.name.toLowerCase() === name.toLowerCase()
  );
  if (clash) {
    throw new ContentError(
      `This subject already has a "${clash.name}" category`,
      409
    );
  }

  const last = await prisma.troubleshootingCategory.findFirst({
    where: { subjectKey },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await prisma.troubleshootingCategory.create({
    data: {
      subjectKey,
      slug,
      glyph,
      name,
      blurb,
      position: (last?.position ?? -1) + 1,
    },
  });

  await reloadTroubleshootingContent();

  return { subjectKey, categoryId: created.slug, name: created.name, position: created.position };
}

/// ── Reordering ───────────────────────────────────────────────────────────
//
//  Order is what the reader sees, and the array order in a `.ts` module is the
//  only place it is recorded. Moves are expressed as "swap with the neighbour"
//  rather than "set position to N": the caller cannot then invent a position
//  that collides, and two admins clicking at once produce a wrong order rather
//  than a corrupt one.

type Direction = "up" | "down";

/** Swap two rows' positions in one transaction, so no intermediate state has
 *  both rows on the same position. */
async function swapPositions(
  table: "troubleshootingCategory" | "troubleshootingSymptom",
  a: { id: number; position: number },
  b: { id: number; position: number }
): Promise<void> {
  await prisma.$transaction([
    // Parked on a position nothing else can hold, because the unique-ish
    // ordering within a parent would otherwise briefly collide.
    (prisma[table] as any).update({ where: { id: a.id }, data: { position: -1 } }),
    (prisma[table] as any).update({ where: { id: b.id }, data: { position: a.position } }),
    (prisma[table] as any).update({ where: { id: a.id }, data: { position: b.position } }),
  ]);
}

export async function moveCategory(
  subjectKey: string,
  categoryId: string,
  direction: Direction
): Promise<{ order: string[] }> {
  const categories = await prisma.troubleshootingCategory.findMany({
    where: { subjectKey },
    orderBy: { position: "asc" },
    select: { id: true, slug: true, position: true },
  });

  const index = categories.findIndex((c) => c.slug === categoryId);
  if (index < 0) throw new ContentError(`No category "${categoryId}"`, 404);

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= categories.length) {
    // Not an error: the button is at the end of the list and the user clicked
    // it. Returning the unchanged order is a no-op the UI can just render.
    return { order: categories.map((c) => c.slug) };
  }

  await swapPositions("troubleshootingCategory", categories[index], categories[target]);
  await reloadTroubleshootingContent();

  const reordered = [...categories];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return { order: reordered.map((c) => c.slug) };
}

export async function moveSymptom(
  subjectKey: string,
  categoryId: string,
  symptomId: string,
  direction: Direction
): Promise<{ order: string[] }> {
  const category = await prisma.troubleshootingCategory.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: categoryId } },
  });
  if (!category) throw new ContentError(`No category "${categoryId}"`, 404);

  const symptoms = await prisma.troubleshootingSymptom.findMany({
    where: { categoryId: category.id },
    orderBy: { position: "asc" },
    select: { id: true, slug: true, position: true },
  });

  const index = symptoms.findIndex((s) => s.slug === symptomId);
  if (index < 0) throw new ContentError(`No symptom "${symptomId}"`, 404);

  const target = direction === "up" ? index - 1 : index + 1;
  // Moves stay WITHIN a category. Crossing into another one is a different
  // operation — it changes which heading a reader finds the symptom under —
  // and pretending an up-arrow does it would surprise somebody.
  if (target < 0 || target >= symptoms.length) {
    return { order: symptoms.map((s) => s.slug) };
  }

  await swapPositions("troubleshootingSymptom", symptoms[index], symptoms[target]);
  await reloadTroubleshootingContent();

  const reordered = [...symptoms];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return { order: reordered.map((s) => s.slug) };
}

/// ── Deleting ─────────────────────────────────────────────────────────────
//
//  THE LINK CHECK COMES FIRST, AND IT SCANS DRAFTS TOO. Branch buttons in
//  other articles point at a symptom by id, and there is no foreign key
//  holding them — delete the target and the button stays, pointing nowhere.
//  Nobody notices, because the article containing it is one nobody was
//  looking at. Scanning drafts as well as published bodies matters for the
//  same reason: a draft that branches here becomes a broken published article
//  the moment somebody hits publish, and by then the cause is a week old.
//
//  DELETING IS REAL, AND THE ARCHIVE IS WHAT MAKES THAT SAFE. The row goes
//  into TroubleshootingArchivedArticle whole — body, draft, taxonomy context,
//  who and when — and the export materialises it into `backend/content-archive/`
//  where it is out of the way but recoverable. To bring one back, move the
//  file into src/ and reseed.
//
//  Archived to the DATABASE rather than to disk at delete time because in
//  production there is no source tree to write to. That is the whole reason
//  this is a table and not a file.

export type SymptomLink = {
  /** Where the branch is — `laptop/print-cloud-error`. */
  from: string;
  subjectKey: string;
  symptomId: string;
  /** 1-based, as the reader sees it. */
  step: number;
  label: string;
  /** True when the branch is in unpublished text rather than live. */
  inDraft: boolean;
};

/**
 * Every branch pointing at this symptom.
 *
 * Shown before deleting, and recorded with the archive so the count reflects
 * what was true at the time rather than what happens to be true later.
 */
export async function findLinksTo(
  subjectKey: string,
  symptomId: string
): Promise<SymptomLink[]> {
  const articles = await prisma.troubleshootingArticle.findMany({
    include: { subjects: { select: { subjectKey: true } } },
  });

  const links: SymptomLink[] = [];

  for (const article of articles) {
    const subjectKeys = article.subjects.map((s) => s.subjectKey);
    const primary = subjectKeys[0] ?? "?";

    // Both documents. A branch that exists only in a draft is a break waiting
    // to be published, which is worth knowing before removing its target.
    const documents: { json: string | null; inDraft: boolean }[] = [
      { json: article.body, inDraft: false },
      { json: article.draftBody, inDraft: true },
    ];

    for (const { json, inDraft } of documents) {
      if (!json) continue;

      let parsed: ArticleBody;
      try {
        parsed = JSON.parse(json) as ArticleBody;
      } catch {
        continue; // Corrupt rows are getContentHealth's problem, not this one.
      }

      parsed.steps?.forEach((step, index) => {
        if (!step.branch || step.branch.targetSymptomId !== symptomId) return;

        // An unqualified branch means "the same subject as the article it is
        // in", so it only points here if this article is listed under the
        // subject being deleted from.
        const targets = step.branch.targetSubjectKey
          ? [step.branch.targetSubjectKey]
          : subjectKeys;
        if (!targets.includes(subjectKey)) return;

        links.push({
          from: `${primary}/${article.symptomSlug}`,
          subjectKey: primary,
          symptomId: article.symptomSlug,
          step: index + 1,
          label: step.branch.label,
          inDraft,
        });
      });
    }
  }

  return links;
}

export type DeletedSymptom = {
  subjectKey: string;
  symptomId: string;
  label: string;
  /** Whether there was an article to archive, or only an empty symptom. */
  archived: boolean;
  /** What now points nowhere. Deleting anyway is allowed — see below. */
  brokenLinks: SymptomLink[];
};

/**
 * Remove a symptom, and its article if it has one.
 *
 * `force` is required when something branches here. The links are NOT a hard
 * block: sometimes the branch is exactly what should go, and refusing outright
 * would mean an admin cannot remove a symptom without first editing every
 * article that mentions it. But it must be a second, deliberate act, with the
 * list on screen — which is why the first call fails and says what would break.
 */
export async function deleteSymptom(
  subjectKey: string,
  symptomId: string,
  actorEmail: string,
  options: { force?: boolean; reason?: string } = {}
): Promise<DeletedSymptom> {
  const symptom = await prisma.troubleshootingSymptom.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: symptomId } },
    include: { category: true },
  });
  if (!symptom) {
    throw new ContentError(`No symptom ${subjectKey}/${symptomId}`, 404);
  }

  const links = await findLinksTo(subjectKey, symptomId);
  if (links.length > 0 && !options.force) {
    throw new ContentError(
      `${links.length} branch button${links.length === 1 ? "" : "s"} point here and would stop working`,
      409,
      links.map((link) => ({
        path: `${link.from} step ${link.step}`,
        message: `“${link.label}”${link.inDraft ? " (in unpublished changes)" : ""}`,
      }))
    );
  }

  const article = await findArticle(subjectKey, symptomId);

  // Archived BEFORE anything is removed. If the delete fails halfway there is
  // a spare copy; if the archive fails, nothing has been destroyed yet.
  if (article) {
    await prisma.troubleshootingArchivedArticle.create({
      data: {
        subjectKey,
        symptomSlug: symptomId,
        label: symptom.label,
        categorySlug: symptom.category.slug,
        categoryName: symptom.category.name,
        position: symptom.position,
        body: article.body,
        draftBody: article.draftBody,
        subjectKeys: JSON.stringify(article.subjects.map((s) => s.subjectKey)),
        publishedAt: article.body ? article.publishedAt : null,
        publishedBy: article.publishedBy,
        deletedBy: actorEmail || null,
        reason: options.reason?.trim() || null,
        linksAtDeletion: links.length,
      },
    });
  }

  await prisma.$transaction([
    ...(article
      ? [
          prisma.troubleshootingArticleSubject.deleteMany({
            where: { articleId: article.id },
          }),
          prisma.troubleshootingArticle.delete({ where: { id: article.id } }),
        ]
      : []),
    prisma.troubleshootingSymptom.delete({ where: { id: symptom.id } }),
  ]);

  await reloadTroubleshootingContent();

  return {
    subjectKey,
    symptomId,
    label: symptom.label,
    archived: Boolean(article),
    brokenLinks: links,
  };
}

/**
 * Remove a category, but only once it is empty.
 *
 * EMPTY-ONLY IS THE WHOLE DESIGN, not a limitation waiting to be lifted. A
 * category with symptoms in it forces a question with no good answer: cascade
 * into them and one click destroys several articles, some of which are shared
 * with other subjects; orphan them and they have no heading to live under.
 * Disabling already does the real job — a disabled category and its symptoms
 * leave every listing — so deletion is only ever about tidying up something
 * created by mistake, and that case is always empty.
 *
 * Emptying it first is also what makes it safe: removing each symptom runs the
 * per-symptom link check, so branch buttons pointing into this category get
 * surfaced one at a time instead of breaking en masse.
 *
 * No archive. There is nothing inside to keep.
 */
export async function deleteCategory(
  subjectKey: string,
  categoryId: string
): Promise<{ subjectKey: string; categoryId: string; name: string }> {
  const category = await prisma.troubleshootingCategory.findUnique({
    where: { subjectKey_slug: { subjectKey, slug: categoryId } },
    include: { symptoms: { select: { slug: true, label: true } } },
  });

  if (!category) {
    throw new ContentError(`No category "${categoryId}" in ${subjectKey}`, 404);
  }

  if (category.symptoms.length > 0) {
    throw new ContentError(
      `“${category.name}” still has ${category.symptoms.length} symptom` +
        `${category.symptoms.length === 1 ? "" : "s"} in it. ` +
        "Move or delete them first, or hide the category instead.",
      409,
      category.symptoms.map((symptom) => ({
        path: symptom.slug,
        message: symptom.label,
      }))
    );
  }

  await prisma.troubleshootingCategory.delete({ where: { id: category.id } });
  await reloadTroubleshootingContent();

  return { subjectKey, categoryId, name: category.name };
}

export type ArchivedArticleSummary = {
  id: number;
  subjectKey: string;
  symptomId: string;
  label: string;
  categoryName: string;
  deletedAt: string;
  deletedBy: string | null;
  reason: string | null;
  wasPublished: boolean;
  exportedAt: string | null;
};

/** What has been deleted, newest first. */
export async function listArchivedArticles(): Promise<ArchivedArticleSummary[]> {
  const rows = await prisma.troubleshootingArchivedArticle.findMany({
    orderBy: { deletedAt: "desc" },
  });

  return rows.map((row) => ({
    id: row.id,
    subjectKey: row.subjectKey,
    symptomId: row.symptomSlug,
    label: row.label,
    categoryName: row.categoryName,
    deletedAt: row.deletedAt.toISOString(),
    deletedBy: row.deletedBy,
    reason: row.reason,
    wasPublished: row.body !== null,
    exportedAt: row.exportedAt?.toISOString() ?? null,
  }));
}

/// ── Health ───────────────────────────────────────────────────────────────
//
//  THE REPLACEMENT FOR A TEST THAT CAN NO LONGER RUN. content.test.ts used to
//  assert that every referenced screenshot existed on disk, and that every
//  branch resolved. Both were build-time guarantees over authored files. Once
//  content is edited in a browser and images live on a volume, a check on a
//  developer's machine cannot speak for production at all.
//
//  So it becomes something an operator can look at instead — surfaced on the
//  troubleshooting settings card rather than buried in CI.
//
//  IT ALSO REPORTS UNPUBLISHED DRAFTS, which is not a fault but is the
//  characteristic failure of draft-and-publish with a single admin: a draft
//  written in January, forgotten, and published never. Nothing else in the
//  system would ever mention it.

export type ContentHealth = {
  missingImages: { subjectKey: string; symptomId: string; step: number; src: string }[];
  orphanImages: string[];
  danglingBranches: { from: string; step: number; to: string; label: string }[];
  drafts: { subjectKey: string; symptomId: string; draftUpdatedAt: string; draftUpdatedBy: string | null }[];
  imageProcessingAvailable: boolean;
};

export async function getContentHealth(): Promise<ContentHealth> {
  const articles = await prisma.troubleshootingArticle.findMany({
    include: { subjects: { select: { subjectKey: true } } },
  });

  const missingImages: ContentHealth["missingImages"] = [];
  const danglingBranches: ContentHealth["danglingBranches"] = [];
  const drafts: ContentHealth["drafts"] = [];
  const referenced = new Set<string>();

  for (const article of articles) {
    const subjectKeys = article.subjects.map((s) => s.subjectKey);
    const primary = subjectKeys[0] ?? "?";

    if (article.draftUpdatedAt) {
      drafts.push({
        subjectKey: primary,
        symptomId: article.symptomSlug,
        draftUpdatedAt: article.draftUpdatedAt.toISOString(),
        draftUpdatedBy: article.draftUpdatedBy,
      });
    }

    let body: ArticleBody;
    try {
      body = JSON.parse(article.body) as ArticleBody;
    } catch {
      continue; // already reported by the snapshot loader
    }

    body.steps.forEach((step, index) => {
      // Both themes. A missing dark variant is exactly as broken as a missing
      // light one, and only half the readers would ever see it.
      for (const image of step.figure?.images ?? []) {
        for (const src of [image.src, image.srcDark].filter(Boolean) as string[]) {
          referenced.add(src);
          if (!troubleshootingImageExists(src)) {
            missingImages.push({
              subjectKey: primary,
              symptomId: article.symptomSlug,
              step: index + 1,
              src,
            });
          }
        }
      }

      if (!step.branch) return;
      const targets = step.branch.targetSubjectKey
        ? [step.branch.targetSubjectKey]
        : subjectKeys;

      for (const target of targets) {
        if (!troubleshootingRepository.findSymptom(target, step.branch.targetSymptomId)) {
          danglingBranches.push({
            from: `${primary}/${article.symptomSlug}`,
            step: index + 1,
            to: `${target}/${step.branch.targetSymptomId}`,
            label: step.branch.label,
          });
        }
      }
    });
  }

  // Orphans are counted against DRAFTS TOO, not only published bodies —
  // otherwise every screenshot uploaded for an in-progress edit would be
  // reported as rubbish and somebody would tidy away a picture that an
  // unpublished draft still points at.
  for (const article of articles) {
    if (!article.draftBody) continue;
    try {
      const draft = JSON.parse(article.draftBody) as ArticleBody;
      for (const step of draft.steps) {
        for (const image of step.figure?.images ?? []) {
          referenced.add(image.src);
          if (image.srcDark) referenced.add(image.srcDark);
        }
      }
    } catch {
      // A malformed draft is the editor's problem, not the orphan sweep's.
    }
  }

  const stored = await listStoredImages();
  const orphanImages = stored.filter((src) => !referenced.has(src));

  return {
    missingImages,
    orphanImages,
    danglingBranches,
    drafts,
    imageProcessingAvailable: await imageProcessingAvailable(),
  };
}
