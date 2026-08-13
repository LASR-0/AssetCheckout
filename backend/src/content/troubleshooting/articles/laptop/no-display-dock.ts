import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |      LAPTOP — MY SCREENS WON'T DISPLAY THROUGH THE DOCK         |
///  +-----------------------------------------------------------------+
//
//  The commonest display fault, and the commonest causes are dull: a monitor
//  on the wrong input, or a dock cable that has worked loose. Both are free
//  to check, so they go first.
//
//  The last step earns its place — connecting a screen straight to the computer
//  splits "the dock is broken" from "the screen is broken", which is the
//  question IT would otherwise have to ask before doing anything.
//
//  THREE DOCK MODELS, ONE ARTICLE. Universal USB-C, Thunderbolt 4 and
//  Thunderbolt 5 all present the same way from the user's side, and every
//  step below applies to all of them — three near-copies would drift apart
//  within a year for no gain.
//
//  The one model-specific thing kept is the Thunderbolt port requirement on
//  step 2, because plugging a Thunderbolt dock into an ordinary USB-C port
//  charges the computer and drives no screens, which is a silent trap rather
//  than a visible failure.
///  +-----------------------------------------------------------------+

const noDisplayDock: Article = {
  symptomId: "no-display-dock",
  // Not desktops: a desktop is wired straight to its screens, so a docking
  // article would be a symptom nobody could ever have.
  subjectKeys: ["laptop", "monitor", "dock"],
  summary:
    "Nothing on your external screens when the computer is docked. Usually a loose dock cable, a dock without power, or a projection mode that has reset itself.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB Lenovo laptops and docks",
  updated: "2026-08-10",
  before: [
    "The computer is connected to the dock and the monitors are switched on",
  ],
  steps: [
    {
      title:
        "Unplug the dock cable from the computer, wait, and plug it back in",
      body: "Take the single cable running from the dock to the computer out entirely, count to ten, and push it firmly back in. This one step fixes more docking problems than everything else here put together.",
      note: "If yours is a Thunderbolt dock, it must go into a Thunderbolt port on the computer — marked with a small lightning bolt beside the socket. A Thunderbolt dock plugged into an ordinary USB-C port may charge and pass through USB while driving no screens at all.",
    },
    {
      title: "Check the dock itself has power",
      body: "The dock has its own power supply, separate from your computer charger. Make sure it is plugged in at the wall and switched on — a dock running on bus power alone will often charge the computer while driving no screens at all.",
    },
    {
      title: "Press Windows + P and choose Extend",
      body: "This opens the projection menu. If it is set to PC screen only, nothing reaches the external monitors no matter what is plugged in. Choose Extend.",
      note: "This setting resets on its own more often than you would expect — after some updates, or after connecting to a projector in a meeting room. It is worth checking even if you never changed it.",
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
      title: "Update the dock and graphics drivers",
      body: "Open Lenovo Commercial Vantage from the Start menu and let it check for updates. Dock firmware and graphics drivers both live here, and both cause exactly this symptom when they fall behind. Install what it offers, then restart with the dock still connected. Vantage is only on Lenovo machines — every laptop, and the ThinkCentre desktops. On a custom-built engineering PC there is no Vantage: use Settings › Windows Update instead, and if the machine has a dedicated graphics card, that card's own updater is where its display drivers come from.",
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
      title: "Connect one monitor straight to the computer",
      body: "Take a cable from a monitor directly into the computer, bypassing the dock. If the picture appears, the screen and the cable are fine and the dock is the problem — which is the single most useful thing you can tell IT.",
      branch: {
        label: "It doesn't work directly over HDMI either",
        targetSymptomId: "no-display-hdmi",
        // Pinned to the computer rather than resolving inside whichever
        // subject the reader came from. The step is "stop using the dock and
        // plug into the machine", so the HDMI article belongs to the machine
        // — and the Docks taxonomy has no HDMI symptom of its own, nor
        // should it, since by this point the dock is out of the picture.
        targetSubjectKey: "laptop",
      },
    },
  ],
};

export default noDisplayDock;
