import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                        ONEDRIVE TAXONOMY                        |
///  +-----------------------------------------------------------------+
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const onedrive: Subject = {
  key: "onedrive",
  kind: "app",
  categories: [
    {
      id: "sync",
      glyph: "↻",
      name: "Syncing",
      blurb: "Files not keeping up with the cloud",
      symptoms: [
        { id: "onedrive-not-syncing", label: "My OneDrive isn't syncing" },
        { id: "onedrive-disk-space", label: "OneDrive can't open a file because of disk space" },
        { id: "onedrive-path-too-long", label: "My OneDrive shortcut won't work" },
      ],
    },
    {
      id: "sharing",
      glyph: "◇",
      name: "Sharing files",
      blurb: "Getting large files to and from people",
      symptoms: [
        { id: "share-large-file", label: "How do I share a large file with someone?" },
        { id: "receive-large-file", label: "How does someone share a large file with me?" },
      ],
    },
  ],
};

export default onedrive;
