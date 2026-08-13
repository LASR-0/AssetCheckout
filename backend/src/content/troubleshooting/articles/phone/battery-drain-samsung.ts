import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |         SAMSUNG — BATTERY DRAINS TOO FAST                       |
///  +-----------------------------------------------------------------+
//
//  The Galaxy twin of battery-drain-ios — see that file for why diagnosis
//  leads and why the stopgap is offered early.
//
//  THE ADAPTIVE BATTERY STEP IS THE ONE PEOPLE NEED MOST and it is the least
//  intuitive: after a One UI update the {device} throws away what it learned
//  about your habits and spends a week or two relearning, and the drain
//  during that window looks exactly like a fault. Samsung document this and
//  nobody reads it. A person about to hand in a perfectly good phone should
//  meet this before they do.
//
//  SLEEPING APPS IS SAMSUNG'S REAL ADVANTAGE HERE and is better than the
//  iPhone equivalent — Deep sleeping apps genuinely stops an app dead rather
//  than just limiting its refresh. Worth the extra sentence explaining the
//  difference between the two lists, because picking the wrong one is why
//  people try this and see no change.
//
//  TODO — BATTERY HEALTH MOVED AND IS VERSION-DEPENDENT. Newer One UI exposes
//  it under Settings › Battery › Battery health; older builds have no
//  equivalent and it lives in the Samsung Members app under diagnostics.
//  Both are named and both need checking against the fleet's actual One UI
//  version when the screenshots are walked.
///  +-----------------------------------------------------------------+

const batteryDrainSamsung: Article = {
  symptomId: "battery-drain-samsung",
  subjectKeys: ["phone"],
  summary:
    "Usually one app running in the background, or a recent software update the {device} hasn't settled down from yet. The battery screen tells you which before you change anything.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB-managed Samsung {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Look at which app is actually using the battery",
      body: "Open Settings › Battery and tap the graph to see the usage list. An app near the top that you barely open is your answer — usually something that syncs or tracks location in the background.",
      note: "On older One UI versions Battery isn't a top-level entry. If you don't see it, look under Settings › Battery and device care › Battery instead.",
      figure: {
        caption: "Settings › Battery › tap the graph for the usage list",
      },
    },
    {
      title: "Has the {device} updated recently?",
      body: "If a One UI update landed in the last week or two, this is very likely nothing more than that. The {device}'s adaptive battery throws away everything it had learned about how you use it and starts again, and while it relearns the drain is noticeably worse. It settles by itself, typically within a fortnight.",
      note: "Worth ruling in before you change any settings — plenty of perfectly healthy {devices} get handed in during this window. If the timing fits, give it another week before going further.",
    },
    {
      title: "Turn on Power saving to get through today",
      body: "Settings › Battery › Power saving, or the tile in the quick panel. It limits background activity and drops the screen brightness and refresh rate, and it will usually buy you the rest of the afternoon. A stopgap rather than a fix.",
    },
    {
      title: "Put the offending app to sleep",
      body: "Go to Settings › Battery › Background usage limits. Adding an app to Sleeping apps stops it running in the background but lets it update occasionally; Deep sleeping apps stops it completely, so it only ever runs while you have it open. Use Deep sleeping apps for the one the battery list pointed at — Sleeping apps often isn't strong enough to make a visible difference.",
      warn: "Don't deep-sleep Company Portal, At Work, Teams or Outlook. Those need to run in the background to keep the {device} compliant and to deliver notifications, and silencing them causes a different problem a fortnight later that nobody connects back to this.",
      figure: { caption: "Settings › Battery › Background usage limits" },
    },
    {
      title: "Shorten the screen timeout",
      body: "Settings › Display › Screen timeout, set to 15 or 30 seconds. The screen is the single largest consumer on any phone, and a device that sits face-up on a desk all day burns a surprising amount of charge doing nothing at all.",
    },
    {
      title: "Update the software",
      body: "Settings › Software update › Download and install. Battery fixes ship in these more often than anything else — though if an update is what started this, see step 2 before installing another one.",
    },
    {
      title: "Still draining? Contact IT",
      body: "Tell them which app was top of the battery list and whether a software update landed just before it started. If the {device} is a few years old the battery may simply be worn out, which is a replacement rather than anything you can fix — IT can check its health directly.",
    },
  ],
  source: {
    name: "Samsung — What to do when your Samsung Galaxy device battery drains faster",
    url: "https://www.samsung.com/uk/support/mobile-devices/what-to-do-when-your-samsung-galaxy-device-battery-drains-faster/",
  },
};

export default batteryDrainSamsung;
