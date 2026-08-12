import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                           SAP TAXONOMY                          |
///  +-----------------------------------------------------------------+
//
//  Both of these end at the service portal rather than in a fix the user can
//  apply themselves. That is still worth an article — knowing WHICH form to
//  raise, and that it is a form rather than a phone call, is most of the
//  delay.
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const sap: Subject = {
  key: "sap",
  kind: "app",
  categories: [
    {
      id: "account",
      glyph: "⚿",
      name: "Account access",
      blurb: "Passwords and locked accounts",
      symptoms: [
        { id: "sap-reset-password", label: "I need to reset my SAP password" },
        { id: "sap-unlock-account", label: "I need to unlock my SAP account" },
      ],
    },
  ],
};

export default sap;
