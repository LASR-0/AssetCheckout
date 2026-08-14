import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readVisibility,
  serialiseVisibility,
  visibilityKey,
  visibilitySchema,
  EMPTY_VISIBILITY,
} from "./visibility.js";
import { contentFromDisk } from "./repository.js";
import { toRows, fromRows } from "./rows.js";

///  +-----------------------------------------------------------------+
///  |        HIDDEN CONTENT STAYS HIDDEN ACROSS A REBUILD             |
///  +-----------------------------------------------------------------+
//
//  The failure this file exists to prevent: somebody hides an article because
//  it is wrong, the content is exported, and a deployment three months later
//  seeds it back VISIBLE. Nobody would connect the two events.
//
//  So the round-trip test at the bottom is the important one here. The rest is
//  the parsing that keeps it honest.
///  +-----------------------------------------------------------------+

const scratch = mkdtempSync(join(tmpdir(), "visibility-"));
const written: string[] = [];

function sidecar(contents: string): string {
  const path = join(scratch, `v${written.length}.json`);
  writeFileSync(path, contents);
  written.push(path);
  return path;
}

afterEach(() => {
  for (const path of written.splice(0)) rmSync(path, { force: true });
});

describe("reading", () => {
  it("treats a missing file as nothing hidden", () => {
    // The state of a fresh checkout, and the state of the world before the
    // sidecar existed. It must not be an error.
    expect(readVisibility(join(scratch, "does-not-exist.json"))).toEqual(
      EMPTY_VISIBILITY
    );
  });

  it("reads what is switched off", () => {
    const path = sidecar(
      JSON.stringify({
        hiddenArticles: { "phone/camera": { by: "someone@ksb.com" } },
        disabledCategories: { "phone/audio": {} },
      })
    );

    const visibility = readVisibility(path);
    expect(visibility.hiddenArticles["phone/camera"].by).toBe("someone@ksb.com");
    expect(visibility.disabledCategories).toHaveProperty("phone/audio");
  });

  it("accepts a file that omits either map", () => {
    expect(readVisibility(sidecar("{}"))).toEqual(EMPTY_VISIBILITY);
    expect(
      readVisibility(sidecar('{"hiddenArticles":{"phone/camera":{}}}'))
        .disabledCategories
    ).toEqual({});
  });

  it("throws on invalid JSON rather than starting with everything visible", () => {
    // Loud beats silent. Ignoring a broken sidecar means un-hiding content,
    // which is the exact failure the file exists to prevent.
    expect(() => readVisibility(sidecar("{ not json"))).toThrow(/not valid JSON/);
  });

  it("throws on the wrong shape, naming what is wrong", () => {
    const path = sidecar('{"hiddenArticles":["phone/camera"]}');
    expect(() => readVisibility(path)).toThrow(/hiddenArticles/);
  });
});

describe("writing", () => {
  it("sorts keys, so an added entry is one added line", () => {
    const source = serialiseVisibility(
      visibilitySchema.parse({
        hiddenArticles: { "phone/zebra": {}, "laptop/alpha": {}, "phone/camera": {} },
        disabledCategories: {},
      })
    );

    expect(Object.keys(JSON.parse(source).hiddenArticles)).toEqual([
      "laptop/alpha",
      "phone/camera",
      "phone/zebra",
    ]);
  });

  it("round-trips through the reader", () => {
    const original = visibilitySchema.parse({
      hiddenArticles: { "phone/camera": { by: "a@ksb.com", at: "2026-08-13" } },
      disabledCategories: { "phone/audio": { note: "vendor changed the menus" } },
    });

    expect(readVisibility(sidecar(serialiseVisibility(original)))).toEqual(original);
  });

  it("ends with a newline, like everything else in the tree", () => {
    expect(serialiseVisibility(EMPTY_VISIBILITY).endsWith("}\n")).toBe(true);
  });
});

describe("applying it to disk content", () => {
  const visible = contentFromDisk(EMPTY_VISIBILITY);

  it("hides nothing when the sidecar is empty", () => {
    expect(visible.articles.some((a) => a.hidden)).toBe(false);
    expect(
      visible.subjects.some((s) => s.categories.some((c) => c.disabled))
    ).toBe(false);
  });

  it("hides exactly the article named, and no other", () => {
    const target = visible.articles[0];
    const key = visibilityKey(target.subjectKeys[0], target.symptomId);

    const content = contentFromDisk(
      visibilitySchema.parse({ hiddenArticles: { [key]: {} } })
    );

    const hidden = content.articles.filter((a) => a.hidden);
    expect(hidden).toHaveLength(1);
    expect(hidden[0].symptomId).toBe(target.symptomId);
  });

  it("disables exactly the category named", () => {
    const subject = visible.subjects.find((s) => s.categories.length > 1)!;
    const key = visibilityKey(subject.key, subject.categories[0].id);

    const content = contentFromDisk(
      visibilitySchema.parse({ disabledCategories: { [key]: {} } })
    );

    const disabled = content.subjects.flatMap((s) =>
      s.categories.filter((c) => c.disabled).map((c) => `${s.key}/${c.id}`)
    );
    expect(disabled).toEqual([key]);
  });

  it("ignores an entry naming something that no longer exists", () => {
    // A stale key is not worth refusing to boot over — the content moved on
    // and the sidecar didn't. The export reports it; the app carries on.
    const content = contentFromDisk(
      visibilitySchema.parse({
        hiddenArticles: { "phone/an-article-that-was-deleted": {} },
      })
    );

    expect(content.articles.some((a) => a.hidden)).toBe(false);
  });
});

describe("the round trip that matters", () => {
  it("keeps an article hidden through export, reseed and reload", () => {
    ///  Hide it → write the sidecar → read it back → seed a database from it
    ///  → load the snapshot the app serves. Still hidden at the end, or a
    ///  deployment silently republishes a page somebody pulled.
    const target = contentFromDisk(EMPTY_VISIBILITY).articles[0];
    const key = visibilityKey(target.subjectKeys[0], target.symptomId);

    const exported = serialiseVisibility(
      visibilitySchema.parse({
        hiddenArticles: { [key]: { by: "admin@ksb.com", at: "2026-08-13" } },
      })
    );

    // A fresh checkout: the modules, plus whatever the sidecar says.
    const seeded = contentFromDisk(readVisibility(sidecar(exported)));

    // Through the database row shape and back, which is what seeding does.
    const reloaded = fromRows(toRows(seeded));

    const article = reloaded.articles.find((a) => a.symptomId === target.symptomId);
    expect(article?.hidden).toBe(true);
  });

  it("keeps a category disabled through the same trip", () => {
    const subject = contentFromDisk(EMPTY_VISIBILITY).subjects.find(
      (s) => s.categories.length > 1
    )!;
    const category = subject.categories[0];
    const key = visibilityKey(subject.key, category.id);

    const exported = serialiseVisibility(
      visibilitySchema.parse({ disabledCategories: { [key]: {} } })
    );

    const reloaded = fromRows(toRows(contentFromDisk(readVisibility(sidecar(exported)))));
    const back = reloaded.subjects
      .find((s) => s.key === subject.key)!
      .categories.find((c) => c.id === category.id);

    expect(back?.disabled).toBe(true);
  });
});
