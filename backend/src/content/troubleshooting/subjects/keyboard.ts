import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                    KEYBOARD SYMPTOM TAXONOMY                    |
///  +-----------------------------------------------------------------+
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const keyboard: Subject = {
  key: "keyboard",
  kind: "device",
  categories: [
    {
      id: "connection",
      glyph: "◈",
      name: "Keys & connection",
      blurb: "Dead keys and pairing",
      symptoms: [
        { id: "keys-not-working", label: "Some of my keys don't work" },
        { id: "keyboard-wont-connect", label: "My keyboard won't connect to my device" },
      ],
    },
  ],
};

export default keyboard;
