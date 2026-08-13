import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |             LAPTOP — MY DISPLAY IS FLICKERING                   |
///  +-----------------------------------------------------------------+
//
//  Cable first, because it is free and it is usually the answer on an
//  external screen. Refresh rate is the one people never think of and it
//  produces a very characteristic flicker, so it gets a step rather than a
//  mention.
//
//  Step 1 splits internal from external before anything else. A flickering
//  built-in panel is a hardware fault and none of the rest of this applies
//  to it.
//
//  No branch to the docking article. It sits in the same category, so it is
//  already offered as a sibling chip to every reader it could help — and
//  desktops, which this is also listed under, have no dock at all.
///  +-----------------------------------------------------------------+

const displayFlickering: Article = {
  symptomId: "display-flickering",
  subjectKeys: ["laptop", "desktop", "monitor"],
  summary:
    "Flickering on an external screen is usually the cable or the refresh rate. Flickering on the computer's own screen is a different matter and needs looking at.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB laptops and desktops",
  updated: "2026-08-10",
  before: [
    "You can tell which screen is flickering — the computer's own, or an external one",
  ],
  steps: [
    {
      title: "Work out which screen is affected",
      body: "If the computer's built-in screen flickers while external monitors are steady, the steps below won't help — that is the panel or its cable inside the machine, and it needs a hardware repair. Skip to the last step and contact IT.",
    },
    {
      title: "Reseat the cable at both ends",
      body: "Unplug the video cable at the monitor and at the computer or dock, then push both ends firmly home. A cable that is almost seated gives an intermittent picture rather than no picture, which is exactly what flickering looks like.",
    },
    {
      title: "Try a different cable",
      body: "Swap in a known-working cable. This is the single most likely fix for a flickering external monitor, and a marginal cable often works fine for months before it starts.",
    },
    {
      title: "Check the refresh rate",
      body: "Open Display settings, scroll to Advanced display, select the affected screen, and look at the refresh rate. If several are offered, try the highest the monitor supports — and if it is already there and flickering, step down one and see whether it settles.",
      figure: { caption: "Display settings › Advanced display › refresh rate" },
    },
    {
      title: "Update the graphics driver, then restart",
      body: "Open Lenovo Commercial Vantage from the Start menu, install anything it offers, and restart. If the flickering started after an update, this is where a fix would arrive. Vantage is only on Lenovo machines — every laptop, and the ThinkCentre desktops. On a custom-built engineering PC there is no Vantage: use Settings › Windows Update instead, and if the machine has a dedicated graphics card, that card's own updater is where its display drivers come from.",
      figure: {
        images: [
          {
            src: "laptop/shared/Lcv-updates-light.jpg",
            srcDark: "laptop/shared/Lcv-updates-dark.jpg",
          },
        ],
        size: "full",
        caption: "Lenovo Commercial Vantage › Updates (Lenovo machines only)",
      },
    },
    {
      title: "Still flickering? Contact IT",
      body: "Say which screen it is, whether a different cable made any difference, and whether it flickers constantly or only sometimes. An intermittent flicker on one screen is a cable or a monitor; the same on every screen at once points at the computer.",
    },
  ],
};

export default displayFlickering;
