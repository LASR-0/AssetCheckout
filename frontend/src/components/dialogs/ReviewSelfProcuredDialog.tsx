import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState, useRef } from "react";
import ComboboxField from "@/components/ui/comboboxfield";
import type { Request } from "@/types/requestType";
import { getLocations } from "@/api/snipe";
import type { SnipeNamedRecord } from "@/types/snipeTypes";
import { reviewSelfProcured } from "@/api/selfProcurement";
import { formatQuoteAmount } from "@/api/quotes";

type DialogState =
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string };

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

/**
 * IT's final call on a self-procured item: is it worth a Snipe record, or
 * just a Checkout one? Either way this completes the request — the
 * requester already has the item in hand, so there's no ship/collect step
 * to run afterwards.
 */
export default function ReviewSelfProcuredDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "form" });
  const [recordInSnipe, setRecordInSnipe] = useState(false);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locations, setLocations] = useState<SnipeNamedRecord[]>([]);
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "form" });
        setRecordInSnipe(false);
        setLocationId(null);
        successFiredRef.current = false;
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const locs = await getLocations();
        if (!cancelled) setLocations(locs);
      } catch (err) {
        console.error("Failed to load locations for self-procured review", err);
      }
    })();
    return () => {
      cancelled = true;
    };
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

    if (recordInSnipe && locationId === null) {
      setDialogState({
        phase: "error",
        message: "Choose a location before recording this in Snipe.",
      });
      return;
    }

    setDialogState({ phase: "submitting" });
    try {
      await reviewSelfProcured(request.id, {
        recordInSnipe,
        locationId: recordInSnipe ? locationId! : undefined,
      });
      setDialogState({
        phase: "success",
        message: recordInSnipe
          ? "Recorded in Snipe and request completed."
          : "Request completed — kept as a Checkout-only record.",
      });
    } catch (err: any) {
      setDialogState({ phase: "error", message: err.message || "Failed to complete the request." });
    }
  }

  const detail = request?.selfProcured;

  function renderHeader() {
    const config = (() => {
      switch (dialogState.phase) {
        case "form":
          return {
            icon: "fact_check",
            title: "Review procurement",
            subtitle: `${request?.userName ?? "The requester"} bought this themselves — decide whether it's worth a Snipe record.`,
          };
        case "submitting":
          return { icon: "save", title: "Completing...", subtitle: "" };
        case "success":
          return { icon: "check_circle", title: "Done", subtitle: "" };
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
            <div className="bg-modal-surface-elevated/50 border border-modal-border/20 rounded-lg p-4 space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">
                What they bought
              </div>
              <div className="text-sm text-modal-text-primary font-medium">
                {detail?.itemName ?? "—"}
              </div>
              <div className="text-sm text-modal-text-secondary">
                {typeof detail?.cost === "number" ? formatQuoteAmount(detail.cost) : "—"}
              </div>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setRecordInSnipe(false)}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                  !recordInSnipe
                    ? "border-modal-brand bg-modal-brand/10"
                    : "border-modal-border/20 hover:bg-modal-surface-elevated/40"
                }`}
              >
                <div className="text-sm font-semibold text-modal-text-primary">Checkout-only record</div>
                <div className="text-xs text-info-light">
                  Nothing is written to Snipe — this record is kept here only. Good for insignificant items like a phone case.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRecordInSnipe(true)}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                  recordInSnipe
                    ? "border-modal-brand bg-modal-brand/10"
                    : "border-modal-border/20 hover:bg-modal-surface-elevated/40"
                }`}
              >
                <div className="text-sm font-semibold text-modal-text-primary">Record in Snipe</div>
                <div className="text-xs text-info-light">
                  Creates a Snipe accessory record and checks it out to {request?.userName ?? "the requester"}.
                </div>
              </button>
            </div>

            {recordInSnipe && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
                  Location
                </label>
                <ComboboxField
                  keyHint={`review-self-procured-location-${locationId ?? "none"}`}
                  items={locations.map((l) => l.name)}
                  defaultValue={
                    locationId !== null
                      ? locations.find((l) => l.id === locationId)?.name ?? ""
                      : ""
                  }
                  placeholder="Select a location..."
                  onSelect={(name) => {
                    const id = locations.find((l) => l.name === name)?.id ?? null;
                    setLocationId(id);
                  }}
                />
              </div>
            )}
          </div>
        );
      case "submitting":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            Completing the request...
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
              Complete request
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
