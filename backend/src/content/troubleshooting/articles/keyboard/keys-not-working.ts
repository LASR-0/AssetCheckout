import type { Article } from "../../schema.js";

///  +-----------------------------------------------------------------+
///  |        KEYBOARD — SOME OF MY KEYS DON'T WORK                    |
///  +-----------------------------------------------------------------+
//
//  WHICH KEYS FAILED IS THE DIAGNOSIS, and that is why step 1 asks rather
//  than starting on fixes. A scattering of unrelated dead keys is dirt or
//  hardware. The number pad alone is Num Lock. Quotation marks and the @ sign
//  swapping places is the keyboard layout, not the keyboard. Three completely
//  different causes presenting as one complaint, and the reader can tell them
//  apart faster than any test can.
//
//  THE LAYOUT CASE DESERVES ITS OWN STEP because it is the one nobody guesses
//  and the one that gets keyboards replaced unnecessarily. A machine that has
//  picked up a US layout puts @ and " in each other's places and moves the
//  hash and pound signs — every key "works", but several type the wrong
//  thing, and it is a two-second fix once you know.
//
//  THE STUCK MODIFIER IN STEP 5 IS RARE AND VERY CONFUSING when it happens. A
//  modifier key held down electrically turns ordinary typing into shortcuts,
//  so keys appear dead while actually doing something invisible.
//
//  DELIBERATELY NOT ABOUT LIQUID. A keyboard that has had a drink in it is a
//  replacement, and the last step says so rather than pretending otherwise.
///  +-----------------------------------------------------------------+

const keysNotWorking: Article = {
  symptomId: "keys-not-working",
  subjectKeys: ["keyboard"],
  summary:
    "Which keys stopped tells you the cause. Scattered dead keys are dirt or hardware; the number pad alone is Num Lock; wrong characters are the layout, not the keyboard.",
  timeEstimate: "About 15 minutes",
  appliesTo: "KSB keyboards",
  updated: "2026-08-11",
  before: [],
  steps: [
    {
      title: "Notice which keys are affected",
      body: "Scattered individual keys with nothing in common point at dirt or a hardware fault. The whole number pad points at Num Lock. Keys that type the wrong character rather than nothing point at the layout. Work out which of the three you have before doing anything else; the fixes have nothing in common.",
    },
    {
      title: "If it's the number pad, press Num Lock",
      body: "It is the key above the 7 on the number pad, sometimes labelled just Num. With it off, the number pad works as arrows and Home and End instead of numbers, which reads as the whole pad being dead. Press it once and watch for the small indicator light.",
      note: "Laptops sometimes fold a number pad into the letter keys, reached with the Fn key. On those, Num Lock turns a patch of ordinary letters into numbers, which looks like several keys typing the wrong thing for no reason.",
    },
    {
      title: "If keys type the wrong character, it's the layout",
      body: 'The classic sign is @ and " swapping places, and the hash and pound signs moving. Nothing is wrong with the keyboard; Windows has picked up a US layout. Click the language indicator at the right-hand end of the taskbar, near the clock, and switch back to English (Australia). If there is no indicator, it is at Settings › Time & language › Language & region.',
      note: "This happens by itself after some updates, and it can be toggled accidentally with a keyboard shortcut. Nobody guesses it, and keyboards get replaced over it.",
      figure: { caption: "Taskbar › language indicator › English (Australia)" },
    },
    {
      title: "Turn it over and shake it out",
      body: "Unplug it or switch it off first, turn it upside down over a bin, and give it a firm shake and a few taps on the base. Crumbs and dust under a keycap are the commonest cause of a handful of unrelated dead keys. A short burst of compressed air around the affected keys helps if you have some.",
      warn: "Don't lever keycaps off to clean underneath. The clips beneath are brittle and snap easily, and a keyboard with a broken clip needs replacing rather than cleaning, which is a worse outcome than the sticky key you started with.",
    },
    {
      title: "Tap each modifier key once",
      body: "Press and release Shift, Ctrl, Alt and the Windows key individually, on both sides of the keyboard. A modifier stuck down electrically turns everything you type into shortcuts, so ordinary keys appear to do nothing at all while quietly triggering something else. Tapping each one clears it.",
    },
    {
      title: "Test the same keys on another keyboard",
      body: "Plug in a wired keyboard, or use the laptop's built-in one, and try the keys that failed. If they work there; the keyboard is at fault. If they fail there too, something on the machine is intercepting them and it is not a hardware problem at all.",
      branch: {
        label: "The keyboard has stopped connecting altogether",
        targetSymptomId: "keyboard-wont-connect",
      },
    },
    {
      title: "Still dead? Contact IT",
      body: "Tell them which keys, and whether they also fail on a different keyboard. If anything has been spilled on it, say so plainly; liquid damage isn't something to clean up and carry on with, and a keyboard that has had a drink in it gets replaced rather than repaired.",
    },
  ],
};

export default keysNotWorking;
