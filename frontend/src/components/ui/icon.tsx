import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type IconProps = Omit<ComponentProps<"span">, "children"> & {
  /** Material Symbols ligature name, e.g. "close". */
  name: string;
  /** Glyph size in design px. */
  size?: number;
  /** The variable font's weight axis. The designs draw most chrome at 300. */
  weight?: number;
  /** Filled glyph. The designs reserve it for selected or active state. */
  fill?: boolean;
};

/**
 * A Material Symbols glyph, sized in design px like everything else (so it
 * follows the 80% root). Decorative by default; give the surrounding control
 * the accessible name.
 */
export function Icon({
  name,
  size = 18,
  weight = 400,
  fill = false,
  className,
  style,
  ...props
}: IconProps) {
  return (
    <span
      aria-hidden
      className={cn("material-symbols-outlined shrink-0 select-none", className)}
      style={{
        fontSize: `${size / 16}rem`,
        fontVariationSettings: `'wght' ${weight}, 'FILL' ${fill ? 1 : 0}`,
        ...style,
      }}
      {...props}
    >
      {name}
    </span>
  );
}
