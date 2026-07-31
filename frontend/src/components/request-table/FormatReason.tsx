import { useLayoutEffect, useRef, useState } from "react";
import { Ban } from "lucide-react";
import { cn } from "@/lib/utils";

type ParsedReason = {
  rejected?: string;
  request?: string;
  plain?: string;
};

/**
 * Longest run of non-space characters we allow through. The reason column is
 * 220px at 13px type, which fits roughly 30 characters, so anything past this
 * cannot wrap onto a line and instead widens the cell.
 */
const MAX_TOKEN = 28;

/**
 * Truncate pathologically long unbroken "words".
 *
 * The table uses automatic layout, where a single unbroken token raises the
 * cell's min-content width — so the COLUMN grows and the text bleeds over the
 * one beside it, which no amount of max-width on the inner div prevents.
 * Normal prose is untouched; only tokens that cannot fit a line are cut.
 *
 * Deliberately done on the text rather than with CSS `truncate`, which forces
 * a single line and would flatten the multi-line reason layout.
 */
function truncateLongTokens(text: string): string {
  return text.replace(/\S+/g, (token) =>
    token.length > MAX_TOKEN ? token.slice(0, MAX_TOKEN - 1) + "\u2026" : token
  );
}

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
    // max-w-full (not max-w-md, which was 448px inside a 220px column) plus
    // overflow-hidden, so nothing can paint outside the cell.
    <div className="max-w-full overflow-hidden py-1">
      <div
        ref={contentRef}
        className={cn("break-words", !expanded && "line-clamp-4")}
      >
        {parsed.plain && (
          <p className="text-sm leading-snug">
            {truncateLongTokens(parsed.plain)}
          </p>
        )}
        {parsed.rejected && (
          <p className="text-sm leading-snug text-status-error/60 mb-1.5">
            {/* FIXED: added "Rejected:" label after the icon */}
            <Ban className="inline size-3.5 text-status-error mr-1.5 -mt-0.5" aria-hidden="true" />
            <span className="font-medium text-status-error mr-1">Rejected:</span>
            {truncateLongTokens(parsed.rejected)}
          </p>
        )}
        {/* A single leading dash rather than a left quote bar: the bar repeated
            down every wrapped line and read as a pipe on each one. The dash
            marks the start once and wrapped lines simply continue. */}
        {parsed.request && (
          <p className="text-[13px] leading-snug text-info-light">
            <span className="mr-1" aria-hidden="true">-</span>
            {truncateLongTokens(parsed.request)}
          </p>
        )}
      </div>
      {(clamped || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
};