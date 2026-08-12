import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                     EMAIL & OUTLOOK TAXONOMY                    |
///  +-----------------------------------------------------------------+
//
//  Mail that doesn't arrive is rarely Outlook — it is the firewall, a blocked
//  file type, a spreadsheet macro, or quarantine. That is exactly why these
//  are worth writing: the cause sits somewhere the user would never look.
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const outlook: Subject = {
  key: "outlook",
  kind: "app",
  categories: [
    {
      id: "delivery",
      glyph: "✉",
      name: "Mail delivery",
      blurb: "Messages that don't arrive",
      symptoms: [
        { id: "emails-not-arriving", label: "My emails aren't coming through" },
      ],
    },
    {
      id: "performance",
      glyph: "◱",
      name: "Performance",
      blurb: "Outlook running slowly",
      symptoms: [
        { id: "outlook-slow", label: "Outlook Classic is running extremely slowly" },
      ],
    },
  ],
};

export default outlook;
