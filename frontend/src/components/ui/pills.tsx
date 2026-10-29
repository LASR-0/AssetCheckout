import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

///  +-----------------------------------------------------------------+
///  |                  PILLS, CHIPS AND FLAGS                         |
///  +-----------------------------------------------------------------+
//
//  Exactly three loud kinds, never mixed up, plus one quiet one:
//
//    IdentityPill  what a thing IS (kind, site, category): neutral surface,
//                  coloured dot, hairline. Round.
//    StateChip     where it IS (the stage): intent tint, icon, label. Square-ish.
//    CountBadge    how many need you: small and solid (countbadge.tsx).
//    Flag          a note about it (Edited, Auto-approved, Location missing,
//                  Starts 12 Nov): icon + muted text, no container.
//
//  HolderChip ("With you", "With IT") and ChoiceChip (a selectable option)
//  are the two other pill-shaped controls the designs use.
///  +-----------------------------------------------------------------+

export type Intent = "ok" | "prog" | "stop";

/** The identity accent slots. Sites, kinds and categories map onto these. */
export type Accent = "id1" | "id2" | "id3" | "id4";

const ACCENT_BG: Record<Accent, string> = {
  id1: "bg-id1",
  id2: "bg-id2",
  id3: "bg-id3",
  id4: "bg-id4",
};

export function Dot({ accent, className }: { accent: Accent; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.75 shrink-0 rounded-full", ACCENT_BG[accent], className)}
    />
  );
}

type IdentityPillProps = ComponentProps<"span"> & {
  accent?: Accent;
  /** Shown instead of a dot, e.g. location_on for a site. */
  icon?: string;
};

export function IdentityPill({ accent, icon, className, children, ...props }: IdentityPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill border border-line bg-sheet px-2.25 fs-11 whitespace-nowrap text-tx2",
        className
      )}
      {...props}
    >
      {accent && <Dot accent={accent} />}
      {icon && <Icon name={icon} size={14} weight={300} />}
      {children}
    </span>
  );
}

const INTENT: Record<Intent, string> = {
  ok: "bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]",
  prog: "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]",
  stop: "bg-stop-bg text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]",
};

type StateChipProps = ComponentProps<"span"> & {
  intent: Intent;
  icon: string;
  /** `sm` 24 design px (lists, Home); `md` 26 (the Requests inspector). */
  size?: "sm" | "md";
};

export function StateChip({ intent, icon, size = "sm", className, children, ...props }: StateChipProps) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-7 font-medium whitespace-nowrap",
        size === "sm" ? "h-6 pr-2.25 pl-1.75 fs-11" : "h-6.5 pr-2.5 pl-2 fs-12.5",
        INTENT[intent],
        className
      )}
      {...props}
    >
      <Icon name={icon} size={size === "sm" ? 13 : 16} />
      {children}
    </span>
  );
}

type FlagProps = ComponentProps<"span"> & {
  icon: string;
  /** A flag that means something is wrong (Location missing, Blocked). */
  alert?: boolean;
};

export function Flag({ icon, alert, className, children, ...props }: FlagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 fs-12 whitespace-nowrap",
        alert ? "text-stop" : "text-tx3",
        className
      )}
      {...props}
    >
      <Icon name={icon} size={15} weight={300} />
      {children}
    </span>
  );
}

type HolderChipProps = ComponentProps<"span"> & {
  icon: string;
  /** The viewer holds it: brand tint and bold, because it's their move. */
  mine?: boolean;
};

/** Who has the request now: "With you", "With IT", "In transit → Perth". */
export function HolderChip({ icon, mine, className, children, ...props }: HolderChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6.5 max-w-full items-center gap-1.25 overflow-hidden rounded-pill pr-2.75 pl-2 fs-11.5 whitespace-nowrap",
        mine
          ? "bg-brand-sub font-semibold text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]"
          : "bg-track text-tx2",
        className
      )}
      {...props}
    >
      <Icon name={icon} size={14} />
      <span className="truncate">{children}</span>
    </span>
  );
}

type ChoiceChipProps = Omit<ComponentProps<"button">, "children"> & {
  selected: boolean;
  icon?: string;
  children: ReactNode;
};

/** A selectable option drawn as a pill (filters, quick picks). */
export function ChoiceChip({ selected, icon, className, children, ...props }: ChoiceChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-7.5 shrink-0 cursor-pointer items-center gap-1.25 rounded-pill border px-3 font-sans fs-12.5 font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        selected
          ? "border-brand bg-brand-sub text-brand-tx"
          : "border-strong bg-sheet text-tx2 hover:bg-hover",
        icon && "pl-2",
        className
      )}
      {...props}
    >
      {icon && <Icon name={icon} size={15} weight={300} />}
      {children}
    </button>
  );
}
