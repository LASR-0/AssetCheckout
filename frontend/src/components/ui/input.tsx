import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { fieldVariants } from "@/components/ui/variants"

const heights = { md: "h-9", lg: "h-11" } as const

function Input({
  className,
  type,
  size,
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof fieldVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldVariants({ size }), heights[size ?? "md"], className)}
      {...props}
    />
  )
}

export { Input }
