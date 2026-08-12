import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |          PHONE — WON'T CHARGE WHEN PLUGGED IN                   |
///  +-----------------------------------------------------------------+
//
//  ONE ARTICLE FOR BOTH PLATFORMS, unlike the won't-turn-on pair. Everything
//  here is a cable, a plug, a wall socket or a port full of lint, and none of
//  that differs between an iPhone and a Galaxy. The only divergence in the
//  whole article is the force restart in step 5, which is two sentences, so
//  both sequences are named there rather than splitting the article in two
//  and duplicating four identical steps.
//
//  ORDERED BY WHAT THE READER HAS TO FIND. Swapping the wall socket costs
//  nothing and is done standing up; borrowing a cable means finding a
//  colleague; clearing the port means finding a toothpick. Diagnostic value
//  runs almost exactly the other way round — the cable swap proves the most —
//  and cost wins, per the house rule.
//
//  THE PORT STEP CARRIES THE ONLY REAL WARNING IN THE ARTICLE. Told to clean
//  a charging port, people reach for a paperclip or a SIM tool, and shorting
//  the contacts turns a free fix into a replacement handset. That is why the
//  warning names what to use rather than only what not to.
//
//  SOURCE IS APPLE'S PAGE THOUGH THIS COVERS BOTH FLEETS. Samsung's own
//  guidance is the same advice in the same order — charge for an hour, check
//  the cable and adapter, inspect the port — and the schema's `source` holds
//  one entry. Apple's is cited because the iPhone fleet is the larger one.
//  If cross-vendor articles become common, `source` wants to be a list.
///  +-----------------------------------------------------------------+

const noCharge: Article = {
  symptomId: "no-charge",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Nearly always the cable, the plug or a port packed with pocket lint — very rarely the {device} itself. These steps rule those out in the order that costs you least.",
  timeEstimate: "About 15 minutes, plus an hour on charge",
  appliesTo: "All KSB company {devices}",
  updated: "2026-08-11",
  before: ["You have the charging cable and plug you normally use"],
  steps: [
    {
      title: "Plug it into a wall socket rather than anything else",
      body: "A laptop USB port, a dock, a monitor or a car charger all deliver far less power than a wall plug, and some deliver so little that a {device} with a flat battery uses it faster than it arrives. Move to a wall socket and try a different socket while you are at it, in case that one is dead.",
    },
    {
      title: "Leave it for a full hour before judging it",
      body: "A completely flat phone shows nothing on screen for several minutes after you plug it in, and on a Galaxy it can be ten minutes before any charging indicator appears at all. Plug it in, walk away, and come back in an hour.",
      note: "This step is skipped more than any other because nothing appears to be happening. Nothing appearing to happen is exactly what a deeply flat battery looks like for the first few minutes, which is why it is worth giving it the full hour before moving on.",
    },
    {
      title: "Try a different cable, then a different plug",
      body: "Change one at a time so you find out which one failed. Cables break inside the insulation where there is nothing to see, usually just behind the connector where they bend most, and they are far and away the commonest culprit. A plug that has stopped working is rarer but does happen.",
      note: "If a borrowed cable works, keep using it and ask IT for a replacement rather than going back to yours. A cable that has failed intermittently will not recover.",
    },
    {
      title: "Look inside the charging port",
      body: "Pocket lint compacts into a solid plug at the bottom of the port over months, and it stops the cable seating fully. Shine a light in and look at the very bottom. A cable that no longer clicks in firmly, or that works only when held at an angle, is this almost every time.",
      warn: "Use a wooden toothpick gently, or a short burst of compressed air. Never anything metal — a paperclip, a pin or a SIM tool shorts the contacts, and that turns a free fix into a replacement handset. If you can see corrosion or any sign of liquid, stop and contact IT instead.",
    },
    {
      title: "Force restart it while it is plugged in",
      body: "A device that has crashed can sit there not charging and not responding. On an iPhone or iPad: press and release volume up, press and release volume down, then hold the side button — the top button on an iPad — until the Apple logo appears. On a Samsung: hold the side button and volume down together for at least seven seconds, until it vibrates and the Samsung logo appears. Neither erases anything.",
      branch: {
        label: "It still won't turn on at all, even after charging",
        targetSymptomId: "wont-turn-on-ios",
      },
    },
    {
      title: "Still not charging? Contact IT",
      body: "Tell them which of these you have already ruled out — especially whether a known-good cable made any difference, and whether it charges slowly rather than not at all. Those two answers are most of the diagnosis and decide whether it is a battery, a port or a charger.",
    },
  ],
  source: {
    name: "Apple Support — If your iPhone or iPod touch won't charge",
    url: "https://support.apple.com/en-us/108805",
  },
};

export default noCharge;
