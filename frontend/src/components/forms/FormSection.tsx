import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet } from "@/components/ui/tray";

type SectionProps = Omit<ComponentProps<"section">, "title"> & {
  /** Anchor for the steps rail and error links: rendered as `sec-<id>`. */
  id: string;
  label: ReactNode;
  aside?: ReactNode;
  /** The sheet's own classes; most sections are a padded column. */
  sheetClassName?: string;
};

/** One step of a form: a labelled tray holding a sheet. */
export function FormSection({ id, label, aside, sheetClassName, children, ...props }: SectionProps) {
  return (
    <Tray id={`sec-${id}`} label={label} aside={aside} className="scroll-mt-4" {...props}>
      <Sheet className={cn("flex flex-col gap-3 p-3.5", sheetClassName)}>{children}</Sheet>
    </Tray>
  );
}

/** The question a section asks, with an optional line of help. */
export function Question({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <div className="fs-13.5 font-semibold text-tx">{children}</div>
      {hint && <div className="mt-0.5 fs-12 leading-[1.45] text-pretty text-tx3">{hint}</div>}
    </div>
  );
}

export function FieldError({ children, className }: { children: ReactNode; className?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn("m-0 flex items-center gap-1.5 fs-12 font-medium text-stop", className)}>
      <Icon name="error" size={16} />
      {children}
    </p>
  );
}

/** A labelled field: the label above, "optional" muted beside it. */
export function Field({
  label,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  optional?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5 fs-13 font-medium text-tx", className)}>
      <span>
        {label}
        {optional && <span className="font-normal text-mut"> {optional === true ? "optional" : optional}</span>}
      </span>
      {children}
    </label>
  );
}
