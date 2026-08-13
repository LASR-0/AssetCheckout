import { describe, it, expect } from "vitest";
import {
  harvestComments,
  findArticleDeclaration,
  orphanedComments,
} from "./comments.js";
import { serialiseArticle, OrphanedCommentError } from "./serialise.js";
import { loadArticleModules, moduleKey } from "./articleModules.js";
import { contentFromDisk } from "./repository.js";
import { articleSchema, type Article } from "./schema.js";

///  +-----------------------------------------------------------------+
///  |        THE COMMENTS SURVIVE, OR THE EXPORT STOPS                |
///  +-----------------------------------------------------------------+
//
//  A comment inside an article literal exists nowhere else — not in the
//  database, not in the schema, not in anybody's head six months later. If
//  regeneration eats one, the loss is invisible in a large diff and permanent
//  once committed.
//
//  So these tests run against the REAL FILES rather than fixtures. A fixture
//  would prove the mechanism works on the shapes I thought of; the corpus
//  proves it works on the shapes that exist.
///  +-----------------------------------------------------------------+

const all = await loadArticleModules();

/** `hidden` is ours, not the schema's — a module has no room for it. */
function authored(article: Article & { hidden?: boolean }): Article {
  const { hidden, ...rest } = article;
  return rest as Article;
}

describe("finding the declaration", () => {
  it("finds one in every article module", () => {
    expect(all.length).toBeGreaterThan(50);

    for (const { label, source } of all) {
      const declaration = findArticleDeclaration(source);
      expect(declaration, label).not.toBeNull();
      expect(source.slice(declaration!.start, declaration!.end)).toMatch(/^\{[\s\S]*\}$/);
    }
  });

  it("returns null rather than throwing on a module that isn't one", () => {
    expect(findArticleDeclaration("export const x = 1;")).toBeNull();
    expect(findArticleDeclaration("not typescript at ((( all")).toBeNull();
  });
});

describe("harvesting", () => {
  it("records a comment against the path of what it introduces", () => {
    // Both depths occur in the corpus: `no-display-dock` comments the whole
    // `subjectKeys` array, `print-cloud-error` comments the single
    // `targetSubjectKey` inside a branch. A comment attaches to the thing
    // directly below it, whatever depth that is.
    const source = `
      const article: Article = {
        // why these subjects
        subjectKeys: ["laptop"],
        steps: [
          { title: "one" },
          {
            title: "two",
            // why there is a branch at all
            branch: {
              label: "l",
              // why it points at another subject
              targetSubjectKey: "phone",
            },
          },
        ],
      };
    `;

    expect(harvestComments(source)).toEqual([
      { path: "subjectKeys", text: "// why these subjects" },
      { path: "steps.1.branch", text: "// why there is a branch at all" },
      {
        path: "steps.1.branch.targetSubjectKey",
        text: "// why it points at another subject",
      },
    ]);
  });

  it("records a comment on an array element, not just a property", () => {
    const source = `
      const a: Article = {
        steps: [
          { title: "one" },
          // this step is second for a reason
          { title: "two" },
        ],
      };
    `;

    expect(harvestComments(source)).toEqual([
      { path: "steps.1", text: "// this step is second for a reason" },
    ]);
  });

  it("keeps consecutive lines separate and in order", () => {
    // The corpus writes multi-line rationale as several `//` lines, not as a
    // block comment. Order is the whole meaning of a paragraph.
    const source = `
      const a: Article = {
        // first line
        // second line
        summary: "s",
      };
    `;

    expect(harvestComments(source).map((c) => c.text)).toEqual([
      "// first line",
      "// second line",
    ]);
  });

  it("ignores everything above the literal", () => {
    // The banner survives because the splice never reaches it — harvesting it
    // too would emit it twice.
    const source = `
      /// +------------------+
      //  A BANNER
      /// +------------------+
      const a: Article = { summary: "s" };
    `;

    expect(harvestComments(source)).toEqual([]);
  });

  it("finds every comment the real modules contain", () => {
    const withComments = all.filter(({ source }) => harvestComments(source).length > 0);

    // Not asserted as a fixed number: writing a new comment in an article is a
    // good thing to do, and a test that fails for it would teach people not to.
    expect(withComments.length).toBeGreaterThan(0);

    for (const { label, source } of withComments) {
      const declaration = findArticleDeclaration(source)!;
      const literal = source.slice(declaration.start, declaration.end);

      for (const comment of harvestComments(source)) {
        expect(literal, label).toContain(comment.text);
      }
    }
  });
});

describe("re-emission", () => {
  const commented = all
    .map((module) => ({ ...module, comments: harvestComments(module.source) }))
    .filter((module) => module.comments.length > 0);

  const byKey = new Map(
    contentFromDisk().articles.map((a) => [moduleKey(a.subjectKeys[0], a.symptomId), a])
  );

  function articleFor(module: { subjectKey: string; symptomId: string }): Article {
    return authored(byKey.get(moduleKey(module.subjectKey, module.symptomId))!);
  }

  it("puts every real comment back, verbatim", async () => {
    expect(commented.length).toBeGreaterThan(0);

    for (const module of commented) {
      const emitted = await serialiseArticle(articleFor(module), module.comments);
      for (const comment of module.comments) {
        expect(emitted, module.label).toContain(comment.text);
      }
    }
  });

  it("still produces valid, unchanged content with the comments in it", async () => {
    // The real hazard: a `//` comment swallows the rest of its line, so a
    // misplaced newline turns the property below it into a comment — which
    // parses fine and silently drops a field.
    for (const module of commented) {
      const article = articleFor(module);
      const emitted = await serialiseArticle(article, module.comments);
      const back = articleSchema.parse(new Function(`return (${emitted})`)());
      expect(back, module.label).toEqual(article);
    }
  });

  it("puts a comment back above the thing it introduced", async () => {
    const article: Article = {
      symptomId: "test",
      subjectKeys: ["phone"],
      summary: "s",
      timeEstimate: "t",
      appliesTo: "a",
      updated: "2026-08-14",
      before: [],
      steps: [{ title: "one", body: "b" }, { title: "two", body: "b" }],
    };

    const emitted = await serialiseArticle(article, [
      { path: "steps.1.title", text: "// about the second step" },
    ]);

    expect(emitted).toMatch(/\/\/ about the second step\s*\n\s*title: "two"/);
  });

  it("survives an edit that moves the comment's line", async () => {
    // The reason paths are used instead of line numbers. Adding a step above
    // shifts every line below it and changes no path at all.
    const base: Article = {
      symptomId: "test",
      subjectKeys: ["phone"],
      summary: "s",
      timeEstimate: "t",
      appliesTo: "a",
      updated: "2026-08-14",
      before: [],
      steps: [{ title: "one", body: "b" }, { title: "two", body: "b" }],
    };

    const comment = { path: "steps.1.title", text: "// about the second step" };
    const grown: Article = {
      ...base,
      summary: "a much longer summary that pushes everything below it downward",
      steps: [
        base.steps[0],
        { ...base.steps[1], note: "a note that did not exist before" },
      ],
    };

    const emitted = await serialiseArticle(grown, [comment]);
    expect(emitted).toMatch(/\/\/ about the second step\s*\n\s*title: "two"/);
  });

  it("emits the same text with and without comments, apart from the comments", async () => {
    // Comments must not perturb layout, or every commented article would look
    // permanently edited to the comparator.
    for (const module of commented) {
      const article = articleFor(module);
      const withThem = await serialiseArticle(article, module.comments);
      const without = await serialiseArticle(article);

      const stripped = withThem
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");

      expect(stripped, module.label).toBe(without);
    }
  });
});

describe("orphans", () => {
  const article: Article = {
    symptomId: "test",
    subjectKeys: ["phone"],
    summary: "s",
    timeEstimate: "t",
    appliesTo: "a",
    updated: "2026-08-14",
    before: [],
    steps: [{ title: "one", body: "b" }],
  };

  it("refuses to emit when a comment's path no longer exists", async () => {
    // An admin deleted the step this comment explained. There is no honest
    // place to put it, so a person decides — not this script.
    await expect(
      serialiseArticle(article, [
        { path: "steps.4.branch.targetSubjectKey", text: "// why this target" },
      ])
    ).rejects.toThrow(OrphanedCommentError);
  });

  it("names the dead path and the comment, so the report is actionable", async () => {
    const orphan = { path: "steps.9.note", text: "// the reasoning" };

    await expect(serialiseArticle(article, [orphan])).rejects.toMatchObject({
      orphans: [orphan],
    });
    await expect(serialiseArticle(article, [orphan])).rejects.toThrow("steps.9.note");
  });

  it("stops even when only one comment of several is orphaned", async () => {
    await expect(
      serialiseArticle(article, [
        { path: "summary", text: "// fine" },
        { path: "steps.7.title", text: "// not fine" },
      ])
    ).rejects.toMatchObject({ orphans: [{ path: "steps.7.title" }] });
  });

  it("reports nothing when every path is still there", () => {
    expect(
      orphanedComments(
        [{ path: "summary", text: "// x" }],
        new Set(["summary", "steps.0.title"])
      )
    ).toEqual([]);
  });

  it("treats an absent optional key as a dead path, not a live one", async () => {
    // `note` is omitted when undefined, so a comment on a note that was
    // deleted has genuinely lost its anchor and must not be silently dropped.
    await expect(
      serialiseArticle(article, [{ path: "steps.0.note", text: "// about the note" }])
    ).rejects.toThrow(OrphanedCommentError);
  });
});
