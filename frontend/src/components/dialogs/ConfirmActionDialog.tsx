import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";

///  +-----------------------------------------------------------------+
///  |                    GENERIC CONFIRM-AND-GO ACTION                |
///  +-----------------------------------------------------------------+
//
//  For a one-step action that needs a confirmation but no form — Skip Quote
//  and Hand off procurement, at the time of writing. Chrome matches
//  ConfirmApprovalDialog so a one-off action still reads as part of the same
//  family of dialogs rather than a bespoke popup.
///  +-----------------------------------------------------------------+

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  /** True while the action is in flight — disables both controls. */
  pending: boolean;
  /** Set when the action failed; keeps the dialog open so it can be retried. */
  error: string | null;
  onConfirm: () => void;
};

export default function ConfirmActionDialog({
  open,
  onOpenChange,
  icon,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
}: Props) {
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
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
            {description}
          </p>
        </ResponsiveDialogHeader>

        {error && (
          <div className="p-8 pb-0">
            <p className="text-sm text-error bg-error-background rounded-lg px-3 py-2">
              {error}
            </p>
          </div>
        )}

        <ResponsiveDialogFooter className="px-8 pb-8 pt-6 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
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
              shadow-brand
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
            {pending ? pendingLabel : confirmLabel}
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

        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
