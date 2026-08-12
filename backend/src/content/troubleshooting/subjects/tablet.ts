import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                   TABLET SYMPTOM TAXONOMY                       |
///  +-----------------------------------------------------------------+
//
//  IPADS ONLY. There are no Android tablets at KSB, which is the single most
//  useful thing to know about this file — the prototype taxonomy this
//  replaced listed an Android tablet symptom beside every iPad one, doubling
//  the list for a fleet that does not exist.
//
//  THE SYMPTOM IDS ARE THE PHONE'S IDS ON PURPOSE. Almost every article here
//  is shared with the phone subject rather than duplicated, which is what
//  `Article.subjectKeys` is for: a cracked iPad and a cracked iPhone follow
//  the same KSB process, and a full iPad is emptied exactly like a full
//  iPhone. Sharing the id is what makes sharing the article possible, since
//  an article's symptom must exist in every subject it claims.
//
//  THE LABEL IS WHERE THEY DIVERGE. The id `wont-turn-on-ios` is labelled
//  "My iPhone..." under phones and "My iPad..." here — the label lives in the
//  taxonomy, not the article, so one article can be introduced in the
//  reader's own words under each subject. That is also why the iOS articles
//  are `-ios` rather than `-iphone`.
//
//  WHAT IS DELIBERATELY ABSENT:
//
//    * Calls and signal. An iPad makes Teams calls, not phone calls, so
//      "calls drop out" is a phone symptom and stays there.
//    * "No sound during calls". The phone article turns on the earpiece
//      grille and on testing the loudspeaker against it, and an iPad has no
//      earpiece. Sharing it would send iPad readers looking for a slot that
//      isn't there. Worth its own article later.
//    * Every Samsung-paired symptom, for the obvious reason.
//
//  MOBILE DATA IS LISTED EVEN THOUGH ONLY SOME IPADS HAVE IT. Staff who
//  travel to sites get a cellular plan and staff who stay in the plants do
//  not, and somebody in the second group hitting this symptom needs to be
//  told that rather than left guessing — which the article does in its
//  opening step.
///  +-----------------------------------------------------------------+

const tablet: Subject = {
  key: "tablet",
  kind: "device",
  categories: [
    {
      id: "power",
      glyph: "⚡",
      name: "Power & charging",
      blurb: "Won't start, won't charge, battery and heat",
      symptoms: [
        { id: "wont-turn-on-ios", label: "My iPad won't turn on or has frozen" },
        { id: "no-charge", label: "iPad won't charge when plugged in" },
        { id: "battery-drain-ios", label: "My iPad's battery drains much faster than it used to" },
        { id: "overheating", label: "iPad gets uncomfortably hot" },
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
        { id: "cracked", label: "Screen is cracked or damaged" },
      ],
    },
    {
      id: "network",
      glyph: "◈",
      name: "Network & connectivity",
      blurb: "KSB Wi-Fi, mobile data and Bluetooth",
      symptoms: [
        { id: "connect-ksb-mobile-ios", label: "How do I connect my iPad to KSB-Mobile Wi-Fi?" },
        { id: "no-data-ios", label: "My iPad has no mobile data" },
        { id: "bluetooth", label: "Bluetooth won't pair" },
      ],
    },
    {
      id: "apps",
      glyph: "◱",
      name: "Apps & compliance",
      blurb: "Company apps, compliance, sign-in and storage",
      symptoms: [
        { id: "portal", label: "Company Portal or At Work won't sign in" },
        { id: "not-compliant", label: "My iPad is showing as not compliant" },
        { id: "install-app", label: "How do I install an approved app?" },
        { id: "crash", label: "An app closes as soon as I open it" },
        { id: "slow", label: "iPad is slow or freezing" },
        { id: "storage", label: "Storage is full" },
      ],
    },
    {
      id: "audio",
      glyph: "◒",
      name: "Audio & camera",
      blurb: "Microphone and camera faults",
      symptoms: [
        { id: "mic", label: "Others can't hear me on calls" },
        { id: "camera", label: "Camera won't open or photos are blurry" },
      ],
    },
  ],
};

export default tablet;
