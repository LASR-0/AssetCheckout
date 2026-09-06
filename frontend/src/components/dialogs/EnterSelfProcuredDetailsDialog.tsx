import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState, useRef } from "react";
import type { Request } from "@/types/requestType";
import { submitSelfProcuredDetails } from "@/api/selfProcurement";

type DialogState =
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success" }
  | { phase: "error"; message: string };

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

/**
 * The requester's half of the self-procurement hand-off: IT already told them
 * to go buy this themselves (see selfProcurement.ts's markUserProcured); this
 * is them reporting back what they got and what it cost, so IT can review it
 * and complete the request.
 */
export default function EnterSelfProcuredDetailsDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "form" });
  const [itemName, setItemName] = useState("");
  const [cost, setCost] = useState("");
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "form" });
        setItemName("");
        setCost("");
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

    const trimmedName = itemName.trim();
    const parsedCost = Number(cost);

    if (!trimmedName) {
      setDialogState({ phase: "error", message: "Enter what you bought." });
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      setDialogState({ phase: "error", message: "Enter a cost of zero or more." });
      return;
    }

    setDialogState({ phase: "submitting" });
    try {
      await submitSelfProcuredDetails(request.id, { itemName: trimmedName, cost: parsedCost });
      setDialogState({ phase: "success" });
    } catch (err: any) {
      setDialogState({ phase: "error", message: err.message || "Failed to submit item details." });
    }
  }

  function renderHeader() {
    const config = (() => {
      switch (dialogState.phase) {
        case "form":
          return {
            icon: "shopping_cart",
            title: "What did you buy?",
            subtitle:
              "IT approved this as something you can go and purchase yourself. Enter what you got and what it cost — IT will review it to finish off your request.",
          };
        case "submitting":
          return { icon: "save", title: "Submitting...", subtitle: "" };
        case "success":
          return { icon: "check_circle", title: "Thanks!", subtitle: "" };
        case "error":
          return { icon: "error", title: "Something went wrong", subtitle: "" };
      }
    })();

    return (
      <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
          <span className="material-symbols-outlined text-modal-text-accent">{config.icon}</span>
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

  function renderBody() {
    switch (dialogState.phase) {
      case "form":
        return (
          <div className="p-8 space-y-6">
            <div className="bg-modal-surface-elevated/50 border border-modal-border/20 rounded-lg p-4 space-y-1">
              <div className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">
                For
              </div>
              <div className="text-sm text-modal-text-primary font-medium">
                {request?.categoryName}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
                What you bought
              </label>
              <input
                className="w-full bg-modal-surface-elevated/50 border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
                value={itemName}
                placeholder="e.g. Spigen phone case"
                onChange={(e) => setItemName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
                What it cost
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full bg-modal-surface-elevated/50 border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
                value={cost}
                placeholder="e.g. 24.99"
                onChange={(e) => setCost(e.target.value)}
              />
            </div>
          </div>
        );
      case "submitting":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            Submitting...
          </div>
        );
      case "success":
        return (
          <div className="p-8 text-center space-y-4">
            <p className="text-sm text-modal-text-primary leading-relaxed max-w-md mx-auto">
              IT will review this and complete your request.
            </p>
          </div>
        );
      case "error":
        return (
          <div className="p-8 space-y-4">
            <div className="bg-modal-error/10 border border-modal-error/30 rounded-lg p-4">
              <p className="text-sm text-modal-error leading-relaxed">{dialogState.message}</p>
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
      case "error":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={handleSubmit}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-brand hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
            >
              Submit
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
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-brand hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
            >
              Done
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
