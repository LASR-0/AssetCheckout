import { useEffect, useRef, useState } from "react";
import { previewSymptomSlug } from "@/api/troubleshooting";
import type { SlugPreview } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |        THE ONE DECISION THAT CANNOT BE UNDONE                   |
///  +-----------------------------------------------------------------+
//
//  A symptom's slug is its URL, the target other articles branch to, and the
//  key its analytics accumulate under. It is derived from the label once and
//  then frozen forever — the label stays editable, the address never is.
//
//  So the address is shown WHILE THE LABEL IS BEING TYPED, not confirmed
//  afterwards in a dialog nobody reads. If it collides with something that
//  already exists, that surfaces here too, naming what has it — the collision
//  is only recoverable before the row exists.
///  +-----------------------------------------------------------------+

type Props = {
  subjectKey: string;
  categoryName: string;
  onCreate: (label: string) => Promise<void>;
  onCancel: () => void;
};

export default function NewSymptomForm({
  subjectKey,
  categoryName,
  onCreate,
  onCancel,
}: Props) {
  const [label, setLabel] = useState("");
  const [preview, setPreview] = useState<SlugPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow reply for an old label overwriting a fast one for
  // the current label — the classic out-of-order autocomplete bug, which here
  // would show the wrong address for what is on screen.
  const latest = useRef(0);

  useEffect(() => {
    const trimmed = label.trim();
    if (!trimmed) {
      setPreview(null);
      return;
    }

    const request = ++latest.current;
    const timer = setTimeout(() => {
      previewSymptomSlug(subjectKey, trimmed)
        .then((result) => request === latest.current && setPreview(result))
        .catch(() => request === latest.current && setPreview(null));
    }, 250);

    return () => clearTimeout(timer);
  }, [label, subjectKey]);

  const canCreate = !!preview?.available && !saving;

  async function submit() {
    if (!canCreate) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(label.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
      <p className="mb-2 text-xs font-semibold text-primary">
        New symptom in {categoryName}
      </p>

      <input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="What would somebody say is wrong? e.g. “Phone won't charge”"
        className="w-full rounded-md border border-outline bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
        aria-label="Symptom wording"
      />

      {/* Reserved whether or not there is anything to say, so the row below
          does not jump as somebody types. */}
      <p className="mt-2 min-h-[18px] text-[12px]">
        {preview?.available && (
          <span className="text-info-light">
            Address: <code className="text-primary">{preview.slug}</code> — permanent
            once created
          </span>
        )}
        {preview && !preview.available && (
          <span className="text-error">{preview.reason}</span>
        )}
      </p>

      {error && <p className="mb-2 text-[12px] text-error">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canCreate}
          onClick={() => void submit()}
          className="rounded-lg px-3 py-1.5 text-xs font-bold twilight-gradient text-white shadow-brand hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 hover:cursor-pointer disabled:hover:cursor-not-allowed"
        >
          {saving ? "Adding…" : "Add symptom"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-outline px-3 py-1.5 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer"
        >
          Cancel
        </button>
        <span className="text-[12px] text-info-light">
          It appears straight away as a gap, with no article yet.
        </span>
      </div>
    </div>
  );
}
