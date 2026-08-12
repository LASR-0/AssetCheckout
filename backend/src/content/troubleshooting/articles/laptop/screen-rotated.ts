import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |         LAPTOP — MY SCREEN IS ROTATED THE WRONG WAY             |
///  +-----------------------------------------------------------------+
//
//  Nearly always an accidental keyboard shortcut, and it looks alarming out
//  of proportion to how easy it is to undo.
//
//  The article does the fix first and explains the shortcut afterwards. A
//  reader with a sideways screen wants it upright, not a lesson in how it
//  happened — but knowing about the shortcut is what stops it happening
//  again next week.
///  +-----------------------------------------------------------------+

const screenRotated: Article = {
  symptomId: "screen-rotated",
  subjectKeys: ["laptop", "desktop", "monitor"],
  summary:
    "A screen showing everything sideways or upside down is a display setting, not damage. It takes about a minute to put right.",
  timeEstimate: "About 3 minutes",
  appliesTo: "KSB computers and desktops",
  updated: "2026-08-10",
  before: ["The screen is showing a picture — just at the wrong orientation"],
  steps: [
    {
      title: "Open Display settings",
      body: "Right-click anywhere on the desktop and choose Display settings. Working on a rotated screen is awkward, so if you have a second screen the right way up, do this there.",
      figure: {
        images: [
          {
            src: "laptop/shared/Display-settingsmenu-light.jpg",
            srcDark: "laptop/shared/Display-settingsmenu-dark.jpg",
          },
        ],
        caption: "Right-click the desktop › Display settings",
      },
    },
    {
      title: "Select the screen that's wrong",
      body: "Click the numbered box for the affected screen so the settings below apply to it rather than to the other one. Press Identify if you are not sure which is which.",
      figure: {
        images: [
          {
            src: "laptop/shared/Display-identify-light.jpg",
            srcDark: "laptop/shared/Display-identify-dark.jpg",
          },
        ],
        size: "full",
        caption:
          "Display settings › Identify, to see which box is which screen",
      },
    },
    {
      title: "Set Display orientation to Landscape",
      body: "Find Display orientation and choose Landscape. The screen rights itself immediately and Windows asks you to confirm — choose Keep changes.",
      note: "If you don't confirm within about fifteen seconds it reverts on its own. That is deliberate, so a setting that leaves you with an unusable screen undoes itself — but it does mean you have to click Keep changes reasonably promptly.",
      figure: {
        images: [
          {
            src: "laptop/screen-rotated/Display-orientation-light.jpg",
            srcDark: "laptop/screen-rotated/Display-orientation-dark.jpg",
          },
        ],
        size: "full",
        caption: "Display settings › Display orientation › Landscape",
      },
    },
    {
      title: "Know how it happened, so it doesn't happen again",
      body: "On many computers Ctrl + Alt + an arrow key rotates the screen. It is easy to hit by accident while reaching for a shortcut, which is why screens usually go sideways at the exact moment nobody did anything unusual. Ctrl + Alt + Up arrow puts it back if the shortcut is enabled on your machine.",
    },
  ],
};

export default screenRotated;
