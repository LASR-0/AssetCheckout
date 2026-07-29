import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  /**
   * Set when an ADMIN is rejecting a request the manager hasn't answered yet —
   * the name of that manager, or "" when the row carries none. Undefined for
   * every other rejection (a manager rejecting their own, or an admin rejecting
   * at the IT stage), which renders no notice.
   *
   * Deliberately an informational indicator rather than an extra confirmation
   * step: rejection is already gated by having to type a reason, and a second
   * gate would just get clicked through.
   */
  onBehalfOfManager?: string;
};

export default function RejectionReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  onBehalfOfManager,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  function submit() {
    onConfirm(reason || "No reason provided");
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
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
              cancel
            </span>
          </div>

          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            Rejection Reasoning
          </ResponsiveDialogTitle>

          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            Please provide a reason for rejecting this request. This message will replace their reasoning for the asset. If left blank, your reason will be "No reason provided."
          </p>
        </ResponsiveDialogHeader>

        {/* CONTENT */}
        <form
          id="rejection-reason-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="p-8 space-y-6"
        >
          {/* On-behalf notice. Same dashed indicator as the home page, so it
              reads as information rather than as an error the admin caused. */}
          {onBehalfOfManager !== undefined && (
            <span className="inline-flex items-start gap-1.5 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-1 text-status-pending text-[12px] font-semibold">
              <span className="material-symbols-outlined !text-[14px] shrink-0">
                info
              </span>
              {onBehalfOfManager.trim()
                ? `${onBehalfOfManager.trim()} hasn't responded yet — you're rejecting this on their behalf.`
                : "The manager hasn't responded yet — you're rejecting this on their behalf."}
            </span>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Reason
            </label>

            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                // Enter submits (managers type a short reason, not a paragraph).
                // Shift+Enter still inserts a newline for the rare multi-line case.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Enter rejection reason..."
              className="
                w-full
                border-modal-border/20
                bg-modal-surface-elevated
                border border-modal-border
                rounded-lg
                py-3 px-4
                text-modal-text-primary
                text-sm
                resize-none
                transition-all
                focus:outline-none
                focus:ring-2 focus:ring-modal-brand/20
              "
            />
          </div>
        </form>

        {/* FOOTER */}
        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          <button
            type="submit"
            form="rejection-reason-form"
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
            "
          >
            Confirm Rejection
          </button>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
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