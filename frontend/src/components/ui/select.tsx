import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Icon } from "@/components/ui/icon"
import { fieldVariants } from "@/components/ui/variants"
import { FLOATING_SURFACE, MENU_ROW } from "@/components/ui/surface"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

/** Drawn as a field, so it lines up with inputs of the same size. */
function SelectTrigger({
  className,
  size = "md",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "md" | "lg"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        fieldVariants({ size }),
        "flex cursor-pointer items-center justify-between gap-2 text-left whitespace-nowrap select-none data-placeholder:text-placeholder data-[state=open]:border-brand data-[state=open]:shadow-[0_0_0_3px_var(--brand-sub)] *:data-[slot=select-value]:truncate",
        size === "md" ? "h-9 pr-2" : "h-11 pr-2.5",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <Icon name="expand_more" size={18} className="text-mut" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          FLOATING_SURFACE,
          "relative max-h-(--radix-select-content-available-height) min-w-36 overflow-hidden",
          className
        )}
        position={position}
        align={align}
        sideOffset={sideOffset}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-position={position}
          className={cn(
            "max-h-70 p-1",
            "data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "px-2.5 pt-2 pb-1 font-title fs-10 font-medium tracking-label text-mut uppercase",
        className
      )}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(MENU_ROW, "pr-8 data-[state=checked]:font-medium", className)}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center text-brand">
        <SelectPrimitive.ItemIndicator>
          <Icon name="check" size={16} />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-line2", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn("flex cursor-default items-center justify-center py-1 text-mut", className)}
      {...props}
    >
      <Icon name="expand_less" size={16} />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn("flex cursor-default items-center justify-center py-1 text-mut", className)}
      {...props}
    >
      <Icon name="expand_more" size={16} />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
