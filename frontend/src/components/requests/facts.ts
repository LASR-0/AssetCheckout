import type { NoLongerHeldReason, Request, WrongField } from "@/types/requestType";
import { kindOf, stepsFor } from "@/lib/route";
import { parseReason } from "@/lib/reason";
import { dayDate } from "@/lib/format";
import { formatStartShort, isStartPending } from "@/lib/startDate";
import { money } from "./copy";

///  +-----------------------------------------------------------------+
///  |                  THE DOCKET'S "REQUEST" TRAY                    |
///  +-----------------------------------------------------------------+
//
//  Everything the row had no room for, as label and value: why, what
//  exactly, who approves, how it reaches them. Only the lines a request
//  actually has; a standard laptop shows four, a self-bought accessory nine.
///  +-----------------------------------------------------------------+

export type Fact = { k: string; v: string; mono?: boolean };

const GONE: Record<NoLongerHeldReason, string> = {
  RETURNED: "Returned",
  LOST: "Lost or stolen",
  SWAPPED: "Swapped for another",
  GAVE_AWAY: "Gave it to someone else",
  OTHER: "Other",
};

const FIELD: Record<WrongField, string> = { SERIAL: "Serial", MODEL: "Model", OTHER: "Something else" };

/** The original reason, without the rejection note a reject writes into it. */
export function originalReason(r: Request): string | null {
  const p = parseReason(r.reason);
  return p?.request ?? p?.plain ?? null;
}

function phoneLine(r: Request): string | null {
  const parts: string[] = [];
  if (r.callText) parts.push("Call & text");
  else if (r.needsData) parts.push("Data only");
  const isNew = r.numberOption ? r.numberOption === "NEW" : !!r.newNumber;
  const reuse = r.numberOption === "REUSE" || !!r.reuseNumberPhone;
  if (isNew) parts.push("new number");
  else if (reuse) parts.push(`existing number${r.reuseNumberPhone ? ` ${r.reuseNumberPhone}` : ""}`);
  return parts.length ? parts.join(" · ") : null;
}

export function factsOf(r: Request): Fact[] {
  const out: Fact[] = [];
  const add = (k: string, v: string | null | undefined, mono?: boolean) => {
    if (v && v.trim()) out.push({ k, v: v.trim(), mono });
  };
  const kind = kindOf(r);
  const c = r.correctionDetail;

  add("Reason", kind === "CORRECTION" ? null : originalReason(r));
  add("What they said", c?.description);
  add("Option", r.accessoryOptionDisplay ?? r.accessoryOption);
  add("Model in mind", r.preferredModel);
  add("Phone", phoneLine(r));
  if (r.quoteDetail) {
    const q = r.quoteDetail;
    add("Quote", [money(q.amount), q.supplier, q.reference].filter(Boolean).join(" · "));
  }
  if (r.modelRequest?.modelName && kind === "ASSET") add("Model", r.modelRequest.modelName);
  if (r.accessoryLinkedLabel || (kind === "ACCESSORY" && r.modelRequest?.snipeAccessoryId != null)) {
    add("Accessory", [r.accessoryLinkedLabel ?? r.modelRequest?.modelName, r.accessoryLocationName].filter(Boolean).join(" · "));
  }
  const sp = r.selfProcured;
  if (sp?.itemName) add("Bought", [sp.itemName, sp.cost != null ? money(sp.cost) : null].filter(Boolean).join(" · "));
  add("Device", r.loan?.accessoryName);
  add("Event", r.loan?.eventName);
  if (r.loan) add("Loan window", `${dayDate(r.loan.startDate)} – ${dayDate(r.loan.endDate)}`);
  if (c?.noLongerHeldReason) add("Reason given", GONE[c.noLongerHeldReason]);
  if (c?.wrongField) add("Wrong field", `${FIELD[c.wrongField]}${c.correctedModel ? ` → ${c.correctedModel}` : ""}`);
  if (c?.serial) add("Serial", c.serial, true);
  if (kind !== "LOAN" && kind !== "CORRECTION") {
    add("Approver", r.manager ? `${r.manager}${r.autoApproved ? " · auto-approved" : ""}` : null);
  }

  const steps = stepsFor(r);
  const at = r.userLocationName?.trim();
  if (steps.includes("ship")) add("Delivery", `Shipping to ${at ?? "their site"}${r.legacyShipment ? " · legacy row" : ""}`);
  else if (steps.includes("prep")) add("Delivery", `Collect at ${at ?? "their site"}${r.locationMissing ? " · their location is missing" : ""}`);
  add("Tracking", r.trackingCode, true);
  if (r.startDate && isStartPending(r.startDate)) add("Reminders", `Held until ${formatStartShort(r.startDate)}`);
  return out;
}
