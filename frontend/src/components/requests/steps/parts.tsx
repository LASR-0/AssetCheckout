import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

///  +-----------------------------------------------------------------+
///  |                  THE PARTS EVERY STEP IS BUILT FROM             |
///  +-----------------------------------------------------------------+
//
//  A step is the docket's "Your move" tray turned into a small form, in
//  place of the dialogs this page used to stack. They all share these:
//  labelled fields in a wrapping grid, radio rows for "pick one of these
//  records", an error line, and a foot with a hint, Cancel and the action.
///  +-----------------------------------------------------------------+

/** Fields side by side while there's room, stacked when there isn't. */
export function FieldGrid({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("grid grid-cols-[repeat(auto-fit,minmax(9.375rem,1fr))] gap-2.5", className)} {...props} />;
}

export function StepField({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.25 fs-12.5 text-tx3", className)}>
      {label}
      {children}
    </label>
  );
}

/** A sub-heading inside a step ("Which record?"). */
export function StepNote({ className, ...props }: ComponentProps<"span">) {
  return <span className={cn("fs-12.5 leading-[1.45] text-tx3", className)} {...props} />;
}

type RadioRowProps = Omit<ComponentProps<"button">, "title"> & {
  selected: boolean;
  title: ReactNode;
  sub?: ReactNode;
  /** Right-aligned, e.g. "4 in stock". */
  aside?: ReactNode;
};

/** One choice in a list of records. */
export function RadioRow({ selected, title, sub, aside, className, ...props }: RadioRowProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-9 border px-3 py-2.25 text-left font-sans fs-13 text-tx transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        selected ? "border-brand-line bg-brand-sub/50" : "border-line bg-sheet hover:border-brand-line",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "size-4 shrink-0 rounded-full bg-sheet",
          selected ? "border-[5px] border-brand" : "border-[1.5px] border-strong"
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {sub && <span className="fs-12 text-mut">{sub}</span>}
      </span>
      {aside}
    </button>
  );
}

export function RadioList({ label, className, ...props }: ComponentProps<"div"> & { label: string }) {
  return <div role="radiogroup" aria-label={label} className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function StepError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div role="alert" className="flex items-start gap-2 fs-13 leading-[1.45] text-stop">
      <Icon name="error" size={17} className="mt-px" />
      <span>{children}</span>
    </div>
  );
}

type FootProps = {
  hint?: ReactNode;
  /** While the action runs: its label is replaced and the buttons lock. */
  pending?: string | null;
  cancelLabel?: string;
  onCancel?: () => void;
  /** Buttons beside Cancel, before the primary (Skip quote, Save for later). */
  extra?: ReactNode;
  primary?: { label: string; onClick: () => void; variant?: "primary" | "danger-solid"; disabled?: boolean };
};

export function StepFoot({ hint, pending, cancelLabel = "Cancel", onCancel, extra, primary }: FootProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {hint && <span className="fs-12.5 leading-[1.45] text-mut">{hint}</span>}
      <span className="flex-1" />
      {pending ? (
        <PendingButton>{pending}</PendingButton>
      ) : (
        <>
          {onCancel && (
            <Button variant="secondary" className="h-9 px-3.5" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          {extra}
          {primary && (
            <Button
              variant={primary.variant ?? "primary"}
              className="h-9 px-4"
              disabled={primary.disabled}
              onClick={primary.onClick}
            >
              {primary.label}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

/** What an action button becomes while it runs. */
export function PendingButton({ children }: { children: ReactNode }) {
  return (
    <span
      role="status"
      className="inline-flex h-9 cursor-progress items-center gap-2 rounded-9 bg-tx3 px-4 fs-13.5 font-medium whitespace-nowrap text-sheet"
    >
      <Icon name="hourglass_top" size={16} />
      {children}
    </span>
  );
}
