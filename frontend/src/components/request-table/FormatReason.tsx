import { useLayoutEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";

type ParsedReason = {
  rejected?: string;
  request?: string;
  plain?: string;
};

export const parseReason = (text?: string): ParsedReason | null => {
  if (!text?.trim()) return null;

  const rejected = text.match(/REJECTED\s*:?\s*([\s\S]*?)(?=REQUEST|$)/)?.[1]?.trim();
  const request = text.match(/REQUEST\s*:?\s*([\s\S]*)$/)?.[1]?.trim();

  if (!rejected && !request) return { plain: text.trim() };
  return { rejected, request };
};

export const ReasonCell = ({ text }: { text?: string }) => {
  const parsed = parseReason(text);
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;

    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  if (!parsed) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="max-w-md py-1">
      <div
        ref={contentRef}
        className={cn("break-words", !expanded && "line-clamp-4")}
      >
        {parsed.plain && (
          <p className="text-sm leading-snug">{parsed.plain}</p>
        )}
        {parsed.rejected && (
          <p className="text-sm leading-snug text-status-error/60 mb-1.5">
            {/* FIXED: added "Rejected:" label after the icon */}
            <Ban className="inline size-3.5 text-status-error mr-1.5 -mt-0.5" aria-hidden="true" />
            <span className="font-medium text-status-error mr-1">Rejected:</span>
            {parsed.rejected}
          </p>
        )}
        {/* FIXED: ml-5 indents the quote bar to align with the label text (icon 14px + 6px gap = 20px) */}
        {parsed.request && (
          <p className="ml-2 border-l-2 border-border pl-2.5 text-[13px] leading-snug text-info-light">
            {parsed.request}
          </p>
        )}
      </div>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
};