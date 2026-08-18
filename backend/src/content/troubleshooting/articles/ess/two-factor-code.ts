import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   ESS — I CAN'T FIND MY ESS TWO-FACTOR CODE                     |
///  +-----------------------------------------------------------------+
//
//  THE FIX IS REMOVAL, NOT RECOVERY, and that is the thing the reader does not
//  know. There is no way to retrieve a code from an authenticator you no
//  longer have — a new phone, a wiped app, a deleted entry — so what Sue does
//  is take the second factor off the account and let you set it up again from
//  scratch. Somebody expecting to be sent a code will ask the wrong question
//  and wait for the wrong thing.
//
//  WHAT HAPPENS NEXT IS WORTH SAYING IN ADVANCE. The next sign-in shows a QR
//  code and asks for the app — which looks like something has gone wrong if
//  you were not told it was coming, and looks like the fix working if you
//  were.
//
//  SEPARATE FROM ess-account-locked because they arrive as different
//  questions, even though both end in a message to the same person. The two
//  branch to each other, and the wording of the message differs, which is the
//  part that actually matters.
///  +-----------------------------------------------------------------+

const essTwoFactorCode: Article = {
  symptomId: "ess-2fa-code",
  subjectKeys: ["ess"],
  summary:
    "A code cannot be recovered; it has to be set up again. Ask Sue to remove two-factor from your account, and ESS will walk you through adding it back at the next sign-in.",
  timeEstimate: "About 5 minutes",
  appliesTo: "Anyone at KSB with an ESS account",
  updated: "2026-08-18",
  before: [],
  steps: [
    {
      title: "Message Sue and ask her to remove two-factor from your account",
      body: "Sue administers ESS. There is no way to recover a code from an authenticator app you no longer have (a new phone, a reinstalled app; a deleted entry) so the fix is to take two-factor off your account and set it up again. Use the button below to open a Teams chat with her, or search for Sue in Teams and start one yourself.",
      note: "Ask specifically for two-factor to be removed so you can re-add it. If you only say you cannot get in; the likely first answer is an account unlock, which will not help; you will sign in and be asked for the same code you do not have.",
      link: {
        label: "Message Sue about my ESS two-factor",
        url: "https://teams.microsoft.com/l/chat/19:7f23fa78-eec2-49d7-bcf7-05b4f2c1bcbb_a09c7b9e-49d7-4022-88d6-b5fe87e50258@unq.gbl.spaces/conversations?context=%7B%22contextType%22%3A%22chat%22%7D",
      },
    },
    {
      title: "Sign in again and set it up from the QR code",
      body: "Once Sue confirms it is done, sign in to ESS as normal. Because there is no second factor on the account any more, it asks you to add one: it shows a QR code, and you scan that with the authenticator app on your phone. ESS then appears in the app and gives you a code as it did before.",
      note: "Have your phone with the authenticator app open before you sign in. The QR code appears as part of signing in rather than somewhere you can go back to, so it is easier to have the app ready than to find it again afterwards.",
      branch: {
        label: "My ESS account is locked as well",
        targetSymptomId: "ess-account-locked",
      },
    },
  ],
};

export default essTwoFactorCode;
