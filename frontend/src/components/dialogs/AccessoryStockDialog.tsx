import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState, useRef } from "react";
import type { Request } from "@/types/requestType";
import { addAccessoryStock } from "@/api/accessories";

type DialogState =
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success"; ready: boolean; message: string }
  | { phase: "error"; message: string; retryable: boolean };

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

/**
 * The quantity-waiting step for a non-standard accessory — the accessory twin
 * of AssetDetailsDialog. Reached via the row's "Add stock" action, which shows
 * whenever the selected accessory has no available stock.
 *
 * This dialog does NOT move the accessory or pick a location — that's authored
 * once at create time. It shows the target accessory (name, site, current
 * stock) read-only for confirmation, and takes a single number: how many units
 * have arrived. That amount is ADDED to the record's current total (a delta);
 * when stock becomes available the backend checks out + completes.
 *
 * The read-only context comes off the request row itself (enriched by the
 * requests-list endpoint): modelRequest.modelName is the accessory name,
 * accessoryLocationName its site, accessoryRemaining its live stock.
 */
export default function AccessoryStockDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "form" });
  const [arrived, setArrived] = useState<string>("");
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "form" });
        setArrived("");
        successFiredRef.current = false;
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (dialogState.phase === "success" && !successFiredRef.current) {
      successFiredRef.current = true;
      onSuccess();
    }
  }, [dialogState, onSuccess]);

  function close() {
    onOpenChange(false);
  }

  async function handleSubmit() {
    if (!request) return;

    const parsed = Number(arrived);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setDialogState({
        phase: "error",
        message: "Enter how many units arrived (a whole number, 1 or more).",
        retryable: true,
      });
      return;
    }

    setDialogState({ phase: "submitting" });

    try {
      const data = await addAccessoryStock(request.id, { arrivedQty: parsed });

      const ready = data?.modelRequest?.assetReady === true;
      setDialogState({
        phase: "success",
        ready,
        message: ready
          ? "Stock added — the accessory has been checked out and the request completed."
          : "Stock saved, but the accessory still shows no available quantity. Re-open this dialog to add more once it arrives.",
      });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to add stock.",
        retryable: true,
      });
    }
  }

  function handleErrorRetry() {
    if (dialogState.phase !== "error") return;
    setDialogState({ phase: "form" });
  }

  // Read-only context off the enriched request row.
  const accessoryName = request?.modelRequest?.modelName ?? "the accessory";
  const locationName = request?.accessoryLocationName ?? "No location set";
  const remaining =
    typeof request?.accessoryRemaining === "number"
      ? request.accessoryRemaining
      : null;

  function renderHeader() {
    const config = (() => {
      switch (dialogState.phase) {
        case "form":
          return {
            icon: "inventory",
            title: "Add Stock",
            subtitle:
              "Enter how many units arrived. This is added to the accessory's current stock; once any is available it's checked out and the request completes.",
          };
        case "submitting":
          return { icon: "save", title: "Saving...", subtitle: "Updating the accessory in Snipe-IT." };
        case "success":
          return { icon: "check_circle", title: "Done", subtitle: "" };
        case "error":
          return { icon: "error", title: "Something went wrong", subtitle: "" };
      }
    })();

    return (
      <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
          <span className="material-symbols-outlined text-modal-text-accent">
            {config.icon}
          </span>
        </div>
        <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
          {config.title}
        </ResponsiveDialogTitle>
        {config.subtitle && (
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {config.subtitle}
          </p>
        )}
      </ResponsiveDialogHeader>
    );
  }

  function renderFormBody() {
    return (
      <div className="p-8 space-y-6">
        {/* Read-only target context — which accessory + where, and its stock. */}
        <div className="bg-modal-surface-elevated border border-modal-border/20 rounded-lg p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">
            Adding stock to
          </div>
          <div className="text-sm text-modal-text-primary font-medium">
            {accessoryName}
          </div>
          <div className="flex items-center gap-4 text-xs text-modal-text-secondary">
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined !text-[14px]">location_on</span>
              {locationName}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined !text-[14px]">inventory_2</span>
              {remaining === null ? "Stock unknown" : `${remaining} available`}
            </span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
            Quantity arrived
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={arrived}
            onChange={(e) => setArrived(e.target.value)}
            placeholder="e.g. 5"
            className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
          />
          <p className="text-[11px] text-info-light mt-1 ml-1">
            Added to the current total — enter only what newly arrived.
          </p>
        </div>
      </div>
    );
  }

  function renderBody() {
    switch (dialogState.phase) {
      case "form":
        return renderFormBody();
      case "submitting":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            Saving stock...
          </div>
        );
      case "success":
        return (
          <div className="p-8 text-center space-y-4">
            <p className="text-sm text-modal-text-primary leading-relaxed max-w-md mx-auto">
              {dialogState.message}
            </p>
          </div>
        );
      case "error":
        return (
          <div className="p-8 space-y-4">
            <div className="bg-modal-error/10 border border-modal-error/30 rounded-lg p-4">
              <p className="text-sm text-modal-error leading-relaxed">
                {dialogState.message}
              </p>
            </div>
          </div>
        );
    }
  }

  function renderFooter() {
    switch (dialogState.phase) {
      case "submitting":
        return null;
      case "form":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={handleSubmit}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
            >
              Add stock
            </button>
            <button
              onClick={close}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors"
            >
              Cancel
            </button>
          </ResponsiveDialogFooter>
        );
      case "success":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={close}
              autoFocus
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
            >
              Done
            </button>
          </ResponsiveDialogFooter>
        );
      case "error":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            {dialogState.retryable && (
              <button
                onClick={handleErrorRetry}
                autoFocus
                className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
              >
                Try again
              </button>
            )}
            <button
              onClick={close}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors"
            >
              Close
            </button>
          </ResponsiveDialogFooter>
        );
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="
          p-0
          bg-modal-surface
          border border-modal-border/20
          rounded-xl
          shadow-md
          md:min-w-lg
        "
      >
        {renderHeader()}
        {renderBody()}
        {renderFooter()}
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}