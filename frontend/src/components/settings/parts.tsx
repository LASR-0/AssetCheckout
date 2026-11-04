import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { TrayLabel } from "@/components/ui/tray";
import { btn } from "@/components/ui/variants";
import { useSave } from "./saveStatus";

///  +-----------------------------------------------------------------+
///  |                  ONE ROW ANATOMY                                |
///  +-----------------------------------------------------------------+
//
//  Every settings page is built from the same few pieces: a tray with a
//  small-caps label and a quiet note on its right ("Saves as you go"), a
//  sheet inside it, and rows with the label and one line of description on
//  the left and the control on the right. Longer explanations sit behind a
//  "How this works" disclosure rather than in front of the control.
///  +-----------------------------------------------------------------+

type SectionProps = Omit<ComponentProps<"section">, "title"> & {
  label: ReactNode;
  /** Quiet, right-aligned: how this section saves, a count, a status. */
  note?: ReactNode;
};

export function Section({ label, note, className, children, ...props }: SectionProps) {
  return (
    <section className={cn("rounded-14 bg-tray p-0.75", className)} {...props}>
      <div className="flex items-center justify-between gap-2.5 px-2.5 pt-1.75 pb-1.5">
        <TrayLabel>{label}</TrayLabel>
        {note && <div className="flex items-center gap-2.5 fs-10.5 text-mut">{note}</div>}
      </div>
      {children}
    </section>
  );
}

export function Sheet({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-11 border border-line bg-sheet", className)} {...props} />;
}

type RowProps = {
  title: ReactNode;
  desc?: ReactNode;
  /** The control, and anything under it (its status). */
  children?: ReactNode;
  /** Controls take a fixed share on the right; `wide` lets them have more. */
  wide?: boolean;
  className?: string;
};

export function Row({ title, desc, children, wide, className }: RowProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-2.5 px-4 py-3.5", className)}>
      <div className="min-w-0 flex-[1_1_16.25rem]">
        <div className="fs-11.5 font-medium text-tx">{title}</div>
        {desc && <div className="mt-0.75 fs-11 leading-[1.45] text-pretty text-mut">{desc}</div>}
      </div>
      {children && (
        <div className={cn("flex min-w-50 flex-col items-end gap-1.5", wide ? "flex-[0_1_22rem]" : "flex-[0_1_15rem]")}>{children}</div>
      )}
    </div>
  );
}

/** "Saving…", "Saved", "Didn't save · Retry" — for the save tracked under `k`. */
export function SaveNote({ k, className }: { k: string | string[]; className?: string }) {
  const { status, retry } = useSave();
  const keys = Array.isArray(k) ? k : [k];
  if (!status || !keys.includes(status.key)) return null;
  const s = {
    saving: { icon: "hourglass_top", text: "Saving…", tone: "text-mut" },
    saved: { icon: "check", text: "Saved", tone: "text-ok" },
    failed: { icon: "error", text: "Didn't save", tone: "text-stop" },
  }[status.state];
  return (
    <span role="status" title={status.message} className={cn("inline-flex items-center gap-1 fs-10.5 font-medium", s.tone, className)}>
      <Icon name={s.icon} size={13} />
      {s.text}
      {status.state === "failed" && (
        <button type="button" onClick={retry} className="cursor-pointer border-0 bg-transparent p-0 pl-1 font-sans fs-10.5 font-medium text-stop underline">
          Retry
        </button>
      )}
    </span>
  );
}

/** A pill that turns a choice on or off: requestable categories, keepers on a phone. */
export function ChipToggle({ on, className, children, ...props }: ComponentProps<"button"> & { on: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(
        "inline-flex h-7.5 cursor-pointer items-center gap-1.25 rounded-pill border font-sans fs-11 font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:border-dashed disabled:border-line disabled:text-dis",
        on ? "border-brand bg-brand-sub pr-3 pl-2 text-brand-tx" : "border-strong bg-sheet px-3 text-tx2 hover:bg-hover",
        className
      )}
      {...props}
    >
      {on && <Icon name="check" size={14} />}
      {children}
    </button>
  );
}

const TONE = {
  prog: "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]",
  ok: "bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]",
  stop: "bg-stop-bg text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]",
  neut: "bg-track text-tx3 shadow-[inset_0_0_0_1px_var(--line)]",
  tray: "bg-tray text-tx2 shadow-[inset_0_0_0_1px_var(--line)]",
  brand: "bg-brand-sub text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]",
} as const;

export type Tone = keyof typeof TONE;

/** A small labelled pill: "Empty means nothing is requestable", "Live", "Dry run". */
export function Pill({ tone, icon, children, className }: { tone: Tone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5.5 items-center gap-1 rounded-6 pr-2 pl-1.5 fs-10.5 font-medium whitespace-nowrap", TONE[tone], className)}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  );
}

/** The rounder, roomier version for a statement beside a control. */
export function Hint({ tone, icon, children }: { tone: Tone; icon: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.25 rounded-pill pr-2.25 pl-1.75 fs-10.5 font-medium whitespace-nowrap", TONE[tone])}>
      <Icon name={icon} size={13} />
      {children}
    </span>
  );
}

/** Snipe-IT couldn't be reached: what's affected, what's kept, and a retry. */
export function SnipeDown({ children, onRetry, retrying }: { children: ReactNode; onRetry: () => void; retrying?: boolean }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-9 bg-stop-bg px-3 py-2.5 fs-11.5 text-tx shadow-[inset_0_0_0_1px_var(--stop-line)]">
      <Icon name="sync_problem" size={15.5} className="text-stop" />
      <span className="flex-[1_1_13.75rem]">{children}</span>
      <button type="button" onClick={onRetry} className={btn({ size: "sm", className: "h-7 rounded-7 fs-10.5" })}>
        {retrying ? "Retrying…" : "Retry"}
      </button>
    </div>
  );
}

/** "How this works": the longer explanation, out of the way until asked for. */
export function HowThisWorks({ label = "How this works", children, bar }: { label?: string; children: ReactNode; bar?: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = (
    <button
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((v) => !v)}
      className={cn(
        "flex cursor-pointer items-center gap-0.75 border-0 bg-transparent p-0 font-sans fs-11 font-medium text-tx2 outline-none hover:text-tx focus-visible:underline",
        bar && "w-full justify-between border-t border-line2 px-4 py-2.75 text-left"
      )}
    >
      {label}
      <Icon name={open ? "expand_less" : "expand_more"} size={15.5} className={bar ? "text-mut" : undefined} />
    </button>
  );
  return (
    <>
      {toggle}
      {open && children}
    </>
  );
}

/** A tinted note under a disclosure. */
export function Aside({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-9 border border-line2 bg-subtle px-3 py-2.5 fs-11 leading-normal text-pretty text-tx3", className)} {...props} />;
}

/** A square icon button for rows: move, remove. Dims rather than hides at the ends. */
export function IconButton({
  icon,
  label,
  danger,
  size = "md",
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> & { icon: string; label: string; danger?: boolean; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        "grid flex-none cursor-pointer place-items-center rounded-8 border-0 bg-transparent p-0 text-mut outline-none focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:text-line",
        danger ? "hover:bg-stop-bg hover:text-stop" : "hover:bg-hover hover:text-tx",
        size === "sm" ? "h-5 w-6.5 rounded-5" : "size-8",
        className
      )}
      {...props}
    >
      <Icon name={icon} size={15.5} />
    </button>
  );
}

/** Skeleton trays while a page's settings load. */
export function LoadingTrays() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} aria-hidden className="rounded-14 bg-tray p-0.75">
          <div className="px-2.5 pt-2.25 pb-2">
            <div className="h-2.25 w-27.5 rounded-4 bg-track" />
          </div>
          <div className="flex flex-col gap-3 rounded-11 border border-line bg-sheet p-4">
            <div className="h-2.75 w-[42%] rounded-5 bg-track" />
            <div className="h-2.25 w-[70%] rounded-5 bg-track" />
            <div className="flex gap-1.5">
              <div className="h-7 w-20 rounded-pill bg-track" />
              <div className="h-7 w-16 rounded-pill bg-track" />
              <div className="h-7 w-23 rounded-pill bg-track" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
