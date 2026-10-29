import { createContext, useContext } from "react";

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
