import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

///  +-----------------------------------------------------------------+
///  |                  THE INSPECTOR                                  |
///  +-----------------------------------------------------------------+
//
//  The right-hand panel for whatever is selected: a request, a device, a
//  job. It does NOT block the page behind it on desktop (the list stays
//  usable, which is the point of list-then-inspector), so it is a labelled
//  region rather than a modal dialog. On phones it covers the screen, with a
//  sticky back bar in place of the close button.
//
//  Escape closes it. Focus moves into it when it opens so a keyboard user
//  lands on what they just selected. Floating, it slides in and back out, so
//  the caller keeps rendering its content (with `open` false) while it goes.
//
//  It sits between the top bar (52 design px while the phone bar shows, 72
//  once the full bar does) and the footer, and casts its shadow to the left
//  only: clipped at the top, so it doesn't smudge the bar's bottom edge. Pages that dock it
//  beside a list instead of floating it pass `docked`.
//
//  Floating, its content renders 10% larger than the page's: it is portaled
//  out of the page column, so it misses the page's wide-screen growth, and
//  at 1:1 it read as small beside the list it was opened from.
//
//  A page can pass `beside`, the element the panel opens next to. Then on a
//  wide screen it reaches left to just short of that element instead of
//  leaving a strip of empty page between them, and its content grows with
//  the page's zoom (never below the 1.1). Its minimum width grows with it,
//  so larger text never means a narrower column. Where the element isn't
//  laid out (phones, or display: contents) none of this applies.
///  +-----------------------------------------------------------------+

/** The space left between the panel and the element it opens beside. */
const GAP_PX = 16;

type InspectorProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name, e.g. "Request #1042". */
  label: string;
  /** The back bar's label on phones: where closing returns to. */
  backLabel?: string;
  /** Laid out in the page's flow (a grid column) instead of floating. */
  docked?: boolean;
  /** Floating, the element it opens beside: it widens up to it. See the header. */
  beside?: RefObject<HTMLElement | null>;
  className?: string;
  children: ReactNode;
};

export function Inspector({
  open,
  onClose,
  label,
  backLabel = "Back",
  docked = false,
  beside,
  className,
  children,
}: InspectorProps) {
  const ref = useRef<HTMLElement>(null);
  // Mounted: true from opening until the slide-out finishes.
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  useEffect(() => {
    if (open || !present) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setPresent(false), docked || reduce ? 0 : 200);
    return () => window.clearTimeout(t);
  }, [open, present, docked]);

  // Focus moves into the panel when it opens, and only then. Tying this to
  // the effect below re-ran it on every render a parent made with a fresh
  // onClose, pulling focus out of whatever field was being typed in.
  useEffect(() => {
    if (open) ref.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // A menu or modal opened from inside the inspector handles its own
      // Escape first; only an unclaimed one closes the panel.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Written to the panel as custom properties rather than kept in state:
  // they follow the page's layout, not anything React renders.
  useLayoutEffect(() => {
    const panel = ref.current;
    const target = beside?.current;
    if (!present || docked || !panel || !target) return;

    const measure = () => {
      const box = target.getBoundingClientRect();
      if (box.width === 0) {
        panel.style.removeProperty("--insp-reach");
        panel.style.removeProperty("--insp-z");
        return;
      }
      const zoom = (target as HTMLElement & { currentCSSZoom?: number }).currentCSSZoom ?? 1;
      panel.style.setProperty("--insp-reach", `${Math.max(0, window.innerWidth - box.right - GAP_PX * zoom)}px`);
      panel.style.setProperty("--insp-z", String(Math.max(1.1, zoom)));
    };

    measure();
    // The root's box follows the viewport, so this also catches a resize.
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, [present, docked, beside]);

  if (!present) return null;

  const panel = (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      aria-hidden={!open || undefined}
      className={cn(
        "overflow-auto bg-canvas outline-none",
        docked
          ? "h-full border-l border-line"
          : "fixed inset-0 z-45 phone:inset-auto phone:top-13 phone:right-0 phone:bottom-12 phone:w-[min(100vw,max(calc(33rem*var(--insp-z,1.1)/1.1),var(--insp-reach,0px)))] phone:border-l phone:border-line phone:shadow-[-4px_0_12px_var(--shade)] phone:[clip-path:inset(0_0_0_-1.5rem)] bar:top-18 motion-reduce:animate-none",
        !docked && (open ? "animate-insp-in" : "pointer-events-none animate-insp-out"),
        className
      )}
    >
      {!docked && (
        <div className="sticky top-0 z-2 flex h-13 items-center border-b border-line bg-sheet px-2 phone:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 cursor-pointer items-center gap-1 rounded-10 pr-2.5 pl-1.5 font-sans fs-13 font-medium text-tx outline-none focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Icon name="arrow_back" size={19} />
            {backLabel}
          </button>
        </div>
      )}
      <div className={cn("flex flex-col gap-3 p-3 phone:p-4", !docked && "phone:[zoom:var(--insp-z,1.1)]")}>{children}</div>
    </aside>
  );

  // A floating panel goes to the document root. Fixed positioning resolves
  // against the nearest ancestor with `zoom` (the page column grows on wide
  // screens, see shell/Page), so rendered in place it slid down from under
  // the bar and grew with the page. Docked, it belongs in the page's flow.
  return docked ? panel : createPortal(panel, document.body);
}

type InspectorHeaderProps = Omit<ComponentProps<"div">, "title"> & {
  /** A code above the title, e.g. "#1042". Drawn in mono. */
  code?: ReactNode;
  title: ReactNode;
  /** Identity pills under the title. */
  pills?: ReactNode;
  /** The state chip, top right. */
  chip?: ReactNode;
  /** Shows the close button (desktop only; phones use the back bar). */
  onClose?: () => void;
};

export function InspectorHeader({
  code,
  title,
  pills,
  chip,
  onClose,
  className,
  ...props
}: InspectorHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-14 border border-line bg-sheet px-4 pt-4 pb-3.5",
        className
      )}
      {...props}
    >
      <div className="min-w-0 flex-1">
        {code && <div className="font-mono fs-10.5 text-mut">{code}</div>}
        <h2 className="m-0 mt-1 fs-16.5 leading-[1.3] font-semibold text-tx">{title}</h2>
        {pills && <div className="mt-2.5 flex flex-wrap gap-1.5">{pills}</div>}
      </div>
      {chip}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mt-0.75 -mr-1 hidden size-7.5 cursor-pointer place-items-center rounded-8 text-mut outline-none hover:bg-hover hover:text-tx focus-visible:outline-2 focus-visible:outline-brand phone:grid"
        >
          <Icon name="close" size={17.5} />
        </button>
      )}
    </div>
  );
}
