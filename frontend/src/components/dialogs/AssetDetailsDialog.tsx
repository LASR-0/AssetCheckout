import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import ComboboxField from "@/components/ui/comboboxfield";
import { useEffect, useState, useRef } from "react";
import type { Request } from "@/types/requestType";
import {
  getCompanies,
  getLocations,
  getStatuses,
} from "@/api/snipe";
import { getTiers } from "@/api/analytics";
import type { SnipeNamedRecord } from "@/types/snipeTypes";

type DialogState =
  | { phase: "loading" }
  | { phase: "form" }
  | { phase: "submitting" }
  | { phase: "success"; assetReady: boolean; message: string }
  | { phase: "error"; message: string; retryable: boolean };

type FormFields = {
  companyId: number | null;
  serial: string;
  statusId: number | null;
  locationId: number | null;
  tier: string;
  price: string;
  assetTag: string;
};

const EMPTY_FORM: FormFields = {
  companyId: null,
  serial: "",
  statusId: null,
  locationId: null,
  tier: "",
  price: "",
  assetTag: "",
};

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentUserName: string;
  averages: Record<string, Record<number, number>>;
};

const PRICE_COMPARISON_THRESHOLD = 0.1;

export default function AssetDetailsDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
  currentUserName,
  averages,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "loading" });
  const [form, setForm] = useState<FormFields>(EMPTY_FORM);

  const [companies, setCompanies] = useState<SnipeNamedRecord[]>([]);
  const [locations, setLocations] = useState<SnipeNamedRecord[]>([]);
  const [statuses, setStatuses] = useState<SnipeNamedRecord[]>([]);
  const [tierValues, setTierValues] = useState<string[]>([]);

  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "loading" });
        setForm(EMPTY_FORM);
        successFiredRef.current = false;
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !request) return;
    if (!request.modelRequest?.linkedAssetId) {
      setDialogState({
        phase: "error",
        message: "This request has no linked asset — cannot open Asset Details.",
        retryable: false,
      });
      return;
    }

    let cancelled = false;
    async function load() {
      try {
        setDialogState({ phase: "loading" });

        const [
          companiesData,
          locationsData,
          statusesData,
          tierValuesData,
          assetData,
        ] = await Promise.all([
          getCompanies(),
          getLocations(),
          getStatuses(),
          getTiers(),
          fetch(`/api/snipe/asset/${request!.modelRequest!.linkedAssetId}`, {
            headers: {
              "x-dev-user-name": currentUserName,
            },
          }).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (cancelled) return;

        setCompanies(companiesData);
        setLocations(locationsData);
        setStatuses(statusesData);
        setTierValues(tierValuesData);

        const readyStatus = statusesData.find(
          (s) => s.name.trim().toLowerCase() === "ready to deploy"
        );

        const asset = assetData?.asset ?? null;

        const initial: FormFields = {
          companyId: asset?.company?.id ?? null,
          serial: asset?.serial ?? "",
          statusId: asset?.status_label?.id ?? readyStatus?.id ?? null,
          locationId: asset?.location?.id ?? null,
          tier: asset?.custom_fields?.Tier?.value ?? "",
          price:
            request!.modelRequest!.price !== null &&
            request!.modelRequest!.price !== undefined
              ? String(request!.modelRequest!.price)
              : "",
          assetTag: asset?.asset_tag ?? "",
        };

        setForm(initial);
        setDialogState({ phase: "form" });
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load Asset Details dialog data", err);
          setDialogState({
            phase: "error",
            message:
              "Failed to load required data. Check your connection to Snipe-IT and try again.",
            retryable: true,
          });
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, request, currentUserName]);

  useEffect(() => {
    if (dialogState.phase === "success" && !successFiredRef.current) {
      successFiredRef.current = true;
      onSuccess();
    }
  }, [dialogState, onSuccess]);

  function close() {
    onOpenChange(false);
  }

  function updateField<K extends keyof FormFields>(field: K, value: FormFields[K]) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function getRelevantAverage(): number | null {
    if (!form.tier || !request) return null;
    const tierKey = form.tier.toLowerCase();
    const tierAverages = averages[tierKey];
    if (!tierAverages) return null;
    const avg = tierAverages[request.categoryId];
    return typeof avg === "number" && Number.isFinite(avg) ? avg : null;
  }

  function getPriceColorState(): "neutral" | "good" | "warning" {
    const avg = getRelevantAverage();
    if (avg === null) return "neutral";
    const priceNum = parseFloat(form.price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return "neutral";
    const upperBound = avg * (1 + PRICE_COMPARISON_THRESHOLD);
    if (priceNum <= upperBound) return "good";
    return "warning";
  }

  function buildSaveSummary() {
    const companyName =
      form.companyId !== null
        ? companies.find((c) => c.id === form.companyId)?.name ?? `#${form.companyId}`
        : "";
    const statusName =
      form.statusId !== null
        ? statuses.find((s) => s.id === form.statusId)?.name ?? `#${form.statusId}`
        : "";
    const locationName =
      form.locationId !== null
        ? locations.find((l) => l.id === form.locationId)?.name ?? `#${form.locationId}`
        : "";

    return [
      { label: "Company", display: companyName, isCleared: !companyName },
      { label: "Serial", display: form.serial, isCleared: !form.serial },
      { label: "Status", display: statusName, isCleared: !statusName },
      { label: "Location", display: locationName, isCleared: !locationName },
      { label: "Tier", display: form.tier, isCleared: !form.tier },
      { label: "Price", display: form.price ? `$${form.price}` : "", isCleared: !form.price },
    ];
  }

  async function handleSubmit() {
    if (!request) return;
    setDialogState({ phase: "submitting" });

    try {
      const body = {
        companyId: form.companyId,
        serial: form.serial.trim(),
        statusId: form.statusId,
        locationId: form.locationId,
        tier: form.tier.trim(),
        price: form.price === "" ? undefined : parseFloat(form.price),
      };

      const res = await fetch(`/api/approval/${request.id}/asset-details`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-user-name": currentUserName,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Submission failed");
      }

      const assetReady = data?.modelRequest?.assetReady === true;
      setDialogState({
        phase: "success",
        assetReady,
        message: assetReady
          ? "Asset details saved. The asset is ready to check out."
          : "Partial save successful. The asset isn't fully complete yet — re-open this dialog when more info is available.",
      });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to save asset details.",
        retryable: true,
      });
    }
  }

  function handleErrorRetry() {
    if (dialogState.phase !== "error") return;
    setDialogState({ phase: "form" });
  }

  // Pre-populated display names for the four comboboxes. Derived from form
  // state so they re-derive after async load completes.
  const initialCompanyName =
    form.companyId !== null
      ? companies.find((c) => c.id === form.companyId)?.name ?? ""
      : "";
  const initialLocationName =
    form.locationId !== null
      ? locations.find((l) => l.id === form.locationId)?.name ?? ""
      : "";
  const initialStatusName =
    form.statusId !== null
      ? statuses.find((s) => s.id === form.statusId)?.name ?? ""
      : "";
  const initialTier = form.tier;

  ///  +---------------------------------------------------------------+
  ///  |                         RENDER                                |
  ///  +---------------------------------------------------------------+

  function renderHeader() {
    const config = (() => {
      switch (dialogState.phase) {
        case "loading":
          return { icon: "hourglass_empty", title: "Loading...", subtitle: "" };
        case "form":
          return {
            icon: "edit_note",
            title: "Asset Details",
            subtitle:
              "Fill in what you know now — you can come back later to fill in the rest. The asset becomes ready for checkout once all fields are complete.",
          };
        case "submitting":
          return { icon: "save", title: "Saving...", subtitle: "Updating asset in Snipe-IT." };
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

  function renderFormBody() {
    const priceColor = getPriceColorState();
    const avg = getRelevantAverage();

    const priceBorderClass =
      priceColor === "good"
        ? "border-green-500/60"
        : priceColor === "warning"
          ? "border-red-500/60"
          : "border-modal-border/20";

    const priceTextClass =
      priceColor === "good"
        ? "text-green-500"
        : priceColor === "warning"
          ? "text-red-500"
          : "text-modal-text-secondary";

    return (
      <>
        <PartialSaveBanner entries={buildSaveSummary()} />

        <div className="p-8 pt-5 space-y-5">
          <FieldLabel>Asset Tag (auto-generated)</FieldLabel>
          <input
            disabled
            className="w-full bg-surface-container/40 border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm opacity-70"
            value={form.assetTag || "(not yet assigned)"}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <FieldLabel>Company</FieldLabel>
              <ComboboxField
                keyHint={`company-${initialCompanyName}`}
                items={companies.map((c) => c.name)}
                defaultValue={initialCompanyName}
                placeholder="Select a company..."
                onSelect={(name) => {
                  const id = companies.find((c) => c.name === name)?.id ?? null;
                  updateField("companyId", id);
                }}
              />
            </div>

            <div>
              <FieldLabel>Default Location</FieldLabel>
              <ComboboxField
                keyHint={`location-${initialLocationName}`}
                items={locations.map((l) => l.name)}
                defaultValue={initialLocationName}
                placeholder="Select a location..."
                onSelect={(name) => {
                  const id = locations.find((l) => l.name === name)?.id ?? null;
                  updateField("locationId", id);
                }}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Serial</FieldLabel>
            <input
              value={form.serial}
              onChange={(e) => setForm((p) => ({ ...p, serial: e.target.value }))}
              className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
              placeholder="Leave empty to clear in Snipe"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <FieldLabel>Status</FieldLabel>
              <ComboboxField
                keyHint={`status-${initialStatusName}`}
                items={statuses.map((s) => s.name)}
                defaultValue={initialStatusName}
                placeholder="Select a status..."
                onSelect={(name) => {
                  const id = statuses.find((s) => s.name === name)?.id ?? null;
                  updateField("statusId", id);
                }}
              />
            </div>

            <div>
              <FieldLabel>Tier</FieldLabel>
              <ComboboxField
                keyHint={`tier-${initialTier}`}
                items={tierValues}
                defaultValue={initialTier}
                placeholder="Select a tier..."
                onSelect={(name) => updateField("tier", name)}
              />
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2 ml-1">
              <label className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">
                Price
              </label>
              {avg !== null && (
                <span className="text-xs text-info-light">
                  Avg for {form.tier}: ${avg.toFixed(2)}
                </span>
              )}
            </div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.price}
              onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
              className={`w-full bg-modal-surface-elevated border ${priceBorderClass} rounded-lg py-3 px-4 ${priceTextClass} text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20 transition-colors`}
              placeholder="0.00"
            />
          </div>
        </div>
      </>
    );
  }

  function renderBody() {
    switch (dialogState.phase) {
      case "loading":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            Loading...
          </div>
        );
      case "form":
        return renderFormBody();
      case "submitting":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            Saving asset details...
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
      case "loading":
      case "submitting":
        return null;
      case "form":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <PrimaryButton onClick={handleSubmit}>Save Details</PrimaryButton>
            <SecondaryButton onClick={close}>Cancel</SecondaryButton>
          </ResponsiveDialogFooter>
        );
      case "success":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <PrimaryButton onClick={close} autoFocus>
              Done
            </PrimaryButton>
          </ResponsiveDialogFooter>
        );
      case "error":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            {dialogState.retryable && (
              <PrimaryButton onClick={handleErrorRetry} autoFocus>
                Try again
              </PrimaryButton>
            )}
            <SecondaryButton onClick={close}>Close</SecondaryButton>
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
          md:min-w-[640px]
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

///  +-----------------------------------------------------------------+
///  |                       INLINE HELPERS                            |
///  +-----------------------------------------------------------------+
//
//  Small UI bits used only here. Keeping them in-file means the dialog
//  stays self-contained — only ComboboxField is shared.
///  +-----------------------------------------------------------------+

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
      {children}
    </label>
  );
}

function PrimaryButton({
  onClick,
  autoFocus,
  children,
}: {
  onClick: () => void;
  autoFocus?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      autoFocus={autoFocus}
      className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors"
    >
      {children}
    </button>
  );
}

function PartialSaveBanner({
  entries,
}: {
  entries: { label: string; display: string; isCleared: boolean }[];
}) {
  const hasAnyCleared = entries.some((e) => e.isCleared);
  if (!hasAnyCleared) return null;

  return (
    <div className="mx-8 mt-2 mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined !text-base text-amber-600 mt-0.5">info</span>
        <div className="flex-1 text-sm">
          <div className="font-bold text-amber-700 mb-1">
            Partial save — some fields are empty
          </div>
          <div className="text-amber-700/90 leading-relaxed">
            The following will be submitted to Snipe-IT:
            <ul className="mt-2 space-y-0.5 text-xs">
              {entries.map((entry) => (
                <li key={entry.label}>
                  <span className="font-semibold">{entry.label}:</span>{" "}
                  {entry.isCleared ? (
                    <span className="italic opacity-70">will be cleared</span>
                  ) : (
                    <span>{entry.display}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}