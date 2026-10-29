import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { pageZoom, useMainWidth } from "./main-width";

type PageProps = ComponentProps<"div"> & {
  /** The page's design width in design px (Home 1240, the forms 1320, …). */
  max: number;
};

/**
 * A page's centred column. Past its design width it grows with the screen
 * (see pageZoom) instead of leaving ever-wider margins. Padding is the
 * page's own, since every design sets its own.
 */
export function Page({ max, className, style, ...props }: PageProps) {
  const zoom = pageZoom(useMainWidth(), max);
  return (
    <div
      className={cn("mx-auto w-full", className)}
      style={{ maxWidth: `${max / 16}rem`, zoom: zoom === 1 ? undefined : zoom, ...style }}
      {...props}
    />
  );
}
