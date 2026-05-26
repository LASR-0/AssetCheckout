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
};

export default function RejectionReasonDialog({
  open,
  onOpenChange,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason(""); 
  }, [open]);

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
        <div className="p-8 space-y-6">

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Reason
            </label>

            <textarea
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
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

        </div>

        {/* FOOTER */}
        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">

          <button
            onClick={() => onConfirm(reason || "No reason provided")}
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