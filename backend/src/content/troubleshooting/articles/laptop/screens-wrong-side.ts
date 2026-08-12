import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |       LAPTOP — MY SECOND SCREEN IS ON THE WRONG SIDE            |
///  +-----------------------------------------------------------------+
//
//  Not a fault at all — Windows does not know how the monitors are arranged
//  on the desk, so it guesses, and the guess is wrong about half the time.
//  Two minutes of dragging fixes it permanently.
//
//  Identify comes before dragging. Without it people move the wrong
//  rectangle and make things worse, because the boxes are unlabelled.
///  +-----------------------------------------------------------------+

const screensWrongSide: Article = {
  symptomId: "screens-wrong-side",
  subjectKeys: ["laptop", "desktop", "monitor"],
  summary:
    "Your mouse leaves the left of one screen and appears on the right of the other. Windows doesn't know how your monitors sit on the desk — you tell it once, in Display settings.",
  timeEstimate: "About 3 minutes",
  appliesTo: "KSB computers and desktops",
  updated: "2026-08-10",
  before: [
    "Both screens are working — this is about where they are, not whether they show a picture",
  ],
  steps: [
    {
      title: "Open Display settings",
      body: "Right-click anywhere on the desktop and choose Display settings. At the top you will see a numbered box for each screen.",
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
      title: "Press Identify to see which box is which",
      body: "Click Identify and a large number appears briefly on each screen. Note which physical monitor is 1, which is 2, and so on — the boxes are otherwise unlabelled and it is easy to move the wrong one.",
      figure: {
        images: [
          {
            src: "laptop/shared/Display-identify-light.jpg",
            srcDark: "laptop/shared/Display-identify-dark.jpg",
          },
        ],
        size: "full",
        caption: "Display settings › Identify",
      },
    },
    {
      title: "Drag the boxes to match your desk",
      body: "Drag each numbered box so their arrangement matches where the monitors actually are. If your second screen sits to the left of the computer, drag its box to the left. You can also drag boxes up and down to match a monitor mounted higher than the other.",
      figure: {
        images: [
          {
            src: "laptop/screens-wrong-side/Display-drag-light.jpg",
            srcDark: "laptop/screens-wrong-side/Display-drag-dark.jpg",
          },
        ],
        size: "full",
        caption: "Display settings › drag the numbered boxes, then Apply",
      },
    },
    {
      title: "Apply, and check by moving the mouse",
      body: "Click Apply, then run the mouse off the edge of one screen. It should arrive on the neighbouring screen at the same height and on the side you expect. If it doesn't, nudge the boxes and apply again.",
      note: "Line the boxes up along their edges rather than leaving them staggered. A gap or a step between them creates a spot where the pointer refuses to cross, which is oddly hard to diagnose later.",
    },
  ],
};

export default screensWrongSide;
