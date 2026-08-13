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
  /** The live text. Raw — {device} tokens intact. */
  published: ArticleBody;
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
    published: JSON.parse(article.body) as ArticleBody,
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
      article: { select: { hidden: true, draftBody: true } },
    },
  });

  const byId = new Map(
    articles.map((m) => [
      m.symptomSlug,
      { hidden: m.article.hidden, hasDraft: m.article.draftBody !== null },
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

export async function discardDraft(
  subjectKey: string,
  symptomId: string
): Promise<{ hasDraft: false }> {
  const article = await requireArticle(subjectKey, symptomId);

  await prisma.troubleshootingArticle.update({
    where: { id: article.id },
    data: { draftBody: null, draftUpdatedAt: null, draftUpdatedBy: null },
  });

  return { hasDraft: false };
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
