import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../db/prisma.js";
import { setSetting, getSetting } from "./settings.js";
import { composeSupportMessage, getStepChoices } from "./supportMessage.js";
import { troubleshootingRepository } from "../content/troubleshooting/index.js";

///  +-----------------------------------------------------------------+
///  |        A MESSAGE SOMEBODY PUTS THEIR NAME TO                    |
///  +-----------------------------------------------------------------+
//
//  This text lands in a public channel under a real person's name, so the
//  failures that matter are the embarrassing ones: a stray "{device}" in the
//  middle of a sentence, a run of blank lines where they ticked nothing, a
//  placeholder that silently stayed a placeholder.
//
//  The template is admin-editable, which makes it untrusted input as far as
//  the substitution is concerned — hence the test that it cannot reach
//  anything but a plain string replace.
///  +-----------------------------------------------------------------+

const ACTOR = { name: "Sam Taylor", email: "sam.taylor@ksb.com" };
const BASE = "https://checkout.ksb.com";

/** A real article with tokens in it, so the token test is not hypothetical. */
let subjectKey = "phone";
let symptomId = "";

beforeAll(async () => {
  const categories = await troubleshootingRepository.getSubjectCategories(subjectKey);
  const withArticle = categories
    .flatMap((c) => c.symptoms)
    .find((s) => s.hasArticle);

  symptomId = withArticle!.id;
});

describe("composing", () => {
  it("fills every placeholder the default template uses", async () => {
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    // The point of the whole feature: nothing left unexpanded.
    expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(text).toContain(ACTOR.email);
  });

  it("resolves {name} and {url} for a template that still asks for them", async () => {
    // Both left the DEFAULT wording, not the template language — an org that
    // wants a signature or a link back can put either one back by editing the
    // setting, and it has to still work when they do.
    const original = (await getSetting("troubleshooting.messageTemplate")) ?? "";
    await setSetting(
      "troubleshooting.messageTemplate",
      "{name} — {url}",
      "admin@ksb.com"
    );

    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).toContain(ACTOR.name);
    expect(text).toContain(`${BASE}/troubleshooting/${subjectKey}/${symptomId}`);

    await setSetting("troubleshooting.messageTemplate", original, "admin@ksb.com");
  });

  it("names nobody by default — Teams already says who posted it", async () => {
    // The name was in the subject line and again in the sign-off, on top of
    // the one Teams stamps on the post itself.
    const { text, subject } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).not.toContain(ACTOR.name);
    expect(subject).not.toContain(ACTOR.name);
  });

  it("does not link back to the article that just failed", async () => {
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).not.toContain(`${BASE}/troubleshooting/`);
  });

  it("names the subject in the singular", async () => {
    // "on my phone", not "on my Phones" — the label used for picker tiles is
    // the wrong one for a sentence.
    const { text } = await composeSupportMessage(
      { subjectKey: "phone", symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).toContain("my phone");
    expect(text).not.toContain("Phones");
  });

  it("lists the steps they ticked, in the article's wording", async () => {
    const choices = await getStepChoices(subjectKey, symptomId);
    expect(choices.length).toBeGreaterThan(0);

    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [0], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).toContain("What I've already tried");
    expect(text).toContain(choices[0].title);
  });

  it("carries no unresolved device tokens through from the step titles", async () => {
    // Step titles hold {device}. They are read through the repository, which
    // substitutes at serve time — reproducing that here would be a second
    // implementation waiting to drift.
    const choices = await getStepChoices(subjectKey, symptomId);

    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: choices.map((c) => c.index), notes: "" },
      ACTOR,
      BASE
    );

    expect(text).not.toContain("{device}");
    expect(text).not.toContain("{Device}");
  });

  it("reads properly when they ticked nothing and wrote nothing", async () => {
    // The commonest case, and the one that leaves blank runs behind.
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).not.toMatch(/\n{3,}/);
    expect(text.startsWith("\n")).toBe(false);
    expect(text.endsWith("\n")).toBe(false);
    expect(text).not.toContain("What I've already tried");
  });

  it("includes what they typed", async () => {
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "  It only happens on Wi-Fi.  " },
      ACTOR,
      BASE
    );

    expect(text).toContain("It only happens on Wi-Fi.");
  });

  it("ignores step indexes that are not in the article", async () => {
    // The indexes come from the browser. An out-of-range one must not throw
    // and must not produce "• undefined".
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [-1, 999], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).not.toContain("undefined");
    expect(text).not.toContain("What I've already tried");
  });

  it("still produces something when the actor has no name or email", async () => {
    // getActorEmail returns "" when the proxy sent nothing — see config/auth.
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      { name: "", email: "" },
      BASE
    );

    expect(text).not.toMatch(/\{[a-zA-Z]+\}/);
    // The default template signs off with the email, so the unidentified case
    // has to say something rather than trailing off after an em dash.
    expect(text).toContain("no email recorded");
  });
});

describe("the template as untrusted input", () => {
  const original = { value: "" };

  beforeAll(async () => {
    original.value = (await getSetting("troubleshooting.messageTemplate")) ?? "";
  });

  it("substitutes literally, never evaluating what an admin typed", async () => {
    // An admin-editable template that could execute would make the settings
    // screen a way to run code on the server.
    await setSetting(
      "troubleshooting.messageTemplate",
      "${process.env.SMTP_PASS} {name} `${1+1}` {notes}",
      "admin@ksb.com"
    );

    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "hi" },
      ACTOR,
      BASE
    );

    // The literal characters, unevaluated.
    expect(text).toContain("${process.env.SMTP_PASS}");
    expect(text).toContain("`${1+1}`");
    expect(text).not.toContain("2");
    expect(text).toContain("Sam Taylor");

    await setSetting("troubleshooting.messageTemplate", original.value, "admin@ksb.com");
  });

  it("leaves an unknown placeholder alone rather than blanking it", async () => {
    // A typo in the template should be visible to whoever wrote it, not
    // silently swallowed.
    await setSetting(
      "troubleshooting.messageTemplate",
      "{name} said {nonsense}",
      "admin@ksb.com"
    );

    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    expect(text).toContain("{nonsense}");

    await setSetting("troubleshooting.messageTemplate", original.value, "admin@ksb.com");
  });
});

describe("step choices", () => {
  it("offers every step, numbered as the reader saw them", async () => {
    const choices = await getStepChoices(subjectKey, symptomId);
    const article = await troubleshootingRepository.getArticle(subjectKey, symptomId);

    expect(choices).toHaveLength(article!.steps.length);
    expect(choices.map((c) => c.index)).toEqual(article!.steps.map((_, i) => i));
  });

  it("is empty for a symptom with no article", async () => {
    expect(await getStepChoices(subjectKey, "not-a-real-symptom")).toEqual([]);
  });
});

describe("the subject header", () => {
  ///  The subject rides along in the same clipboard payload because Teams has
  ///  no way to receive it as a separate field. That means instructional text
  ///  inside a message somebody is about to post publicly — so the tests here
  ///  are mostly about that text being findable and removable.

  it("puts the subject first, so it is the line they cut", async () => {
    const { text, subject } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    expect(text.split("\n")[0]).toBe(subject);
  });

  it("is the symptom, and only the symptom", async () => {
    // A channel full of "IT request" tells nobody anything; a channel full of
    // "<symptom> — <name>" repeats the name Teams has already put above it.
    const { subject } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    const symptom = troubleshootingRepository.findSymptom(subjectKey, symptomId);

    expect(subject).toBe(symptom!.symptom.label);
    expect(subject).not.toContain(ACTOR.name);
  });

  it("marks where the instructions end with a rule they can delete to", async () => {
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      ACTOR,
      BASE
    );

    const lines = text.split("\n");
    const rule = lines.findIndex((l) => /^─+$/.test(l));

    expect(rule).toBeGreaterThan(0);
    // Everything they are told to remove is above it, and the message proper
    // is below — so "delete to the line" is an unambiguous instruction.
    expect(lines.slice(rule + 1).join("\n").trim().length).toBeGreaterThan(0);
  });

  it("keeps the message itself intact below the rule", async () => {
    const { text } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "Only on Wi-Fi." },
      ACTOR,
      BASE
    );

    const body = text.split(/^─+$/m)[1];

    expect(body).toContain("Only on Wi-Fi.");
    expect(body).toContain(ACTOR.email);
    // And no placeholder survived into the part they actually post.
    expect(body).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it("still has a usable subject when nobody is identified", async () => {
    const { subject } = await composeSupportMessage(
      { subjectKey, symptomId, stepsTried: [], notes: "" },
      { name: "", email: "" },
      BASE
    );

    expect(subject).not.toContain("—  ");
    expect(subject.trim().length).toBeGreaterThan(0);
  });
});
