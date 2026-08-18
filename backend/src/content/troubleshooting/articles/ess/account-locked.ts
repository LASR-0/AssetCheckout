import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   ESS — MY ESS ACCOUNT IS LOCKED                                |
///  +-----------------------------------------------------------------+
//
//  ESS IS ADMINISTERED BY A PERSON, NOT A PORTAL. There is no self-service
//  unlock and no ticket to raise — it is a message to Sue, who administers
//  ESS. That makes this the shortest article in the library, and pretending
//  otherwise by padding it with checks would waste the reader's time.
//
//  SO THE ARTICLE'S REAL JOB IS THE MESSAGE, not the diagnosis. Somebody who
//  writes "ESS won't let me in" gets a reply asking which of half a dozen
//  things they mean; somebody who writes "please unlock my ESS account" is
//  done in one exchange. The step spells out what to say for exactly that
//  reason.
//
//  THE TEAMS LINK GOES STRAIGHT TO THE CHAT. It is unreadable as text — a
//  GUID nobody can retype — so it is only useful if the reader can click it.
//  The step names Sue as well, so somebody reading this on a phone, or
//  printed, can still find her.
///  +-----------------------------------------------------------------+

const essAccountLocked: Article = {
  symptomId: "ess-account-locked",
  subjectKeys: ["ess"],
  summary:
    "There is no self-service unlock for ESS. Message Sue, who administers it, and ask her to unlock your account.",
  timeEstimate: "About 2 minutes",
  appliesTo: "Anyone at KSB with an ESS account",
  updated: "2026-08-18",
  before: [],
  steps: [
    {
      title: "Message Sue and ask her to unlock it",
      body: "Sue administers ESS and unlocking is something she does directly; there is no portal request and no ticket to raise. Use the button below to open a Teams chat with her, or search for Sue in Teams and start one yourself.",
      note: "Say plainly that your ESS account is locked and that you would like it unlocked. “ESS won't let me in” covers several different problems and costs a round trip to sort out; naming the one you have gets it done in a single reply.",
      link: {
        label: "Message Sue about my locked ESS account",
        url: "https://teams.microsoft.com/l/chat/19:7f23fa78-eec2-49d7-bcf7-05b4f2c1bcbb_a09c7b9e-49d7-4022-88d6-b5fe87e50258@unq.gbl.spaces/conversations?context=%7B%22contextType%22%3A%22chat%22%7D",
      },
    },
    {
      title: "Try signing in again once she confirms",
      body: "Nothing is sent to you automatically, so wait until Sue says it is done rather than watching for an email. Once she confirms, sign in to ESS as normal, your password has not changed.",
      branch: {
        label: "It's my two-factor code I can't get, not the account",
        targetSymptomId: "ess-2fa-code",
      },
    },
  ],
};

export default essAccountLocked;
