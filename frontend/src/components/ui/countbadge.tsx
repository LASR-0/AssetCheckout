import { cn } from "@/lib/utils";

type Props = {
  count: number;
  /** Announced to screen readers — the digit alone says nothing useful. */
  label?: string;
  /**
   * `brand` for work waiting on the reader (needs-you), `ink` for everything
   * else (the stock queue), as in the designs' nav.
   */
  tone?: "brand" | "ink";
  /**
   * Positioning, supplied by the caller. The nav sits it beside a label; the
   * queue cards sit it inline beside a heading. The badge itself stays
   * layout-agnostic so it can do both.
   */
  className?: string;
};

export default function CountBadge({ count, label, tone = "brand", className }: Props) {
  if (!Number.isFinite(count) || count <= 0) return null;
  const display = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-label={label ? `${count} ${label}` : `${count} items`}
      className={cn(
        "inline-grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded-9 px-1.25 fs-11 leading-none font-semibold tabular-nums",
        tone === "brand" ? "bg-brand text-on-brand" : "bg-ink text-on-ink",
        className
      )}
    >
      {display}
    </span>
  );
}
