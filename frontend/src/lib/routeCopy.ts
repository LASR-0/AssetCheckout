import type { Request } from "@/types/requestType";
import { stageMeta, type Route, type StepKey, type Viewer } from "@/lib/route";
import { isApprover, isRequestee } from "@/lib/permissions";
import { dayDate, shortDate } from "@/lib/format";
import { requestTitle } from "@/lib/requestDisplay";

///  +-----------------------------------------------------------------+
///  |           WHAT IS HAPPENING, IN ONE PLAIN SENTENCE              |
///  +-----------------------------------------------------------------+
//
//  The rail shows where a request is; these say it in words, for the
//  inspector's "Whose move" and Home's "Needs you" cards. Written to the
//  person reading, so a step reads differently to the requester ("Collect
//  it") and to anyone else ("Waiting on Sarah to collect it").
///  +-----------------------------------------------------------------+

function site(r: Request): string | null {
  return r.userLocationName?.trim() || null;
}

/** The current step, explained to this viewer. */
export function moveText(r: Request, route: Route, viewer: Viewer): string {
  if (route.rejected) {
    const on = shortDate(route.rejected.at);
    const why = route.rejected.reason ? `: ${route.rejected.reason}` : "";
    const by = route.rejected.by ? ` Rejected by ${route.rejected.by}.` : "";
    return `Rejected${on ? ` on ${on}` : ""}${why}.${by}`;
  }
  if (route.finished || !route.step) {
    const last = route.stations.at(-1);
    const on = shortDate(last?.at);
    return `${stageMeta(route.stage).label}${on ? ` on ${on}` : ""}. Nothing else to do.`;
  }
  if (route.blocked) {
    return `IT is sorting out a problem with our records: ${route.blocked}`;
  }

  const mine = isRequestee(r, viewer.userId, viewer.name);
  const you = mine ? "you" : r.userName;
  const at = site(r);
  return STEP_TEXT[route.step]({ r, mine, you, at, approver: isApprover(r, viewer.userId, viewer.name) });
}

type Ctx = { r: Request; mine: boolean; you: string; at: string | null; approver: boolean };

const STEP_TEXT: Record<StepKey, (c: Ctx) => string> = {
  mgr: ({ r, approver }) =>
    approver ? "Waiting on your approval." : `Waiting on ${r.manager ?? "the manager"} to approve it.`,
  it: () => "Waiting on IT to sign it off. IT then picks the device and checks it out.",
  model: () => "IT is adding this model to our records before it can be ordered.",
  details: () => "IT is recording the device's details, then checks it out.",
  quote: () => "IT is getting a quote, which then goes to the manager to accept.",
  review: ({ r, approver }) =>
    approver
      ? "A quote is waiting for you to accept or reject."
      : `The quote is with ${r.manager ?? "the manager"} to accept.`,
  select: () => "IT is choosing the accessory to send.",
  stock: () => "IT is adding stock and checking it out.",
  handoff: () => "IT is deciding whether to supply it or have it bought directly.",
  purchase: ({ mine, you }) =>
    mine
      ? "IT has asked you to buy this yourself. Once you have, enter what you bought and what it cost."
      : `Waiting on ${you} to buy it and enter the details.`,
  procrev: () => "IT is reviewing what was bought.",
  assign: () => "Waiting on IT to assign a device for the loan.",
  ship: () => "IT is getting it ready to ship.",
  arrive: ({ r, at }) => {
    const on = shortDate(r.shippedAt);
    return `Shipped${on ? ` on ${on}` : ""}. When it reaches ${at ?? "the site"}, the stock keeper marks it ready and an email goes out.`;
  },
  prep: ({ at }) => `The ${at ? `${at} ` : ""}stock keeper is getting it ready to collect.`,
  collect: ({ mine, you, at }) =>
    mine
      ? `It's ready at the ${at ? `${at} ` : ""}office. Collect it from the stock keeper, then mark it collected here.`
      : `Ready at the ${at ? `${at} ` : ""}office, waiting for ${you} to collect it.`,
  receive: ({ mine, you, at }) =>
    mine
      ? `It's arrived at the ${at ? `${at} ` : ""}office. Collect it from the stock keeper, then mark it collected here.`
      : `Arrived at the ${at ? `${at} ` : ""}office, waiting for ${you} to collect it.`,
  lreceive: ({ mine, you }) =>
    mine ? "It's on its way to you. Mark it received once it arrives." : `On its way to ${you}.`,
  lcollect: ({ mine, you, at }) =>
    mine
      ? `It's ready at the ${at ? `${at} ` : ""}office. Collect it, then mark it collected to start the loan.`
      : `Ready at the ${at ? `${at} ` : ""}office, waiting for ${you} to collect it.`,
  lreturn: ({ r, mine, you, at }) => {
    const due = r.loan ? dayDate(r.loan.endDate) : "";
    const whom = mine ? "Hand it back" : `${you} hands it back`;
    return `On loan${due ? ` until ${due}` : ""}. ${whom} to the ${at ? `${at} ` : ""}stock keeper by then.`;
  },
  manage: () => "IT checks what was sent against our records and updates them. Nothing else to do.",
};

/** The steps a requester acts on themselves, which Home lifts into "Needs you". */
export const REQUESTEE_ACTIONS: ReadonlySet<StepKey> = new Set([
  "purchase",
  "collect",
  "receive",
  "lreceive",
  "lcollect",
]);

/** A "Needs you" card: the headline, one line of context, and its icon. */
export function needCopy(r: Request, step: StepKey): { title: string; text: string; icon: string } {
  const item = requestTitle(r);
  const at = site(r);
  const office = at ? `the ${at} office` : "the office";
  switch (step) {
    case "purchase":
      return { title: "Buy it yourself", text: `IT asked you to buy your ${item}. Enter the details once you have it.`, icon: "shopping_bag" };
    case "lreceive":
      return { title: "On its way to you", text: `Your ${item} has been shipped. Mark it received once it arrives.`, icon: "local_shipping" };
    case "lcollect":
      return { title: "Ready to collect", text: `Your loan ${item} is waiting at ${office}.`, icon: "storefront" };
    default:
      return { title: "Ready to collect", text: `Your ${item} is waiting at ${office}.`, icon: "storefront" };
  }
}
