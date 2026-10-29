import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type Option<T extends string> = { value: T; label: ReactNode; sub?: ReactNode };

/** A single choice as full-width rows with a radio, the selected one tinted. */
export function OptionRows<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <RadioGroup aria-label={label} value={value ?? ""} onValueChange={(v) => onChange(v as T)} className="gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex min-h-13 cursor-pointer items-center gap-3 rounded-10 border border-line bg-sheet px-3.5 py-2.5 fs-13.5 text-tx transition-colors has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand-sub"
        >
          <RadioGroupItem value={o.value} />
          <span className="flex min-w-0 flex-col gap-px leading-[1.4]">
            <span>{o.label}</span>
            {o.sub && <span className="fs-12 text-tx3">{o.sub}</span>}
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}

/** A selectable card in a grid: icon, name, and a quiet line under it. */
export function ChoiceCard({
  selected,
  icon,
  name,
  note,
  onClick,
}: {
  selected: boolean;
  icon: string;
  name: string;
  note?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex min-h-23 cursor-pointer flex-col items-start gap-1.5 rounded-10 border p-3 text-left font-sans text-tx outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        selected
          ? "border-brand bg-brand-sub shadow-[inset_0_0_0_1px_var(--brand)]"
          : "border-line bg-sheet hover:border-strong"
      )}
    >
      <Icon name={icon} size={22} weight={300} fill={selected} className={selected ? "text-brand" : "text-tx3"} />
      <span className="fs-13.5 font-medium">{name}</span>
      {note && <span className="fs-11 text-mut">{note}</span>}
    </button>
  );
}
