"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

// The frame is the field here: it carries the border and the focus ring
// (on focus-within), and the control inside is bare. Heights match Input's
// md / lg so an input group sits in a row of plain inputs without a seam.
const inputGroupVariants = cva(
  "group/input-group relative flex w-full min-w-0 items-center border border-strong bg-sheet transition-[border-color,box-shadow] outline-none focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-sub)] has-disabled:bg-subtle has-disabled:text-dis has-[[data-slot][aria-invalid=true]]:border-stop has-[>textarea]:h-auto has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-start]]:flex-col in-data-[slot=combobox-content]:focus-within:shadow-none",
  {
    variants: {
      size: {
        md: "h-9 rounded-8 fs-13.5",
        lg: "h-11 rounded-9 fs-15",
      },
    },
    defaultVariants: { size: "md" },
  }
)

function InputGroup({
  className,
  size,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupVariants>) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(inputGroupVariants({ size }), className)}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text items-center justify-center gap-2 text-mut select-none group-has-disabled/input-group:opacity-50",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-2.5",
        "inline-end": "order-last pr-1",
        "block-start": "order-first w-full justify-start px-2.5 pt-2",
        "block-end": "order-last w-full justify-start px-2.5 pb-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
)

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

const inputGroupButtonVariants = cva("shadow-none", {
  variants: {
    size: {
      xs: "h-6 gap-1 rounded-6 px-1.5 fs-12",
      sm: "h-7 rounded-7 px-2 fs-12",
      "icon-xs": "size-6 rounded-6 p-0",
      "icon-sm": "size-7 rounded-7 p-0",
    },
  },
  defaultVariants: {
    size: "xs",
  },
})

function InputGroupButton({
  className,
  variant = "ghost",
  size = "xs",
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size"> &
  VariantProps<typeof inputGroupButtonVariants>) {
  return (
    <Button
      data-size={size}
      variant={variant}
      size="sm"
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("flex items-center gap-2 text-mut", className)}
      {...props}
    />
  )
}

// Bare controls: the group draws the border and the focus ring.
const BARE =
  "flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:shadow-none disabled:bg-transparent aria-invalid:shadow-none"

// Takes its font size from the group (md / lg) rather than carrying its own.
function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        BARE,
        "h-full min-w-0 px-2.5 font-sans text-tx outline-none placeholder:text-placeholder disabled:cursor-not-allowed disabled:text-dis",
        className
      )}
      {...props}
    />
  )
}

function InputGroupTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <Textarea
      data-slot="input-group-control"
      className={cn(BARE, "resize-none", className)}
      {...props}
    />
  )
}

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}
