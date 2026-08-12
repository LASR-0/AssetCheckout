import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   PHONE & IPAD — COMPANY PORTAL OR AT WORK WON'T SIGN IN        |
///  +-----------------------------------------------------------------+
//
//  THE PRIVATE-BROWSER TEST IS THE ARTICLE. It answers the only question
//  worth asking — is the password wrong, or is something else wrong — and it
//  answers it in a minute without involving anybody. The same test is the
//  backbone of the laptop KSB-Office article, for the same reason.
//
//  IT HAS TO BE A PRIVATE WINDOW AND THAT IS THE WHOLE TRICK. In an ordinary
//  browser you are almost certainly still signed in from an earlier session,
//  so office.com lets you straight through without ever asking for the
//  password — which tells you nothing at all about the password you just
//  typed. People run this test in a normal tab, see it work, and conclude
//  their credentials are fine when they are the actual problem.
//
//  THE TEST DOUBLES AS THE NETWORK CHECK, which is why it leads despite
//  looking like the more expensive step. A page that won't load at all is a
//  connection problem, not a credentials problem, and the reader learns that
//  from the same action rather than from a separate one.
//
//  NO BRANCH ON THE NETWORK STEP, deliberately. The right destination depends
//  on whether the reader is holding an iPhone, an iPad or a Galaxy, a step
//  carries one branch, and this article is listed under tablets — so a branch
//  would be wrong for somebody however it was aimed. Prose names the articles
//  instead and the symptom list is one tap away.
//
//  THREE STEPS AND THEN IT STOPS. Beyond a bad password and a dead
//  connection, a sign-in failure is an account or enrolment problem that only
//  IT can see — there is no fourth thing for the reader to try, and inventing
//  one would just delay them.
///  +-----------------------------------------------------------------+

const portal: Article = {
  symptomId: "portal",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Almost always the password rather than the app. One minute in a private browser window tells you which, and it checks your connection at the same time.",
  timeEstimate: "About 5 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [
    "You know your @ksb.com email address and the password you use for email",
  ],
  steps: [
    {
      title: "Test your password in a private browser window",
      body: "Open a private or incognito window and sign in to office.com with your full @ksb.com email address and your usual password. In Safari, tap the tabs button then Private. In Chrome, tap ⋮ then New Incognito tab. In Samsung Internet, tap Tabs then Turn on Secret mode. If office.com rejects the password, that is your answer — the app is fine and the password is the problem.",
      note: "It has to be a private window. In an ordinary one you are almost certainly still signed in from earlier, so it will let you straight through without ever asking for your password — which tells you nothing about the one that just failed. A password that has recently expired or been changed fails here in exactly the same way it fails in the app.",
      figure: {
        images: [
          {
            src: "phone/portal/Mobile-privatebrowser-light.jpg",
            srcDark: "phone/portal/Mobile-privatebrowser-dark.jpg",
          },
        ],
        caption: "Safari › Tabs › Private — or Chrome › ⋮ › New Incognito tab",
      },
    },
    {
      title: "If the page wouldn't load at all, fix the connection first",
      body: "That is a network problem rather than a sign-in one, and no password will get you past it. Check you are on KSB-Mobile or have mobile data, and that you can load an ordinary web page. The Wi-Fi and mobile data articles for your device are in the symptom list under Network & connectivity.",
      note: "Worth checking you have real internet rather than just a connection. A device joined to a network that isn't passing traffic looks connected in every way that matters visually, and the app fails exactly as though your password were wrong.",
    },
    {
      title: "Still won't sign in? Take it to IT",
      body: "If the password works at office.com and your connection is fine, the problem is with the account or with how the device was enrolled — neither of which is visible from where you are standing, and neither of which you can fix. Take the device in and tell them the password worked in a private browser window. That one sentence saves them repeating everything you have already done.",
    },
  ],
};

export default portal;
