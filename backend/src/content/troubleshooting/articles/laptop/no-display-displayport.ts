import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |     LAPTOP — MY SCREEN WON'T DISPLAY OVER DISPLAYPORT           |
///  +-----------------------------------------------------------------+
//
//  Mostly the same shape as the HDMI article, with two differences that
//  matter enough to justify a separate one: DisplayPort plugs often have a
//  latch that has to be pressed before they will come out, and a USB-C to
//  DisplayPort lead only works from a port that carries video — which not
//  every USB-C port does.
//
//  Both of those send people to IT convinced the hardware is broken.
///  +-----------------------------------------------------------------+

const noDisplayDisplayPort: Article = {
  symptomId: "no-display-displayport",
  subjectKeys: ["laptop", "desktop", "monitor"],
  summary:
    "Nothing appears over DisplayPort. Usually the cable or the projection mode — but DisplayPort has two traps of its own worth knowing about.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB computers and desktops",
  updated: "2026-08-10",
  before: [
    "The screen is switched on and connected by DisplayPort or by a USB-C to DisplayPort lead",
  ],
  steps: [
    {
      title: "Reseat the cable, pressing the latch to remove it",
      body: "Many DisplayPort plugs have a small catch on top that must be held down before the plug will come out. Forcing it damages the socket. Press the catch, remove the plug, then push it back in until it clicks.",
      warn: "Do not pull a latched DisplayPort cable out by force. The latch is there to stop it falling out, and dragging it free can take part of the socket with it — turning a five-minute problem into a new monitor.",
    },
    {
      title:
        "If you're using USB-C to DisplayPort, check the port carries video",
      body: "Not every USB-C port can drive a screen. The ones that can are usually marked with a small display or lightning symbol next to the socket. If nothing happens on one port, try the others before assuming the cable is at fault.",
    },
    {
      title: "Press Windows + P and choose Extend",
      body: "If projection is set to PC screen only, nothing leaves the computer regardless of what is connected.",
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
      body: "Hold all four keys together. The screen goes black for a second and you may hear a short beep — that is the graphics driver restarting. It often brings back a display that stopped working while the computer was running.",
      note: "This is safe to do at any time. Nothing closes, nothing is saved over, and your open windows stay exactly where they were — the brief black screen and the beep are the whole of it.",
    },
    {
      title: "Update the graphics driver, then restart",
      body: "Open Lenovo Commercial Vantage from the Start menu, install anything offered, and restart with the screen connected. Vantage is only on Lenovo machines — every laptop, and the ThinkCentre desktops. On a custom-built engineering PC there is no Vantage: use Settings › Windows Update instead, and if the machine has a dedicated graphics card, that card's own updater is where its display drivers come from.",
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
      body: "Say whether the monitor works over HDMI, whether you tried another cable, and which port you used. DisplayPort faults are usually the cable or the socket rather than the computer.",
      branch: {
        label: "Let me try HDMI instead",
        targetSymptomId: "no-display-hdmi",
      },
    },
  ],
};

export default noDisplayDisplayPort;
