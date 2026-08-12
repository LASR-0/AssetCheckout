import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |            MONITOR — MY SCREEN WON'T TURN ON                    |
///  +-----------------------------------------------------------------+
//
//  Closes the monitor subject, and it is the natural home for the one thing
//  the three no-display articles deliberately dropped: manually switching the
//  input source. Those were written for modern monitors, which auto-detect,
//  and the step was removed as noise. Older screens on site do NOT auto-
//  detect, and when one of those is on the wrong input it looks exactly like
//  a monitor that won't turn on — black screen, no message.
//
//  STEP 2 IS THE FORK THE WHOLE ARTICLE TURNS ON. A power light that is off
//  and a power light that is on are two completely different faults, and the
//  reader can tell them apart in a second. If the light is on, the monitor is
//  working perfectly and the problem is the signal reaching it — which is
//  three other articles, not this one. Sending those readers away early is
//  worth more than anything further down this page.
//
//  THE POWER BUTTON GETS ITS OWN STEP because on the Lenovo screens in use
//  it is often a small joystick or nub tucked under the bottom-right bezel
//  rather than a labelled button on the front, and people genuinely cannot
//  find it on a screen they have sat in front of for a year.
///  +-----------------------------------------------------------------+

const monitorWontTurnOn: Article = {
  symptomId: "monitor-wont-turn-on",
  subjectKeys: ["monitor"],
  summary:
    "Check the power light first — if it's lit, the monitor is fine and the problem is the signal reaching it. If it's dark, this is power, and it's usually a cable at the end you can't see.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB monitors",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Find the power light and see whether it's lit",
      body: "It is a small LED, usually on the bottom edge or the bottom-right corner of the bezel. Look at it in shade — these are dim enough to be invisible under office lighting if you glance rather than look.",
      note: "Amber or orange rather than white or blue is not off. It means the monitor is powered and asleep because it isn't receiving a picture — which is the next step, not this one.",
    },
    {
      title: "If the light is on, this isn't a power problem",
      body: "A lit power light means the monitor is working. What's missing is the picture being sent to it, which is a different fault with a different fix depending on how the screen is connected — through the dock, or straight to the machine by HDMI or DisplayPort.",
      branch: {
        label: "The light is on but the screen stays black",
        targetSymptomId: "no-display-dock",
      },
    },
    {
      title: "Press the power button — it may not be where you expect",
      body: "On most of the Lenovo screens here it is a small joystick or nub tucked underneath the bottom-right corner of the bezel rather than a labelled button on the front. Feel along the underside. Push it in once rather than holding it.",
      note: "That same joystick is the monitor's menu control. If pressing it brings up an on-screen menu instead of waking the screen, the monitor is already on — go back to the previous step.",
    },
    {
      title: "Check both ends of the power cable, and the wall switch",
      body: "Push the cable firmly into the back of the monitor as well as at the wall — the monitor end works loose far more often, because nobody ever checks it. Make sure the wall socket is switched on, and that it isn't a switched outlet controlled by something else.",
      note: "Monitors on a desk that gets adjusted, or on a sit-stand frame, pull their own cables loose over time. If the desk moves, this is the likeliest step in the article.",
    },
    {
      title: "Try a different power outlet, then a different power cable",
      body: "Change one at a time. Monitor power cables are the standard kettle-style lead, so there is almost certainly a spare on a desk near you — borrowing one for a minute settles it either way.",
    },
    {
      title: "If it's an older screen, switch the input source by hand",
      body: "Older monitors don't scan their inputs automatically, so one left on the wrong source shows nothing at all and never says why. Use the joystick or the menu buttons to open the on-screen menu, find Input or Source, and step through HDMI, DisplayPort and USB-C until the picture appears.",
      note: "Newer screens do this by themselves and won't need it. It is worth trying anyway — it costs a minute and it is invisible from the outside which sort you have.",
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them whether the power light does anything at all, and whether the on-screen menu comes up when you press the joystick. A monitor whose menu appears is alive and has a signal problem; one that stays completely dark with a known-good cable and outlet is a dead screen.",
    },
  ],
};

export default monitorWontTurnOn;
