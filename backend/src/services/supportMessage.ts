import { getSetting, DEFAULT_MESSAGE_TEMPLATE } from "./settings.js";
import {
  troubleshootingRepository,
  SUBJECT_LABELS,
  type SubjectKey,
} from "../content/troubleshooting/index.js";
import {
  getSupportChannelUrl,
  getSupportChannelName,
  isSupportChannelConfigured,
} from "../config/support.js";

///  +-----------------------------------------------------------------+
///  |        THE MESSAGE SOMEBODY SENDS WHEN THE ARTICLE FAILED       |
///  +-----------------------------------------------------------------+
//
//  COMPOSED ON THE SERVER, though the user sends it themselves from Teams.
//  Three reasons it does not belong in the browser:
//
//  The template is a database setting, and shipping the raw template plus a
//  substitution engine to the client would mean two implementations of the
//  same rules the first time anything about it changed.
//
//  The step titles have {device} tokens in them. The repository substitutes
//  those at serve time so a reader gets "your phone" rather than "{device}",
//  and reproducing that in the client is exactly the duplication the
//  repository exists to prevent.
//
//  And the composed text is worth recording. Not yet — nothing stores these —
//  but "what were people writing when the article ran out" is the most useful
//  question this feature could eventually answer, and it can only be asked if
//  one side owns the wording.
//
//  IT IS NOT SENT FROM HERE. The user posts it themselves, in their own Teams
//  identity, so IT's reply threads back to them and notifies them. An app that
//  posted on their behalf would put the answer somewhere they are not looking.
///  +-----------------------------------------------------------------+

export type SupportMessageRequest = {
  subjectKey: string;
  symptomId: string;
  /** Indexes of the steps they ticked, 0-based, as the article lists them. */
  stepsTried: number[];
  /** Anything they added themselves. */
  notes: string;
};

export type SupportMessage = {
  /** The finished text, ready to paste into Teams — subject line, the note
   *  telling them what to do with it, then the message itself. */
  text: string;
  /** The subject on its own, so the UI can offer it separately without the
   *  server having to compose twice. */
  subject: string;
  /** Where to post it. Null when unconfigured, which hides the whole feature. */
  channelUrl: string | null;
  channelName: string;
};

/** Available so the settings screen can list them beside the editor rather
 *  than leaving somebody to guess at the syntax. */
export const MESSAGE_PLACEHOLDERS = [
  "{name}",
  "{email}",
  "{subject}",
  "{symptom}",
  "{article}",
  "{url}",
  "{stepsTried}",
  "{notes}",
] as const;

const TEMPLATE_KEY = "troubleshooting.messageTemplate";

/**
 * Fill a template.
 *
 * Deliberately a plain replace over a known set rather than anything that
 * evaluates: the template is admin-editable text, and the day it becomes
 * something that can execute is the day an admin account becomes a way to run
 * code on the server.
 */
function fill(template: string, values: Record<string, string>): string {
  let out = template;
  for (const [key, value] of Object.entries(values)) {
    out = out.split(`{${key}}`).join(value);
  }

  // Placeholders that expanded to nothing leave blank runs behind. Collapsed
  // rather than left, so a message with no steps and no notes still reads as
  // something a person wrote.
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

export async function composeSupportMessage(
  request: SupportMessageRequest,
  actor: { name: string; email: string },
  appBaseUrl: string
): Promise<SupportMessage> {
  const symptom = troubleshootingRepository.findSymptom(
    request.subjectKey,
    request.symptomId
  );

  // Served, not raw: this goes through the repository so {device} tokens are
  // already resolved for this subject — "your phone", not "{device}".
  const article = await troubleshootingRepository.getArticle(
    request.subjectKey,
    request.symptomId
  );

  // The SINGULAR label — the message says "on my phone", not "on my Phones".
  // `nameTheSubject` is the wrong tool here: it fills {device} tokens inside
  // an article, it does not name a subject.
  const subjectLabel =
    SUBJECT_LABELS[request.subjectKey as SubjectKey]?.labelSingular ??
    request.subjectKey;

  const steps = (request.stepsTried ?? [])
    .filter((index) => article && index >= 0 && index < article.steps.length)
    .map((index) => `• ${article!.steps[index].title}`);

  const stepsTried = steps.length
    ? `What I've already tried:\n${steps.join("\n")}`
    : "";

  // The shipped wording when the setting is absent — see DEFAULT_MESSAGE_TEMPLATE.
  // An empty template composes an empty message, and the user would post it.
  const template = (await getSetting(TEMPLATE_KEY))?.trim() || DEFAULT_MESSAGE_TEMPLATE;

  const text = fill(template, {
    name: actor.name || "Someone",
    email: actor.email || "no email recorded",
    subject: subjectLabel,
    symptom: symptom?.symptom.label ?? request.symptomId,
    article: symptom?.symptom.label ?? request.symptomId,
    url: `${appBaseUrl.replace(/\/$/, "")}/troubleshooting/${request.subjectKey}/${request.symptomId}`,
    stepsTried,
    notes: request.notes.trim(),
  });

  // A Teams channel post can carry a subject, and one that says what the
  // problem is turns a wall of similar-looking posts into a scannable list.
  // Teams will not accept it through the clipboard as a separate field, so it
  // rides along at the top with instructions for moving it.
  const subject = `${symptom?.symptom.label ?? request.symptomId} — ${actor.name || "IT request"}`;

  return {
    subject,
    text: withSubjectHeader(subject, text),
    channelUrl: getSupportChannelUrl(),
    channelName: getSupportChannelName(),
  };
}

/**
 * The subject line, the instruction, and a rule to delete down to.
 *
 * ONE CLIPBOARD PAYLOAD, by decision — two Copy buttons would be cleaner but
 * would also be two things to get in the right order, and the whole point of
 * this feature is that somebody at the end of their patience can finish it.
 *
 * The instruction is worded as a range with a visible end ("everything above
 * the line") rather than a count of lines, because a count stops being true
 * the moment anybody edits the message before sending — and people do.
 */
function withSubjectHeader(subject: string, body: string): string {
  const rule = "─".repeat(52);

  return [
    subject,
    "",
    "▲ Cut the line above into the Teams subject box, then delete",
    "  everything above the line below — including the line itself.",
    rule,
    "",
    body,
  ].join("\n");
}

/** The step titles to offer as checkboxes — served, so the tokens are already
 *  filled and the wording matches what they just read. */
export async function getStepChoices(
  subjectKey: string,
  symptomId: string
): Promise<{ index: number; title: string }[]> {
  const article = await troubleshootingRepository.getArticle(subjectKey, symptomId);
  if (!article) return [];

  return article.steps.map((step, index) => ({ index, title: step.title }));
}

export { isSupportChannelConfigured };
