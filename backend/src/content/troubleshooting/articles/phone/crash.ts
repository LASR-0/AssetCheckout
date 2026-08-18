import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |      PHONE — AN APP CLOSES AS SOON AS I OPEN IT                 |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS. Force close, update, reinstall — the
//  procedure is identical and only the gesture and the store name differ.
//
//  REINSTALL IS THE FIX AND IT IS HELD BACK DELIBERATELY, because it is the
//  one step here that can lose something. Anything the app kept locally and
//  never synced goes with it. Cheapest-first would put it earlier; the cost
//  to the reader if it goes wrong puts it fourth, behind three free steps
//  that resolve most of these anyway.
//
//  THE COMPANY-APP CASE IS DIFFERENT AND GETS ITS OWN STEP. A work app that
//  crashes on launch is often a sign-in or compliance problem wearing a
//  crash's clothing, and reinstalling it changes nothing. Sending those
//  readers sideways early saves them the whole article.
//
//  TODO — NO CITATION YET; assembled from general vendor guidance rather than
//  one page. Add a `source` at review if a good one turns up.
///  +-----------------------------------------------------------------+

const crash: Article = {
  symptomId: "crash",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Force closing and reopening fixes most of these. If it's a work app; the problem is usually the sign-in behind it rather than the app itself.",
  timeEstimate: "About 15 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Force close it and open it again",
      body: "Swipe up from the bottom of the screen and hold to bring up the recent apps, then swipe the app away. Reopen it from the home screen. This clears an app that is stuck part-way through starting, which is what most launch crashes actually are.",
      note: "Different from just going back to the home screen. That leaves the app running in the background in exactly the state it was stuck in, so reopening returns you to the same crash.",
    },
    {
      title: "Is it a work app?",
      body: "Company Portal, At Work, Teams, Outlook and anything else you sign into with your KSB account can close on launch when the sign-in behind them has expired or the {device} has fallen out of compliance. That looks exactly like a crash and none of the steps below will touch it.",
      branch: {
        label: "It's a work app and it won't sign in",
        targetSymptomId: "portal",
      },
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. Worth doing before anything more drastic; it costs a minute and clears the case where the {device} rather than the app is the problem.",
    },
    {
      title: "Update the app, then the {device}",
      body: "Check the App Store or Play Store for an update to the app first; a crash on launch after a {device} update is usually an app waiting for its own. Then check for an OS update: on an iPhone, Settings › General › Software Update; on a Samsung, Settings › Software update › Download and install.",
    },
    {
      title: "Delete the app and install it again",
      body: "This resolves nearly everything the steps above don't. Hold the app icon, remove it, then install it fresh from the App Store or Play Store; nothing is blocked on a KSB phone, so you don't need approval to reinstall something you already had.",
      warn: "Anything the app stored on the {device} and never synced goes with it; draft notes, offline files, local settings. If the app holds something you can't afford to lose and you can't open it to check, contact IT before doing this rather than after.",
      branch: {
        label: "I'm not sure how to install it again",
        targetSymptomId: "install-app",
      },
    },
    {
      title: "Check there is space to run it",
      body: "A {device} with almost no free storage kills apps as they start, and it presents as one particular app crashing rather than as a storage warning. If the {device} is nearly full, that is very likely the whole story.",
      branch: {
        label: "The {device} is nearly out of storage",
        targetSymptomId: "storage",
      },
    },
    {
      title: "Still crashing? Contact IT",
      body: "Tell them which app, whether it ever worked, and whether anything changed just before, a {device} update, an app update, a password change. Those answers point at completely different causes, and the last one in particular is fixed centrally rather than on your handset.",
    },
  ],
};

export default crash;
