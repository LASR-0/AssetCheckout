import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                       SHAREPOINT TAXONOMY                       |
///  +-----------------------------------------------------------------+
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const sharepoint: Subject = {
  key: "sharepoint",
  kind: "app",
  categories: [
    {
      id: "finding",
      glyph: "⌕",
      name: "Finding things",
      blurb: "Locating documents and sites",
      symptoms: [
        { id: "find-in-sharepoint", label: "Where do I find something in SharePoint?" },
      ],
    },
  ],
};

export default sharepoint;
