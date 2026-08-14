import {
  articleBodySchema,
  articleSchema,
  SUBJECT_KEYS,
  type SubjectKey,
} from "./schema.js";
import type { ContentSnapshot } from "./repository.js";

///  +-----------------------------------------------------------------+
///  |          CONTENT ↔ ROWS, WITHOUT TOUCHING A DATABASE            |
///  +-----------------------------------------------------------------+
//
//  The mapping between a ContentSnapshot and the flat shape the tables hold,
//  as two pure functions. Prisma is deliberately not imported here.
//
//  WHY THIS IS SEPARATE FROM THE SEEDER. The dangerous bug in a migration
//  like this is not a failed insert — that is loud. It is a field silently
//  dropped on the way in, discovered months later when somebody notices a
//  `note` callout has gone missing from an article nobody had opened. Keeping
//  the mapping pure means `fromRows(toRows(x))` deep-equals `x` is a test
//  that needs no database, runs in milliseconds, and fails the moment a field
//  is forgotten.
//
//  Ordering is carried explicitly rather than left to insertion order.
//  SQLite returns rows in rowid order right up until the first row is
//  rewritten, at which point an edited category would quietly jump position.
///  +-----------------------------------------------------------------+

export type SubjectRow = {
  key: string;
  kind: string;
  position: number;
};

export type CategoryRow = {
  subjectKey: string;
  slug: string;
  glyph: string;
  name: string;
  blurb: string;
  position: number;
  disabled: boolean;
};

export type SymptomRow = {
  subjectKey: string;
  /** Which category it belongs to, by slug — the database id doesn't exist
   *  until insert, and this mapping never sees one. */
  categorySlug: string;
  slug: string;
  label: string;
  position: number;
};

export type ArticleRow = {
  symptomSlug: string;
  /**
   * The article body, JSON-encoded. Validated by articleBodySchema.
   *
   * NULL MEANS NEVER PUBLISHED — created in the UI and still being written.
   * Declared nullable so the shape says so, but note that `strict` is off in
   * this package's tsconfig, so the compiler will NOT find the places that
   * assume a string. The skip in `fromRows` is deliberate rather than
   * defensive: it is the only thing standing between a draft and a validation
   * error logged on every snapshot load.
   */
  body: string | null;
  hidden: boolean;
  /** Every subject that lists it — becomes the membership rows. */
  subjectKeys: string[];
};

export type ContentRows = {
  subjects: SubjectRow[];
  categories: CategoryRow[];
  symptoms: SymptomRow[];
  articles: ArticleRow[];
};

/** Flatten a snapshot into the shape the tables hold. */
export function toRows(content: ContentSnapshot): ContentRows {
  const subjects: SubjectRow[] = [];
  const categories: CategoryRow[] = [];
  const symptoms: SymptomRow[] = [];

  content.subjects.forEach((subject, subjectIndex) => {
    subjects.push({
      key: subject.key,
      kind: subject.kind,
      position: subjectIndex,
    });

    subject.categories.forEach((category, categoryIndex) => {
      categories.push({
        subjectKey: subject.key,
        slug: category.id,
        glyph: category.glyph,
        name: category.name,
        blurb: category.blurb,
        position: categoryIndex,
        disabled: category.disabled,
      });

      category.symptoms.forEach((symptom, symptomIndex) => {
        symptoms.push({
          subjectKey: subject.key,
          categorySlug: category.id,
          slug: symptom.id,
          label: symptom.label,
          position: symptomIndex,
        });
      });
    });
  });

  const articles: ArticleRow[] = content.articles.map((article) => {
    // Split identity from document. `hidden` is ours, not the schema's, so it
    // is peeled off before the body is encoded — a stray `hidden` key inside
    // the JSON would fail articleBodySchema's strictness on the way back.
    const { symptomId, subjectKeys, hidden, ...body } = article;

    return {
      symptomSlug: symptomId,
      body: JSON.stringify(articleBodySchema.parse(body)),
      hidden,
      subjectKeys: [...subjectKeys],
    };
  });

  return { subjects, categories, symptoms, articles };
}

/**
 * Rebuild a snapshot from rows.
 *
 * Validates every article as it goes, because these rows are user-edited once
 * the editor exists. A row that fails is the caller's problem to report —
 * `onInvalid` lets the live loader skip it and keep the library up, while the
 * seed and the round-trip test let it throw.
 */
export function fromRows(
  rows: ContentRows,
  onInvalid?: (symptomSlug: string, error: unknown) => void
): ContentSnapshot {
  const categoriesBySubject = new Map<string, CategoryRow[]>();
  for (const category of [...rows.categories].sort((a, b) => a.position - b.position)) {
    const list = categoriesBySubject.get(category.subjectKey);
    if (list) list.push(category);
    else categoriesBySubject.set(category.subjectKey, [category]);
  }

  const symptomsByCategory = new Map<string, SymptomRow[]>();
  for (const symptom of [...rows.symptoms].sort((a, b) => a.position - b.position)) {
    const key = `${symptom.subjectKey}/${symptom.categorySlug}`;
    const list = symptomsByCategory.get(key);
    if (list) list.push(symptom);
    else symptomsByCategory.set(key, [symptom]);
  }

  const subjects = [...rows.subjects]
    .sort((a, b) => a.position - b.position)
    .map((subject) => ({
      key: subject.key as SubjectKey,
      kind: subject.kind as "device" | "app",
      categories: (categoriesBySubject.get(subject.key) ?? []).map((category) => ({
        id: category.slug,
        glyph: category.glyph,
        name: category.name,
        blurb: category.blurb,
        disabled: category.disabled,
        symptoms: (symptomsByCategory.get(`${subject.key}/${category.slug}`) ?? []).map(
          (symptom) => ({ id: symptom.slug, label: symptom.label })
        ),
      })),
    }));

  // Membership rows come back in whatever order the database chose, so the
  // list is put into SUBJECT_KEYS order on the way out. That is not an
  // arbitrary tidy: every authored article already lists its subjects in that
  // order, so canonicalising here reproduces the authored value exactly
  // without needing a position column to remember it. It also matches
  // buildPicker, which sorts by SUBJECT_KEYS for the same reason — a stable
  // order that no edit can reshuffle.
  const subjectOrder = new Map(SUBJECT_KEYS.map((key, i) => [key as string, i]));
  const canonical = (keys: string[]) =>
    [...keys].sort(
      (a, b) => (subjectOrder.get(a) ?? 99) - (subjectOrder.get(b) ?? 99)
    );

  const articles: ContentSnapshot["articles"] = [];
  for (const row of rows.articles) {
    // Never published: an article being written in the UI. It is NOT invalid,
    // so it must not go through onInvalid — that path logs an error and would
    // report every work in progress as corrupt content on every reload. It
    // simply isn't in the library yet, which is the same state a symptom with
    // no article at all is in, and renders the same way: as Draft.
    if (row.body === null || row.body === undefined) continue;

    try {
      const article = articleSchema.parse({
        symptomId: row.symptomSlug,
        subjectKeys: canonical(row.subjectKeys),
        ...JSON.parse(row.body),
      });
      articles.push({ ...article, hidden: row.hidden });
    } catch (err) {
      if (!onInvalid) throw err;
      onInvalid(row.symptomSlug, err);
    }
  }

  return { subjects, articles };
}
