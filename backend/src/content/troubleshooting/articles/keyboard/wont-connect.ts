import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |     KEYBOARD — MY KEYBOARD WON'T CONNECT TO MY DEVICE           |
///  +-----------------------------------------------------------------+
//
//  THE SAME SHAPE AS mouse-wont-connect BECAUSE THE FAULTS ARE THE SAME:
//  two kinds of wireless, a receiver that gets knocked out, batteries that go
//  flat, a stale pairing. Written separately rather than shared because the
//  one step that differs is the one that matters — you cannot type your way
//  through a Bluetooth pairing dialogue with the keyboard you are trying to
//  pair, and the article has to say so before the reader is stuck.
//
//  STEP 1 IS ABOUT NOT PAINTING YOURSELF INTO A CORNER. A user who removes
//  their only keyboard's pairing on a desktop, with no touchscreen and no
//  second keyboard, cannot complete the next step or undo the last one. That
//  warning has to arrive before the instruction, not after it.
//
//  A WIRED KEYBOARD IS THE FASTEST FIX AVAILABLE for anyone who needs to keep
//  working, and it is listed as a real step rather than a consolation. IT
//  keeps spares and it takes a minute.
///  +-----------------------------------------------------------------+

const keyboardWontConnect: Article = {
  symptomId: "keyboard-wont-connect",
  subjectKeys: ["keyboard"],
  summary:
    "Check which kind you have and get a wired keyboard first if you need to keep working — some of these steps need a keyboard you can already type on.",
  timeEstimate: "About 10 minutes",
  appliesTo: "KSB wireless keyboards",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Get hold of a wired keyboard before you change anything",
      body: "Some of the steps below need you to type or to click through dialogues, and you cannot do either with the keyboard you are trying to fix. On a laptop the built-in keyboard covers you. On a desktop, borrow a wired USB keyboard first — IT keeps spares and it plugs straight in with nothing to set up.",
      warn: "Don't remove the pairing for your only keyboard on a machine that has no other keyboard attached. You will not be able to complete the pairing that follows, or undo what you just did.",
    },
    {
      title: "Work out which kind of keyboard you have",
      body: "Look for a small USB receiver plugged into the machine or the back of the dock — a stub barely bigger than the socket. If there is one, the keyboard talks to that and will never show up in Bluetooth settings. If there is no receiver anywhere, it is a Bluetooth keyboard.",
      note: "A keyboard and mouse sold as a set often share one receiver. If your mouse still works, the receiver is present and working, and the problem is the keyboard alone.",
    },
    {
      title: "Change the batteries and check the switch underneath",
      body: "Do this before any pairing steps. A keyboard low on power connects and then drops, or refuses to pair while still showing a light. Turn it over: there is usually a power switch, and on a new keyboard a plastic tab to pull out from beside the batteries.",
    },
    {
      title: "If it has a receiver, reseat it somewhere better",
      body: "Take the receiver out and put it into a port on the front or side of the dock rather than one tucked behind a monitor. A screen between the receiver and the keyboard is enough to make it unreliable.",
      branch: {
        label: "None of the USB ports on my dock are working",
        targetSymptomId: "dock-usb-not-working",
        // Pinned: the dock symptoms live under the dock subject, not here.
        targetSubjectKey: "dock",
      },
    },
    {
      title: "If it's Bluetooth, remove the pairing and add it again",
      body: "With your wired keyboard connected, open Settings › Bluetooth & devices, find the keyboard, and choose Remove device. Then hold the keyboard's pairing button — usually underneath or along the top edge — until its light flashes, and add it as a new device.",
      note: "Bluetooth keyboards often ask you to type a short code and press Enter to confirm the pairing. Type it on the keyboard you are pairing, not the wired one — that is the step people get wrong, and it fails silently.",
      figure: {
        caption:
          "Settings › Bluetooth & devices › Remove device, then Add device",
      },
    },
    {
      title: "Test it on another machine",
      body: "Take the keyboard and its receiver to another laptop. Working there means the keyboard is fine and the problem is your machine; failing there too means the keyboard is.",
    },
    {
      title: "Still nothing? Contact IT",
      body: "Tell them whether it is Bluetooth or a receiver, whether fresh batteries changed anything, and whether it worked elsewhere. Keep the wired keyboard until it is sorted — there is no reason to be stuck in the meantime.",
    },
  ],
};

export default keyboardWontConnect;
