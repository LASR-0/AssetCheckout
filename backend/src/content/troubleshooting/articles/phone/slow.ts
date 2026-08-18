import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            PHONE & IPAD — SLOW OR FREEZING                      |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR EVERY DEVICE. Restart, free up space, update, find the bad
//  app — the procedure is the same on an iPhone, an iPad and a Galaxy, and
//  only the update path differs by a line.
//
//  A VAGUE SYMPTOM THAT NEEDS NARROWING BEFORE IT NEEDS FIXING. "Slow" covers
//  a device that stutters everywhere and one that is fine except in a single
//  app, and those are different problems with different answers. Step 2 asks
//  the question rather than assuming, because the whole-device case is worth
//  five steps and the one-app case is worth one.
//
//  THE RESTART LEADS BECAUSE IT IS FREE AND BECAUSE IT WORKS. It is the most
//  clichéd advice in support and also the highest hit rate in this article;
//  the note exists to stop a reader skipping it out of cynicism.
//
//  MOST OF THE REAL FIXES LIVE IN OTHER ARTICLES — storage and battery both
//  present as slowness — so this branches out rather than duplicating them.
//
//  NO SAMSUNG BRANCH BUTTON, deliberately. This article is listed under
//  tablets, the fleet has no Android tablets, and a button reading
//  "(Samsung)" on an iPad page is noise. Samsung readers still get their
//  settings path inline and reach the battery article from the symptom list.
///  +-----------------------------------------------------------------+

const slow: Article = {
  symptomId: "slow",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Nearly always a full device, a pending update, or one badly behaved app rather than the hardware wearing out. Twenty minutes of this usually sorts it.",
  timeEstimate: "About 20 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Restart it properly",
      body: "Power it right off, wait ten seconds, and power it back on. Not lock and unlock; fully off. {Devices} go weeks or months between restarts and accumulate stuck background processes the whole time.",
      note: "Worth doing even though it sounds like the thing support says to get rid of you. It fixes more of these than everything below it put together, and it costs a minute.",
    },
    {
      title: "Is it the whole device, or one app?",
      body: "Open something simple (Settings, or the camera) and see whether that is slow too. If everything drags, keep going down this list. If the device is fine and one app is unusable; the problem is that app, and the rest of these steps won't touch it.",
      branch: {
        label: "It's one app, and it closes as soon as I open it",
        targetSymptomId: "crash",
      },
    },
    {
      title: "Check how much free storage is left",
      body: "A device with almost no free space slows down badly, because it has nowhere to put temporary files. On an iPhone or iPad: Settings › General › iPhone Storage (or iPad Storage). On a Samsung: Settings › Battery and device care › Storage. If you have less than a couple of gigabytes free, that is very likely the whole answer.",
      branch: {
        label: "It's nearly full and I need to clear space",
        targetSymptomId: "storage",
      },
    },
    {
      title: "Install any pending update",
      body: "On an iPhone or iPad: Settings › General › Software Update. On a Samsung: Settings › Software update › Download and install. Put it on charge and on Wi-Fi and let it finish. Performance fixes ship in these constantly, and a device several versions behind is often slow for reasons that were solved months ago.",
      note: "Expect it to feel worse for a day or two afterwards, not better. It re-indexes everything in the background after a major update. Judge it at the end of the week.",
    },
    {
      title: "Check the battery isn't the real story",
      body: "A device that is slow and also flat by mid-afternoon usually has one cause, not two, a worn battery, or an app burning through both at once. If that sounds familiar; the battery article is the more useful place to be.",
      branch: {
        label: "The battery is draining fast too",
        targetSymptomId: "battery-drain-ios",
      },
    },
    {
      title: "Still slow? Contact IT",
      body: "Tell them roughly how much free storage there is, whether it is slow everywhere or only in one app, and how old the device is. Those three answers separate a full device; a bad app and hardware that has genuinely reached the end of its life.",
    },
  ],
};

export default slow;
