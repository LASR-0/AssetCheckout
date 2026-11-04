import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: string;
  disabled?: boolean;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
  /** `sm` 28 design px segments (toolbars, settings); `md` 34 (forms); `lg` 40 (mobile forms). */
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SEGMENT = {
  sm: "h-7 px-2.75 fs-13",
  md: "h-8.5 px-3.5 fs-13",
  lg: "h-10 px-3.5 fs-13",
};

/**
 * A tray-coloured track with one raised segment. Arrow keys move between
 * segments (Radix roving focus); there is always exactly one selected.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onValueChange,
  label,
  size = "sm",
  className,
}: Props<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      // Radix lets a single group deselect to "". A segmented control always
      // has a choice, so a click on the selected segment is ignored.
      onValueChange={(next) => next && onValueChange(next as T)}
      aria-label={label}
      className={cn("inline-flex gap-0.5 rounded-10 bg-track p-0.75", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          className={cn(
            "inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-7 font-sans font-medium whitespace-nowrap text-tx3 transition-colors outline-none hover:text-tx focus-visible:outline-2 focus-visible:outline-brand",
            "data-[state=on]:bg-sheet data-[state=on]:text-tx data-[state=on]:shadow-[0_0_0_1px_var(--line),0_1px_2px_var(--shade)]",
            "disabled:cursor-not-allowed disabled:text-dis",
            SEGMENT[size]
          )}
        >
          {o.icon && <Icon name={o.icon} size={16} weight={300} />}
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
