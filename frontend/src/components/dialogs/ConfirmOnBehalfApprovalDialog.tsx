import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";

///  +-----------------------------------------------------------------+
///  |          CONFIRM APPROVAL ON THE MANAGER'S BEHALF               |
///  +-----------------------------------------------------------------+
//
//  Gates the ONE approval an admin can make that isn't their own: standing in
//  for a manager who hasn't responded yet. It exists because that action used
//  to be indistinguishable from the admin's own IT sign-off — same button, and
//  (before this increment) an identical-looking row afterwards.
//
//  Deliberately NOT shown for the admin's own IT sign-off at the second stage.
//  That is a routine action, and gating it would train people to click through
//  this dialog without reading it, which would cost us the one place the
//  on-behalf distinction is spelled out.
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
  /** True while the approval is in flight — disables both controls. */
  pending: boolean;
  /** Set when the approval failed; keeps the dialog open so it can be retried. */
  error: string | null;
  onConfirm: () => void;
};

export default function ConfirmOnBehalfApprovalDialog({
  open,
  onOpenChange,
  userName,
  categoryName,
  managerName,
  pending,
  error,
  onConfirm,
}: Props) {
  // Every mention of the manager degrades to a generic phrase rather than
  // rendering "null" or an empty gap if the row has no manager attached.
  const manager = managerName?.trim() || "their manager";
  const forManager = managerName?.trim() ? `for ${manager}` : "on their behalf";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        // Never let an outside click or Esc pull the dialog out from under an
        // in-flight request — the admin would lose the pending/error feedback.
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
              supervisor_account
            </span>
          </div>

          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            Approve on {manager}'s behalf?
          </ResponsiveDialogTitle>

          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {manager} hasn't responded to this request yet. Approving now
            records the manager's approval {forManager} and moves{" "}
            <strong className="text-modal-text-primary">{userName}</strong>'s{" "}
            {categoryName} request on to IT sign-off.
          </p>
        </ResponsiveDialogHeader>

        {/* CONTENT */}
        <div className="p-8 space-y-4">
          {/* Matches the home page's dashed info indicator. The one thing an
              admin must not misread here is that this is NOT their sign-off. */}
          <span className="inline-flex items-start gap-1.5 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-1 text-status-pending text-[12px] font-semibold">
            <span className="material-symbols-outlined !text-[14px] shrink-0">
              info
            </span>
            This is the manager's approval, not your IT sign-off — the request
            will still need that afterwards.
          </span>

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
            {pending ? "Approving..." : `Approve ${forManager}`}
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
