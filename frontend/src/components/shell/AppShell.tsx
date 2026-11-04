import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SCROLL_ROOT_ID } from "@/lib/scrollRoot";
import { MainWidthContext } from "./main-width";
import TopBar from "./TopBar";
import Footer from "./Footer";

///  +-----------------------------------------------------------------+
///  |                         THE APP SHELL                           |
///  +-----------------------------------------------------------------+
//
//  Bar, page, footer, filling the viewport; only the page scrolls (see
//  lib/scrollRoot). The page sits on the dotted canvas.
//
//  The shell measures the page's width for Page's wide-screen growth, and
//  puts a new page at the top: the scroller outlives navigation, so without
//  this a page would open wherever the last one was left. Back and forward
//  are left alone, because useViewState restores those.
///  +-----------------------------------------------------------------+

export default function AppShell({ children }: { children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const measure = () => {
      // Design px per CSS px follows the root size (80%), so read it rather
      // than assume it.
      const designPx = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
      setWidth(Math.round(el.clientWidth / designPx));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  useLayoutEffect(() => {
    if (navigationType !== "POP") mainRef.current?.scrollTo(0, 0);
  }, [pathname, navigationType]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-dvh flex-col bg-canvas font-sans text-tx">
        <TopBar />
        <main
          id={SCROLL_ROOT_ID}
          ref={mainRef}
          className="relative min-h-0 flex-1 overflow-auto bg-canvas bg-[radial-gradient(var(--dot)_0.0625rem,transparent_0.0625rem)] bg-size-[1rem_1rem]"
        >
          <MainWidthContext.Provider value={width}>{children}</MainWidthContext.Provider>
        </main>
        <Footer />
      </div>
    </TooltipProvider>
  );
}
