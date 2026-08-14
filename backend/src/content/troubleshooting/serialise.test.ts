import { describe, it, expect } from "vitest";
import { contentFromDisk } from "./repository.js";
import {
  serialiseArticle,
  articlesDiffer,
  rewriteArticleModule,
  newArticleModule,
  archivedArticleModule,
  NotAnArticleModuleError,
} from "./serialise.js";
import { loadArticleModules, moduleKey } from "./articleModules.js";
import { articleSchema, type Article } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |           THE SERIALISER SAYS WHAT IT WAS GIVEN                 |
///  +-----------------------------------------------------------------+
//
//  This function writes the article library back into source files, so a bug
//  in it silently corrupts content that exists nowhere else. These tests are
//  cheap because article objects are pure JSON-compatible data: emit one,
//  evaluate the text, compare. No database, no fixtures, no mocks.
//
//  THE CORPUS IS THE FIXTURE. Sixty real articles already cover every optional
//  key combination, both quote styles, backslashed Windows paths, and every
//  non-ASCII character in use — a hand-written fixture set would be smaller
//  and less representative, and would drift from what is actually stored.
///  +-----------------------------------------------------------------+

const articles = contentFromDisk().articles;

/** `hidden` is ours, not the schema's — a module has no room for it. */
function authored(article: Article & { hidden?: boolean }): Article {
  const { hidden, ...rest } = article;
  return rest as Article;
}

/** Evaluate emitted source back into an object. No injection surface: the
 *  input is text this module produced from already-validated data. */
function evaluate(literal: string): unknown {
  return new Function(`return (${literal})`)();
}

describe("round trip", () => {
  it("re-parses to the same article, for all 60", async () => {
    expect(articles.length).toBeGreaterThan(50);

    for (const article of articles) {
      const source = await serialiseArticle(article);
      const back = articleSchema.parse(evaluate(source));
      expect(back).toEqual(authored(article));
    }
  });

  it("is idempotent — emitting twice changes nothing", async () => {
    // Catches any layout decision that isn't a fixed point, which would make
    // the exporter rewrite files forever with no content change.
    for (const article of articles.slice(0, 12)) {
      const once = await serialiseArticle(article);
      const twice = await serialiseArticle(articleSchema.parse(evaluate(once)));
      expect(twice).toBe(once);
    }
  });

  it("emits the same text for equal content, whatever the key order", async () => {
    // The comparator depends on this completely. A row deserialised from JSON
    // can arrive with keys in any order, and two articles with the same
    // content must never look different because of it.
    const [first] = articles;
    const shuffled = Object.fromEntries(
      Object.entries(authored(first)).reverse()
    ) as unknown as Article;

    expect(await serialiseArticle(shuffled)).toBe(await serialiseArticle(first));
    expect(await articlesDiffer(first, shuffled)).toBe(false);
  });

  it("reports a real edit as a difference", async () => {
    const [first] = articles;
    const edited = { ...authored(first), summary: `${first.summary} ` };

    // A trailing space is a real edit, not noise: somebody typed it. The
    // exporter must not normalise text an author wrote.
    expect(await articlesDiffer(first, edited)).toBe(true);
  });
});

describe("string escaping", () => {
  ///  The one place a bug produces invalid source rather than wrong content,
  ///  which is worse: a broken module fails the whole seed at boot.
  const nasty = [
    'contains "double" quotes',
    "contains 'single' quotes",
    `both "double" and 'single'`,
    "C:\\Program Files\\Y Soft Corporation\\SAFEQ Cloud Client\\",
    "a\nnewline and a\ttab",
    "template ${injection} attempt",
    "</script><script>alert(1)</script>",
    "unicode — › ⓘ ⚙ ⋮ ⚡ ▣ and an emoji 🔋",
    "trailing backslash \\",
    "\u0000 control character",
    `equal counts " and '`,
  ];

  it("survives every shape of string we might store", async () => {
    for (const value of nasty) {
      const article: Article = {
        symptomId: "test-symptom",
        subjectKeys: ["phone"],
        summary: value,
        timeEstimate: value,
        appliesTo: value,
        updated: "2026-08-14",
        before: [value],
        steps: [{ title: value, body: value, note: value, warn: value }],
      };

      const back = evaluate(await serialiseArticle(article)) as Article;
      expect(back.summary).toBe(value);
      expect(back.before[0]).toBe(value);
      expect(back.steps[0].note).toBe(value);
    }
  });
});

describe("what the emitter leaves out", () => {
  it("omits absent optional keys rather than emitting undefined", async () => {
    const bare: Article = {
      symptomId: "bare",
      subjectKeys: ["phone"],
      summary: "s",
      timeEstimate: "t",
      appliesTo: "a",
      updated: "2026-08-14",
      before: [],
      steps: [{ title: "x", body: "y" }],
    };

    const source = await serialiseArticle(bare);
    expect(source).not.toContain("undefined");
    expect(source).not.toContain("null");
    expect(source).not.toContain("source:");
    expect(source).not.toContain("note:");
    expect(source).toContain("before: []");

    expect(articleSchema.parse(evaluate(source))).toEqual(bare);
  });

  it("never emits the hidden flag, which is not authored content", async () => {
    const withFlag = { ...authored(articles[0]), hidden: true } as Article;
    expect(await serialiseArticle(withFlag)).not.toContain("hidden");
  });
});

describe("the seed is already canonical", () => {
  ///  +-----------------------------------------------------------------+
  //  The assertion the whole export rests on: regenerating every module from
  //  the content it holds reproduces the file BYTE FOR BYTE.
  //
  //  Without it, "only rewrite the files that differ" is an unverifiable
  //  heuristic — the exporter could be introducing layout churn into every
  //  file it touches and nothing would say so. With it, a diff after an export
  //  contains only what somebody actually changed, which is the difference
  //  between a review that takes a minute and one nobody does.
  //
  //  IT IS ALSO THE PRETTIER TRIPWIRE. A Prettier upgrade reformats the corpus;
  //  the version is pinned exactly, and this fails on the day the pin moves
  //  rather than inside somebody's unrelated diff three weeks later.
  ///  +-----------------------------------------------------------------+

  it("regenerates every module byte-for-byte", async () => {
    const modules = await loadArticleModules();
    expect(modules.length).toBeGreaterThan(50);

    const byKey = new Map(
      articles.map((a) => [moduleKey(a.subjectKeys[0], a.symptomId), a])
    );

    for (const module of modules) {
      const article = byKey.get(moduleKey(module.subjectKey, module.symptomId));
      expect(article, `${module.label} has no article in the snapshot`).toBeDefined();

      const rewritten = await rewriteArticleModule(module.source, authored(article!));
      expect(rewritten, module.label).toBe(module.source);
    }
  });

  it("refuses a file that isn't an article module", async () => {
    await expect(
      rewriteArticleModule("export const x = 1;", authored(articles[0]))
    ).rejects.toThrow(NotAnArticleModuleError);
  });

  it("replaces only the literal, leaving the banner and imports alone", async () => {
    const [first] = await loadArticleModules();
    const article = { ...authored(articles.find((a) => a.symptomId === first.symptomId)!) };
    article.summary = "a summary nobody wrote";

    const rewritten = await rewriteArticleModule(first.source, article);
    const header = first.source.slice(0, first.source.indexOf("const "));

    expect(rewritten.startsWith(header)).toBe(true);
    expect(rewritten.endsWith(first.source.slice(first.source.lastIndexOf("};") + 2))).toBe(
      true
    );
    expect(rewritten).toContain("a summary nobody wrote");
  });
});

describe("a module for a brand new article", () => {
  it("is a complete, valid module", async () => {
    const source = await newArticleModule("phoneSpeakerCrackle", authored(articles[0]), "phone — speaker crackle");

    expect(source).toContain('import type { Article } from "../../schema.js";');
    expect(source).toContain("const phoneSpeakerCrackle: Article = {");
    expect(source.trimEnd().endsWith("export default phoneSpeakerCrackle;")).toBe(true);
  });

  it("holds the article it was given", async () => {
    const article = authored(articles[0]);
    const source = await newArticleModule("x", article, "heading");

    const literal = source.slice(source.indexOf("= {") + 2, source.lastIndexOf("};") + 1);
    expect(articleSchema.parse(evaluate(literal))).toEqual(article);
  });

  it("says its banner is a stub rather than inventing rationale", async () => {
    // Every hand-written module explains why the article is shaped as it is.
    // None of that is in the database, so a confident-sounding banner here
    // would be fabricated reasoning that reads exactly like the real thing.
    const source = await newArticleModule("x", authored(articles[0]), "heading");

    expect(source).toContain("THIS BANNER IS A STUB");
  });

  it("is formatted the same way the corpus is", async () => {
    // Round-trips through the same emitter, so a new file and an edited one
    // cannot drift apart in layout.
    const article = authored(articles[0]);
    const source = await newArticleModule("x", article, "heading");
    const literal = source.slice(source.indexOf("= {") + 2, source.lastIndexOf("};") + 1);

    expect(literal).toBe(await serialiseArticle(article));
  });
});

describe("an archived article", () => {
  const context = {
    label: "Camera won't open or photos are blurry",
    categoryName: "Audio & camera",
    position: 3,
    deletedAt: "2026-08-14T09:00:00.000Z",
    deletedBy: "admin@ksb.com",
    reason: "superseded by the combined article",
    linksAtDeletion: 2,
    wasPublished: true,
  };

  it("says who deleted it, when, and where it sat", async () => {
    // The questions somebody finding this file in a year actually has.
    const source = await archivedArticleModule(authored(articles[0]), context);

    expect(source).toContain("DELETED 2026-08-14 by admin@ksb.com");
    expect(source).toContain("Audio & camera");
    expect(source).toContain("position 3");
    expect(source).toContain("2 article(s) linked to it");
    expect(source).toContain("superseded by the combined article");
  });

  it("says how to bring it back", async () => {
    // The archive is only useful if the recovery path is written down where
    // the file is, not in a document nobody finds.
    const source = await archivedArticleModule(authored(articles[0]), context);

    expect(source).toContain("To bring it back");
    expect(source).toContain("NOT COMPILED, NOT TESTED, NOT SHIPPED");
  });

  it("keeps the article intact", async () => {
    const article = authored(articles[0]);
    const source = await archivedArticleModule(article, context);

    const literal = source.slice(source.indexOf("= {") + 2, source.lastIndexOf("};") + 1);
    expect(articleSchema.parse(evaluate(literal))).toEqual(article);
  });

  it("records that it was never published, when it wasn't", async () => {
    const source = await archivedArticleModule(authored(articles[0]), {
      ...context,
      wasPublished: false,
      reason: null,
      deletedBy: null,
    });

    expect(source).toContain("never published");
    expect(source).not.toContain("Reason given");
    expect(source).not.toContain(" by ");
  });
});
