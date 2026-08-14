import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import {
  createSymptom,
  createCategory,
  deleteCategory,
  createArticleDraft,
  saveDraft,
  publishDraft,
  getEditableArticle,
  getEditableSubject,
  findLinksTo,
  deleteSymptom,
  listArchivedArticles,
  ContentError,
} from "./troubleshootingContent.js";
import { troubleshootingRepository } from "../content/troubleshooting/index.js";

///  +-----------------------------------------------------------------+
///  |        DELETING, AND THE THINGS THAT POINT AT IT                 |
///  +-----------------------------------------------------------------+
//
//  Two failures worth this much test:
//
//  A BRANCH BUTTON POINTING NOWHERE. Nothing in the database holds a branch to
//  its target — it is a string in a JSON document — so deleting a symptom
//  silently breaks every button aimed at it, inside articles nobody happened
//  to be reading.
//
//  LOSING THE ONLY COPY. Content edited in the UI exists in one database and
//  nowhere else until an export runs. Deleting without archiving is the one
//  operation in this whole increment that can destroy something irrecoverably.
///  +-----------------------------------------------------------------+

const SUBJECT = "phone";
const stamp = Date.now();
const created: string[] = [];

function label(name: string): string {
  return `Del ${name} ${stamp}`;
}

async function newSymptom(name: string, categoryId = "audio") {
  const symptom = await createSymptom(SUBJECT, categoryId, label(name));
  created.push(symptom.symptomId);
  return symptom;
}

/** A published article whose step 2 branches to `target`. */
async function publishedArticleLinkingTo(
  name: string,
  target: string,
  targetSubjectKey?: string
) {
  const symptom = await newSymptom(name);
  await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

  const editable = await getEditableArticle(SUBJECT, symptom.symptomId);
  await saveDraft(
    SUBJECT,
    symptom.symptomId,
    {
      ...editable!.draft!,
      appliesTo: "All phones",
      steps: [
        editable!.draft!.steps[0],
        {
          title: "Try the other thing",
          body: "Go and read the other article.",
          branch: {
            label: "That didn't work",
            targetSymptomId: target,
            ...(targetSubjectKey ? { targetSubjectKey } : {}),
          },
        },
      ],
    },
    "admin@ksb.com"
  );
  await publishDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

  return symptom;
}

afterAll(async () => {
  for (const slug of created) {
    await prisma.troubleshootingArticleSubject
      .deleteMany({ where: { symptomSlug: slug } })
      .catch(() => {});
    await prisma.troubleshootingArticle
      .deleteMany({ where: { symptomSlug: slug } })
      .catch(() => {});
    await prisma.troubleshootingSymptom
      .deleteMany({ where: { slug } })
      .catch(() => {});
    await prisma.troubleshootingArchivedArticle
      .deleteMany({ where: { symptomSlug: slug } })
      .catch(() => {});
  }
  await prisma.$disconnect();
});

describe("finding what links here", () => {
  it("finds a branch in a published article", async () => {
    const target = await newSymptom("linktarget");
    const source = await publishedArticleLinkingTo("linksource", target.symptomId);

    const links = await findLinksTo(SUBJECT, target.symptomId);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      symptomId: source.symptomId,
      step: 2,
      inDraft: false,
    });
  });

  it("finds a branch that exists only in unpublished changes", async () => {
    // The one people forget. A draft branch becomes a broken published article
    // the moment somebody hits publish, and by then the cause is a week old.
    const target = await newSymptom("drafttarget");
    const source = await newSymptom("draftsource");
    await createArticleDraft(SUBJECT, source.symptomId, "admin@ksb.com");

    const editable = await getEditableArticle(SUBJECT, source.symptomId);
    await saveDraft(
      SUBJECT,
      source.symptomId,
      {
        ...editable!.draft!,
        steps: [
          {
            ...editable!.draft!.steps[0],
            branch: { label: "Go there", targetSymptomId: target.symptomId },
          },
        ],
      },
      "admin@ksb.com"
    );

    const links = await findLinksTo(SUBJECT, target.symptomId);

    expect(links).toHaveLength(1);
    expect(links[0].inDraft).toBe(true);
  });

  it("finds nothing for a symptom nobody points at", async () => {
    const lonely = await newSymptom("lonely");
    expect(await findLinksTo(SUBJECT, lonely.symptomId)).toEqual([]);
  });

  it("does not count a branch aimed at another subject", async () => {
    // Symptom ids are unique within a subject, not across them —
    // "wont-turn-on" is a different article under Laptops and Desktops. A
    // branch naming another subject explicitly does not point here.
    //
    // The target is a REAL laptop symptom, taken from the corpus: the publish
    // gate resolves every branch from every subject the article is listed
    // under, so an invented id would be refused before this could be asserted.
    const laptopSymptom = (await getEditableSubject("laptop")).flatMap((c) => c.symptoms)[0];

    const source = await publishedArticleLinkingTo(
      "otherlink",
      laptopSymptom.id,
      "laptop"
    );

    // Nothing points at the phone symptom of the same name, because there
    // isn't one — the branch is explicitly aimed elsewhere.
    expect(await findLinksTo(SUBJECT, laptopSymptom.id)).toEqual([]);
    expect(source.symptomId).toBeTruthy();
  });
});

describe("refusing to break things silently", () => {
  it("refuses when something branches here, and says what", async () => {
    const target = await newSymptom("refusetarget");
    await publishedArticleLinkingTo("refusesource", target.symptomId);

    await expect(
      deleteSymptom(SUBJECT, target.symptomId, "admin@ksb.com")
    ).rejects.toThrow(/branch button/);

    // Still there. A refusal that half-deleted would be worse than no check.
    expect(
      (await getEditableSubject(SUBJECT))
        .flatMap((c) => c.symptoms)
        .some((s) => s.id === target.symptomId)
    ).toBe(true);
  });

  it("names each broken button, so the warning is actionable", async () => {
    const target = await newSymptom("detailtarget");
    await publishedArticleLinkingTo("detailsource", target.symptomId);

    await expect(
      deleteSymptom(SUBJECT, target.symptomId, "admin@ksb.com")
    ).rejects.toMatchObject({
      statusCode: 409,
      details: [expect.objectContaining({ message: expect.stringContaining("didn't work") })],
    });
  });

  it("goes ahead when forced, and reports what it broke", async () => {
    // Not a hard block: sometimes the branch is exactly what should go. But it
    // has to be a second, deliberate act with the list on screen.
    const target = await newSymptom("forcetarget");
    await publishedArticleLinkingTo("forcesource", target.symptomId);

    const result = await deleteSymptom(SUBJECT, target.symptomId, "admin@ksb.com", {
      force: true,
    });

    expect(result.brokenLinks).toHaveLength(1);
    expect(await getEditableArticle(SUBJECT, target.symptomId)).toBeNull();
  });
});

describe("deleting", () => {
  it("removes the symptom and its article from everything readers see", async () => {
    const symptom = await newSymptom("gone");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");
    const editable = await getEditableArticle(SUBJECT, symptom.symptomId);
    await saveDraft(
      SUBJECT,
      symptom.symptomId,
      { ...editable!.draft!, appliesTo: "All phones" },
      "admin@ksb.com"
    );
    await publishDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com");

    expect(await troubleshootingRepository.getArticle(SUBJECT, symptom.symptomId)).toBeNull();
    expect(troubleshootingRepository.findSymptom(SUBJECT, symptom.symptomId)).toBeFalsy();
    expect(
      (await getEditableSubject(SUBJECT)).flatMap((c) => c.symptoms).some((s) => s.id === symptom.symptomId)
    ).toBe(false);
  });

  it("removes a symptom that never had an article", async () => {
    const symptom = await newSymptom("emptysymptom");

    const result = await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com");

    expect(result.archived).toBe(false);
    expect(troubleshootingRepository.findSymptom(SUBJECT, symptom.symptomId)).toBeFalsy();
  });

  it("refuses a symptom that is not there", async () => {
    await expect(
      deleteSymptom(SUBJECT, "never-existed", "admin@ksb.com")
    ).rejects.toThrow(ContentError);
  });
});

describe("the archive", () => {
  it("keeps the published text, whole", async () => {
    const symptom = await newSymptom("archived");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");
    const editable = await getEditableArticle(SUBJECT, symptom.symptomId);
    await saveDraft(
      SUBJECT,
      symptom.symptomId,
      { ...editable!.draft!, appliesTo: "All phones", summary: "worth keeping" },
      "admin@ksb.com"
    );
    await publishDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com", {
      reason: "superseded",
    });

    const row = await prisma.troubleshootingArchivedArticle.findFirst({
      where: { symptomSlug: symptom.symptomId },
    });

    expect(row).not.toBeNull();
    expect(JSON.parse(row!.body!).summary).toBe("worth keeping");
    expect(row!.reason).toBe("superseded");
    expect(row!.deletedBy).toBe("admin@ksb.com");
  });

  it("keeps unpublished work too", async () => {
    // Somebody's half-written article is exactly what should not evaporate
    // because a different person tidied up the list.
    const symptom = await newSymptom("archiveddraft");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const row = await prisma.troubleshootingArchivedArticle.findFirst({
      where: { symptomSlug: symptom.symptomId },
    });

    expect(row!.body).toBeNull();
    expect(row!.draftBody).not.toBeNull();
  });

  it("keeps the taxonomy context, denormalised", async () => {
    // So the archive still means something after the category itself is gone.
    const symptom = await newSymptom("context");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");

    await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const row = await prisma.troubleshootingArchivedArticle.findFirst({
      where: { symptomSlug: symptom.symptomId },
    });

    expect(row!.categorySlug).toBe("audio");
    expect(row!.categoryName).toBeTruthy();
    expect(row!.label).toBe(label("context"));
    expect(JSON.parse(row!.subjectKeys)).toEqual([SUBJECT]);
  });

  it("records how many links were broken at the time", async () => {
    // Recorded rather than recomputed: the answer changes as the library
    // changes, and what matters is what was true when somebody decided.
    //
    // The target needs an article of its own — an empty symptom is not
    // archived at all, so there would be no row to carry the count.
    const target = await newSymptom("counted");
    await createArticleDraft(SUBJECT, target.symptomId, "admin@ksb.com");
    await publishedArticleLinkingTo("countedsource", target.symptomId);

    await deleteSymptom(SUBJECT, target.symptomId, "admin@ksb.com", { force: true });

    const row = await prisma.troubleshootingArchivedArticle.findFirst({
      where: { symptomSlug: target.symptomId },
    });
    expect(row!.linksAtDeletion).toBe(1);
  });

  it("lists what has been deleted, newest first", async () => {
    const symptom = await newSymptom("listed");
    await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");
    await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com");

    const archive = await listArchivedArticles();
    expect(archive[0].symptomId).toBe(symptom.symptomId);
    expect(archive[0].exportedAt).toBeNull();
  });

  it("does not archive a symptom that had nothing to archive", async () => {
    const symptom = await newSymptom("nothingtokeep");
    await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com");

    expect(
      await prisma.troubleshootingArchivedArticle.findFirst({
        where: { symptomSlug: symptom.symptomId },
      })
    ).toBeNull();
  });
});

describe("deleting a category", () => {
  ///  Empty-only, by design. See deleteCategory for why a populated one has no
  ///  good answer — cascading destroys shared articles, orphaning leaves
  ///  symptoms with no heading — and why disabling already covers the real need.

  const categories: string[] = [];

  async function newCategory(name: string) {
    const category = await createCategory(SUBJECT, {
      name: label(name),
      glyph: "◈",
      blurb: "",
    });
    categories.push(category.categoryId);
    return category;
  }

  afterAll(async () => {
    for (const slug of categories) {
      await prisma.troubleshootingCategory
        .deleteMany({ where: { subjectKey: SUBJECT, slug } })
        .catch(() => {});
    }
  });

  it("removes an empty one", async () => {
    const category = await newCategory("emptycat");

    await deleteCategory(SUBJECT, category.categoryId);

    expect(
      (await getEditableSubject(SUBJECT)).some((c) => c.id === category.categoryId)
    ).toBe(false);
  });

  it("refuses one with symptoms in it, and names them", async () => {
    const category = await newCategory("fullcat");
    const symptom = await createSymptom(SUBJECT, category.categoryId, label("inside"));
    created.push(symptom.symptomId);

    await expect(deleteCategory(SUBJECT, category.categoryId)).rejects.toMatchObject({
      statusCode: 409,
      details: [expect.objectContaining({ path: symptom.symptomId })],
    });

    // Untouched — a refusal that half-deleted would be worse than no check.
    expect(
      (await getEditableSubject(SUBJECT)).some((c) => c.id === category.categoryId)
    ).toBe(true);
  });

  it("can be deleted once emptied", async () => {
    // The intended route: remove the symptoms, which runs each one's link
    // check, then remove the category.
    const category = await newCategory("emptiedcat");
    const symptom = await createSymptom(SUBJECT, category.categoryId, label("temporary"));

    await deleteSymptom(SUBJECT, symptom.symptomId, "admin@ksb.com");
    await deleteCategory(SUBJECT, category.categoryId);

    expect(
      (await getEditableSubject(SUBJECT)).some((c) => c.id === category.categoryId)
    ).toBe(false);
  });

  it("refuses one that is not there", async () => {
    await expect(deleteCategory(SUBJECT, "no-such-category")).rejects.toThrow(
      /No category/
    );
  });
});
