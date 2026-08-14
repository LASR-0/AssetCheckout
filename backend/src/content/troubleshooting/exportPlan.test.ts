import { describe, it, expect } from "vitest";
import { planExport, describeExportPlan } from "./exportPlan.js";
import { contentFromDisk } from "./repository.js";
import { EMPTY_VISIBILITY, visibilitySchema, visibilityKey } from "./visibility.js";
import type { ContentSnapshot } from "./repository.js";

///  +-----------------------------------------------------------------+
///  |        THE PLAN REPORTS DRIFT, NOT EVERYTHING                   |
///  +-----------------------------------------------------------------+
//
//  A report that lists every hidden article on every run is a report nobody
//  reads, and the one thing it has to be is read — it is the only warning
//  before an export writes over content that exists nowhere else.
//
//  So the assertions here are as much about SILENCE as about output: an
//  unchanged library and an agreeing sidecar must produce an empty plan.
///  +-----------------------------------------------------------------+

const disk = contentFromDisk(EMPTY_VISIBILITY);

/** The database snapshot, as a copy that can be modified without leaking. */
function snapshot(): ContentSnapshot {
  return structuredClone(disk);
}

const noImagesChecked = () => true;

describe("nothing has changed", () => {
  it("reports every article unchanged and no visibility drift", async () => {
    const plan = await planExport(snapshot(), disk, noImagesChecked, EMPTY_VISIBILITY);

    expect(plan.articles.every((a) => a.kind === "unchanged")).toBe(true);
    expect(plan.taxonomy).toEqual([]);
    expect(plan.visibility).toEqual([]);
    expect(plan.missingImages).toEqual([]);
  });

  it("says so in one line", async () => {
    const plan = await planExport(snapshot(), disk, noImagesChecked, EMPTY_VISIBILITY);
    expect(describeExportPlan(plan)).toHaveLength(1);
  });
});

describe("article changes", () => {
  it("notices an edit and names the field", async () => {
    const db = snapshot();
    db.articles[0].summary = "something an admin typed";

    const plan = await planExport(db, disk, noImagesChecked, EMPTY_VISIBILITY);
    const change = plan.articles.find((a) => a.kind === "edited");

    expect(change).toMatchObject({ kind: "edited", symptomId: db.articles[0].symptomId });
    expect(change && "fields" in change && change.fields).toContain("summary");
  });

  it("does not report a reordered key as an edit", async () => {
    // The comparator goes through the serialiser precisely so that key order,
    // which JSON round-tripping does not preserve, is not a change.
    const db = snapshot();
    db.articles[0] = Object.fromEntries(
      Object.entries(db.articles[0]).reverse()
    ) as unknown as (typeof db.articles)[number];

    const plan = await planExport(db, disk, noImagesChecked, EMPTY_VISIBILITY);
    expect(plan.articles.every((a) => a.kind === "unchanged")).toBe(true);
  });

  it("notices an article the modules do not have", async () => {
    const db = snapshot();
    db.articles.push({ ...structuredClone(db.articles[0]), symptomId: "brand-new" });

    const plan = await planExport(db, disk, noImagesChecked, EMPTY_VISIBILITY);
    expect(plan.articles).toContainEqual(
      expect.objectContaining({ kind: "created", symptomId: "brand-new" })
    );
  });

  it("notices an article the database no longer has", async () => {
    const db = snapshot();
    const [gone] = db.articles.splice(0, 1);

    const plan = await planExport(db, disk, noImagesChecked, EMPTY_VISIBILITY);
    expect(plan.articles).toContainEqual(
      expect.objectContaining({ kind: "removed", symptomId: gone.symptomId })
    );
  });
});

describe("visibility against the sidecar", () => {
  function hide(db: ContentSnapshot): string {
    db.articles[0].hidden = true;
    return visibilityKey(db.articles[0].subjectKeys[0], db.articles[0].symptomId);
  }

  it("reports a newly hidden article as a change to write", async () => {
    const db = snapshot();
    const key = hide(db);

    const plan = await planExport(db, disk, noImagesChecked, EMPTY_VISIBILITY);

    expect(plan.visibility).toContainEqual(
      expect.objectContaining({ kind: "article-hidden" })
    );
    expect(plan.visibilityFile.hiddenArticles).toHaveProperty(key);
  });

  it("stays silent when the sidecar already records it", async () => {
    // The difference between a report worth reading and a wall of noise.
    const db = snapshot();
    const key = hide(db);

    const plan = await planExport(
      db,
      disk,
      noImagesChecked,
      visibilitySchema.parse({ hiddenArticles: { [key]: {} } })
    );

    expect(plan.visibility).toEqual([]);
    expect(plan.visibilityFile.hiddenArticles).toHaveProperty(key);
  });

  it("keeps who hid it and any note they left", async () => {
    // The database has its own audit columns, but a hand-written note has
    // nowhere else to live and must survive the rewrite.
    const db = snapshot();
    const key = hide(db);
    const entry = { by: "admin@ksb.com", at: "2026-08-01", note: "vendor changed the steps" };

    const plan = await planExport(
      db,
      disk,
      noImagesChecked,
      visibilitySchema.parse({ hiddenArticles: { [key]: entry } })
    );

    expect(plan.visibilityFile.hiddenArticles[key]).toEqual(entry);
  });

  it("reports an article that was un-hidden, so the line gets removed", async () => {
    // The quieter direction: leaving a stale entry would keep an article
    // hidden that somebody deliberately restored.
    const db = snapshot();
    const key = visibilityKey(db.articles[0].subjectKeys[0], db.articles[0].symptomId);

    const plan = await planExport(
      db,
      disk,
      noImagesChecked,
      visibilitySchema.parse({ hiddenArticles: { [key]: {} } })
    );

    expect(plan.visibility).toContainEqual(
      expect.objectContaining({ kind: "article-unhidden" })
    );
    expect(plan.visibilityFile.hiddenArticles).not.toHaveProperty(key);
  });

  it("handles a disabled category the same way in both directions", async () => {
    const db = snapshot();
    const subject = db.subjects.find((s) => s.categories.length > 1)!;
    subject.categories[0].disabled = true;
    const key = visibilityKey(subject.key, subject.categories[0].id);

    const fresh = await planExport(db, disk, noImagesChecked, EMPTY_VISIBILITY);
    expect(fresh.visibility).toContainEqual(
      expect.objectContaining({ kind: "category-disabled" })
    );

    const recorded = await planExport(
      db,
      disk,
      noImagesChecked,
      visibilitySchema.parse({ disabledCategories: { [key]: {} } })
    );
    expect(recorded.visibility).toEqual([]);

    subject.categories[0].disabled = false;
    const enabled = await planExport(
      db,
      disk,
      noImagesChecked,
      visibilitySchema.parse({ disabledCategories: { [key]: {} } })
    );
    expect(enabled.visibility).toContainEqual(
      expect.objectContaining({ kind: "category-enabled" })
    );
  });

  it("reports a sidecar entry naming something that no longer exists", async () => {
    const plan = await planExport(
      snapshot(),
      disk,
      noImagesChecked,
      visibilitySchema.parse({ hiddenArticles: { "phone/deleted-long-ago": {} } })
    );

    expect(plan.visibility).toContainEqual({
      kind: "stale-entry",
      key: "phone/deleted-long-ago",
    });
    // Dropped from what would be written, rather than carried forever.
    expect(plan.visibilityFile.hiddenArticles).not.toHaveProperty(
      "phone/deleted-long-ago"
    );
  });
});

describe("missing images", () => {
  it("reports an image the repository does not have", async () => {
    const withImage = disk.articles.find((a) =>
      a.steps.some((s) => (s.figure?.images.length ?? 0) > 0)
    )!;

    const plan = await planExport(
      snapshot(),
      disk,
      (src) => !src.includes(imageOf(withImage)),
      EMPTY_VISIBILITY
    );

    expect(plan.missingImages.length).toBeGreaterThan(0);
  });
});

function imageOf(article: ContentSnapshot["articles"][number]): string {
  return article.steps.find((s) => s.figure?.images.length)!.figure!.images[0].src;
}
