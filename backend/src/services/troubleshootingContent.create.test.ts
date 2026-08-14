import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import {
  slugifyLabel,
  previewSymptomSlug,
  createSymptom,
  createArticleDraft,
  createCategory,
  moveCategory,
  moveSymptom,
  getEditableArticle,
  getEditableSubject,
  publishDraft,
  saveDraft,
  discardDraft,
  ContentError,
} from "./troubleshootingContent.js";
import { troubleshootingRepository } from "../content/troubleshooting/index.js";

///  +-----------------------------------------------------------------+
///  |        CREATING CONTENT THAT NOBODY CAN SEE YET                 |
///  +-----------------------------------------------------------------+
//
//  The invariant worth more than all the others here: a newly created article
//  is INVISIBLE to readers until somebody publishes it. Get that wrong and an
//  admin who clicks "add" has published an empty skeleton to the whole company
//  and has to race to fill it in.
//
//  These run against the real database, because the thing being tested is
//  largely the database's behaviour — position ordering, the compound unique
//  on subject+slug, what a null body does to the snapshot. Everything created
//  is torn down at the end, in reverse dependency order.
///  +-----------------------------------------------------------------+

/** Everything created here, cleaned up afterwards. */
const created = {
  symptoms: [] as { subjectKey: string; slug: string }[],
  categories: [] as { subjectKey: string; slug: string }[],
};

const SUBJECT = "phone";
const stamp = Date.now();

/** A label unique to this run, so a failed teardown cannot poison the next. */
function label(name: string): string {
  return `Test ${name} ${stamp}`;
}

async function newSymptom(categoryId: string, name: string) {
  const symptom = await createSymptom(SUBJECT, categoryId, label(name));
  created.symptoms.push({ subjectKey: SUBJECT, slug: symptom.symptomId });
  return symptom;
}

afterAll(async () => {
  for (const { subjectKey, slug } of created.symptoms) {
    await prisma.troubleshootingArticleSubject
      .deleteMany({ where: { subjectKey, symptomSlug: slug } })
      .catch(() => {});
    await prisma.troubleshootingArticle
      .deleteMany({ where: { symptomSlug: slug } })
      .catch(() => {});
    await prisma.troubleshootingSymptom
      .deleteMany({ where: { subjectKey, slug } })
      .catch(() => {});
  }

  for (const { subjectKey, slug } of created.categories) {
    await prisma.troubleshootingCategory
      .deleteMany({ where: { subjectKey, slug } })
      .catch(() => {});
  }

  await prisma.$disconnect();
});

describe("slugs", () => {
  it("produces the shape the corpus already uses", () => {
    expect(slugifyLabel("Calls drop out or there's no signal")).toBe(
      "calls-drop-out-or-theres-no-signal"
    );
    expect(slugifyLabel("Phone won't charge when plugged in")).toBe(
      "phone-wont-charge-when-plugged-in"
    );
  });

  it("closes up apostrophes rather than breaking on them", () => {
    // "won't" → "wont", matching wont-turn-on-ios. A hyphen there would read
    // as two words.
    expect(slugifyLabel("won't")).toBe("wont");
    expect(slugifyLabel("won’t")).toBe("wont");
  });

  it("strips accents rather than dropping the letter", () => {
    expect(slugifyLabel("café")).toBe("cafe");
  });

  it("never starts or ends with a hyphen", () => {
    expect(slugifyLabel("  ...Hello!  ")).toBe("hello");
    expect(slugifyLabel("??? what ???")).toBe("what");
  });

  it("returns empty for a label with nothing to work with", () => {
    // Refused upstream rather than turned into a meaningless id.
    expect(slugifyLabel("!!!")).toBe("");
    expect(slugifyLabel("   ")).toBe("");
  });

  it("does not end a truncated slug on a hyphen", () => {
    const slug = slugifyLabel("a".repeat(58) + " something long after it");
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});

describe("previewing a slug before committing to it", () => {
  it("reports what the slug will be", async () => {
    const preview = await previewSymptomSlug(SUBJECT, "Some brand new problem");
    expect(preview).toEqual({ slug: "some-brand-new-problem", available: true });
  });

  it("refuses one that is already taken, naming what has it", async () => {
    // The slug is permanent, so the collision has to surface BEFORE creation.
    //
    // Tested against a symptom created here rather than a shipped one: the
    // authored slugs are hand-written short ids with no relation to their
    // labels — "Calls drop out or there's no signal" is `dropped-calls` — so
    // re-deriving a shipped label produces no collision at all.
    const symptom = await newSymptom("audio", "collision");

    const preview = await previewSymptomSlug(SUBJECT, symptom.label);
    expect(preview.available).toBe(false);
    expect(preview.reason).toContain("already used");
  });

  it("refuses a label with no usable characters", async () => {
    const preview = await previewSymptomSlug(SUBJECT, "!!!");
    expect(preview.available).toBe(false);
    expect(preview.slug).toBe("");
  });
});

describe("creating a symptom", () => {
  it("appends it to the end of the category", async () => {
    const before = await getEditableSubject(SUBJECT);
    const audio = before.find((c) => c.id === "audio")!;

    const symptom = await newSymptom("audio", "appended");

    const after = await getEditableSubject(SUBJECT);
    const symptoms = after.find((c) => c.id === "audio")!.symptoms;

    expect(symptoms).toHaveLength(audio.symptoms.length + 1);
    expect(symptoms[symptoms.length - 1].id).toBe(symptom.symptomId);
  });

  it("creates a visible gap, not an article", async () => {
    // A symptom with no article renders as Draft, which is how the library
    // shows a gap on purpose rather than hiding it.
    const symptom = await newSymptom("audio", "gap");

    const after = await getEditableSubject(SUBJECT);
    const entry = after
      .find((c) => c.id === "audio")!
      .symptoms.find((s) => s.id === symptom.symptomId)!;

    expect(entry.hasArticle).toBe(false);
    expect(entry.published).toBe(false);
  });

  it("is immediately visible to readers as a symptom", async () => {
    const symptom = await newSymptom("audio", "listed");

    const categories = await troubleshootingRepository.getSubjectCategories(SUBJECT);
    const listed = categories
      .flatMap((c) => c.symptoms)
      .find((s) => s.id === symptom.symptomId);

    expect(listed).toBeDefined();
    expect(listed!.hasArticle).toBe(false);
  });

  it("refuses a duplicate label rather than making a second slug", async () => {
    const symptom = await newSymptom("audio", "duplicate");
    const same = created.symptoms.length;

    await expect(createSymptom(SUBJECT, "audio", label("duplicate"))).rejects.toThrow(
      ContentError
    );

    expect(created.symptoms).toHaveLength(same);
    expect(symptom.symptomId).toBeTruthy();
  });

  it("refuses an empty label", async () => {
    await expect(createSymptom(SUBJECT, "audio", "   ")).rejects.toThrow(/needs a label/);
  });

  it("refuses a category that does not exist", async () => {
    await expect(createSymptom(SUBJECT, "no-such-category", label("x"))).rejects.toThrow(
      /No category/
    );
  });
});

describe("starting an article", () => {
  it("is invisible to readers until published", async () => {
    ///  The invariant this whole nullable column exists for.
    const symptom = await newSymptom("audio", "unpublished");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    // Not served.
    const article = await troubleshootingRepository.getArticle(SUBJECT, symptom.symptomId);
    expect(article).toBeNull();

    // And still shown as a gap in the reader's list.
    const categories = await troubleshootingRepository.getSubjectCategories(SUBJECT);
    const listed = categories
      .flatMap((c) => c.symptoms)
      .find((s) => s.id === symptom.symptomId);
    expect(listed!.hasArticle).toBe(false);
  });

  it("is visible to the editor, as a draft with no published text", async () => {
    const symptom = await newSymptom("audio", "editorview");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const editable = await getEditableArticle(SUBJECT, symptom.symptomId);

    expect(editable).not.toBeNull();
    expect(editable!.published).toBeNull();
    expect(editable!.draft).not.toBeNull();
    expect(editable!.draft!.steps.length).toBeGreaterThan(0);
  });

  it("gives the editor a skeleton that already validates", async () => {
    // If the skeleton did not satisfy the schema, the first save would fail
    // and the admin would have to guess which field the editor was unhappy
    // about before writing a word.
    const symptom = await newSymptom("audio", "skeleton");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const editable = await getEditableArticle(SUBJECT, symptom.symptomId);
    await expect(
      saveDraft(SUBJECT, symptom.symptomId, editable!.draft, "admin@ksb.com")
    ).resolves.toMatchObject({ hasDraft: true });
  });

  it("becomes readable the moment it is published", async () => {
    const symptom = await newSymptom("audio", "published");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const editable = await getEditableArticle(SUBJECT, symptom.symptomId);
    await saveDraft(
      SUBJECT,
      symptom.symptomId,
      { ...editable!.draft!, appliesTo: "All phones" },
      "admin@ksb.com"
    );
    await publishDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const article = await troubleshootingRepository.getArticle(SUBJECT, symptom.symptomId);
    expect(article).not.toBeNull();
    expect(article!.appliesTo).toBe("All phones");
  });

  it("refuses to start a second article for the same symptom", async () => {
    const symptom = await newSymptom("audio", "twice");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    await expect(
      createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com")
    ).rejects.toThrow(/already has an article/);
  });

  it("refuses a symptom that does not exist", async () => {
    await expect(
      createArticleDraft(SUBJECT, "not-a-real-symptom", "admin@ksb.com")
    ).rejects.toThrow(/No symptom/);
  });

  it("works on a symptom that has been sitting empty since the taxonomy was written", async () => {
    // Ten shipped symptoms have no article. If this only worked on freshly
    // created ones, the feature would miss a real use.
    const subject = await getEditableSubject(SUBJECT);
    const gap = subject
      .flatMap((c) => c.symptoms)
      .find((s) => !s.hasArticle && !s.id.includes(String(stamp)));

    if (!gap) return; // Every symptom has an article; nothing to assert.

    await createArticleDraft(SUBJECT, gap.id, "admin@ksb.com");
    created.symptoms.push({ subjectKey: SUBJECT, slug: gap.id });

    const editable = await getEditableArticle(SUBJECT, gap.id);
    expect(editable!.published).toBeNull();
    expect(editable!.draft).not.toBeNull();
  });
});

describe("creating a category", () => {
  it("appends it to the subject", async () => {
    const before = await getEditableSubject(SUBJECT);

    const category = await createCategory(SUBJECT, {
      name: label("Category"),
      glyph: "◈",
      blurb: "A test category",
    });
    created.categories.push({ subjectKey: SUBJECT, slug: category.categoryId });

    const after = await getEditableSubject(SUBJECT);
    expect(after).toHaveLength(before.length + 1);
    expect(after[after.length - 1].id).toBe(category.categoryId);
    expect(after[after.length - 1].symptoms).toEqual([]);
  });

  it("refuses a name that collides", async () => {
    // By NAME, which is the collision a person would notice. The authored
    // slug for this category is `power`, so a slug-only check would let a
    // second "Power & charging" be created right beside the first.
    await expect(
      createCategory(SUBJECT, { name: "Power & charging", glyph: "⚡", blurb: "x" })
    ).rejects.toThrow(/already has a/);
  });

  it("refuses a category with no name or no glyph", async () => {
    await expect(
      createCategory(SUBJECT, { name: "  ", glyph: "◈", blurb: "" })
    ).rejects.toThrow(/needs a name/);
    await expect(
      createCategory(SUBJECT, { name: label("NoGlyph"), glyph: " ", blurb: "" })
    ).rejects.toThrow(/needs a glyph/);
  });
});

describe("reordering", () => {
  it("moves a category up and back down again", async () => {
    const before = (await getEditableSubject(SUBJECT)).map((c) => c.id);
    const second = before[1];

    const up = await moveCategory(SUBJECT, second, "up");
    expect(up.order[0]).toBe(second);

    const down = await moveCategory(SUBJECT, second, "down");
    expect(down.order).toEqual(before);
  });

  it("does nothing at the ends, rather than erroring", async () => {
    // The button exists on the first row too; clicking it is not a mistake
    // worth an error dialog.
    const before = (await getEditableSubject(SUBJECT)).map((c) => c.id);

    const result = await moveCategory(SUBJECT, before[0], "up");
    expect(result.order).toEqual(before);
  });

  it("moves a symptom within its category", async () => {
    const category = (await getEditableSubject(SUBJECT)).find(
      (c) => c.symptoms.length > 1
    )!;
    const before = category.symptoms.map((s) => s.id);

    const up = await moveSymptom(SUBJECT, category.id, before[1], "up");
    expect(up.order[0]).toBe(before[1]);

    const down = await moveSymptom(SUBJECT, category.id, before[1], "down");
    expect(down.order).toEqual(before);
  });

  it("leaves the reader's list in the same order it reports", async () => {
    // The order returned must be the order served, or the UI and the site
    // disagree until the next reload.
    const category = (await getEditableSubject(SUBJECT)).find(
      (c) => c.symptoms.length > 1
    )!;
    const moved = category.symptoms[1].id;

    const { order } = await moveSymptom(SUBJECT, category.id, moved, "up");

    const served = (await troubleshootingRepository.getSubjectCategories(SUBJECT))
      .find((c) => c.id === category.id)!
      .symptoms.map((s) => s.id);

    // The served list filters hidden symptoms, so compare only what it shows.
    expect(order.filter((id) => served.includes(id))).toEqual(served);

    await moveSymptom(SUBJECT, category.id, moved, "down");
  });

  it("refuses to move something that is not there", async () => {
    await expect(moveCategory(SUBJECT, "no-such-category", "up")).rejects.toThrow(
      /No category/
    );
    await expect(moveSymptom(SUBJECT, "audio", "no-such-symptom", "up")).rejects.toThrow(
      /No symptom/
    );
  });
});

describe("discarding a draft that was never published", () => {
  ///  +-----------------------------------------------------------------+
  //  The trap: clear the draft and keep the row, and you have an article with
  //  no body and no draft — invisible to readers, showing as "not written" in
  //  the editor, and impossible to open or remove ever again.
  ///  +-----------------------------------------------------------------+

  it("removes the article rather than emptying it", async () => {
    const symptom = await newSymptom("audio", "discarded");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const result = await discardDraft(SUBJECT, symptom.symptomId);
    expect(result.articleRemoved).toBe(true);

    expect(await getEditableArticle(SUBJECT, symptom.symptomId)).toBeNull();
  });

  it("leaves the symptom exactly where it was", async () => {
    // Undoing "start writing" must not undo "add a symptom" — the gap was
    // deliberate and other things may already point at it.
    const symptom = await newSymptom("audio", "keptsymptom");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");
    await discardDraft(SUBJECT, symptom.symptomId);

    const entry = (await getEditableSubject(SUBJECT))
      .find((c) => c.id === "audio")!
      .symptoms.find((s) => s.id === symptom.symptomId);

    expect(entry).toBeDefined();
    expect(entry!.hasArticle).toBe(false);
  });

  it("can be started again afterwards", async () => {
    const symptom = await newSymptom("audio", "restarted");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");
    await discardDraft(SUBJECT, symptom.symptomId);

    await expect(
      createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com")
    ).resolves.toMatchObject({ symptomId: symptom.symptomId });
  });

  it("only empties the draft when the article HAS been published", async () => {
    // The ordinary case must keep behaving exactly as it did.
    const symptom = await newSymptom("audio", "publishedthendiscard");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");
    await publishDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const live = await getEditableArticle(SUBJECT, symptom.symptomId);
    await saveDraft(
      SUBJECT,
      symptom.symptomId,
      { ...live!.published!, summary: "an edit to throw away" },
      "admin@ksb.com"
    );

    const result = await discardDraft(SUBJECT, symptom.symptomId);
    expect(result.articleRemoved).toBe(false);

    const after = await getEditableArticle(SUBJECT, symptom.symptomId);
    expect(after!.draft).toBeNull();
    expect(after!.published).not.toBeNull();
  });
});

describe("the updated date", () => {
  ///  Stamped on publish rather than authored. The date a reader trusts has to
  ///  track the deliberate act of publishing — not a whitespace fix, and not
  ///  whatever somebody last typed into a date field by hand.

  it("is set to today when the article is published", async () => {
    const symptom = await newSymptom("audio", "dated");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const editable = await getEditableArticle(SUBJECT, symptom.symptomId);
    await saveDraft(
      SUBJECT,
      symptom.symptomId,
      { ...editable!.draft!, appliesTo: "All phones", updated: "2020-01-01" },
      "admin@ksb.com"
    );

    await publishDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const published = await getEditableArticle(SUBJECT, symptom.symptomId);
    expect(published!.published!.updated).toBe(new Date().toISOString().slice(0, 10));
  });

  it("overrides whatever the draft said, rather than trusting it", async () => {
    // The draft carries a date because the schema requires one; publishing is
    // what decides its value.
    const symptom = await newSymptom("audio", "dateoverride");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const editable = await getEditableArticle(SUBJECT, symptom.symptomId);
    await saveDraft(
      SUBJECT,
      symptom.symptomId,
      { ...editable!.draft!, appliesTo: "All phones", updated: "2099-12-31" },
      "admin@ksb.com"
    );

    await publishDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const published = await getEditableArticle(SUBJECT, symptom.symptomId);
    expect(published!.published!.updated).not.toBe("2099-12-31");
  });
});
