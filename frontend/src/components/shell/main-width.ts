import { createContext, useContext } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/** The scrolling page's width in design px (0 before the shell measures). */
export const MainWidthContext = createContext(0);

export function useMainWidth(): number {
  return useContext(MainWidthContext);
}

/**
 * How much a page grows on a wide screen, as the designs do it: nothing up
 * to its own max width, then 30% of the extra, proportionally. A 1240 page
 * on a 1600 screen renders about 9% larger rather than sitting in a sea of
 * margin, and never reaches the full width.
 */
export function pageZoom(mainWidth: number, max: number): number {
  if (mainWidth <= max) return 1;
  return Math.round((1 + (0.3 * (mainWidth - max)) / max) * 1e4) / 1e4;
}

/**
 * The bar's and footer's size on a desktop: 90% of the design, growing on a
 * wide screen by half a page's rate, measured from the full bar's 1340 design
 * px (the nav breakpoint). Smaller only ever means more room, so the bar
 * breakpoints still hold. The phone bar (below the bar breakpoint) stays at
 * the design's size, for its touch targets.
 */
export function useShellZoom(): number | undefined {
  const desktop = useMediaQuery("(min-width: 54rem)");
  const growth = 1 + (pageZoom(useMainWidth(), 1340) - 1) / 2;
  const zoom = Math.round((desktop ? 0.9 : 1) * growth * 1e4) / 1e4;
  return zoom === 1 ? undefined : zoom;
}
