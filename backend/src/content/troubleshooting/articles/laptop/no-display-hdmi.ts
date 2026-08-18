import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |        LAPTOP — MY SCREEN WON'T DISPLAY OVER HDMI               |
///  +-----------------------------------------------------------------+
//
//  Direct HDMI, not through the dock. Shorter than the dock article because
//  there is less to go wrong: a cable, a port, an input and a projection
//  mode.
//
//  Cables get their own step rather than a footnote. HDMI cables fail
//  silently and intermittently, and a spare is the cheapest test in this
//  whole library.
//
//  No branch to the docking article, for the same reason as the flickering
//  one: it shares a category here, so it already appears as a sibling chip,
//  and this is also listed under desktops, which have no dock at all.
///  +-----------------------------------------------------------------+

const noDisplayHdmi: Article = {
  symptomId: "no-display-hdmi",
  subjectKeys: ["laptop", "desktop", "monitor"],
  summary:
    "Nothing appears when you connect a screen straight to the computer's HDMI port. Almost always the cable, the projection mode, or a graphics driver that needs a nudge.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB laptops and desktops",
  updated: "2026-08-16",
  before: [
    "The screen is switched on and connected to the computer by HDMI, not through a dock",
  ],
  steps: [
    {
      title: "Reseat both ends of the cable",
      body: "Unplug the HDMI cable at the computer and at the monitor, then push both ends firmly in. HDMI plugs have no latch and work loose over time, particularly on a computer that gets moved.",
    },
    {
      title: "Press Windows + P and choose Extend",
      body: "If projection is set to PC screen only, the computer sends nothing out of the HDMI port at all. Choose Extend to use both screens, or Duplicate to mirror them.",
      figure: {
        images: [
          {
            src: "laptop/shared/Display-extend-light.jpg",
            srcDark: "laptop/shared/Display-extend-dark.jpg",
          },
        ],
        caption: "Windows + P › Extend",
      },
    },
    {
      title: "Reset the graphics driver with Windows + Ctrl + Shift + B",
      body: "Hold all four keys together. The screen goes black for a second and you may hear a short beep; that is the graphics driver restarting. It often brings back a display that stopped working while the computer was running.",
      note: "This is safe to do at any time. Nothing closes, nothing is saved over, and your open windows stay exactly where they were.",
    },
    {
      title: "Try a different cable",
      body: "Borrow a known-working HDMI cable and swap it in. Cables fail more often than ports do, and they tend to fail intermittently first, which is why a screen that worked yesterday can be dead today with nothing else having changed.",
    },
    {
      title: "Update the graphics driver, then restart",
      body: "Open Lenovo Commercial Vantage from the Start menu, install anything it offers, and restart with the screen still connected. Vantage is only on Lenovo machines, every laptop, and the ThinkCentre desktops. On a custom-built engineering PC there is no Vantage: use Settings › Windows Update instead, and if the machine has a dedicated graphics card; that card's own updater is where its display drivers come from.",
      note: 'If Lenovo Commercial Vantage is not installed on your laptop or Lenovo Desktop, Please install it from the "Company Portal" app on your device.',
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
      title: "Still nothing? Contact IT",
      body: "Tell them whether the monitor works on another machine, whether you tried a second cable, and whether the same screen works through the dock. Those three answers separate a dead port from a dead cable from a dead monitor.",
    },
  ],
};

export default noDisplayHdmi;
