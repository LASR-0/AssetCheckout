import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

///  +-----------------------------------------------------------------+
///  |                    COLLAPSIBLE SECTION                          |
///  +-----------------------------------------------------------------+
//
//  The house expanding-section shell: bordered card, tinted header bar that
//  is entirely the trigger, hairline, padded body. One component so a change
//  to the chrome lands everywhere at once.
//
//  Moved here from components/settings/ when the troubleshooting page needed
//  the same shell with a richer header. Everything added for that is
//  OPTIONAL and additive — the settings callers pass `title` alone and render
//  exactly as they did before.
//
//  Uncontrolled by default. Pass `open` + `onOpenChange` to drive it from
//  outside, which is what an Expand-all control or a search that reveals its
//  matches needs.
///  +-----------------------------------------------------------------+

type Props = {
  title: string;
  /** Second line under the title. */
  subtitle?: string;
  /** Leading visual — a glyph tile or icon, before the title block. */
  leading?: React.ReactNode;
  /** Right-aligned text before the chevron, e.g. "4 issues". */
  meta?: React.ReactNode;
  /** Optional right-aligned controls. Clicks here don't toggle the section. */
  actions?: React.ReactNode;
  /** Uncontrolled starting state. Ignored when `open` is supplied. */
  defaultOpen?: boolean;
  /** Supply with onOpenChange to control the section from outside. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

export default function CollapsibleSection({
  title,
  subtitle,
  leading,
  meta,
  actions,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  children,
}: Props) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={handleOpenChange}
      className="rounded-lg border border-outline bg-surface"
    >
      {/* The whole header bar is the trigger. The actions area stops
          propagation so its controls don't also toggle the section. */}
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between gap-3 p-3 bg-surface-container-low/20 hover:bg-surface-container-low/40 hover:cursor-pointer transition-colors rounded-t-lg">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`material-symbols-outlined !text-[18px] text-info-light transition-transform ${
                open ? "rotate-180" : ""
              }`}
            >
              expand_more
            </span>
            {leading}
            {/* min-w-0 so a long subtitle truncates rather than shoving the
                meta and chevron off the end of the bar. */}
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-on-background text-sm">{title}</span>
              {subtitle && (
                <span className="text-info-light text-[13px] leading-snug truncate">
                  {subtitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {meta && <span className="text-xs text-info-light">{meta}</span>}
            {actions && (
              <div onClick={(e) => e.stopPropagation()}>{actions}</div>
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-outline/10 p-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
