import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                     WEBCAM SYMPTOM TAXONOMY                     |
///  +-----------------------------------------------------------------+
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const webcam: Subject = {
  key: "webcam",
  kind: "device",
  categories: [
    {
      id: "detection",
      glyph: "◉",
      name: "Detection & apps",
      blurb: "Being seen by the computer and by Teams",
      symptoms: [
        { id: "webcam-not-in-teams", label: "My webcam isn't working in Teams" },
        { id: "webcam-not-detected", label: "My webcam isn't picked up by my device" },
      ],
    },
  ],
};

export default webcam;
