import type { Request } from "@/types/requestType";
import type { Accent } from "@/components/ui/pills";
import { iconForCategory } from "@/lib/categoryIcon";
import { kindOf } from "@/lib/route";
import { dayDate } from "@/lib/format";

///  +-----------------------------------------------------------------+
///  |              HOW A REQUEST IS NAMED ON SCREEN                   |
///  +-----------------------------------------------------------------+
//
//  The same three things wherever a request appears (Home's lists, the
//  inspector, the request log): what it is, what kind of request it is, and
//  the kind's identity colour. One place, so "Standard asset" never reads
//  "Standard device" on another page.
//
//  KIND COLOURS are the four identity slots, in the designs' order:
//  standard (id1), non-standard (id2), correction (id3), loan (id4).
///  +-----------------------------------------------------------------+

/** What the request is for: the model when there is one, else the category. */
export function requestTitle(r: Request): string {
  return (
    r.modelRequest?.modelName?.trim() ||
    r.accessoryOptionDisplay?.trim() ||
    r.loan?.accessoryName?.trim() ||
    r.categoryName
  );
}

const CORRECTION_LABEL = {
  WRONG_MODEL: "wrong details",
  NO_LONGER_HELD: "no longer held",
  UNLOGGED: "unrecorded item",
} as const;

/** "Standard asset", "Non-standard accessory", "Loan · 14–25 Jul", … */
export function kindLabel(r: Request): string {
  const kind = kindOf(r);
  if (kind === "CORRECTION") {
    const k = r.correctionDetail?.correctionKind;
    return k ? `Correction · ${CORRECTION_LABEL[k]}` : "Correction";
  }
  if (kind === "LOAN") {
    if (!r.loan) return "Loan";
    const from = dayDate(r.loan.startDate);
    const to = dayDate(r.loan.endDate);
    // "14–25 Jul" when both ends share a month, "28 Jul – 3 Aug" otherwise.
    const [fd, fm] = from.split(" ");
    const [td, tm] = to.split(" ");
    if (from === to) return `Loan · ${from}`;
    return fm === tm ? `Loan · ${fd}–${td} ${tm}` : `Loan · ${from} – ${to}`;
  }
  const standard = r.requestType === "NON_STANDARD" ? "Non-standard" : "Standard";
  return `${standard} ${kind === "ACCESSORY" ? "accessory" : "asset"}`;
}

export function kindAccent(r: Request): Accent {
  const kind = kindOf(r);
  if (kind === "CORRECTION") return "id3";
  if (kind === "LOAN") return "id4";
  return r.requestType === "NON_STANDARD" ? "id2" : "id1";
}

export function requestIcon(r: Request): string {
  return kindOf(r) === "CORRECTION" ? "rule" : iconForCategory(r.categoryName);
}
