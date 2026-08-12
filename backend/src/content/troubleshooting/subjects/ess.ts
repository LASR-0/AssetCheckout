import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                           ESS TAXONOMY                          |
///  +-----------------------------------------------------------------+
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const ess: Subject = {
  key: "ess",
  kind: "app",
  categories: [
    {
      id: "account",
      glyph: "⚿",
      name: "Account access",
      blurb: "Getting into ESS",
      symptoms: [
        { id: "ess-account-locked", label: "My ESS account is locked" },
        { id: "ess-2fa-code", label: "I can't find my ESS two-factor code" },
      ],
    },
  ],
};

export default ess;
