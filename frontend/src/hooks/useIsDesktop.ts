import { useEffect, useState } from "react";
 
/**
 * Returns true if the viewport is at or above the desktop breakpoint (768px,
 * matching Tailwind's `md:` breakpoint).
 *
 * Subscribes to `window.matchMedia` so the value updates live when the user
 * resizes the window (or rotates a tablet). One subscription per component
 * that uses the hook — cheap, no shared state needed.
 *
 * Used by ResponsiveDialog to pick between rendering as a dialog (desktop)
 * or drawer (mobile). Also reusable anywhere else we need viewport-based
 * branching.
 */
export function useIsDesktop(): boolean {
  // SSR safety: window isn't defined on the server. Default to true (dialog
  // shape) so the initial render doesn't flicker into the mobile state before
  // hydration. Vite is client-rendered so this is mostly belt-and-braces.
  const getInitial = () => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 768px)").matches;
  };
 
  const [isDesktop, setIsDesktop] = useState<boolean>(getInitial);
 
  useEffect(() => {
    if (typeof window === "undefined") return;
 
    const query = window.matchMedia("(min-width: 768px)");
 
    function handleChange(event: MediaQueryListEvent) {
      setIsDesktop(event.matches);
    }
 
    // Sync once on mount in case the initial state was stale.
    setIsDesktop(query.matches);
 
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);
 
  return isDesktop;
}