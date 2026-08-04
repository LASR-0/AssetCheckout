type Props = {
  value: "STANDARD" | "NON_STANDARD";
  reason: string;
  /** Optional "what model do you have in mind?" free text. Shared by the
   *  asset and accessory forms; only offered on non-standard requests. */
  preferredModel: string;
  onChange: (val: "STANDARD" | "NON_STANDARD") => void;
  onReasonChange: (val: string) => void;
  onPreferredModelChange: (val: string) => void;
  /**
   * Pin the toggle to one value and disable it. The accessory form drives
   * this from its option choice: "Something else" pins NON_STANDARD, a named
   * option pins STANDARD — a catalogued accessory is standard by definition,
   * so offering the choice would let someone send a contradiction.
   *
   * Carries WHICH value rather than a bare boolean, because the two locks pull
   * in opposite directions. The parent still derives the effective value it
   * submits; this component only shows and enforces it. Optional, so the asset
   * form (no options, always a free choice) is unaffected.
   */
  lockedTo?: "STANDARD" | "NON_STANDARD";
  /** Shown under the toggle while locked. */
  lockedHint?: string;
};

export default function SpecLevelToggle({
  value,
  reason,
  preferredModel,
  onChange,
  onReasonChange,
  onPreferredModelChange,
  lockedTo,
  lockedHint,
}: Props) {
  // While locked, display the pinned value regardless of the user's own
  // (preserved) choice — same display-the-derived-state pattern as the
  // call&text → data checkbox on the asset form.
  const locked = lockedTo !== undefined;
  const displayValue = lockedTo ?? value;

  return (
    <section className="space-y-4">
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        4. Specification Level
      </label>

      <div className="inline-flex p-1 bg-surface-container rounded-lg">
        {/* The dim goes on whichever option is NOT the pinned one, so the lock
            reads the same in both directions. It used to be hard-coded onto
            Standard, which was right only while the sole lock pinned
            NON_STANDARD — locking to STANDARD faded the active button. */}
        {(["STANDARD", "NON_STANDARD"] as const).map((option) => {
          const active = displayValue === option;
          return (
            <button
              key={option}
              type="button"
              disabled={locked}
              onClick={() => onChange(option)}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-all
                ${locked
                  ? `cursor-not-allowed${active ? "" : " opacity-40"}`
                  : "hover:cursor-pointer"}
                ${active
                  ? "bg-surface-container-lowest text-on-background shadow-sm"
                  : "text-on-surface-variant/25"}`}
            >
              {option === "STANDARD" ? "Standard" : "Non-Standard"}
            </button>
          );
        })}
      </div>

      {locked && (
        <p className="text-xs text-info-light ml-2">
          {lockedHint ??
            (lockedTo === "STANDARD"
              ? "Your selection above sets this."
              : "This selection requires a non-standard request.")}
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

          {/* Optional, and deliberately inside the non-standard block so the
              standard path — which has been stable in production — gains no
              field and no validation. Blank is normalised to null server-side. */}
          <label className="block text-sm ml-2 font-medium text-on-surface-variant pt-2">
            What model do you have in mind?{" "}
            <span className="font-normal text-info-light">(optional)</span>
          </label>

          <input
            type="text"
            value={preferredModel}
            onChange={(e) => onPreferredModelChange(e.target.value)}
            placeholder="e.g. ThinkPad T16 Gen 1 — leave blank if you don't mind"
            className="w-full p-4 border border-outline rounded-xl bg-surface-container/40 text-on-surface-variant focus:outline-0 transition-all"
          />
        </div>
      )}
    </section>
  );
}