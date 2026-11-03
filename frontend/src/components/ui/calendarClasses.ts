/**
 * The calendar's parts, in a file of their own so the contract test can
 * read them (a component file may only export components).
 *
 * The month arrows are positioned rather than laid out, which couples two
 * entries here that sit forty lines apart and share no obvious connection.
 * Break that coupling and nothing errors — the arrows simply leave the
 * calendar, and the only way to find out is to look. Hence a test.
 */
export const CALENDAR_CLASS_NAMES = {
  months: "relative flex flex-col gap-x-7 gap-y-3 phone:flex-row",
  month: "flex min-w-0 flex-1 flex-col gap-1.5",
  month_caption: "flex h-8 items-center justify-center",
  caption_label: "fs-13 font-semibold text-tx",

  nav: "absolute inset-x-0 top-0 z-10 flex h-8 items-center justify-between pointer-events-none",

  button_previous:
    "pointer-events-auto grid size-8 cursor-pointer place-items-center rounded-8 text-tx2 " +
    "transition-colors hover:bg-hover hover:text-tx " +
    "aria-disabled:pointer-events-none aria-disabled:text-dis",
  button_next:
    "pointer-events-auto grid size-8 cursor-pointer place-items-center rounded-8 text-tx2 " +
    "transition-colors hover:bg-hover hover:text-tx " +
    "aria-disabled:pointer-events-none aria-disabled:text-dis",

  chevron: "size-4.5 fill-current",

  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday: "grid h-6 flex-1 place-items-center fs-10.5 font-medium text-mut",
  week: "mt-0.5 flex w-full",

  day: "relative h-8.5 flex-1 p-0 text-center focus-within:z-20",
  day_button:
    "h-full w-full cursor-pointer rounded-8 font-sans fs-12.5 text-tx tabular-nums transition-colors " +
    "outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand " +
    "disabled:pointer-events-none",

  // A single pick and the two ends of a range: the brand chip.
  selected: "[&>button]:bg-brand [&>button]:font-semibold [&>button]:text-on-brand [&>button]:hover:bg-brand",
  range_start: "",
  range_end: "",
  // Inside a range: a tint, joined across the row and rounded at its ends.
  range_middle:
    "bg-brand-sub first:rounded-l-8 last:rounded-r-8 " +
    "[&>button]:rounded-none! [&>button]:bg-transparent! [&>button]:font-normal! [&>button]:text-tx! " +
    "[&>button]:hover:bg-brand-sub!",

  today: "[&>button]:shadow-[inset_0_0_0_1px_var(--strong)]",
  outside: "[&>button]:text-dis",
  disabled: "[&>button]:text-dis [&>button]:line-through",
  hidden: "invisible",
} as const;
