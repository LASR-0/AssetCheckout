import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |   DOCK — THE ETHERNET PORT ON MY DOCK ISN'T WORKING             |
///  +-----------------------------------------------------------------+
//
//  THE READER USUALLY HASN'T NOTICED THEY ARE STILL ONLINE. Wi-Fi keeps
//  working when the dock's ethernet fails, so this rarely arrives as "I have
//  no internet" — it arrives as an internal site not loading, or a share
//  being slow. Step 1 asks what actually isn't working, because if the answer
//  is "an internal system" then ethernet is a red herring and the VPN is the
//  real subject.
//
//  THE LINK LIGHTS ARE THE CHEAPEST DIAGNOSTIC IN ANY OF THESE ARTICLES and
//  almost nobody looks at them. Dark lights mean nothing is reaching the
//  socket — a cable, a patch lead or a dead wall port — and lit ones mean the
//  physical side is fine and the fault is further up. That halves the article
//  in about two seconds.
//
//  THE WALL PORT IS NAMED EXPLICITLY because a surprising share of these are
//  a desk that was moved to a position whose floor port was never patched
//  through. Nothing about the dock is wrong, and no amount of dock
//  troubleshooting will ever reveal it.
///  +-----------------------------------------------------------------+

const dockEthernetNotWorking: Article = {
  symptomId: "dock-ethernet-not-working",
  subjectKeys: ["dock"],
  summary:
    "Check the little lights beside the dock's network socket first; they tell you in two seconds whether this is a cable, a wall port, or something further up.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB Lenovo docks",
  updated: "2026-08-11",
  before: ["The dock has power and your screens are working through it"],
  steps: [
    {
      title: "Work out what actually isn't working",
      body: "If ordinary websites load but an internal system doesn't, this isn't an ethernet problem at all; internal systems have .intern in the address and need the VPN whether you are wired or not. If nothing loads anywhere, keep going.",
      note: "Worth thirty seconds before anything else. Wi-Fi carries on working when the dock's ethernet fails, so most people arrive here still fully online without realising it, having assumed the wired connection was what one particular thing needed.",
    },
    {
      title: "Look at the lights beside the dock's network socket",
      body: "There are one or two small LEDs at the socket itself. Lit or blinking means a live connection is reaching the dock and the physical side is fine. Completely dark means nothing is getting through, a cable, the patch lead, or the wall port.",
    },
    {
      title: "Reseat both ends of the network cable",
      body: "Push it in at the dock and at the wall until each end clicks. The plastic clip on these snaps off with use, and a cable with a broken clip sits in the socket looking perfectly seated while making no contact at all; check the clip while you have it in your hand.",
      note: "A cable with a snapped clip is worth replacing rather than pushing back in. It will do this again next week.",
    },
    {
      title: "Try a different wall port, and a cable you know works",
      body: "Change one at a time. If your desk has been moved recently, try the port at a colleague's desk you know is live; floor and wall ports are patched through individually, and a desk moved to a new position often sits next to one that was never connected to anything.",
      note: "If it works at another desk with the same cable and dock, nothing you own is broken and the message to IT is about the port, not the equipment.",
    },
    {
      title: "Power-cycle the dock",
      body: "Unplug the dock's power supply at the wall and the cable to your laptop, leave both out for a full thirty seconds, then reconnect power first and the laptop second.",
      branch: {
        label: "The dock has no power at all",
        targetSymptomId: "dock-no-power",
      },
    },
    {
      title:
        "Update the dock firmware with Lenovo Commercial Vantage, then restart",
      body: "Open Lenovo Commercial Vantage from the Start menu, install anything it offers, and restart the laptop from the Start menu with the dock still connected. The dock's network adapter has its own driver and its own firmware, and both come through Vantage.",
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
      title: "Still no connection? Contact IT",
      body: "Tell them whether the lights at the dock socket were lit, and whether the same cable worked at another desk. Dark lights at every desk points at the dock; lit lights with no connection points at the network; working elsewhere points at your wall port.",
    },
  ],
};

export default dockEthernetNotWorking;
