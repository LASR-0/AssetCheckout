///  +-----------------------------------------------------------------+
///  |                 SHARED REQUEST STATUS BADGE                     |
///  +-----------------------------------------------------------------+
//
//  Exports the low-level <Badge> primitive — the ONE badge shell in the
//  legacy pages — and the legacy StatusBadge. Stage derivation lives in
//  lib/stage.ts. Both are replaced by StateChip (components/ui/pills.tsx)
//  as pages are rebuilt.
///  +-----------------------------------------------------------------+

// ── Badge primitive ──
//
//  The single badge shell. `default` matches the requests-table badge
//  (px-2 py-1, !text-sm icon); `compact` is the tighter variant for dense
//  summary rows (py-0.5, 14px icon). Border colour is currentColor
//  (Tailwind v4 default), so it always matches the text token.

export type BadgeSize = "default" | "compact";

export type BadgeProps = {
  icon: string;
  label: string;
  /** Background utility, e.g. "bg-status-success/15" */
  bg: string;
  /** Text utility, e.g. "text-status-success" */
  text: string;
  size?: BadgeSize;
  className?: string;
};

export function Badge({
  icon,
  label,
  bg,
  text,
  size = "default",
  className = "",
}: BadgeProps) {
  const pad = size === "compact" ? "px-2 py-0.5" : "px-2 py-1";
  const iconSize = size === "compact" ? "!text-[14px]" : "!text-sm";

  return (
    // max-w-full + min-w-0 let the pill shrink inside flex rows / narrow
    // cells; the label then truncates ("Ready to c…") instead of wrapping
    // onto a second line. `title` keeps the full text on hover.
    <span
      title={label}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 ${pad} text-xs font-semibold border-1 rounded-full ${bg} ${text} ${className}`}
    >
      <span className={`material-symbols-outlined shrink-0 ${iconSize}`}>{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

// ── Request status presentation ──

const labelMap: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed",
  AWAITING_IT: "Awaiting IT",
  // Non-standard accessory whose quote is with the manager. A distinct stage
  // rather than a plain "Approved", because the request is stalled on someone
  // outside IT and the row should say so.
  AWAITING_QUOTE: "Quote with manager",
  // Non-standard accessory IT has handed off to the requester instead of
  // selecting a Snipe accessory — see selfProcurement.ts.
  AWAITING_SELF_PROCUREMENT: "Awaiting purchase",
  AWAITING_PROCUREMENT_REVIEW: "Awaiting IT review",
  READY_TO_COLLECT: "Ready to collect",
  READY_TO_SHIP: "Ready to ship",
  // Loans. ON_LOAN is the only "done" state that is not an ending —
  // see deriveLoanStage.
  ON_LOAN: "On loan",
  DUE_BACK: "Due back",
  OVERDUE: "Overdue",
  RETURNED: "Returned",
  SHIPPED: "Shipped",
  COLLECTED: "Collected",
  RECEIVED: "Received",
  ASSIGNED: "Assigned",
};

// ── Three colours, not twelve ──
//
//  Every phase resolves to one of three intents (see index.css):
//
//    done      the request has cleared IT — approved, dispatched, finished
//    progress  somebody still owes an action on it
//    stop      it is dead
//
//  This replaced a scheme where each stage carried its own hue. Eleven colours
//  across a list is not eleven pieces of information; a person scanning the
//  table is asking one question — does this row need me? — and the colour now
//  answers exactly that, with the LABEL carrying which stage it is. It also
//  ends the collision where a stage colour appeared elsewhere on the same row
//  meaning something unrelated: "Ready to collect" and the "Mark ready" action
//  shared a violet with nothing to do with each other.
//
//  ASSIGNED is the one that looks misplaced and isn't. It means fulfilled but
//  not yet prepped, so IT still owes the shipping or collection step — hence
//  progress, while everything after it is done.
const DONE = { bg: "bg-intent-done/15", text: "text-intent-done" };
const PROGRESS = { bg: "bg-intent-progress/15", text: "text-intent-progress" };
const STOP = { bg: "bg-intent-stop/15", text: "text-intent-stop" };

const styleMap: Record<string, { bg: string; text: string; icon: string }> = {
  APPROVED: { ...DONE, icon: "schedule" },
  COMPLETED: { ...DONE, icon: "check_circle" },
  REJECTED: { ...STOP, icon: "cancel" },
  PENDING: { ...PROGRESS, icon: "schedule" },
  AWAITING_IT: { ...PROGRESS, icon: "shield_person" },
  AWAITING_QUOTE: { ...PROGRESS, icon: "request_quote" },
  AWAITING_SELF_PROCUREMENT: { ...PROGRESS, icon: "shopping_cart" },
  AWAITING_PROCUREMENT_REVIEW: { ...PROGRESS, icon: "fact_check" },
  READY_TO_COLLECT: { ...DONE, icon: "package_2" },
  READY_TO_SHIP: { ...DONE, icon: "local_shipping" },
  // ON_LOAN is `done` because nobody owes an action while a loan is running —
  // the requester is simply using the thing. It becomes `progress` the day it
  // is owed back, and `stop` once it is late, which is the only point in the
  // whole flow where a row goes backwards through the three intents. That is
  // correct: a loan nobody returned IS a problem, and it should not keep
  // reading like a finished request.
  ON_LOAN: { ...DONE, icon: "devices" },
  DUE_BACK: { ...PROGRESS, icon: "event_upcoming" },
  OVERDUE: { ...STOP, icon: "running_with_errors" },
  RETURNED: { ...DONE, icon: "assignment_turned_in" },
  SHIPPED: { ...DONE, icon: "local_shipping" },
  COLLECTED: { ...DONE, icon: "check_circle" },
  RECEIVED: { ...DONE, icon: "check_circle" },
  ASSIGNED: { ...PROGRESS, icon: "assignment_ind" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = styleMap[status] ?? styleMap.PENDING;
  const label = labelMap[status] ?? status;

  return <Badge icon={style.icon} label={label} bg={style.bg} text={style.text} />;
}