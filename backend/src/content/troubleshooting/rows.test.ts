import { describe, it, expect } from "vitest";
import { contentFromDisk } from "./repository.js";
import { toRows, fromRows, type ContentRows } from "./rows.js";

///  +-----------------------------------------------------------------+
///  |            THE SEED MAPPING SURVIVES A ROUND TRIP               |
///  +-----------------------------------------------------------------+
//
//  The whole library, out to rows and back, compared against itself.
//
//  This is the test that makes the disk-to-database migration safe. A failed
//  insert is loud and gets fixed in minutes; a field silently dropped on the
//  way through is not, and would be found months later by a reader who
//  noticed a `warn` callout had gone missing from an article nobody had
//  opened since. Deep equality over the real corpus catches that on the day
//  the mapping is written.
//
//  No database. Both functions are pure, which is exactly why they were
//  separated from the seeder.
///  +-----------------------------------------------------------------+

const original = contentFromDisk();

describe("toRows / fromRows", () => {
  it("reproduces the entire library exactly", () => {
    expect(fromRows(toRows(original))).toEqual(original);
  });

  it("carries every article, with its subjects", () => {
    const rows = toRows(original);

    expect(rows.articles).toHaveLength(original.articles.length);

    // The shared articles are the ones most likely to be mangled — a mapping
    // that flattened memberships wrongly would silently unshare them.
    const shared = rows.articles.filter((a) => a.subjectKeys.length > 1);
    expect(shared.length).toBeGreaterThan(0);

    // Compared BY POSITION, not by symptomSlug. A slug does not identify an
    // article on its own: "wont-turn-on" is one article under Laptops and a
    // different one under Desktops, which is why the database puts its unique
    // constraint on (subjectKey, symptomSlug) and not on the slug alone.
    rows.articles.forEach((row, i) => {
      expect(row.symptomSlug).toBe(original.articles[i].symptomId);
      expect(row.subjectKeys).toEqual(original.articles[i].subjectKeys);
    });
  });

  it("allows one slug to be two different articles under different subjects", () => {
    // The invariant the schema depends on, pinned so nobody 'fixes' the
    // model by making symptomSlug unique.
    const rows = toRows(original);
    const bySlug = new Map<string, string[][]>();
    for (const row of rows.articles) {
      bySlug.set(row.symptomSlug, [...(bySlug.get(row.symptomSlug) ?? []), row.subjectKeys]);
    }

    const reused = [...bySlug].filter(([, uses]) => uses.length > 1);
    expect(reused.length).toBeGreaterThan(0);

    // ...but no subject may list the same slug twice, which IS unique.
    for (const [, uses] of reused) {
      const flat = uses.flat();
      expect(new Set(flat).size).toBe(flat.length);
    }
  });

  it("keeps category and symptom order, which nothing else records", () => {
    // SQLite returns insertion order right up until a row is rewritten, so
    // position is the only thing that will still be true after the first edit.
    const rows = toRows(original);
    const rebuilt = fromRows(rows);

    for (const subject of original.subjects) {
      const after = rebuilt.subjects.find((s) => s.key === subject.key)!;
      expect(after.categories.map((c) => c.id)).toEqual(
        subject.categories.map((c) => c.id)
      );
      for (const [i, category] of subject.categories.entries()) {
        expect(after.categories[i].symptoms.map((s) => s.id)).toEqual(
          category.symptoms.map((s) => s.id)
        );
      }
    }
  });

  it("stores the body without its identity fields", () => {
    // symptomId and subjectKeys are relational — enforced by keys and unique
    // constraints. A copy inside the JSON could disagree with the columns,
    // and then which one is right?
    for (const row of toRows(original).articles) {
      const body = JSON.parse(row.body);
      expect(body).not.toHaveProperty("symptomId");
      expect(body).not.toHaveProperty("subjectKeys");
      expect(body).not.toHaveProperty("hidden");
      expect(body.summary).toBeTruthy();
    }
  });

  it("preserves the {device} tokens rather than substituting them", () => {
    // Substitution happens at serve time, per subject. If it ever leaked into
    // storage, a shared article would be frozen to whichever subject was
    // seeded first and would read wrongly under the other one forever.
    const tokened = toRows(original).articles.filter((a) => a.body.includes("{device"));
    expect(tokened.length).toBeGreaterThan(0);
  });

  it("reports a bad row instead of throwing when asked to", () => {
    // The live loader must keep the library up when one user-edited row is
    // malformed; the seed must not. Same function, caller's choice.
    const rows = toRows(original);
    rows.articles[0] = { ...rows.articles[0], body: '{"summary":"missing everything else"}' };

    expect(() => fromRows(rows)).toThrow();

    const skipped: string[] = [];
    const result = fromRows(rows, (slug) => skipped.push(slug));
    expect(skipped).toHaveLength(1);
    expect(result.articles).toHaveLength(original.articles.length - 1);
  });
});

describe("an article that was never published", () => {
  ///  +-----------------------------------------------------------------+
  //  `body` is null for an article created in the UI and still being written.
  //
  //  These tests carry more weight than usual: this package compiles with
  //  `strict: false`, so `string | null` assigns to `string` without complaint
  //  and NOTHING in the type system will find a place that assumed otherwise.
  //  The behaviour is only pinned here.
  ///  +-----------------------------------------------------------------+

  const draftRow = (rows: ContentRows): ContentRows => ({
    ...rows,
    articles: rows.articles.map((article, index) =>
      index === 0 ? { ...article, body: null } : article
    ),
  });

  it("is left out of the library rather than reported as corrupt", () => {
    const rows = toRows(original);
    const invalid: string[] = [];

    const { articles } = fromRows(draftRow(rows), (slug) => invalid.push(slug));

    // Absent, and — the point — absent silently.
    expect(articles).toHaveLength(original.articles.length - 1);
    expect(invalid).toEqual([]);
  });

  it("is skipped even when nothing is listening for invalid rows", () => {
    // The seed and the round-trip test call fromRows with no handler, so a
    // draft must not throw there either.
    expect(() => fromRows(draftRow(toRows(original)))).not.toThrow();
  });

  it("leaves every other article untouched", () => {
    const rows = toRows(original);
    const skipped = rows.articles[0].symptomSlug;

    const { articles } = fromRows(draftRow(rows));

    expect(articles.some((a) => a.symptomId === skipped)).toBe(false);
    expect(articles.length).toBeGreaterThan(50);
  });

  it("still reports a genuinely malformed body as invalid", () => {
    // The skip must be for null specifically. A body that is present but
    // broken is real corruption and has to keep being reported.
    const rows = toRows(original);
    const broken: ContentRows = {
      ...rows,
      articles: rows.articles.map((article, index) =>
        index === 0 ? { ...article, body: '{"steps":"not an array"}' } : article
      ),
    };

    const invalid: string[] = [];
    fromRows(broken, (slug) => invalid.push(slug));

    expect(invalid).toEqual([rows.articles[0].symptomSlug]);
  });
});
