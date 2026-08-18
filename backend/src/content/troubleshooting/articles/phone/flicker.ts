import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |        PHONE — DISPLAY FLICKERS OR SHOWS LINES                  |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS. Restart, cool down, update, rule out the
//  brightness features — none of it differs beyond a settings path.
//
//  MOSTLY HARDWARE, AND THE ARTICLE IS HONEST ABOUT THAT. Unlike most
//  symptoms in this library, flickering usually ends at "contact IT". So the
//  steps are ordered to rule out the three things that AREN'T hardware
//  quickly — heat, adaptive brightness, a stuck compositor — and then get out
//  of the way rather than padding the article to look thorough.
//
//  LINES AND FLICKER ARE DIFFERENT FAULTS and step 1 splits them, because the
//  answer differs completely: fixed vertical or horizontal lines are a panel
//  or connector failure and nothing below will touch them, while flicker that
//  comes and goes is often environmental.
//
//  TODO — NO CITATION YET. Neither vendor has a single page that covers this
//  well; the steps are assembled from general display guidance rather than
//  one document. Add a `source` if a good page turns up at review.
///  +-----------------------------------------------------------------+

const flicker: Article = {
  symptomId: "flicker",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Flicker that comes and goes is usually heat or an automatic brightness feature. Fixed lines across the screen are hardware, and worth reporting rather than troubleshooting.",
  timeEstimate: "About 10 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Work out which of the two you have",
      body: "Fixed lines, vertical or horizontal bands that stay in the same place regardless of what is on screen, are a panel or connector fault. Nothing in this article will change them, so skip to the last step and report it. Flickering that comes and goes, or that changes with brightness, is worth working through.",
    },
    {
      title: "Let it cool down",
      body: "A {device} running hot dims and flickers on purpose to protect itself, and this is much the commonest cause of intermittent flicker. Get it out of the sun, take the case off, stop anything heavy it is running, and give it ten minutes.",
      branch: {
        label: "It's hot as well as flickering",
        targetSymptomId: "overheating",
      },
    },
    {
      title: "Turn off automatic brightness and watch it",
      body: "Adaptive brightness constantly adjusts the screen, and in changing light (walking past windows, under some fluorescent lighting) that reads as flicker. On an iPhone: Settings › Accessibility › Display & Text Size › Auto-Brightness. On a Samsung: Settings › Display › Adaptive brightness. Switch it off for a day and see whether the flicker goes with it.",
      note: "If that fixes it, nothing is broken. Leave it off, or turn it back on knowing what it is; either is fine.",
    },
    {
      title: "Restart the {device}",
      body: "Power it fully off, wait ten seconds, and power it back on. The part of the {device} that draws the screen can get stuck, and a restart is the only thing that clears it.",
    },
    {
      title: "Install any pending update",
      body: "On an iPhone: Settings › General › Software Update. On a Samsung: Settings › Software update › Download and install. Display bugs after a major OS release are common and get patched quickly, so a {device} a couple of versions behind may be flickering for a reason that is already fixed.",
    },
    {
      title: "Still flickering? Contact IT",
      body: "Tell them whether it is lines or flicker, whether it happens at all brightness levels, and whether it started after a drop or after an update. Those three answers separate a damaged panel from a software fault, and only one of them means the {device} has to be replaced.",
      warn: "Report it sooner rather than later if the affected area is spreading, or if there is a dark blotch or bleeding colour around it. That is a panel failing progressively, and it does not stop on its own.",
    },
  ],
};

export default flicker;
