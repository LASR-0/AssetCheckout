import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

///  +-----------------------------------------------------------------+
///  |                  TRAYS AND SHEETS                               |
///  +-----------------------------------------------------------------+
//
//  The layout primitive every redesigned page is built from. A TRAY is a
//  softly tinted container with a small-caps label; a SHEET is the white
//  panel sitting inside it with a hairline border. A section holding one
//  switch and a section holding a whole editor get the same frame, which is
//  what keeps the rhythm consistent.
///  +-----------------------------------------------------------------+

/** Small-caps label: Martian Mono, 10 design px, letter-spaced, muted. */
export function TrayLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "font-title fs-10 font-medium tracking-label text-mut uppercase",
        className
      )}
      {...props}
    />
  );
}

type TrayProps = Omit<ComponentProps<"section">, "title"> & {
  /** The small-caps header. Omit for an unlabelled tray. */
  label?: ReactNode;
  /** Right-aligned beside the label: a count, a link, a small control. */
  aside?: ReactNode;
};

export function Tray({ label, aside, className, children, ...props }: TrayProps) {
  return (
    <section className={cn("rounded-14 bg-tray p-0.75", className)} {...props}>
      {(label || aside) && (
        <div className="flex items-center justify-between gap-2.5 px-2.5 pt-1.75 pb-1.5">
          <TrayLabel>{label}</TrayLabel>
          {aside && (
            <div className="flex items-center gap-2 fs-11 text-mut">{aside}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * The surface inside a tray. Lists inside one separate with `divide-y
 * divide-line2`; give padded content `p-3.5`.
 */
export function Sheet({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-11 border border-line bg-sheet", className)}
      {...props}
    />
  );
}
