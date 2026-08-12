import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                      MOUSE SYMPTOM TAXONOMY                     |
///  +-----------------------------------------------------------------+
//
//  Small on purpose. Wireless mice fail in three ways — flat, unpaired, or a
//  surface the sensor can't read — and the rest is generic enough that
//  writing it would add maintenance without adding value.
//
//  All Drafts for now.
///  +-----------------------------------------------------------------+

const mouse: Subject = {
  key: "mouse",
  kind: "device",
  categories: [
    {
      id: "connection",
      glyph: "◈",
      name: "Connection & movement",
      blurb: "Pairing, batteries and erratic pointers",
      symptoms: [
        { id: "mouse-wont-connect", label: "My mouse won't connect to my device" },
        { id: "mouse-not-moving", label: "My mouse pointer doesn't move or jumps around" },
        { id: "mouse-battery", label: "My mouse keeps running out of battery" },
      ],
    },
  ],
};

export default mouse;
