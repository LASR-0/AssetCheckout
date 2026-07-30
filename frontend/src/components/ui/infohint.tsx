import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

///  +-----------------------------------------------------------------+
///  |                          INFO HINT                              |
///  +-----------------------------------------------------------------+
//
//  A small info icon that reveals an explanation on hover or focus. The one
//  info affordance in the app — anything needing a "what does this do?" hint
//  should use this rather than growing its own.
//
//  Use it sparingly and only where the explanation is longer than the label
//  can carry. If every control has one they stop being read, and the things
//  that genuinely need explaining get lost among them. Behaviour that every
//  admin needs to know belongs in always-visible section copy instead; this
//  is for the ambiguous specifics.
//
//  A <button> rather than a bare span so it's reachable by keyboard and
//  announced by screen readers — Radix wires focus and Escape for us.
///  +-----------------------------------------------------------------+

type Props = {
  /** The explanation. A sentence or two; longer belongs in the docs. */
  children: React.ReactNode;
  /** Accessible name for the trigger. */
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
};

export default function InfoHint({
  children,
  label = "More information",
  side = "top",
  className = "",
}: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            // type="button" so it never submits a surrounding form.
            type="button"
            aria-label={label}
            className={`inline-flex shrink-0 align-middle text-info-light hover:text-on-surface-variant hover:cursor-help transition-colors ${className}`}
          >
            <span className="material-symbols-outlined !text-[14px]">info</span>
          </button>
        </TooltipTrigger>
        {/* items-start + leading-relaxed so two- and three-line explanations
            read as prose rather than being vertically centred against the
            arrow. */}
        <TooltipContent side={side} className="items-start max-w-xs leading-relaxed">
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
