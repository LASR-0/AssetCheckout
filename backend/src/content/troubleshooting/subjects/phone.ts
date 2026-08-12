import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                    PHONE SYMPTOM TAXONOMY                       |
///  +-----------------------------------------------------------------+
//
//  The list of things that can be wrong with a managed phone. This is the
//  navigation, NOT the library — some of these have no article yet and
//  render as Draft, which is the point: an empty symptom is a visible gap
//  rather than a silent one.
//
//  WE WRITE THE GENERIC ONES TOO, and that reverses the library's original
//  rule. The first pass here said to cover only what is KSB-specific and to
//  link out to Apple or Samsung for everything else. In practice nobody
//  follows the link: a person whose phone won't charge does not open a vendor
//  support site and read it, they ring IT. So the vendor documentation is the
//  SOURCE, not the destination — we rewrite it into our own steps, cite it in
//  the article's `source` field, and the reader never has to leave.
//
//  REBUILT FROM WHAT THE VENDORS ACTUALLY DOCUMENT, replacing the prototype's
//  invented list. Two changes worth knowing about: "Screen is black but the
//  phone vibrates" is gone, because both Apple and Samsung treat that as the
//  same fault as "won't turn on" and answer it with a force restart — two
//  symptoms leading to one set of steps is a way of splitting readers, not
//  helping them. And Accessories has been folded into Power & charging: a
//  charger that doesn't work is a charging problem, and nobody looks for it
//  under a separate heading.
//
//  PAIRED SYMPTOMS WHERE THE PLATFORMS DIVERGE. The fleet is iPhones and
//  Samsungs, and for plenty of faults the two have genuinely different steps
//  — force-restarting an iPhone is a three-button sequence, a Galaxy is a
//  two-button hold. Those get one symptom each, named for the phone the
//  reader is holding, per the rule in schema.ts.
//
//  The line is whether the STEPS differ, not whether a menu has moved. Where
//  the whole procedure is the same and only one settings path differs, it
//  stays a single symptom and that step names both paths — one line, not a
//  hedge running the length of the article. Where the reader would have to
//  skip half of what they were reading, it is two symptoms.
///  +-----------------------------------------------------------------+

const phone: Subject = {
  key: "phone",
  kind: "device",
  categories: [
    {
      id: "power",
      glyph: "⚡",
      name: "Power & charging",
      blurb: "Won't start, won't charge, battery and heat",
      symptoms: [
        // Paired: the force restart sequence is the whole article and the two
        // are nothing like each other.
        { id: "wont-turn-on-ios", label: "My iPhone won't turn on or has frozen" },
        { id: "wont-turn-on-samsung", label: "My Samsung phone won't turn on or has frozen" },
        // Not paired: a cable, a port and a wall socket are the same on both.
        { id: "no-charge", label: "Phone won't charge when plugged in" },
        { id: "battery-drain-ios", label: "My iPhone's battery drains much faster than it used to" },
        { id: "battery-drain-samsung", label: "My Samsung phone's battery drains much faster than it used to" },
        { id: "overheating", label: "Phone gets uncomfortably hot" },
      ],
    },
    {
      id: "display",
      glyph: "▣",
      name: "Display & touch",
      blurb: "Dead touch areas, flickering, cracks",
      symptoms: [
        { id: "touch-dead", label: "Touch is unresponsive in places" },
        { id: "flicker", label: "Display flickers or shows lines" },
        // KSB rather than vendor: what a user needs here is our damage and
        // replacement process, not Apple's repair booking page.
        { id: "cracked", label: "Screen is cracked or damaged" },
      ],
    },
    {
      id: "network",
      glyph: "◈",
      name: "Network & connectivity",
      blurb: "KSB Wi-Fi, mobile data, Bluetooth, calls",
      symptoms: [
        { id: "connect-ksb-mobile-ios", label: "How do I connect my iPhone to KSB-Mobile Wi-Fi?" },
        { id: "connect-ksb-mobile-samsung", label: "How do I connect my Samsung phone to KSB-Mobile Wi-Fi?" },
        { id: "no-data-ios", label: "My iPhone has no mobile data" },
        { id: "no-data-samsung", label: "My Samsung phone has no mobile data" },
        { id: "dropped-calls", label: "Calls drop out or there's no signal" },
        { id: "bluetooth", label: "Bluetooth won't pair" },
      ],
    },
    {
      id: "apps",
      glyph: "◱",
      name: "Apps & compliance",
      blurb: "Company apps, compliance, sign-in and storage",
      symptoms: [
        // The compliance cluster is entirely ours — no vendor documents which
        // of our two management apps a given phone was given, and it is the
        // thing people are most often stuck on.
        { id: "portal", label: "Company Portal or At Work won't sign in" },
        { id: "not-compliant", label: "My phone is showing as not compliant" },
        { id: "install-app", label: "How do I install an approved app?" },
        { id: "crash", label: "An app closes as soon as I open it" },
        { id: "slow", label: "Phone is slow or freezing" },
        { id: "storage", label: "Storage is full" },
      ],
    },
    {
      id: "audio",
      glyph: "◒",
      name: "Audio & camera",
      blurb: "Speaker, microphone and camera faults",
      symptoms: [
        { id: "no-sound", label: "No sound during calls" },
        { id: "mic", label: "Others can't hear me on calls" },
        { id: "camera", label: "Camera won't open or photos are blurry" },
      ],
    },
  ],
};

export default phone;
