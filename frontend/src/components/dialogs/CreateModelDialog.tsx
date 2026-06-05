import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState, useRef } from "react";
import type { Request } from "@/types/requestType";

type SnipeMatch = {
  id: number;
  name: string;
  manufacturer?: { id: number; name: string };
  model_number?: string;
};

type ErrorReturnPhase = "form" | "matches";

type DialogState =
  | { phase: "form" }
  | { phase: "searching" }
  | { phase: "matches"; candidates: SnipeMatch[] }
  | { phase: "creating" }
  | { phase: "linking" }
  | {
      phase: "success";
      kind: "use-existing" | "create-new";
      message: string;
    }
  | {
      phase: "error";
      message: string;
      retryable: boolean;
      returnPhase: ErrorReturnPhase;
    };

type FormFields = {
  manufacturer: string;
  modelName: string;
  modelNumber: string;
};

const EMPTY_FORM: FormFields = {
  manufacturer: "",
  modelName: "",
  modelNumber: "",
};

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentUserName: string;
};

export default function CreateModelDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
  currentUserName,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "form" });
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "form" });
        setForm(EMPTY_FORM);
        successFiredRef.current = false;
      }, 200);
      return () => clearTimeout(t);
    }

    if (request?.modelRequest) {
      setForm({
        manufacturer: request.modelRequest.manufacturer ?? "",
        modelName: request.modelRequest.modelName ?? "",
        modelNumber: request.modelRequest.modelNumber ?? "",
      });
    }
  }, [open, request]);

  function close() {
    onOpenChange(false);
  }

  useEffect(() => {
    if (dialogState.phase === "success" && !successFiredRef.current) {
      successFiredRef.current = true;
      onSuccess();
    }
  }, [dialogState, onSuccess]);

  async function handleSearch() {
    if (!request) return;

    const manufacturer = form.manufacturer.trim();
    const modelName = form.modelName.trim();
    const modelNumber = form.modelNumber.trim();

    if (!manufacturer || !modelName || !modelNumber) {
      setDialogState({
        phase: "error",
        message: "Please fill in all three fields before continuing.",
        retryable: true,
        returnPhase: "form",
      });
      return;
    }

    setDialogState({ phase: "searching" });

    try {
      const params = new URLSearchParams({
        manufacturer,
        modelName,
      });
      const res = await fetch(
        `/api/approval/${request.id}/search-models?${params.toString()}`,
        {
          headers: { "x-dev-user-name": currentUserName },
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Search failed");
      }

      const data = await res.json();
      const matches: SnipeMatch[] = data.matches ?? [];

      if (matches.length === 0) {
        await runCreateNew();
        return;
      }

      setDialogState({ phase: "matches", candidates: matches });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to search for matching models.",
        retryable: true,
        returnPhase: "form",
      });
    }
  }

  async function runUseExisting(snipeModelId: number) {
    if (!request) return;
    setDialogState({ phase: "linking" });

    try {
      const res = await fetch(
        `/api/approval/${request.id}/use-existing-model`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-dev-user-name": currentUserName,
          },
          body: JSON.stringify({ snipeModelId }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to link model");
      }

      setDialogState({
        phase: "success",
        kind: "use-existing",
        message:
          "Existing model assigned. The asset is ready to be checked out.",
      });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to link the chosen model.",
        retryable: true,
        returnPhase: "matches",
      });
    }
  }

  async function runCreateNew() {
    if (!request) return;
    setDialogState({ phase: "creating" });

    try {
      const res = await fetch(`/api/approval/${request.id}/create-model`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-user-name": currentUserName,
        },
        body: JSON.stringify({
          manufacturer: form.manufacturer.trim(),
          modelName: form.modelName.trim(),
          modelNumber: form.modelNumber.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || "Failed to create model");
      }

      setDialogState({
        phase: "success",
        kind: "create-new",
        message:
          "New model created. Asset details still need to be filled in before checkout.",
      });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to create the new model.",
        retryable: true,
        returnPhase: "form",
      });
    }
  }

  function handleErrorRetry() {
    if (dialogState.phase !== "error") return;
    if (dialogState.returnPhase === "matches") {
      handleSearch();
    } else {
      setDialogState({ phase: "form" });
    }
  }

  function renderHeader() {
    const headerConfig = (() => {
      switch (dialogState.phase) {
        case "form":
          return {
            icon: "category",
            title: "Create Snipe-IT Model",
            subtitle: "Enter the model details below to begin.",
          };
        case "searching":
          return {
            icon: "search",
            title: "Searching for matches...",
            subtitle: "Looking for existing models in Snipe-IT.",
          };
        case "matches":
          return {
            icon: "inventory_2",
            title: "Existing model matches found",
            subtitle:
              "Select an existing model to use, or create a new one.",
          };
        case "creating":
          return {
            icon: "add_box",
            title: "Creating model...",
            subtitle: "Adding the new model and skeleton asset to Snipe-IT.",
          };
        case "linking":
          return {
            icon: "link",
            title: "Linking model...",
            subtitle: "Reserving the asset for this request.",
          };
        case "success":
          return {
            icon: "check_circle",
            title: "Done",
            subtitle: "",
          };
        case "error":
          return {
            icon: "error",
            title: "Something went wrong",
            subtitle: "",
          };
      }
    })();

    return (
      <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
          <span className="material-symbols-outlined text-modal-text-accent">
            {headerConfig.icon}
          </span>
        </div>
        <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
          {headerConfig.title}
        </ResponsiveDialogTitle>
        {headerConfig.subtitle && (
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {headerConfig.subtitle}
          </p>
        )}
      </ResponsiveDialogHeader>
    );
  }

  function renderFormFields(disabled: boolean) {
    return (
      <div className="space-y-6">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
            Model Name
          </label>
          <input
            disabled={disabled}
            className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
            value={form.modelName}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, modelName: e.target.value }))
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Manufacturer
            </label>
            <input
              disabled={disabled}
              className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
              value={form.manufacturer}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, manufacturer: e.target.value }))
              }
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Model Number
            </label>
            <input
              disabled={disabled}
              className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
              value={form.modelNumber}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, modelNumber: e.target.value }))
              }
            />
          </div>
        </div>
      </div>
    );
  }

  function renderFormSummary() {
    return (
      <div className="bg-modal-surface-elevated border border-modal-border/20 rounded-lg p-4 space-y-2">
        <div className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">
          Searched for
        </div>
        <div className="text-sm text-modal-text-primary space-y-1">
          <div>
            <span className="text-modal-text-secondary">Model: </span>
            {form.modelName}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-modal-text-secondary">Manufacturer: </span>
              {form.manufacturer}
            </div>
            <div>
              <span className="text-modal-text-secondary">Number: </span>
              {form.modelNumber}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderMatchesTable(candidates: SnipeMatch[]) {
    return (
      <div className="border border-modal-border/20 rounded-lg overflow-hidden">
        <div className="bg-modal-surface-elevated px-4 py-2 text-xs font-bold uppercase tracking-widest text-modal-text-secondary border-b border-modal-border/20">
          {candidates.length} match{candidates.length === 1 ? "" : "es"}
        </div>
        <div className="divide-y divide-modal-border/10">
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-4 py-3 hover:bg-modal-surface-elevated/50 transition-colors"
            >
              <div className="flex-1">
                <div className="text-sm font-medium text-modal-text-primary">
                  {c.name}
                </div>
                <div className="text-xs text-modal-text-secondary mt-0.5">
                  {c.manufacturer?.name ?? "—"}
                  {c.model_number ? ` · ${c.model_number}` : ""}
                </div>
              </div>
              <button
                onClick={() => runUseExisting(c.id)}
                className="px-4 py-2 rounded-md text-xs font-bold text-white twilight-gradient hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
              >
                Select
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderBody() {
    switch (dialogState.phase) {
      case "form":
        return <div className="p-8">{renderFormFields(false)}</div>;

      case "searching":
        return (
          <div className="p-8 space-y-6">
            {renderFormFields(true)}
            <div className="flex items-center justify-center gap-3 py-2 text-info-light text-sm">
              <span className="animate-spin h-4 w-4 border-2 border-outline border-t-transparent rounded-full" />
              Searching Snipe-IT...
            </div>
          </div>
        );

      case "matches":
        return (
          <div className="p-8 space-y-6">
            {renderFormSummary()}
            {renderMatchesTable(dialogState.candidates)}
          </div>
        );

      case "creating":
      case "linking":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            {dialogState.phase === "creating"
              ? "Creating model in Snipe-IT..."
              : "Linking and reserving asset..."}
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
      case "form":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={handleSearch}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
            >
              Create Model
            </button>
            <button
              onClick={close}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors"
            >
              Cancel
            </button>
          </ResponsiveDialogFooter>
        );

      case "searching":
      case "creating":
      case "linking":
        return null;

      case "matches":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={runCreateNew}
              autoFocus
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
            >
              Create new anyway
            </button>
            <button
              onClick={() => setDialogState({ phase: "form" })}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary hover:text-modal-error font-bold text-sm hover:bg-error/10 hover:cursor-pointer transition-colors"
            >
              Back to form
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