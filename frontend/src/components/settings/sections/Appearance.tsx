import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented";
import { usePreset } from "@/hooks/usePreset";
import { PRESETS, findPreset } from "@/lib/presets";
import { Row, Section, Sheet } from "../parts";

///  +-----------------------------------------------------------------+
///  |                  APPEARANCE (everyone)                          |
///  +-----------------------------------------------------------------+
//
//  Light, dark or the device's own setting, and a palette. Both live in
//  this browser only, so the page says that rather than "Saved".
//
//  A PALETTE IS EITHER CHOSEN OR INHERITED. "Use organisation default" on
//  means nothing is stored and the deployment's palette applies; picking a
//  card stores a choice and turns it off.
///  +-----------------------------------------------------------------+

const MODES = [
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "system", label: "System", icon: "contrast" },
] as const;

export function Appearance({ staff }: { staff: boolean }) {
  const { theme = "system", resolvedTheme, setTheme } = useTheme();
  const { preset, isExplicit, setPreset, clearPreset, orgDefault } = usePreset();
  const dark = resolvedTheme === "dark";

  return (
    <>
      <Section label="Mode" note="Saved to this browser" data-tour="settings-theme">
        <Sheet>
          <Row title="Light or dark" desc="System follows your device setting.">
            <SegmentedControl
              label="Light or dark"
              value={theme as (typeof MODES)[number]["value"]}
              onValueChange={setTheme}
              options={MODES.map((m) => ({ value: m.value, label: m.label, icon: m.icon }))}
            />
          </Row>
        </Sheet>
      </Section>

      <Section label="Palette" note="Saved to this browser" data-tour="settings-palette">
        <Sheet>
          <Row title="Use organisation default" desc={`The organisation default is ${findPreset(orgDefault).label}. Picking a palette below turns this off.`}>
            <Switch
              aria-label="Use organisation default"
              checked={!isExplicit}
              onCheckedChange={(on) => (on ? clearPreset() : setPreset(preset))}
            />
          </Row>
          <div role="radiogroup" aria-label="Palette" className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2.5 border-t border-line2 px-4 pt-3.5 pb-4">
            {PRESETS.map((p) => {
              const on = p.id === preset;
              const bands = dark ? p.bands.dark : p.bands.light;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPreset(p.id)}
                  className={cn(
                    "block cursor-pointer rounded-11 border bg-sheet pt-2 pr-2.5 pb-2.75 pl-2 text-left font-sans text-tx outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                    on ? "border-brand shadow-[0_0_0_1px_var(--brand)]" : "border-line hover:border-strong"
                  )}
                >
                  <span className="flex h-13 overflow-hidden rounded-7 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                    {bands.map((c, i) => (
                      <span key={i} style={{ background: c, flex: [3, 1.4, 1.6, 0.9, 1.4, 0.5, 0.5, 0.5][i] }} />
                    ))}
                  </span>
                  <span className="mt-2.25 flex items-center gap-1.5">
                    <span className="fs-11.5 font-medium">{p.label}</span>
                    {p.id === orgDefault && <span className="fs-10 text-mut">· Org default</span>}
                    <span className="flex-1" />
                    {on && <Icon name="check_circle" size={15.5} fill className="text-brand" />}
                  </span>
                  <span className="mt-0.5 block fs-10.5 leading-[1.4] text-mut">{p.description}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      </Section>

      {staff && <p className="m-0 px-1 fs-11 text-mut">Everything else in Settings is managed by IT.</p>}
    </>
  );
}
