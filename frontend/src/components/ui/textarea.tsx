import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { fieldVariants } from "@/components/ui/variants"

function Textarea({
  className,
  size,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof fieldVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldVariants({ size }),
        "min-h-18 resize-y py-2 leading-normal",
        size === "lg" && "py-2.5",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
