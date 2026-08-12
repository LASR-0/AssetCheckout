import type { Subject } from "../schema.js";

///  +-----------------------------------------------------------------+
///  |                     PRINTER SYMPTOM TAXONOMY                    |
///  +-----------------------------------------------------------------+
//
//  All four are SAFEQ, which is what makes them worth writing — the printers
//  themselves rarely fail, the print service is what people actually hit.
//
//  Two of these are already written and shared with laptops and desktops.
//
//  Everything here is currently a Draft — listed because we intend to cover
//  it, which is the only reason anything appears in a taxonomy. A symptom we
//  never mean to write is left out entirely rather than sitting as a Draft
//  forever, so the badge keeps meaning "not yet" rather than "never".
///  +-----------------------------------------------------------------+

const printer: Subject = {
  key: "printer",
  kind: "device",
  categories: [
    {
      id: "safeq",
      glyph: "⎙",
      name: "Printing & SAFEQ",
      blurb: "Finding printers and releasing jobs",
      symptoms: [
        { id: "printers-missing", label: "I can't find my printers" },
        { id: "print-pin", label: "Where do I find my PIN to print?" },
        { id: "print-cloud-error", label: "I get a cloud error when I try to print" },
        { id: "safeq-connection-error", label: "The printer says the SAFEQ Cloud connection isn't working" },
      ],
    },
  ],
};

export default printer;
