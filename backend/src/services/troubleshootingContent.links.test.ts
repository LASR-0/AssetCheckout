import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "../db/prisma.js";
import {
  createSymptom,
  createArticleDraft,
  getEditableArticle,
  saveDraft,
  publishDraft,
} from "./troubleshootingContent.js";
import { troubleshootingRepository } from "../content/troubleshooting/index.js";
import { ContentError } from "./troubleshootingContent.js";

/**
 * The gate reports each problem in `details` and keeps the thrown message
 * generic, so an assertion on the message alone would pass for any refusal at
 * all — including one for a reason the test is not about.
 */
async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ContentError) {
      const details = (err.details ?? []) as { path: string; message: string }[];
      return details.map((d) => `${d.path}: ${d.message}`).join("\n");
    }
    throw err;
  }
  throw new Error("expected the publish to be refused, and it was not");
}

///  +-----------------------------------------------------------------+
///  |        THE LINKS INSIDE PROSE, CHECKED AT THE GATE              |
///  +-----------------------------------------------------------------+
//
//  Step bodies, notes, warnings, the summary and captions can carry inline
//  markup, and [label](url) is the part of it that can be dangerous. The
//  editor refuses a non-http scheme as you type, but the editor is a browser:
//  a request that skips the UI arrives here instead, and this is the last
//  place anything can be refused.
//
//  What the reader does with a bad link is render it as its own text — see
//  RichText — so nothing executes either way. These tests are about the
//  author finding out, at the moment they publish, rather than shipping a
//  link that silently is not one.
///  +-----------------------------------------------------------------+

const created: { subjectKey: string; slug: string }[] = [];
const SUBJECT = "phone";
const stamp = Date.now();

async function articleWith(
  name: string,
  edit: (draft: Record<string, unknown>) => Record<string, unknown>
) {
  const symptom = await createSymptom(SUBJECT, "audio", `Link gate ${name} ${stamp}`);
  created.push({ subjectKey: SUBJECT, slug: symptom.symptomId });

  await createArticleDraft(SUBJECT, symptom.symptomId, "admin@ksb.com");
  const editable = await getEditableArticle(SUBJECT, symptom.symptomId);

  await saveDraft(
    SUBJECT,
    symptom.symptomId,
    edit(editable!.draft as unknown as Record<string, unknown>) as never,
    "admin@ksb.com"
  );

  return symptom.symptomId;
}

afterAll(async () => {
  for (const { subjectKey, slug } of created) {
    await prisma.troubleshootingArticleSubject
      .deleteMany({ where: { subjectKey, symptomSlug: slug } })
      .catch(() => {});
    await prisma.troubleshootingArticle.deleteMany({ where: { symptomSlug: slug } });
    await prisma.troubleshootingSymptom.deleteMany({ where: { subjectKey, slug } });
  }
  await troubleshootingRepository.reload?.();
});

describe("links in a step body", () => {
  it("publishes an http and an https link", async () => {
    const id = await articleWith("ok", (draft) => ({
      ...draft,
      steps: [
        {
          title: "Open the portal",
          body: "Go to [the staff portal](https://portal.ksb.com) and sign in.",
        },
        { title: "Second", body: "Or [the old one](http://intranet.ksb.local)." },
      ],
    }));

    await expect(publishDraft(SUBJECT, id, "admin@ksb.com")).resolves.toMatchObject({
      hasDraft: false,
    });
  });

  it("refuses a javascript: link, naming what it found", async () => {
    // The reason the rule exists. The reader would render this as text, but
    // an author must not be able to store something that looks like a link
    // and never behaves as one.
    const id = await articleWith("js", (draft) => ({
      ...draft,
      steps: [{ title: "Bad", body: "Press [here](javascript:alert(1)) to fix it." }],
    }));

    const why = await refusal(publishDraft(SUBJECT, id, "admin@ksb.com"));

    expect(why).toContain("links:");
    // Truncated at the first ")", which is where the link syntax ends on
    // both sides — see PROSE_LINK and matchLink. It still fails the scheme
    // check, which is the point.
    expect(why).toContain("javascript:alert(1");
    expect(why).toMatch(/http:\/\/ or https:\/\//);
  });

  it("refuses one in a note, a warning and the summary too", async () => {
    // Every field that RENDERS markup is checked, so a gate that only looked
    // at bodies would be a gate with three ways round it. Figure captions are
    // not among them — they are plain text at both ends, and there is a test
    // below that says so.
    for (const [name, edit] of [
      [
        "note",
        (d: Record<string, unknown>) => ({
          ...d,
          steps: [{ title: "T", body: "B", note: "See [this](file:///etc/passwd)." }],
        }),
      ],
      [
        "warn",
        (d: Record<string, unknown>) => ({
          ...d,
          steps: [{ title: "T", body: "B", warn: "Not [this](data:text/html,x)." }],
        }),
      ],
      [
        "summary",
        (d: Record<string, unknown>) => ({
          ...d,
          summary: "Read [the guide](ftp://files.ksb.com) first.",
          steps: [{ title: "T", body: "B" }],
        }),
      ],
    ] as const) {
      const id = await articleWith(name, edit);
      const why = await refusal(publishDraft(SUBJECT, id, "admin@ksb.com"));

      expect(why, name).toContain("links:");
    }
  });

  it("leaves figure captions alone, because they are not markup", async () => {
    // A caption is a navigation path, edited and rendered as plain text. A
    // path containing brackets is a path, not a link, and refusing it would
    // be a rule the reader does not honour.
    const id = await articleWith("caption", (draft) => ({
      ...draft,
      steps: [
        {
          title: "T",
          body: "B",
          // No `images` key at all: the schema allows a caption-only figure
          // but not an empty images array.
          figure: { caption: "Settings › Apps [Beta](preview) › Reset" },
        },
      ],
    }));

    await expect(publishDraft(SUBJECT, id, "admin@ksb.com")).resolves.toMatchObject({
      hasDraft: false,
    });
  });

  it("is not fooled by text that only looks like a link", async () => {
    // An escaped bracket does not open a link, and prose full of brackets is
    // not something to refuse — the renderer shows both as the characters
    // they are, so the gate must agree.
    const id = await articleWith("literal", (draft) => ({
      ...draft,
      steps: [
        {
          title: "Brackets",
          body: "Type \\[not a link](x) exactly, then press [ and ] on their own.",
        },
      ],
    }));

    await expect(publishDraft(SUBJECT, id, "admin@ksb.com")).resolves.toMatchObject({
      hasDraft: false,
    });
  });
});
