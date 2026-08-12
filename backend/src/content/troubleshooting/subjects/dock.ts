import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                      DOCK SYMPTOM TAXONOMY                      |
///  +-----------------------------------------------------------------+
//
//  Reached from the dock rather than from the computer, which is how people
//  describe it when the dock is the thing they suspect. The display symptom
//  shares its article with laptops, desktops and monitors — same id, same
//  content, one place to maintain it.
//
//  Everything else here is a Draft: listed because we intend to cover it.
///  +-----------------------------------------------------------------+

const dock: Subject = {
  key: "dock",
  kind: "device",
  categories: [
    {
      id: "display",
      glyph: "▣",
      name: "Display",
      blurb: "Screens connected through the dock",
      symptoms: [
        { id: "no-display-dock", label: "My screens won't display through the dock" },
      ],
    },
    {
      id: "connection",
      glyph: "◈",
      name: "Power & connections",
      blurb: "The dock itself, and what's plugged into it",
      symptoms: [
        { id: "dock-no-power", label: "My dock has no power" },
        { id: "dock-usb-not-working", label: "The USB ports on my dock aren't working" },
        { id: "dock-ethernet-not-working", label: "The ethernet port on my dock isn't working" },
      ],
    },
  ],
};

export default dock;
