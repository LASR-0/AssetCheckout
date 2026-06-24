import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState } from "react";
import type { Request } from "@/types/requestType";

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (trackingCode: string, trackingUrl: string) => void;
};

export default function ShipDialog({ request, open, onOpenChange, onConfirm }: Props) {
  const [trackingUrl, setTrackingUrl] = useState("");
  const [trackingCode, setTrackingCode] = useState("");

  // Reset fields when the dialog closes.
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setTrackingUrl("");
        setTrackingCode("");
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  function handleShip() {
    onConfirm(trackingCode.trim(), trackingUrl.trim());
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="p-0 bg-modal-surface border border-modal-border/20 rounded-xl shadow-md md:min-w-lg"
      >
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">local_shipping</span>
          </div>
          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            Mark as shipped
          </ResponsiveDialogTitle>
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            Add tracking details if you have them — they'll be included in the email to{" "}
            {request?.userName ?? "the requester"}. You can ship without them and the
            request will still be marked as shipped.
          </p>
        </ResponsiveDialogHeader>

        <div className="p-8 space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Tracking website URL <span className="text-info-light normal-case font-normal">(optional)</span>
            </label>
            <input
              value={trackingUrl}
              onChange={(e) => setTrackingUrl(e.target.value)}
              placeholder="e.g. https://auspost.com.au/mypost/track"
              className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Tracking code <span className="text-info-light normal-case font-normal">(optional)</span>
            </label>
            <input
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="e.g. AP1234567890"
              className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
            />
          </div>
        </div>

        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={handleShip}
            autoFocus
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
          >
            Ship
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors"
          >
            Cancel
          </button>
        </ResponsiveDialogFooter>
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}