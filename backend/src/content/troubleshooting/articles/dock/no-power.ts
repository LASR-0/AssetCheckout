import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |                DOCK — MY DOCK HAS NO POWER                      |
///  +-----------------------------------------------------------------+
//
//  THE MISCONCEPTION IS THE ARTICLE. Every dock here needs its own mains
//  power supply, and a surprising number of people assume the single cable
//  to the laptop powers the dock rather than the other way round. A dock
//  whose PSU has been unplugged, borrowed, or knocked out behind a desk
//  presents as "the dock is dead" and is fixed by looking behind the desk.
//
//  THIRTY SECONDS, NOT TEN. Docks hold enough charge to keep their
//  controller alive through a short unplug, so a quick power-cycle often
//  changes nothing and convinces the reader the step doesn't work. The step
//  gives the number and says why.
//
//  THREE DOCK MODELS, ONE ARTICLE — the same decision as no-display-dock.
//  Universal USB-C, Thunderbolt 4 and Thunderbolt 5 all behave identically
//  from the user's side here.
//
//  TODO — PSU WATTAGE IS NOT STATED ANYWHERE and probably should be. Swapping
//  a Thunderbolt dock's supply for a lower-wattage one from a different dock
//  is a plausible cause we can't currently name precisely. Worth adding the
//  actual figures at review.
///  +-----------------------------------------------------------------+

const dockNoPower: Article = {
  symptomId: "dock-no-power",
  subjectKeys: ["dock"],
  summary:
    "Your dock has its own power supply, the cable to your laptop doesn't power it. Nearly every case of this is that supply being unplugged, switched off, or swapped for the wrong one.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB Lenovo docks",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Find the dock's own power supply and follow it to the wall",
      body: "The dock has a separate mains adapter; a black brick with a round plug that goes into the back of the dock. It is not powered by the cable running to your laptop. Follow that lead from the dock all the way to the socket and check it is plugged in at both ends and the socket is switched on.",
      note: "This is the answer most of the time. Dock power supplies live behind desks where they get pulled out by chairs, knocked out by cleaners, or borrowed by whoever needed a socket. Nobody looks, because the dock is on the desk and the problem is on the floor.",
    },
    {
      title: "Push the round connector firmly into the back of the dock",
      body: "It works loose over time, and it can sit far enough in to look connected while making no contact. Take it out and push it back until it seats properly.",
    },
    {
      title: "Power-cycle it properly; thirty seconds, not five",
      body: "Unplug the dock's power supply at the wall, unplug the cable running to your laptop as well, and leave both out for a full thirty seconds. Then plug the power back in first, and the laptop cable second.",
      note: "The thirty seconds matter. A dock holds enough charge to keep its controller running through a quick unplug, so a fast power-cycle often changes nothing and leaves people thinking the step doesn't work.",
    },
    {
      title: "Check you have the right power supply",
      body: "Dock supplies look alike and get swapped between desks. A supply from a smaller dock or a laptop charger may plug in and deliver too little power to run the dock properly, which shows up as a dock that half works, or doesn't wake at all. If there is any chance yours has been swapped, borrow one from an identical dock and test with that.",
    },
    {
      title: "Try a different wall socket",
      body: "Preferably one on a different circuit, and not through a power board that might itself be switched off. This takes a minute and rules out the room rather than the dock.",
    },
    {
      title: "Still dead? Contact IT",
      body: "Tell them whether any light on the dock comes on at all, and whether the laptop charges when the dock cable is connected. A dock that charges the laptop but does nothing else is a different fault from one that is completely lifeless, and that distinction usually decides whether it is the dock or its power supply that gets replaced.",
      branch: {
        label: "It has power but my screens are blank",
        targetSymptomId: "no-display-dock",
      },
    },
  ],
};

export default dockNoPower;
