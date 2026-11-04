import type { Request } from "@/types/requestType";
import { kindOf, stageMeta, stationHolder, type Route, type StepKey, type Viewer } from "@/lib/route";
import { isApprover } from "@/lib/permissions";
import { deriveLoanStage } from "@/lib/stage";
import { dayDate, shortDate } from "@/lib/format";
import type { LogRow } from "./useRequestLog";

///  +-----------------------------------------------------------------+
///  |           THE DOCKET'S "YOUR MOVE", IN WORDS                    |
///  +-----------------------------------------------------------------+
//
//  Home's copy (lib/routeCopy) speaks to the requester. This speaks to
//  whoever holds the step in the request log: the approver, IT, the stock
//  keeper. Same steps, same order; different reader.
///  +-----------------------------------------------------------------+

const first = (name: string) => name.split(" ")[0];
const site = (r: Request) => r.userLocationName?.trim() || null;

/** What it means to do a step, after "needs to …". */
const VERB: Record<StepKey, string> = {
  mgr: "approve it",
  it: "sign it off",
  model: "create the model",
  details: "fill in the asset details",
  quote: "send a quote",
  review: "review the quote",
  select: "select the accessory",
  stock: "add stock and check it out",
  handoff: "select the accessory",
  purchase: "buy it and enter the details",
  procrev: "review the purchase",
  assign: "assign a device",
  ship: "ship it",
  arrive: "confirm it arrived",
  prep: "get it ready",
  collect: "collect it",
  receive: "collect it",
  lreceive: "confirm it arrived",
  lcollect: "collect it",
  lreturn: "return it",
  manage: "review the correction",
};

/** When the current step started: the last thing that happened. */
export function since(route: Route): string | null {
  for (let i = route.current - 1; i >= 0; i--) {
    const at = route.stations[i]?.at;
    if (at) return at;
  }
  return null;
}

export function daysSince(iso: string | null, now = new Date()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** The holder's name in a sentence: "Grace O'Neill", "IT", "the Perth stock keeper". */
function holderName(r: Request, step: StepKey, viewer: Viewer): string {
  const n = stationHolder(r, step, viewer);
  if (n === "You") return "you";
  return /stock keeper$/.test(n) ? `the ${n}` : n;
}

/** The step is the viewer's: what it is and what doing it involves. */
export function yourMove(row: LogRow, viewer: Viewer): { text: string; note: string | null } {
  const { r, route } = row;
  const step = route.step!;
  const at = site(r) ?? "the site";
  const admin = viewer.role === "ADMIN";
  const person = r.userName;
  const item = r.categoryName.toLowerCase();
  const nonStd = r.requestType === "NON_STANDARD";
  const accessory = kindOf(r) === "ACCESSORY";
  const keeperStep = step === "arrive" || step === "prep";
  const note =
    admin && keeperStep && !viewer.stockKeeperLocations.some((l) => l.id === r.userLocationId)
      ? `${site(r) ? `${site(r)}'s` : "The site's"} stock keeper usually does this. You can do it for any site.`
      : null;

  if (route.blocked) {
    return { text: "Check the details, then apply again or close it as corrected by hand.", note: null };
  }

  const loanStage = r.loan ? deriveLoanStage(r.loan) : null;
  const due = dayDate(r.loan?.endDate);
  const text: Record<StepKey, () => string> = {
    mgr: () =>
      isApprover(r, viewer.userId, viewer.name)
        ? `${person} needs ${item}${r.reason ? `: ${lower(r.reason)}` : ""}. IT signs off and fulfils it after you.`
        : `Waiting on ${r.manager ?? "the manager"} since ${shortDate(since(route))}. You can approve on their behalf; IT sign-off still follows.`,
    it: () =>
      `Manager approved. Sign off to ${nonStd ? "start sourcing it" : `assign an available ${accessory ? "accessory" : "asset"} and decide ship or collect`}.`,
    ship: () => `It's assigned from another site, so it ships to ${at}.`,
    arrive: () => `It's on its way to ${at}. Confirm it has arrived so ${first(person)} is told it's ready.`,
    prep: () => `It's checked out to ${person}. Get it ready at ${at} and they'll be emailed.`,
    collect: () => `It's ready for you at ${at}. Mark it collected once you have it.`,
    receive: () => `It's ready for you at ${at}. Mark it collected once you have it.`,
    lcollect: () => `It's ready for you at ${at}. The loan starts when you collect it.`,
    lreceive: () => "This shipped before stock keepers existed, so it comes straight to you. Mark it received once you have it.",
    model: () =>
      `Non-standard, so IT signed off without an asset. Find or create the Snipe-IT model${r.preferredModel ? `; ${first(person)} has a ${r.preferredModel} in mind` : ""}.`,
    details: () => "The model is linked. Fill in the asset details; partial saves are fine.",
    quote: () => `${first(person)}'s department pays, so send a quote or skip it if it's too cheap to bother.`,
    review: () => {
      const q = r.quoteDetail;
      return `IT sent a quote for ${q ? `${money(q.amount)} from ${q.supplier}` : "this"}. It's paid from your department's budget. Accept the cost, or reject it with a reason.`;
    },
    select: () => "Quote accepted. Select or create the accessory, or hand it to the requester to buy.",
    handoff: () => "Select or create the accessory, or hand it to the requester to buy.",
    stock: () => {
      const name = r.accessoryLinkedLabel || r.modelRequest?.modelName || "The accessory";
      const where = r.accessoryLocationName ? ` at ${r.accessoryLocationName}` : "";
      return `${name}${where} is selected. ${(r.accessoryRemaining ?? 0) > 0 ? "There is stock, so you can check it out." : "There is no stock yet, so add what arrived."}`;
    },
    purchase: () => "IT handed this to you to buy. Once you have it, enter what you bought and what it cost.",
    procrev: () => `${person} entered what they bought. Record it in Snipe-IT or keep it as a Checkout-only record.`,
    assign: () => "Pick a device from the loan list. The requested one is pre-selected.",
    manage: () => `${person} reported: ${r.correctionDetail?.description || r.reason || "a problem with their records"}. Name the Snipe-IT record, then apply or close it.`,
    lreturn: () => {
      const when =
        loanStage === "ON_LOAN"
          ? `It's on loan until ${due}. Returning early checks it back in now.`
          : loanStage === "DUE_BACK"
            ? "It's due back today."
            : `It was due back ${due}, ${daysSince(r.loan?.endDate ?? null)} days ago.`;
      return `${when} Mark it returned once it's back; it's checked in to Snipe-IT.`;
    },
  };
  return { text: text[step](), note };
}

/** The step is someone else's: who has it, and since when. */
export function waitingText(row: LogRow, viewer: Viewer): string {
  const { r, route } = row;
  const step = route.step!;
  const who = holderName(r, step, viewer);
  if (who === "you") {
    const back = step === "lreturn" ? ` It's due back ${dayDate(r.loan?.endDate)}. Return it to the ${site(r) ?? "site"} stock keeper.` : "";
    return `It's waiting on you to ${VERB[step]}.${back}`;
  }
  if (viewer.role !== "ADMIN" && who === "IT") {
    return `IT has it and needs to ${VERB[step]}. You'll get an email when it moves on.`;
  }
  const on = shortDate(since(route));
  return `Waiting on ${who} to ${VERB[step]}.${on ? ` With them since ${on}.` : ""}`;
}

/** After an action lands: what happened, and who is next. */
export function doneText(row: LogRow, viewer: Viewer): string {
  const { r, route } = row;
  if (route.finished) return `${stageMeta(route.stage).label}. That's the last step, so nothing is left to do.`;
  const prev = route.stations[route.current - 1]?.label ?? "Done";
  if (!route.step) return `${prev}.`;
  if (row.mine) return `${prev}.`;
  return `${prev}. Next, ${holderName(r, route.step, viewer)} needs to ${VERB[route.step]}.`;
}

/** A confirm-only step: the question and what will happen. */
export function confirmCopy(row: LogRow, viewer: Viewer): { question: string; note: string } {
  const { r, route } = row;
  const step = route.step!;
  const admin = viewer.role === "ADMIN";
  const onBehalf = step === "mgr" && admin && !isApprover(r, viewer.userId, viewer.name);
  switch (step) {
    case "mgr": {
      const budget =
        kindOf(r) === "ACCESSORY" && r.requestType === "NON_STANDARD"
          ? `It's paid from ${first(r.userName)}'s department budget, not IT's. IT will source a quote and email it; nothing is ordered until that quote is approved.`
          : null;
      const behalf = `This is ${r.manager ?? "the manager"}'s approval given on their behalf, not your IT sign-off. It will still need that.`;
      if (budget) return { question: "Approve this request?", note: onBehalf ? `${budget} You're approving for ${r.manager ?? "the manager"}.` : budget };
      return { question: "Approve this request?", note: onBehalf ? behalf : "IT is notified next." };
    }
    case "it":
      return {
        question: r.requestType === "NON_STANDARD" ? "Sign it off?" : "Sign off and assign?",
        note:
          r.requestType === "NON_STANDARD"
            ? "IT sources it next."
            : "If nothing is available, the request stays as it is and you'll see why.",
      };
    case "arrive":
    case "prep":
      return { question: "Mark it ready to collect?", note: `${r.userName} is emailed that it's ready at ${site(r) ?? "their site"}.` };
    case "collect":
    case "receive":
    case "lcollect":
      return { question: "Confirm you have it?", note: step === "lcollect" ? "The loan starts now." : "This closes the request." };
    case "lreceive":
      return { question: "Confirm it arrived?", note: "This closes the request." };
    case "lreturn": {
      const early = r.loan && deriveLoanStage(r.loan) === "ON_LOAN";
      return {
        question: r.loan?.checkinError ? "Try the return again?" : early ? "Close this loan early?" : "Mark it returned?",
        note: "The device is checked back in to Snipe-IT.",
      };
    }
    default:
      return { question: "Go ahead?", note: "" };
  }
}

/** While a confirm-only step runs. */
export const PENDING: Partial<Record<StepKey, string>> = {
  mgr: "Approving…",
  it: "Signing off…",
  arrive: "Marking ready…",
  prep: "Marking ready…",
  collect: "Confirming…",
  receive: "Confirming…",
  lcollect: "Confirming…",
  lreceive: "Confirming…",
  lreturn: "Checking in…",
};

/** The steps that are a form in the docket rather than a yes/no. */
export type FormKind =
  | "ship" | "model" | "details" | "quote" | "review" | "select" | "stock"
  | "purchase" | "procrev" | "assign" | "manage"
  | "reject" | "edit" | "start";

export const STEP_FORM: Partial<Record<StepKey, FormKind>> = {
  ship: "ship",
  model: "model",
  details: "details",
  quote: "quote",
  review: "review",
  select: "select",
  handoff: "select",
  stock: "stock",
  purchase: "purchase",
  procrev: "procrev",
  assign: "assign",
  manage: "manage",
};

export function money(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
