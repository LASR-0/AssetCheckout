import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |    LAPTOP — LOCK SCREEN IS BLANK AND I CAN'T SIGN IN            |
///  +-----------------------------------------------------------------+
//
//  A short article, and it should stay short. The fix is one keystroke; the
//  only thing standing between the reader and it is that a lock screen
//  showing nothing but wallpaper looks broken rather than locked, so nobody
//  thinks to press anything.
//
//  Step 1 exists to separate this from a {device} that is off or asleep. Both
//  look like "the screen won't let me in", and the fixes have nothing in
//  common — so it branches out early rather than sending someone through a
//  restart that was never going to help.
///  +-----------------------------------------------------------------+

const lockScreenBlank: Article = {
  symptomId: "lock-screen-blank",
  subjectKeys: ["laptop", "desktop"],
  summary:
    "Sometimes the lock screen shows only the wallpaper, with no password box and no prompt. Pressing Ctrl + Alt + Delete almost always brings the sign-in fields back.",
  timeEstimate: "About 5 minutes",
  appliesTo: "KSB {devices}",
  updated: "2026-08-10",
  before: [
    "The {device} is switched on and the screen is lit — you can see the wallpaper",
  ],
  steps: [
    {
      title: "Check the screen is awake, not off",
      body: "You should be able to see the wallpaper. Press a key or move the mouse first — if the screen stays completely black with no backlight, this is a different problem and the steps below won't help.",
      branch: {
        label: "The screen is completely black and won't wake",
        targetSymptomId: "wont-turn-on",
      },
    },
    {
      title: "Press Ctrl + Alt + Delete",
      body: "Hold all three together. The sign-in fields normally appear straight away, and you can enter your password or PIN as usual.",
      note: "The prompt that normally tells you to do this sometimes doesn't draw, which is what makes the screen look stuck. The keystroke still works even when nothing on screen invites it.",
    },
    {
      title: "If the fields still don't appear, restart the {device}",
      body: "Hold the power button down for about ten seconds until the machine switches off, then press it again to start it up. The lock screen comes back normally.",
      warn: "This is a forced shutdown, so anything unsaved in open applications is lost. It is the right move here — you can't reach those applications to save them anyway — but it is worth knowing before you hold the button.",
    },
  ],
};

export default lockScreenBlank;
