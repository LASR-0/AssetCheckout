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
import {
  searchAccessoriesForRequest,
  useExistingAccessory,
  createAccessoryForRequest,
  type AccessorySearchMatch,
} from "@/api/accessories";

type ErrorReturnPhase = "form" | "matches";

type DialogState =
  | { phase: "form" }
  | { phase: "searching" }
  | { phase: "matches"; candidates: AccessorySearchMatch[] }
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
  name: string;
  manufacturer: string;
  modelNumber: string;
};

const EMPTY_FORM: FormFields = {
  name: "",
  manufacturer: "",
  modelNumber: "",
};

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentUserName: string;
};

export default function CreateAccessoryDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "form" });
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [locations, setLocations] = useState<SnipeNamedRecord[]>([]);
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "form" });
        setForm(EMPTY_FORM);
        setLocationId(null);
        successFiredRef.current = false;
      }, 200);
      return () => clearTimeout(t);
    }

    // Pre-fill from the ModelRequest buffer if a prior selection populated it.
    if (request?.modelRequest) {
      setForm({
        name: request.modelRequest.modelName ?? "",
        manufacturer: request.modelRequest.manufacturer ?? "",
        modelNumber: request.modelRequest.modelNumber ?? "",
      });
    }
  }, [open, request]);

  // Load locations once when the dialog opens — needed for the create-new
  // path, which authors the new accessory's site.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const locs = await getLocations();
        if (!cancelled) setLocations(locs);
      } catch (err) {
        // Non-fatal: search + pick-existing still work; only create-new needs
        // locations. The create path guards on a chosen location anyway.
        console.error("Failed to load locations for accessory create", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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

    const name = form.name.trim();
    const manufacturer = form.manufacturer.trim();

    // Name is the required search key (accessories often lack manufacturer).
    if (!name) {
      setDialogState({
        phase: "error",
        message: "Enter an accessory name to search.",
        retryable: true,
        returnPhase: "form",
      });
      return;
    }

    setDialogState({ phase: "searching" });

    try {
      const matches = await searchAccessoriesForRequest(request.id, {
        name,
        manufacturer: manufacturer || undefined,
        locationId: locationId ?? undefined,
      });

      // Zero matches still lands on the matches phase — with an empty list and
      // the "Create new anyway" action. This gives the admin a chance to set a
      // location (required for create) rather than force-creating and bouncing
      // to a location error.
      setDialogState({ phase: "matches", candidates: matches });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to search for accessories.",
        retryable: true,
        returnPhase: "form",
      });
    }
  }

  async function runUseExisting(match: AccessorySearchMatch) {
    if (!request) return;
    setDialogState({ phase: "linking" });

    try {
      await useExistingAccessory(request.id, match.id);

      // Stock present → backend checked out + completed. No stock → waiting
      // phase. The match's own stock count tells us which message to show;
      // the row will surface "Add stock" after reload if it's the latter.
      const hasStock = match.hasAvailable;
      setDialogState({
        phase: "success",
        kind: "use-existing",
        message: hasStock
          ? `${match.name} assigned and checked out.`
          : `${match.name} selected — it has no stock yet. Use "Add stock" on the request to enter the quantity once it arrives.`,
      });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to select the accessory.",
        retryable: true,
        returnPhase: "matches",
      });
    }
  }

  async function runCreateNew() {
    if (!request) return;

    // Location is required to create a new accessory (it authors the site).
    if (locationId === null) {
      setDialogState({
        phase: "error",
        message:
          "Choose a location for the new accessory before creating it — this sets where the stock lives.",
        retryable: true,
        returnPhase: "form",
      });
      return;
    }

    setDialogState({ phase: "creating" });

    try {
      await createAccessoryForRequest(request.id, {
        name: form.name.trim(),
        locationId,
        manufacturer: form.manufacturer.trim() || null,
        modelNumber: form.modelNumber.trim() || null,
      });

      setDialogState({
        phase: "success",
        kind: "create-new",
        message:
          'New accessory created with no stock. Use "Add stock" on the request to enter the quantity once it arrives.',
      });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to create the new accessory.",
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
            icon: "cable",
            title: "Select or Create Accessory",
            subtitle:
              "Search for an existing accessory, or create a new one if it isn't in Snipe-IT yet.",
          };
        case "searching":
          return {
            icon: "search",
            title: "Searching for matches...",
            subtitle: "Looking for existing accessories in Snipe-IT.",
          };
        case "matches":
          return {
            icon: "inventory_2",
            title: "Existing accessory matches",
            subtitle: "Select a specific record to use, or create a new one.",
          };
        case "creating":
          return {
            icon: "add_box",
            title: "Creating accessory...",
            subtitle: "Adding the new accessory to Snipe-IT.",
          };
        case "linking":
          return {
            icon: "link",
            title: "Selecting accessory...",
            subtitle: "Assigning the accessory to this request.",
          };
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
            Accessory Name
          </label>
          <input
            disabled={disabled}
            className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
            value={form.name}
            placeholder="e.g. USB-C to Lightning cable"
            onChange={(e) =>
              setForm((prev) => ({ ...prev, name: e.target.value }))
            }
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Manufacturer <span className="normal-case font-normal text-info-light">(optional)</span>
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
              Model Number <span className="normal-case font-normal text-info-light">(optional)</span>
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

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
            Location{" "}
            <span className="normal-case font-normal text-info-light">
              (filters search; required to create a new accessory)
            </span>
          </label>
          <ComboboxField
            keyHint={`create-accessory-location-${locationId ?? "none"}`}
            items={locations.map((l) => l.name)}
            defaultValue={
              locationId !== null
                ? locations.find((l) => l.id === locationId)?.name ?? ""
                : ""
            }
            placeholder="Select a location..."
            disabled={disabled}
            onSelect={(name) => {
              const id = locations.find((l) => l.name === name)?.id ?? null;
              setLocationId(id);
            }}
          />
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
            <span className="text-modal-text-secondary">Name: </span>
            {form.name}
          </div>
          {form.manufacturer && (
            <div>
              <span className="text-modal-text-secondary">Manufacturer: </span>
              {form.manufacturer}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderMatchesTable(candidates: AccessorySearchMatch[]) {
    if (candidates.length === 0) {
      return (
        <div className="border border-modal-border/20 rounded-lg p-6 text-center">
          <p className="text-sm text-modal-text-secondary">
            No existing accessories matched. Pick a location above and choose
            "Create new" to add it to Snipe-IT.
          </p>
        </div>
      );
    }
    return (
      <div className="border border-modal-border/20 rounded-lg overflow-hidden">
        <div className="bg-modal-surface-elevated px-4 py-2 text-xs font-bold uppercase tracking-widest text-modal-text-secondary border-b border-modal-border/20">
          {candidates.length} match{candidates.length === 1 ? "" : "es"}
        </div>
        <div className="divide-y divide-modal-border/10 max-h-72 overflow-y-auto">
          {candidates.map((c) => {
            const noStock = !c.hasAvailable;
            return (
              <div
                key={c.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-modal-surface-elevated/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-modal-text-primary">
                      {c.name}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                        noStock
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/30"
                          : "bg-green-500/10 text-green-600 border-green-500/30"
                      }`}
                    >
                      <span className="material-symbols-outlined !text-[12px]">
                        inventory_2
                      </span>
                      {noStock ? "No stock" : `${c.remaining} in stock`}
                    </span>
                  </div>
                  <div className="text-xs text-modal-text-secondary w-[85%] mt-0.5">
                    {/* Location is essential — the admin picks one specific
                        per-site record. */}
                    <span className="material-symbols-outlined !text-[12px] align-middle mr-0.5">
                      location_on
                    </span>
                    {c.locationName ?? "No location"}
                    {c.manufacturer ? ` · ${c.manufacturer}` : ""}
                    {c.modelNumber ? ` · ${c.modelNumber}` : ""}
                    {noStock &&
                      " · selecting starts the waiting phase — add the quantity once it arrives"}
                  </div>
                </div>
                <button
                  onClick={() => runUseExisting(c)}
                  className="px-4 py-2 rounded-md text-xs font-bold text-white twilight-gradient hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all shrink-0"
                >
                  Select
                </button>
              </div>
            );
          })}
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
            {/* Location picker repeated here so it can be set before "Create
                new anyway" — required for the create path. */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
                Location{" "}
                <span className="normal-case font-normal text-info-light">
                  (needed to create a new accessory)
                </span>
              </label>
              <ComboboxField
                keyHint={`matches-location-${locationId ?? "none"}`}
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
          </div>
        );

      case "creating":
      case "linking":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            {dialogState.phase === "creating"
              ? "Creating accessory in Snipe-IT..."
              : "Selecting and assigning accessory..."}
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
              Search
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