import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |          IPHONE — BATTERY DRAINS TOO FAST                       |
///  +-----------------------------------------------------------------+
//
//  DIAGNOSIS FIRST, UNUSUALLY. The house rule is cheapest-first, and here the
//  cheapest step also happens to be the one that answers the question: the
//  Battery screen names the app responsible, and everything after it is
//  conditional on what that screen said. Guessing at settings before looking
//  costs more than looking.
//
//  TWO GENUINELY DIFFERENT FAULTS SHARE THIS SYMPTOM and the article has to
//  separate them early. A worn-out battery is a hardware replacement and no
//  amount of settings-fiddling touches it; a misbehaving app is free to fix.
//  Maximum Capacity tells them which they have in about ten seconds, so it
//  goes second.
//
//  LOW POWER MODE IS OFFERED AS A STOPGAP, NOT A FIX, and is placed where
//  someone reading in a hurry will find it — a person whose phone is at 15%
//  at lunchtime wants to survive the afternoon, not understand the cause.
//
//  A SEPARATE ARTICLE FROM THE SAMSUNG ONE because almost nothing overlaps:
//  Apple exposes battery health as a number and Samsung largely doesn't,
//  Apple's background control is one switch and Samsung's is a sleeping-apps
//  system, and the menus share no path.
///  +-----------------------------------------------------------------+

const batteryDrainIos: Article = {
  symptomId: "battery-drain-ios",
  subjectKeys: ["phone", "tablet"],
  summary:
    "Either one app is misbehaving or the battery has simply worn out — and the Battery screen tells you which in about ten seconds. Start there before changing any settings.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB-managed {devices}",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Look at which app is actually using the battery",
      body: "Open Settings › Battery and scroll to the usage list. Switch it to the last 10 days rather than the last 24 hours — a pattern is far easier to see over days. An app near the top that you barely open is your answer, and it is usually something that syncs or tracks location in the background.",
      note: "Screen time at the top of the list is normal and not a fault. It only tells you the screen is what uses the most power, which is true of every phone.",
      figure: {
        images: [
          {
            src: "phone/battery-drain-ios/Battery-usage-light.jpg",
            srcDark: "phone/battery-drain-ios/Battery-usage-dark.jpg",
          },
        ],
        caption: "Settings › Battery › last 10 days",
      },
    },
    {
      title: "Check whether the battery has simply worn out",
      body: "Go to Settings › Battery › Battery Health and read Maximum Capacity. This is how much charge the battery still holds compared to when it was new. Anything in the 80s or above is healthy. Below about 80% the {device} genuinely will not last a day however carefully you use it, and no setting will change that.",
      note: "Batteries are meant to reach about 80% after a few years of normal use — an iPhone 14 or earlier after roughly 500 full charges, an iPhone 15 or later after about 1000. A low number here is wear, not damage, and not something you did wrong.",
      figure: {
        images: [
          {
            src: "phone/battery-drain-ios/Battery-Health-light.jpg",
            srcDark: "phone/battery-drain-ios/Battery-Health-dark.jpg",
          },
        ],
        caption: "Settings › Battery › Battery Health › Maximum Capacity",
      },
    },
    {
      title: "Turn on Low Power Mode to get through today",
      body: "Settings › Battery › Low Power Mode, or the battery tile in the Control Centre. It cuts background refresh, mail fetching and some visual effects, and it will usually buy you the rest of the afternoon. This is a stopgap rather than a fix, and the {device} turns it off by itself once you charge back up.",
    },
    {
      title: "Stop the app you found from running in the background",
      body: "Settings › General › Background App Refresh, then switch off the app the Battery screen pointed at. It will still work normally when you open it — it just stops waking the {device} up when you aren't using it. If several apps look suspicious, turn them off one at a time so you learn which one it was.",
    },
    {
      title: "Update iOS and give it a few days",
      body: "Settings › General › Software Update. Battery fixes ship in point releases more often than anything else. After any major update the {device} spends several days re-indexing and re-learning your habits, so judge the result at the end of that week rather than the next morning.",
    },
    {
      title: "Still draining? Contact IT",
      body: "Tell them the Maximum Capacity figure and which app was top of the Battery list. Those two numbers decide the outcome between them — a worn battery is a replacement, and an app that shouldn't be doing what it's doing is something IT can look at centrally rather than on your handset.",
    },
  ],
  source: {
    name: "Apple Support — If the battery in your iPhone or iPad drains too quickly",
    url: "https://support.apple.com/en-us/120745",
  },
};

export default batteryDrainIos;
