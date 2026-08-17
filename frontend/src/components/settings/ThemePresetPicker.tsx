import { usePreset } from "@/hooks/usePreset";
import { PRESETS, type Preset } from "@/lib/presets";

///  +-----------------------------------------------------------------+
///  |                  CHOOSING A PALETTE                              |
///  +-----------------------------------------------------------------+
//
//  Sits beside the light/dark toggle rather than replacing it, because the two
//  answer different questions. The toggle picks light or dark; this picks
//  WHICH light and dark — every preset defines both, so the choices compose
//  rather than compete.
//
//  Each option shows its own colours rather than a name alone. A palette is
//  the one setting where the label tells you nothing and the swatch tells you
//  everything, and the swatch has to be drawn in a palette the page is not
//  currently wearing — which is why lib/presets.ts carries a copy of three
//  colours per preset.
///  +-----------------------------------------------------------------+

export default function ThemePresetPicker() {
  const { preset, setPreset } = usePreset();

  return (
    <div
      role="radiogroup"
      aria-label="Colour palette"
      className="flex flex-wrap items-center gap-2"
    >
      {PRESETS.map((option) => (
        <PresetOption
          key={option.id}
          option={option}
          selected={option.id === preset}
          onSelect={() => setPreset(option.id)}
        />
      ))}
    </div>
  );
}

function PresetOption({
  option,
  selected,
  onSelect,
}: {
  option: Preset;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      title={option.description}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors hover:cursor-pointer ${
        selected
          ? "border-primary bg-primary/10 text-primary"
          : "border-outline text-info-light hover:bg-surface-container-low/40 hover:text-on-background"
      }`}
    >
      {/* Three bands rather than one dot: a palette is a relationship between
          colours, and a single brand swatch cannot show that the ground moved
          too. `aria-hidden` because the label already names it. */}
      <span
        aria-hidden
        className="flex h-4 w-8 overflow-hidden rounded border border-outline/60"
      >
        {option.swatch.map((colour, i) => (
          <span key={i} className="flex-1" style={{ background: colour }} />
        ))}
      </span>
      {option.label}
    </button>
  );
}
