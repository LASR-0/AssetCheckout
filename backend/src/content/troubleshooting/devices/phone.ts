import type { Device } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                    PHONE SYMPTOM TAXONOMY                       |
///  +-----------------------------------------------------------------+
//
//  The list of things that can be wrong with a managed phone. This is the
//  navigation, NOT the library — most of these have no article yet and
//  render as Draft, which is the point: an empty symptom is a visible gap
//  rather than a silent one.
//
//  Not every symptom here will ever get an article. The rule for the content
//  inventory is to write one only where KSB-specific knowledge is the point,
//  and to link out for everything generic. "Storage is full" on an iPhone is
//  solved better by Apple's own page; "Won't connect to KSB Wi-Fi" is about
//  KSB-Corp vs KSB-Guest vs KSB-Site, certificate auth and Intune
//  compliance, and exists nowhere else.
///  +-----------------------------------------------------------------+

const phone: Device = {
  key: "phone",
  categories: [
    {
      id: "power",
      glyph: "⚡",
      name: "Power & charging",
      blurb: "Won't start, won't charge, battery drains",
      symptoms: [
        { id: "no-power", label: "Phone won't turn on" },
        { id: "battery-drain", label: "Battery drains much faster than usual" },
        { id: "no-charge", label: "Won't charge when plugged in" },
        { id: "hot", label: "Gets hot while charging" },
      ],
    },
    {
      id: "display",
      glyph: "▣",
      name: "Display & touch",
      blurb: "Black screen, dead touch areas, cracks",
      symptoms: [
        { id: "black-screen", label: "Screen is black but the phone vibrates" },
        { id: "touch-dead", label: "Touch is unresponsive in places" },
        { id: "cracked", label: "Screen is cracked or damaged" },
        { id: "flicker", label: "Display flickers or shows lines" },
      ],
    },
    {
      id: "network",
      glyph: "◈",
      name: "Network & connectivity",
      blurb: "Wi-Fi, mobile data, Bluetooth, calls",
      symptoms: [
        { id: "wifi", label: "Won't connect to KSB Wi-Fi" },
        { id: "no-data", label: "No mobile data" },
        { id: "bluetooth", label: "Bluetooth won't pair" },
        { id: "dropped-calls", label: "Calls drop constantly" },
      ],
    },
    {
      id: "apps",
      glyph: "◱",
      name: "Apps & performance",
      blurb: "Sign-in failures, crashes, slowness, storage",
      symptoms: [
        { id: "portal", label: "Company Portal won't sign in" },
        { id: "crash", label: "An app crashes on launch" },
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
        { id: "mic", label: "Others can't hear me" },
        { id: "camera", label: "Camera is blurry or won't open" },
      ],
    },
    {
      id: "accessories",
      glyph: "◇",
      name: "Accessories",
      blurb: "Chargers, cables, cases and adapters",
      symptoms: [
        { id: "cable", label: "Charger or cable not working" },
        { id: "case", label: "Case or screen protector issue" },
      ],
    },
  ],
};

export default phone;
