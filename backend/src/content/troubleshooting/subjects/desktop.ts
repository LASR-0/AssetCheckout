import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                   DESKTOP SYMPTOM TAXONOMY                      |
///  +-----------------------------------------------------------------+
//
//  Almost identical to the laptop taxonomy, and that is the point: the
//  symptom ids match deliberately so a single article can be listed under
//  both via `subjectKeys` rather than being written out twice. Anything that
//  drifts here has to drift in laptop.ts too or the shared article stops
//  resolving — which the content test will catch.
//
//  Three deliberate differences from laptops:
//
//    * No battery symptoms. A desktop cannot fail to charge.
//    * No docking symptom. Desktops are wired straight to their screens.
//    * "Won't turn on" is its OWN article rather than the shared one. A dead
//      desktop is diagnosed from mains power, the PSU switch and the
//      motherboard's own indicator lights; a dead laptop is diagnosed from
//      its battery and charger. Nothing about the two overlaps except the
//      sentence the user types.
///  +-----------------------------------------------------------------+

const desktop: Subject = {
  key: "desktop",
  kind: "device",
  categories: [
    {
      id: "display",
      glyph: "▣",
      name: "Display",
      blurb: "External screens, cables and how they're arranged",
      symptoms: [
        { id: "no-display-hdmi", label: "My screen won't display over HDMI" },
        { id: "no-display-displayport", label: "My screen won't display over DisplayPort" },
        { id: "screens-wrong-side", label: "My second screen is on the wrong side" },
        { id: "screen-rotated", label: "My screen is rotated the wrong way" },
        { id: "display-flickering", label: "My display is flickering" },
      ],
    },
    {
      id: "network",
      glyph: "◈",
      name: "Network & remote access",
      blurb: "KSB Wi-Fi, working from home, and getting to internal systems",
      symptoms: [
        { id: "connect-ksb-office-wifi", label: "How do I connect to KSB-Office Wi-Fi?" },
        { id: "vpn-from-home", label: "How do I reach internal systems from home?" },
        { id: "wifi-down-ethernet-fine", label: "My ethernet works but my Wi-Fi doesn't" },
      ],
    },
    {
      id: "printing",
      glyph: "⎙",
      name: "Printing",
      blurb: "Finding printers and getting a job to come out",
      symptoms: [
        { id: "printers-missing", label: "I can't find my printers" },
        { id: "print-pin", label: "Where do I find my PIN to print?" },
        // Listed here as well as under Printers: the error appears on this
        // machine when you press print, so this is where people look for it.
        { id: "print-cloud-error", label: "I get a cloud error when I try to print" },
      ],
    },
    {
      id: "access",
      glyph: "⚿",
      name: "Sign-in & access",
      blurb: "Getting into the machine",
      symptoms: [
        {
          id: "lock-screen-blank",
          label: "My lock screen is blank and I can't enter my password or PIN",
        },
      ],
    },
    {
      id: "performance",
      glyph: "◱",
      name: "Apps & performance",
      blurb: "Slowness, unresponsive Windows, and files that won't open",
      symptoms: [
        { id: "apps-slow", label: "My applications are running slow" },
        { id: "taskbar-not-responding", label: "My taskbar isn't responding" },
        { id: "cannot-open-file-type", label: "I can't open a video file (.MOV)" },
      ],
    },
    {
      id: "power",
      glyph: "⚡",
      name: "Power",
      blurb: "Won't start at all",
      symptoms: [
        { id: "wont-turn-on", label: "My computer won't turn on" },
      ],
    },
  ],
};

export default desktop;
