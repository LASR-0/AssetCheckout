import { useEffect, useRef, type ComponentProps, type ReactNode } from "react";
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
//  lands on what they just selected.
//
//  It sits below the nav (top = the nav's 64 design px). Pages that dock it
//  beside a list instead of floating it pass `docked`.
///  +-----------------------------------------------------------------+

type InspectorProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible name, e.g. "Request #1042". */
  label: string;
  /** The back bar's label on phones: where closing returns to. */
  backLabel?: string;
  /** Laid out in the page's flow (a grid column) instead of floating. */
  docked?: boolean;
  className?: string;
  children: ReactNode;
};

export function Inspector({
  open,
  onClose,
  label,
  backLabel = "Back",
  docked = false,
  className,
  children,
}: InspectorProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      // A menu or modal opened from inside the inspector handles its own
      // Escape first; only an unclaimed one closes the panel.
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      className={cn(
        "overflow-auto bg-canvas outline-none",
        docked
          ? "h-full border-l border-line"
          : "fixed inset-0 z-45 animate-insp-in phone:inset-auto phone:top-16 phone:right-0 phone:bottom-0 phone:w-[min(30rem,100vw)] phone:border-l phone:border-line phone:shadow-[-4px_0_12px_var(--shade)] motion-reduce:animate-none",
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
      <div className="flex flex-col gap-3 p-3 phone:p-4">{children}</div>
    </aside>
  );
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
