import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |     DOCK — THE USB PORTS ON MY DOCK AREN'T WORKING              |
///  +-----------------------------------------------------------------+
//
//  THE TWO-WAY TEST IN STEP 2 IS THE ARTICLE. Swapping the device to another
//  dock port and then plugging it straight into the laptop splits three
//  possibilities apart in under a minute — a dead port, a dead dock, or a
//  dead device — and no amount of reseating cables gets you that.
//
//  ORDERED CHEAPEST FIRST as usual, which puts the reseat before the test
//  even though the test proves more. Reseating costs ten seconds and fixes a
//  fair share outright.
//
//  THE POWER STEP IS NOT PADDING. A dock running on the wrong supply, or one
//  feeding several bus-powered devices at once, drops the USB ports first and
//  keeps everything else working — so "my USB stopped but my screens are
//  fine" has a real cause that looks nothing like a power problem.
//
//  FIRMWARE LAST, because it needs Vantage, a restart and ten minutes, and
//  because it is the rarest of the causes here despite being the one that
//  sounds most technical.
///  +-----------------------------------------------------------------+

const dockUsbNotWorking: Article = {
  symptomId: "dock-usb-not-working",
  subjectKeys: ["dock"],
  summary:
    "Usually the dock rather than the port, and occasionally the device you plugged in. Two quick tests tell you which before you change anything.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB Lenovo docks",
  updated: "2026-08-11",
  before: ["The dock has power and your screens are working through it"],
  steps: [
    {
      title: "Unplug the dock cable from the laptop, wait, and plug it back in",
      body: "Take the single cable running from the dock to the laptop out entirely, count to ten, and push it firmly back in. The same step that fixes most docking display faults fixes most USB ones, and for the same reason.",
    },
    {
      title:
        "Try another port on the dock, then plug the device into the laptop",
      body: "Move the device to a different USB port on the dock. If it works there, one port has failed and the dock is otherwise fine. If it fails on every dock port, plug it straight into a USB port on the laptop — if it works there, the problem is the dock; if it fails there too, the problem is the device.",
      note: "Worth doing in that order, and worth actually doing both halves. This is the difference between IT replacing a dock, replacing a mouse, or looking at your laptop — and it is thirty seconds of your time.",
    },
    {
      title: "Power-cycle the dock",
      body: "Unplug the dock's own power supply at the wall and the cable to your laptop, leave both out for a full thirty seconds, then reconnect power first and the laptop second. A dock holds enough charge to survive a quick unplug, so a fast power-cycle often does nothing.",
      branch: {
        label: "The dock has no power at all",
        targetSymptomId: "dock-no-power",
      },
    },
    {
      title: "Unplug anything power-hungry and try again",
      body: "Portable hard drives, phone chargers and USB fans all draw their power from the port. Several at once — or one greedy one — can pull the dock's USB side past what it will supply, and the ports shut down while the screens and ethernet carry on working normally. Unplug everything, test one device on its own, and add the rest back one at a time.",
      note: "This is worth a minute even if nothing you have plugged in looks demanding. It explains the otherwise baffling case where USB stops working and everything else on the dock is fine.",
    },
    {
      title:
        "Update the dock firmware with Lenovo Commercial Vantage, then restart",
      body: "Open Lenovo Commercial Vantage from the Start menu, let it check for updates, and install anything it offers — dock firmware included. Then restart the laptop from the Start menu rather than closing the lid, and leave the dock connected while you do.",
      note: "Vantage is only on Lenovo machines, which is every laptop here and the ThinkCentre desktops. Restart even if it offers nothing: that alone reloads the USB controller and resolves a fair share of these.",
      figure: {
        images: [
          {
            src: "laptop/shared/Lcv-updates-light.jpg",
            srcDark: "laptop/shared/Lcv-updates-dark.jpg",
          },
        ],
        size: "full",
        caption: "Lenovo Commercial Vantage › Updates",
      },
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them whether the device worked when plugged directly into the laptop, and whether every dock port failed or only one. Those two answers are the whole diagnosis and decide whether it is the dock, the device or the laptop that needs attention.",
    },
  ],
};

export default dockUsbNotWorking;
