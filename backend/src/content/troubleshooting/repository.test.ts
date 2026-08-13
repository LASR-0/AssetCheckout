import { describe, it, expect } from "vitest";
import { createRepositoryOver, type ContentSnapshot } from "./repository.js";
import type { Article, Subject } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |        REPOSITORY QUERIES — VISIBILITY, OVER FIXTURES           |
///  +-----------------------------------------------------------------+
//
//  content.test.ts validates the authored corpus. This validates the QUERY
//  LAYER, and it uses hand-built fixtures because it has to: `hidden` and
//  `disabled` are admin switches with nowhere to live in a `.ts` module, so
//  there is no disk content that could exercise them.
//
//  THE RULE UNDER TEST is that listing-shaped methods filter and fetch-shaped
//  ones do not. Hidden means unlisted, not retracted — a link IT already sent
//  somebody has to keep working — and every regression of that rule ends with
//  a user following a link into a 404 while their phone is already broken.
///  +-----------------------------------------------------------------+

const article = (symptomId: string, subjectKeys: string[]): Article => ({
  symptomId,
  subjectKeys: subjectKeys as Article["subjectKeys"],
  summary: `Summary for ${symptomId} on your {device}.`,
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB {devices}",
  updated: "2026-08-12",
  before: [],
  steps: [{ title: "Step one", body: "Do the thing to your {device}." }],
});

const subject = (key: string): Subject =>
  ({
    key,
    kind: "device",
    categories: [
      {
        id: "power",
        glyph: "⚡",
        name: "Power & charging",
        blurb: "Won't start, won't charge",
        symptoms: [
          { id: "wont-turn-on", label: "Won't turn on" },
          { id: "no-charge", label: "Won't charge" },
        ],
      },
      {
        id: "display",
        glyph: "▣",
        name: "Display",
        blurb: "Screen faults",
        symptoms: [{ id: "flicker", label: "Display flickers" }],
      },
    ],
  }) as Subject;

/** A snapshot with everything visible, then bent per test. */
function snapshot(
  bend: (s: ContentSnapshot) => void = () => {}
): ContentSnapshot {
  const content: ContentSnapshot = {
    subjects: [subject("phone"), subject("tablet")].map((s) => ({
      ...s,
      categories: s.categories.map((c) => ({ ...c, disabled: false })),
    })),
    articles: [
      { ...article("wont-turn-on", ["phone", "tablet"]), hidden: false },
      { ...article("no-charge", ["phone"]), hidden: false },
      { ...article("flicker", ["phone"]), hidden: false },
    ],
  };
  bend(content);
  return content;
}

const hide = (symptomId: string) => (c: ContentSnapshot) => {
  c.articles.find((a) => a.symptomId === symptomId)!.hidden = true;
};

const disable = (categoryId: string) => (c: ContentSnapshot) => {
  for (const s of c.subjects) {
    const category = s.categories.find((cat) => cat.id === categoryId);
    if (category) category.disabled = true;
  }
};

describe("a hidden article", () => {
  it("leaves the taxonomy, search and siblings entirely", () => {
    const repo = createRepositoryOver(snapshot(hide("no-charge")));

    const symptomIds = repo
      .getSubjectCategories("phone")
      .flatMap((c) => c.symptoms.map((s) => s.id));
    expect(symptomIds).not.toContain("no-charge");
    expect(symptomIds).toContain("wont-turn-on");

    expect(repo.searchSymptoms("charge", "phone").map((s) => s.id)).toEqual([]);

    // Its former sibling must no longer offer it.
    expect(
      repo.getSiblingSymptoms("phone", "wont-turn-on").map((s) => s.id)
    ).not.toContain("no-charge");
  });

  it("is NOT dropped to a Draft badge — it goes, entirely", () => {
    // The badge means "we intend to cover this". Leaving a hidden symptom
    // listed as a Draft would say the opposite of what hiding means, and
    // would be a lie besides: the article exists and still opens.
    const repo = createRepositoryOver(snapshot(hide("no-charge")));
    const listed = repo
      .getSubjectCategories("phone")
      .flatMap((c) => c.symptoms);

    expect(listed.find((s) => s.id === "no-charge")).toBeUndefined();
  });

  it("still serves at its own address, fully substituted", () => {
    // The whole point. A direct link must keep working.
    const repo = createRepositoryOver(snapshot(hide("no-charge")));

    const served = repo.getArticle("phone", "no-charge");
    expect(served).not.toBeNull();
    expect(served!.summary).toContain("phone");
    expect(served!.summary).not.toContain("{device}");

    const found = repo.findSymptom("phone", "no-charge");
    expect(found).not.toBeNull();
    expect(found!.listed).toBe(false);
    expect(found!.category.id).toBe("power");
  });

  it("stops being counted in the subject summary", () => {
    const before = createRepositoryOver(snapshot());
    const after = createRepositoryOver(snapshot(hide("no-charge")));

    const count = (r: typeof before) =>
      r.listSubjects().find((s) => s.key === "phone")!;

    expect(count(after).symptomCount).toBe(count(before).symptomCount - 1);
    expect(count(after).articleCount).toBe(count(before).articleCount - 1);
  });

  it("hides under every subject it is listed under", () => {
    // A shared article is one row, so hiding it hides it everywhere. Worth
    // pinning: 16 phone articles are shared with tablet, and an admin hiding
    // one from Phones is also changing Tablets.
    const repo = createRepositoryOver(snapshot(hide("wont-turn-on")));

    for (const key of ["phone", "tablet"]) {
      const ids = repo
        .getSubjectCategories(key)
        .flatMap((c) => c.symptoms.map((s) => s.id));
      expect(ids).not.toContain("wont-turn-on");
      expect(repo.getArticle(key, "wont-turn-on")).not.toBeNull();
    }
  });
});

describe("a disabled category", () => {
  it("disappears from the taxonomy with its symptoms", () => {
    const repo = createRepositoryOver(snapshot(disable("display")));
    const categories = repo.getSubjectCategories("phone");

    expect(categories.map((c) => c.id)).toEqual(["power"]);
    expect(repo.searchSymptoms("flicker", "phone")).toEqual([]);
  });

  it("still resolves its symptoms by address", () => {
    const repo = createRepositoryOver(snapshot(disable("display")));

    const found = repo.findSymptom("phone", "flicker");
    expect(found).not.toBeNull();
    expect(found!.listed).toBe(false);
    expect(repo.getArticle("phone", "flicker")).not.toBeNull();
  });

  it("does not take the subject down with it", () => {
    // Disabling every category must not make the subject itself unknown —
    // the route derives its 404 from hasSubject for exactly this reason.
    const repo = createRepositoryOver(
      snapshot((c) => {
        for (const s of c.subjects) {
          for (const category of s.categories) category.disabled = true;
        }
      })
    );

    expect(repo.getSubjectCategories("phone")).toEqual([]);
    expect(repo.hasSubject("phone")).toBe(true);
    expect(repo.listSubjects().find((s) => s.key === "phone")).toBeDefined();
  });
});

describe("addresses that were never real", () => {
  it("returns null rather than pretending", () => {
    const repo = createRepositoryOver(snapshot());

    expect(repo.findSymptom("phone", "does-not-exist")).toBeNull();
    expect(repo.findSymptom("toaster", "wont-turn-on")).toBeNull();
    expect(repo.hasSubject("toaster")).toBe(false);
    expect(repo.getArticle("phone", "does-not-exist")).toBeNull();
  });

  it("reports a listed symptom as listed", () => {
    const found = createRepositoryOver(snapshot()).findSymptom(
      "phone",
      "no-charge"
    );
    expect(found!.listed).toBe(true);
  });
});
