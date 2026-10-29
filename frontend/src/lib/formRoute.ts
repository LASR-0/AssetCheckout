///  +-----------------------------------------------------------------+
///  |          "WHAT HAPPENS NEXT", FROM WHAT'S BEEN CHOSEN           |
///  +-----------------------------------------------------------------+
//
//  The route a request will take, predicted from the form as it is filled
//  in, so the person filing can see where it goes before they send it:
//  who approves, what IT does, where it is collected. Shown beside the form
//  and again on the success page (with the first step done).
//
//  A prediction, written for people: it never claims more than the form
//  knows. Without a site it says "their site"; without an approver, "their
//  manager". Whether IT ships it from another site is IT's call later, so
//  the collection step says it might.
//
//  The real route of a request that exists is lib/route.ts; this is the
//  version that exists before the request does.
///  +-----------------------------------------------------------------+

export type PreviewState = "done" | "now" | "current" | "future" | "loop";

export type PreviewStep = {
  title: string;
  sub: string;
  state: PreviewState;
  /** A note under the step, e.g. "Auto-approved". */
  flag?: { text: string; icon: string };
  /** Who holds it while this is the current step. */
  holder?: string;
};

export type RouteContext = {
  kind: "asset" | "accessory" | "loan";
  nonStandard: boolean;
  /** The person filing is the person it's for. */
  forMe: boolean;
  /** The requestee, when picked. */
  forName: string | null;
  /** Where they collect, from their Snipe-IT location. */
  site: string | null;
  approverName: string | null;
  /** The person filing is the requestee's manager in Snipe-IT, so the
   *  manager step passes when they send it. */
  autoApproved: boolean;
  /** "laptop", for "Picks a standard laptop from stock". */
  noun: string | null;
  deviceName: string | null;
  start: Date | null;
  end: Date | null;
};

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Tue 3 Nov". */
export function weekdayDate(d: Date): string {
  return `${WD[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

/**
 * The steps, in order. `sent` is the success page's version: the first step
 * has happened and the next one is where the request now is.
 */
export function previewRoute(c: RouteContext, sent = false): PreviewStep[] {
  const site = c.site ?? "their site";
  const first = c.forName?.split(" ")[0] ?? null;
  const who = c.forMe ? "You" : c.forName ?? "They";
  const whom = c.forMe ? "you" : first ?? "them";
  const collects = c.forMe || !c.forName ? "collect" : "collects";
  const keeper = c.site ? `the ${c.site} stock keeper` : "their site's stock keeper";
  const Keeper = c.site ? `The ${c.site} stock keeper` : "Their site's stock keeper";
  const office = c.site ? `the ${c.site} office` : "their site's office";

  let steps: PreviewStep[];
  if (c.kind === "loan") {
    steps = [
      sent
        ? { title: "Booked", sub: "Just now", state: "done" }
        : { title: "You book it", sub: "Sent straight to IT. No manager approval for loans.", state: "now" },
      {
        title: "IT assigns a device",
        sub: `Picks a ${c.deviceName ?? "device"} that's free for your dates and checks it out.`,
        state: "future",
        holder: "With IT",
      },
      { title: `Ready at ${site}`, sub: `${Keeper} gets it ready and emails ${whom}.`, state: "future" },
      {
        title: `${who} ${collects} it`,
        sub: c.start ? `The loan starts on collection, from ${weekdayDate(c.start)}.` : "The loan starts on collection.",
        state: "future",
      },
      {
        title: c.end ? `Return by ${weekdayDate(c.end)}` : "Return it on the last day",
        sub: `Hand it back to ${keeper}.`,
        state: "loop",
      },
    ];
  } else {
    const acc = c.kind === "accessory";
    const non = c.nonStandard;
    steps = [
      sent
        ? { title: "Sent", sub: "Just now", state: "done" }
        : {
            title: "You send it",
            sub: c.forMe || !c.forName ? "Nothing is ordered until it is approved." : `Filed on behalf of ${c.forName}.`,
            state: "now",
          },
      c.autoApproved
        ? {
            title: "Manager approval",
            sub: "You are the manager, so this passes when you send it.",
            state: "done",
            flag: { text: "Auto-approved", icon: "bolt" },
          }
        : {
            title: c.approverName ? `${c.approverName} approves` : "Their manager approves",
            sub:
              acc && non
                ? "The cost falls on the department budget, so they approve it twice: now and at the quote."
                : "They get an email and approve or reject it.",
            state: "future",
            holder: c.approverName ? `With ${c.approverName} · manager` : "With their manager",
          },
      {
        title: "IT signs it off",
        sub: acc
          ? non
            ? "Checks what you described and works out a quote."
            : `Takes it from ${site} stock, or ships it from another site.`
          : non
            ? "Reviews your reason for a non-standard device."
            : `Picks a standard ${c.noun ?? "device"} from stock and checks it out.`,
        state: "future",
        holder: "With IT",
      },
    ];
    if (acc && non) {
      steps.push(
        { title: "Quote to the manager", sub: "IT sends a quote to accept. Skipped for low-cost items.", state: "future" },
        { title: "IT sources it", sub: "Orders it, or picks a matching item from stock.", state: "future" }
      );
    }
    if (!acc && non) {
      steps.push({
        title: "IT sets up the model",
        sub: "Creates the model and asset details, ordering it if needed.",
        state: "future",
      });
    }
    steps.push(
      {
        title: `Ready at ${site}`,
        sub: acc
          ? `${Keeper} gets it ready and emails ${whom}.`
          : `${Keeper} gets it ready. If it's at another site, IT ships it there first.`,
        state: "future",
      },
      { title: `${who} ${collects} it`, sub: `At ${office}.`, state: "future" }
    );
  }

  if (sent) {
    const i = steps.findIndex((s) => s.state === "future");
    if (i >= 0) steps[i] = { ...steps[i], state: "current" };
  }
  return steps;
}
