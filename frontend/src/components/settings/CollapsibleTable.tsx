import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type Props = {
  title: string;
  /** Optional right-aligned header content (count, export button, etc.).
   *  Clicks inside here don't toggle the section. */
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export default function CollapsibleTableSection({
  title,
  actions,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-outline/20 bg-surface"
    >
      {/* The whole header bar is the trigger. The actions area stops
          propagation so its controls don't also toggle the section. */}
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between gap-3 p-3 hover:bg-surface-container-low/20 hover:cursor-pointer transition-colors rounded-t-lg">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`material-symbols-outlined !text-[18px] text-info-light transition-transform ${
                open ? "rotate-180" : ""
              }`}
            >
              expand_more
            </span>
            <span className="font-semibold text-on-background text-sm">{title}</span>
          </div>
          {actions && (
            <div
              className="shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              {actions}
            </div>
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-outline/10 p-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}