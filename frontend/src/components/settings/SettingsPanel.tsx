import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { btn } from "@/components/ui/variants";
import { Pill, type Tone } from "./parts";
import { usePanelHost } from "./saveStatus";

///  +-----------------------------------------------------------------+
///  |                  THE PANEL ON THE RIGHT                         |
///  +-----------------------------------------------------------------+
//
//  Where a setting too big for a row is edited: a category's standard models,
//  its accessory options, a loan device, a job's schedule. Its edits wait
//  for Save changes, and the footer always says whether there are any.
//
//  THREE LAYOUTS. On a wide screen it's a third column beside the page, so
//  the list it came from stays in view. Narrower, it slides over the page
//  from the right. On a phone it's the whole screen, with a back bar.
///  +-----------------------------------------------------------------+

export type PanelLayout = "docked" | "float" | "phone";

type Props = {
  open: boolean;
  layout: PanelLayout;
  onClose: () => void;
  /** The phone back bar's label: where closing returns to. */
  backLabel: string;
  kicker: string;
  title: string;
  /** Saved, Unsaved, Saving…, Not saved. */
  chip: { tone: Tone; icon: string; text: string };
  /** Inline notices above the body: a failed save, Snipe-IT down. */
  notices?: ReactNode;
  children: ReactNode;
  foot: {
    text: string;
    dirty: boolean;
    saving: boolean;
    onDiscard: () => void;
    onSave: () => void;
  };
};

export function SettingsPanel({ open, layout, onClose, backLabel, kicker, title, chip, notices, children, foot }: Props) {
  const ref = useRef<HTMLElement>(null);
  const docked = layout === "docked";
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);

  // Kept mounted while it slides out, then dropped.
  useEffect(() => {
    if (open || !present) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(() => setPresent(false), docked || reduce ? 0 : 260);
    return () => window.clearTimeout(t);
  }, [open, present, docked]);

  useEffect(() => {
    if (!open) return;
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!present || (docked && !open)) return null;

  return (
    <aside
      ref={ref}
      tabIndex={-1}
      aria-label={title}
      aria-hidden={!open || undefined}
      className={cn(
        "flex min-h-0 flex-col bg-subtle outline-none",
        layout === "docked" && "h-full w-[max(32.5rem,34vw)] min-w-0 border-l border-line",
        layout === "float" &&
          "absolute inset-y-0 right-0 z-10 w-[min(35rem,100%)] border-l border-line shadow-[-0.25rem_0_0.75rem_var(--shade)]",
        layout === "phone" && "fixed inset-0 z-45",
        !docked && (open ? "animate-insp-in" : "pointer-events-none animate-insp-out"),
        "motion-reduce:animate-none"
      )}
    >
      {layout === "phone" && (
        <div className="sticky top-0 z-2 flex h-13 flex-none items-center border-b border-line bg-sheet px-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 cursor-pointer items-center gap-1 rounded-10 border-0 bg-transparent pr-2.5 pl-1.5 font-sans fs-13 font-medium text-tx outline-none focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Icon name="arrow_back" size={19} />
            {backLabel}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className={cn("flex flex-col gap-3.5 [zoom:1.2]", layout === "phone" ? "p-3" : "p-6")}>
          <div className="flex items-start gap-2.5 rounded-14 border border-line bg-sheet px-4.5 py-4">
            <div className="min-w-0 flex-1">
              <div className="fs-10.5 text-mut">{kicker}</div>
              <div className="mt-1 font-head fs-16.5 font-medium tracking-head text-tx">{title}</div>
            </div>
            <Pill tone={chip.tone} icon={chip.icon} className="h-6.5 rounded-7 pr-2.5 pl-2 fs-11">
              {chip.text}
            </Pill>
            {layout !== "phone" && (
              <button
                type="button"
                onClick={onClose}
                title="Close (Esc)"
                aria-label="Close"
                className="grid size-7.5 cursor-pointer place-items-center rounded-8 border-0 bg-transparent text-tx3 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Icon name="close" size={16.5} />
              </button>
            )}
          </div>
          {notices}
          {children}
        </div>
      </div>
      <div className="flex flex-none flex-wrap items-center gap-x-2.5 gap-y-2 border-t border-line bg-sheet px-4.5 py-3 [zoom:1.2]">
        <span className="min-w-0 flex-1 basis-0 fs-11 text-mut">{foot.text}</span>
        <button type="button" disabled={!foot.dirty || foot.saving} onClick={foot.onDiscard} className={btn({ size: "md", className: "fs-11.5" })}>
          Discard
        </button>
        <button type="button" disabled={!foot.dirty || foot.saving} onClick={foot.onSave} className={btn({ variant: "primary", size: "md", className: "fs-11.5" })}>
          {foot.saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </aside>
  );
}

/**
 * A section's panel, placed where the page wants it: into the page's panel
 * column (docked, or sliding over the page), or on its own on a phone.
 */
export function Panel(props: Omit<Props, "layout">) {
  const host = usePanelHost();
  const panel = <SettingsPanel {...props} layout={host.layout} />;
  return host.layout !== "phone" && host.slot ? createPortal(panel, host.slot) : panel;
}
