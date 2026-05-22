type Props = {
  value: string;
  reason: string;
  onChange: (value: string) => void;
  onReasonChange: (value: string) => void;
};

export default function SpecLevelToggle({
  value,
  reason,
  onChange,
  onReasonChange,
}: Props) {
  return (
    <section className="space-y-4">
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        4. Specification Level
      </label>

      <div className="inline-flex p-1 bg-surface-container rounded-lg">
        <button
          type="button"
          onClick={() => onChange("STANDARD")}
          className={`px-6 py-2 rounded-md text-sm font-medium hover:cursor-pointer transition-all
            ${value === "STANDARD"
              ? "bg-surface-container-lowest text-on-background shadow-sm"
              : "text-on-surface-variant/25"}`}
        >
          Standard
        </button>

        <button
          type="button"
          onClick={() => onChange("NON_STANDARD")}
          className={`px-6 py-2 rounded-md text-sm hover:cursor-pointer font-medium transition-all
            ${value === "NON_STANDARD"
              ? "bg-surface-container-lowest text-on-background shadow-sm"
              : "text-on-surface-variant/25"}`}
        >
          Non-Standard
        </button>
      </div>

      {value === "NON_STANDARD" && (
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