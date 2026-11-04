import { cn } from "@/lib/utils";

const companyName: string | undefined = import.meta.env.VITE_COMPANY_NAME;

/**
 * The small square monogram the designs put in a framed modal's header: the
 * company's initial, or Checkout's when no company is configured. Text, not
 * the logo, so it stays legible at 22 design px in every palette.
 */
export function BrandMark({ className }: { className?: string }) {
  const initial = (companyName?.trim()[0] ?? "C").toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5.5 shrink-0 place-items-center rounded-6 bg-ink fs-10 font-semibold text-on-ink",
        className
      )}
    >
      {initial}
    </span>
  );
}
