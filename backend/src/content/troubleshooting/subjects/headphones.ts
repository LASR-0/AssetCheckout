import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                     HEADSET SYMPTOM TAXONOMY                    |
///  +-----------------------------------------------------------------+
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const headphones: Subject = {
  key: "headphones",
  kind: "device",
  categories: [
    {
      id: "connection",
      glyph: "◈",
      name: "Connection & audio",
      blurb: "Pairing, and being heard on calls",
      symptoms: [
        { id: "headset-wont-connect", label: "My headphones won't connect to my device" },
        { id: "headset-not-in-teams", label: "My headphones don't work in Teams" },
      ],
    },
  ],
};

export default headphones;
