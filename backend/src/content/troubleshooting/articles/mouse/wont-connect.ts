import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |        MOUSE — MY MOUSE WON'T CONNECT TO MY DEVICE              |
///  +-----------------------------------------------------------------+
//
//  TWO KINDS OF WIRELESS MOUSE AND THEY FAIL DIFFERENTLY, which is why step 1
//  is a question rather than an instruction. A Bluetooth mouse pairs through
//  Windows; a mouse with its own little USB receiver does not appear in
//  Bluetooth settings at all, and a reader hunting for it there will never
//  find it and will conclude the mouse is dead.
//
//  THE RECEIVER IS THE FIRST THING TO CHECK on the second kind, because they
//  live in dock ports behind monitors and get knocked out, borrowed, or left
//  plugged into a laptop that went home in someone's bag.
//
//  BATTERIES BEFORE PAIRING. A mouse low on charge behaves exactly like one
//  that will not pair — an LED that lights briefly and then nothing — and
//  swapping the batteries is faster than any of the pairing steps.
//
//  KEPT SEPARATE FROM mouse-not-moving deliberately: a mouse that connects
//  and tracks badly is a surface and sensor problem, and mixing the two would
//  give both audiences an article that is half irrelevant.
///  +-----------------------------------------------------------------+

const mouseWontConnect: Article = {
  symptomId: "mouse-wont-connect",
  subjectKeys: ["mouse"],
  summary:
    "Check which kind you have first, a Bluetooth mouse and one with its own USB receiver fail in completely different ways, and looking in the wrong place wastes the most time.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB wireless mice",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Work out which kind of mouse you have",
      body: "Look for a small USB receiver, a stub barely bigger than the socket, plugged into your laptop or the back of your dock. If there is one, yours talks to that rather than to Bluetooth, and it will never appear in Bluetooth settings. If there is no receiver anywhere, it is a Bluetooth mouse.",
      note: "Some mice do both and have a switch underneath to choose. If yours has a switch marked with a Bluetooth symbol and a number, check which position it is in; it gets knocked when the mouse goes in a bag.",
    },
    {
      title: "Change the batteries, or charge it",
      body: "Do this before anything else. A mouse low on power behaves exactly like one that cannot connect, a light that flickers on and then nothing at all, and fresh batteries take thirty seconds where the pairing steps take ten minutes.",
      note: "Rechargeable mice need long enough on the cable to matter. Ten minutes is not enough to tell you anything; give it half an hour.",
    },
    {
      title: "Check the mouse is actually switched on",
      body: "Turn it over. Most have a slider or button underneath, and it gets pushed as the mouse is moved around a desk or carried. While you are there, peel off the little plastic tab if the mouse is new; batteries ship with an insulating strip that has to come out.",
    },
    {
      title: "If it has a USB receiver, move it and reseat it",
      body: "Take the receiver out and put it back in a different port; ideally one on the front or side of the dock rather than tucked round the back behind a monitor. Distance and metal both matter more than they should with these, and a receiver behind a screen is working through the screen.",
      branch: {
        label: "None of the USB ports on my dock are working",
        targetSymptomId: "dock-usb-not-working",
        // Pinned: the dock symptoms live under the dock subject, not here.
        targetSubjectKey: "dock",
      },
    },
    {
      title: "If it's Bluetooth, remove the old pairing and add it again",
      body: "Open Settings › Bluetooth & devices, find the mouse, and choose Remove device. Then put the mouse back into pairing mode, usually a small button underneath held until its light flashes, and add it as a new device.",
      note: "You will need another way to click while doing this. The touchpad on a laptop still works, and Windows can be driven from the keyboard with Tab and the arrow keys if you are on a desktop with nothing else to hand.",
      figure: {
        caption:
          "Settings › Bluetooth & devices › Remove device, then Add device",
      },
    },
    {
      title: "Test it on another machine",
      body: "Take the mouse, and the receiver if it has one, to another laptop. If it works there; the mouse is fine and the problem is your machine. If it fails there too; the mouse is the problem, and either answer saves IT from starting at the beginning.",
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them whether it is a Bluetooth mouse or one with a receiver, whether fresh batteries changed anything, and whether it worked on another machine. Mice are cheap and quickly swapped, so this is usually a short conversation.",
    },
  ],
};

export default mouseWontConnect;
