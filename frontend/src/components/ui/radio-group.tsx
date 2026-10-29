import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid w-full gap-1.5", className)}
      {...props}
    />
  )
}

// 18 design px ring, 8px dot, brand when checked.
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "grid size-4.5 shrink-0 cursor-pointer place-items-center rounded-full border-[1.5px] border-strong bg-sheet transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand data-[state=checked]:border-brand disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="size-2 rounded-full bg-brand"
      />
    </RadioGroupPrimitive.Item>
  )
}

export { RadioGroup, RadioGroupItem }
