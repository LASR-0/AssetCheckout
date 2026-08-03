import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";

///  +-----------------------------------------------------------------+
///  |               CONFIRM AN APPROVAL AT THE MANAGER STAGE           |
///  +-----------------------------------------------------------------+
//
//  One dialog, two independent reasons to gate an approval. They are separate
//  flags rather than separate components because a single approval can trigger
//  both at once — an admin standing in for a manager on a non-standard
//  accessory is acknowledging someone else's budget on their behalf, and needs
//  to be told both things in one place rather than through two stacked dialogs.
//
//    onBehalf   The actor is an admin approving before the manager has
//               responded. This is the ONE approval on the table that isn't
//               the actor's own decision. Deliberately NOT shown for the
//               admin's own IT sign-off at the second stage — that is routine,
//               and gating it would train people to click through this dialog
//               without reading it, which would cost us the one place the
//               on-behalf distinction is spelled out.
//
//    budget     The request is a non-standard ACCESSORY. Non-standard
//               accessories are by definition not required to do the job, so
//               the cost falls on the requester's department rather than IT.
//               Approving IS the acknowledgment of that — there is no flag and
//               no timestamp recorded anywhere, by design. A request only
//               advances if the manager approved, so the state is the record.
//
//  Neither flag set means no dialog: the page doesn't open this at all.
//
//  Chrome matches RejectRequestDialog — the other confirm-an-approval-decision
//  dialog on this table — so the two read as a pair.
///  +-----------------------------------------------------------------+

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Requester's name, for "…{userName}'s {categoryName} request". */
  userName: string;
  categoryName: string;
  /** The manager being stood in for. Null when the row carries no manager. */
  managerName: string | null;
  /** Admin approving ahead of the manager, rather than the manager themselves. */
  onBehalf: boolean;
  /** Non-standard accessory — the cost lands on a department budget. */
  budget: boolean;
  /** True while the approval is in flight — disables both controls. */
  pending: boolean;
  /** Set when the approval failed; keeps the dialog open so it can be retried. */
  error: string | null;
  onConfirm: () => void;
};

export default function ConfirmApprovalDialog({
  open,
  onOpenChange,
  userName,
  categoryName,
  managerName,
  onBehalf,
  budget,
  pending,
  error,
  onConfirm,
}: Props) {
  // Every mention of the manager degrades to a generic phrase rather than
  // rendering "null" or an empty gap if the row has no manager attached.
  const manager = managerName?.trim() || "their manager";
  const forManager = managerName?.trim() ? `for ${manager}` : "on their behalf";

  // Whose budget it is: second person for the manager, third for an admin
  // standing in. An admin told "your department's budget" would be reading
  // about a budget that isn't theirs.
  const whoseBudget = onBehalf
    ? `${manager}'s department budget`
    : "your department's budget";

  // The on-behalf act is the more unusual one, so it takes the icon and the
  // title when both apply.
  const icon = onBehalf ? "supervisor_account" : "account_balance_wallet";
  const title = onBehalf
    ? `Approve on ${manager}'s behalf?`
    : `Approve this ${categoryName} request?`;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        // Never let an outside click or Esc pull the dialog out from under an
        // in-flight request — the actor would lose the pending/error feedback.
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <ResponsiveDialogContent
        className="
          p-0
          bg-modal-surface
          border border-modal-border
          rounded-xl
          shadow-md
          md:min-w-lg
        "
      >
        {/* HEADER */}
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">
              {icon}
            </span>
          </div>

          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            {title}
          </ResponsiveDialogTitle>

          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {onBehalf ? (
              <>
                {manager} hasn't responded to this request yet. Approving now
                records the manager's approval {forManager} and moves{" "}
                <strong className="text-modal-text-primary">{userName}</strong>'s{" "}
                {categoryName} request on to IT sign-off.
              </>
            ) : (
              <>
                <strong className="text-modal-text-primary">{userName}</strong>{" "}
                has asked for a {categoryName} that isn't one of the standard
                options.
              </>
            )}
          </p>
        </ResponsiveDialogHeader>

        {/* CONTENT */}
        <div className="p-8 space-y-4">
          {budget && (
            // Three things have to land here, and only three: whose budget the
            // cost comes out of, that approving IS the acknowledgment of it,
            // and that a quote follows which needs approving separately. Any
            // longer and it becomes a wall of text that gets clicked past.
            <div className="rounded-lg bg-modal-surface-accent/60 border border-modal-border-light/20 px-4 py-3 space-y-2 text-left">
              <div className="flex items-center gap-2 text-modal-text-accent">
                <span className="material-symbols-outlined !text-[18px]">
                  payments
                </span>
                <span className="text-[13px] font-bold uppercase tracking-wide">
                  Department budget
                </span>
              </div>
              <p className="text-sm leading-relaxed text-modal-text-primary">
                Non-standard accessories are paid for out of {whoseBudget}, not
                IT's. Approving accepts that cost.
              </p>
              <p className="text-sm leading-relaxed text-info-light">
                IT will source a quote and email it{" "}
                {onBehalf ? `to ${manager}` : "to you"}. Nothing is ordered
                until {onBehalf ? "they approve" : "you approve"} that quote
                separately.
              </p>
            </div>
          )}

          {onBehalf && (
            /* Matches the home page's dashed info indicator. The one thing an
               admin must not misread here is that this is NOT their sign-off. */
            <span className="inline-flex items-start gap-1.5 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-1 text-status-pending text-[12px] font-semibold">
              <span className="material-symbols-outlined !text-[14px] shrink-0">
                info
              </span>
              This is the manager's approval, not your IT sign-off — the request
              will still need that afterwards.
            </span>
          )}

          {error && (
            <p className="text-sm text-error bg-error-background rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* FOOTER */}
        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="
              w-full sm:w-auto
              px-8 py-3.5
              rounded-lg
              text-white
              font-bold text-sm
              twilight-gradient
              shadow-[0_4px_12px_rgba(80,37,186,0.3)]
              hover:opacity-90
              hover:cursor-pointer
              active:scale-95
              transition-all
              disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100
              inline-flex items-center justify-center gap-2
            "
          >
            {pending && (
              <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
            )}
            {pending
              ? "Approving..."
              : onBehalf
                ? `Approve ${forManager}`
                : "Approve and accept the cost"}
          </button>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="
              w-full sm:w-auto
              px-8 py-3.5
              rounded-lg
              text-modal-text-secondary
              font-bold text-sm
              hover:bg-modal-error/10
              hover:cursor-pointer
              hover:text-modal-error
              transition-colors
              disabled:opacity-60 disabled:cursor-not-allowed
            "
          >
            Cancel
          </button>
        </ResponsiveDialogFooter>

        {/* BOTTOM RIBBON */}
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
