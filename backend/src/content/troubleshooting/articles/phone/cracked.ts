import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |         PHONE — SCREEN IS CRACKED OR DAMAGED                    |
///  +-----------------------------------------------------------------+
//
//  ENTIRELY OURS, AND SHORT ON PURPOSE. Apple's answer to this is "book a
//  Genius Bar appointment" and Samsung's is "find a service centre"; neither
//  is what happens at KSB, where the {device} comes back to IT and gets
//  replaced. Following vendor documentation here would send people to a shop.
//
//  NOT REALLY A TROUBLESHOOTING ARTICLE. There is nothing to fix — a cracked
//  screen is cracked. What the reader actually needs is to know that the
//  process is simple, that they aren't in trouble, and what to have with them
//  when they hand it over. So the job of this article is to get them to IT
//  prepared rather than to work through diagnostics that cannot help.
//
//  ONE ARTICLE FOR BOTH PLATFORMS. Glass is glass, and every step here is
//  about the KSB process rather than the handset.
//
//  STEP 1 IS A SAFETY STEP AND LEADS FOR THAT REASON ALONE, breaking the
//  cost-ordering rule deliberately. Shattered glass held against a face is
//  the one thing in this library that can hurt somebody, so it goes first
//  regardless of how few readers it applies to.
//
//  FUTURE: the last step should become a Teams deep link to the help chat
//  once those land, rather than prose telling people to contact IT. The
//  escape block beneath already carries the call route.
///  +-----------------------------------------------------------------+

const cracked: Article = {
  symptomId: "cracked",
  subjectKeys: ["phone", "tablet"],
  summary:
    "There's nothing to repair yourself; bring the {device} back to IT and it gets replaced. This is what to do in the meantime and what to have ready when you hand it over.",
  timeEstimate: "About 10 minutes",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-17",
  before: [],
  steps: [
    {
      title: "Work out whether it still does its job",
      body: "Can you make a call, read email, and unlock it? A {device} with a cracked corner that works perfectly can wait until you're next in the office. One that won't unlock, won't charge, or has dead patches under the crack can't, and it's worth saying which when you get in touch.",
      branch: {
        label: "Parts of the screen have stopped responding to touch",
        targetSymptomId: "touch-dead",
      },
    },
    {
      title: "Make sure nothing important lives only on this phone",
      body: "Your KSB email, Teams messages and files are in your account rather than on the handset, so they arrive on the replacement by themselves; there is nothing to move. Personal photos and anything saved locally by an app are the exception. If the screen still works well enough, check those are backed up before you hand it over.",
      note: "Don't factory reset it or sign yourself out before bringing it in. IT handles the wipe as part of the swap, and doing it early only makes the handover slower.",
    },
    {
      title: "Bring it to IT and they'll replace it",
      body: "Hand the {device} in and tell them roughly what happened and when. Bring the charger and cable if you have them. You aren't in trouble; screens break, this is a routine swap, and the sooner it's in the sooner the replacement is set up.",
      note: "If you're at another site or working from home, get in touch first rather than posting it. They'll tell you how they want it sent and can start setting up the replacement before it arrives.",
    },
  ],
};

export default cracked;
