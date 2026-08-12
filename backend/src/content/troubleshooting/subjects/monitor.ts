import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                     MONITOR SYMPTOM TAXONOMY                    |
///  +-----------------------------------------------------------------+
//
//  Almost entirely shared with laptops and desktops — the same display
//  symptoms, reached from the screen rather than from the computer. The ids
//  match laptop.ts and desktop.ts deliberately so one article serves all
//  three through `subjectKeys`.
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const monitor: Subject = {
  key: "monitor",
  kind: "device",
  categories: [
    {
      id: "display",
      glyph: "▣",
      name: "Picture & signal",
      blurb: "Nothing on screen, or the wrong picture",
      symptoms: [
        { id: "no-display-dock", label: "My screens won't display through the dock" },
        { id: "no-display-hdmi", label: "My screen won't display over HDMI" },
        { id: "no-display-displayport", label: "My screen won't display over DisplayPort" },
        { id: "display-flickering", label: "My display is flickering" },
        { id: "monitor-wont-turn-on", label: "My screen won't turn on" },
      ],
    },
    {
      id: "arrangement",
      glyph: "◫",
      name: "Arrangement",
      blurb: "Where the screens are and which way up",
      symptoms: [
        { id: "screens-wrong-side", label: "My second screen is on the wrong side" },
        { id: "screen-rotated", label: "My screen is rotated the wrong way" },
      ],
    },
  ],
};

export default monitor;
