type Props = {
  value: "STANDARD" | "NON_STANDARD";
  reason: string;
  onChange: (val: "STANDARD" | "NON_STANDARD") => void;
  onReasonChange: (val: string) => void;
  /**
   * One-way lock to NON_STANDARD while true (accessory "Something else").
   * The parent derives the effective value; this component just disables
   * the choice and explains why. Optional and default-off, so the asset
   * form is unaffected.
   */
  locked?: boolean;
  /** Shown under the toggle while locked. */
  lockedHint?: string;
};

export default function SpecLevelToggle({
  value,
  reason,
  onChange,
  onReasonChange,
  locked = false,
  lockedHint,
}: Props) {
  // While locked, display NON_STANDARD regardless of the user's own
  // (preserved) choice — same display-the-derived-state pattern as the
  // call&text → data checkbox on the asset form.
  const displayValue = locked ? "NON_STANDARD" : value;

  return (
    <section className="space-y-4">
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        4. Specification Level
      </label>

      <div className="inline-flex p-1 bg-surface-container rounded-lg">
        <button
          type="button"
          disabled={locked}
          onClick={() => onChange("STANDARD")}
          className={`px-6 py-2 rounded-md text-sm font-medium transition-all
            ${locked ? "cursor-not-allowed opacity-40" : "hover:cursor-pointer"}
            ${displayValue === "STANDARD"
              ? "bg-surface-container-lowest text-on-background shadow-sm"
              : "text-on-surface-variant/25"}`}
        >
          Standard
        </button>

        <button
          type="button"
          disabled={locked}
          onClick={() => onChange("NON_STANDARD")}
          className={`px-6 py-2 rounded-md text-sm font-medium transition-all
            ${locked ? "cursor-not-allowed" : "hover:cursor-pointer"}
            ${displayValue === "NON_STANDARD"
              ? "bg-surface-container-lowest text-on-background shadow-sm"
              : "text-on-surface-variant/25"}`}
        >
          Non-Standard
        </button>
      </div>

      {locked && (
        <p className="text-xs text-info-light ml-2">
          {lockedHint ?? "This selection requires a non-standard request."}
        </p>
      )}

      {displayValue === "NON_STANDARD" && (
        <div className="space-y-2">
          <label className="text-sm ml-2 font-medium text-on-surface-variant">
            Reason for non-standard request
          </label>

          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={4}
            placeholder="Explain why this asset is required... (e.g., 'I need a bigger screen', 'I want an Android specifically')"
            className="w-full p-4 border border-outline rounded-xl bg-surface-container/40 text-on-surface-variant focus:outline-0 transition-all"
          />
        </div>
      )}
    </section>
  );
}