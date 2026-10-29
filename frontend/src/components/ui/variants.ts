import { cva } from "class-variance-authority"

// One solid primary per view: `primary` (ink) by default, `brand` where the
// design calls for the brand colour instead. `secondary` is a sheet with a
// hairline; `ghost` is the borderless icon/text button; `danger` is the
// quiet destructive (hairline in the stop colour) and `danger-solid` the
// confirm step of a destructive action. Sizes are the designs' 28 / 36 / 44
// design px; 44 is the touch height every mobile layout uses.
export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 border font-sans font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-default",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-ink text-on-ink hover:bg-ink-hover disabled:bg-track disabled:text-dis",
        brand:
          "border-transparent bg-brand text-on-brand hover:opacity-90 disabled:bg-track disabled:text-dis disabled:opacity-100",
        secondary:
          "border-strong bg-sheet text-tx hover:bg-hover disabled:bg-sheet disabled:text-dis",
        ghost:
          "border-transparent bg-transparent text-tx3 hover:bg-hover hover:text-tx disabled:bg-transparent disabled:text-dis",
        danger:
          "border-stop-line bg-sheet text-stop hover:bg-stop-bg disabled:text-dis",
        "danger-solid":
          "border-transparent bg-stop text-sheet hover:opacity-90 disabled:bg-track disabled:text-dis disabled:opacity-100",
        link:
          "h-auto border-transparent bg-transparent p-0 text-brand-tx hover:underline hover:underline-offset-3 disabled:text-dis",
      },
      size: {
        sm: "h-7 rounded-7 px-2.5 fs-11.5",
        md: "h-9 rounded-9 px-3.5 fs-13.5",
        lg: "h-11 rounded-10 px-4 fs-15",
        "icon-sm": "size-7 rounded-7 fs-11.5",
        icon: "size-9 rounded-9 fs-13.5",
        "icon-lg": "size-11 rounded-10 fs-15",
      },
    },
    compoundVariants: [
      { variant: "link", size: ["sm", "md", "lg"], className: "h-auto px-0" },
    ],
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  }
)

// The two field densities in the designs: `md` (36 design px, 13.5px text)
// on operator pages and `lg` (44, 15px) on requester forms and every mobile
// layout. An `lg` placeholder drops to 13px, the size of the label above the
// field, so a hint never reads louder than the question it answers. Shared with Textarea and the select/combobox triggers so a row of
// mixed controls lines up.
export const fieldVariants = cva(
  "w-full min-w-0 border border-strong bg-sheet font-sans text-tx transition-[border-color,box-shadow] outline-none placeholder:text-placeholder focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_var(--brand-sub)] disabled:cursor-not-allowed disabled:bg-subtle disabled:text-dis aria-invalid:border-stop aria-invalid:focus-visible:shadow-[0_0_0_3px_var(--stop-bg)]",
  {
    variants: {
      size: {
        md: "rounded-8 px-2.5 fs-13.5",
        lg: "rounded-9 px-3 fs-15 placeholder:fs-13",
      },
    },
    defaultVariants: { size: "md" },
  }
)
