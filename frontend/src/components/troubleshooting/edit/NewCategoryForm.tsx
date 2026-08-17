import { useState } from "react";

///  +-----------------------------------------------------------------+
///  |        A NEW HEADING ON THE PAGE                                |
///  +-----------------------------------------------------------------+
//
//  Categories are the headings a reader scans before they read anything, so
//  there are deliberately few of them and adding one is a bigger decision than
//  adding a symptom.
//
//  Worth knowing: the EXPORT cannot place this into the `.ts` seed module by
//  itself. Where a category belongs among siblings that carry hand-written
//  editorial comments is a judgement, so the export reports a block for a
//  person to paste. Creating it here works fine; committing it needs a minute
//  of somebody's attention.
///  +-----------------------------------------------------------------+

type Props = {
  onCreate: (input: { name: string; glyph: string; blurb: string }) => Promise<void>;
  onCancel: () => void;
};

/** The glyphs already in use across the library, offered rather than typed. */
const GLYPHS = ["⚡", "▣", "◈", "◱", "◒", "⚙", "◐", "◇", "⊞", "⌸"];

export default function NewCategoryForm({ onCreate, onCancel }: Props) {
  const [name, setName] = useState("");
  const [glyph, setGlyph] = useState(GLYPHS[0]);
  const [blurb, setBlurb] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), glyph, blurb: blurb.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-primary/40 bg-primary/5 p-4">
      <p className="mb-3 text-sm font-bold text-primary">New category</p>

      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-info-light">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
            placeholder="e.g. Security & access"
            className="rounded-md border border-outline bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-info-light">
            Blurb — the line under the heading
          </span>
          <input
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
            placeholder="e.g. Passcodes, MFA and being locked out"
            className="rounded-md border border-outline bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-info-light">Glyph</span>
          <div className="flex flex-wrap gap-1">
            {GLYPHS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setGlyph(option)}
                className={`grid size-8 place-items-center rounded-lg border text-sm hover:cursor-pointer ${
                  option === glyph
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-outline text-info-light hover:bg-surface-container-low/30"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="mt-2 text-[12px] text-error">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!name.trim() || saving}
          onClick={() => void submit()}
          className="rounded-lg px-3 py-1.5 text-xs font-bold twilight-gradient text-white shadow-brand hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 hover:cursor-pointer disabled:hover:cursor-not-allowed"
        >
          {saving ? "Adding…" : "Add category"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-outline px-3 py-1.5 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
