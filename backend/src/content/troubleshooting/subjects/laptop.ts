import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                    LAPTOP SYMPTOM TAXONOMY                      |
///  +-----------------------------------------------------------------+
//
//  The things that can be wrong with a KSB laptop, as users describe them.
//
//  ONLY WHAT WE INTEND TO COVER IS LISTED. A symptom here is a commitment to
//  write it up, not a catalogue of everything a laptop can do wrong. Listing
//  the rest and marking them Draft forever would turn the Draft badge into
//  noise, and it would blunt the no-match search metric — which is only
//  useful if "no match" honestly means "we don't cover this".
//
//  SEVERAL OF THESE ARE SHARED. Desktops have all but three of them, and the
//  display and docking symptoms belong to monitors and docks as well. Those
//  articles will list every subject they serve via `subjectKeys` rather than
//  being written out again per device — see the note in schema.ts. The
//  symptom ids here are therefore chosen to read correctly from any of those
//  entry points, not just from a laptop.
///  +-----------------------------------------------------------------+

const laptop: Subject = {
  key: "laptop",
  kind: "device",
  categories: [
    {
      id: "display",
      glyph: "▣",
      name: "Display & docking",
      blurb: "External screens, docks, cables and how they're arranged",
      symptoms: [
        { id: "no-display-dock", label: "My screens won't display through the dock" },
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
        {
          id: "cannot-open-file-type",
          label: "I can't open a video file (.MOV)",
        },
      ],
    },
    {
      id: "power",
      glyph: "⚡",
      name: "Power & charging",
      blurb: "Won't start, won't charge, running hot",
      symptoms: [
        { id: "wont-turn-on", label: "My laptop won't turn on" },
        { id: "not-charging", label: "My laptop isn't charging" },
        { id: "overheating", label: "My laptop is overheating" },
      ],
    },
  ],
};

export default laptop;
