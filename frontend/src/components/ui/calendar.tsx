import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";

///  +-----------------------------------------------------------------+
///  |                        THE CALENDAR                             |
///  +-----------------------------------------------------------------+
//
//  react-day-picker, dressed in this app's own tokens rather than the stock
//  shadcn palette — every colour here is a `surface-*` / `on-*` / `primary`
//  token from index.css, so it follows the theme switch and the org preset
//  like everything else. Nothing in it is hardcoded to a hue.
//
//  IT SHIPS NO CSS FILE. react-day-picker's stylesheet is deliberately not
//  imported: it styles by element rather than by class, so it would leak into
//  any table it shares a page with, and it knows nothing about the tokens.
//  Every class below is supplied through `classNames`, which replaces the
//  library's defaults outright.
//
//  Sized in rem so the grid keeps its shape when the browser font size
//  changes, and the whole thing fits the 400px phone width without a
//  horizontal scroll.
///  +-----------------------------------------------------------------+

export type CalendarProps = DayPickerProps & {
  className?: string;
};

/**
 * Exported for the contract test, not for callers to spread.
 *
 * The month arrows are positioned rather than laid out, which couples two
 * entries here that sit forty lines apart and share no obvious connection.
 * Break that coupling and nothing errors — the arrows simply leave the
 * calendar, and the only way to find out is to look. Hence a test.
 */
export const CALENDAR_CLASS_NAMES = {
  ///  MONTH NAVIGATION
  //
  //  `relative` HERE IS LOAD-BEARING. react-day-picker renders <Nav> as
  //  the first child of `months`, and the nav is absolutely positioned
  //  so it can straddle the caption row. Without a positioned ancestor
  //  it resolves against whatever further up the tree happens to be
  //  positioned — the dialog, or the page — and the arrows silently
  //  leave the calendar entirely. Nothing errors; the buttons are just
  //  somewhere else, and the month cannot be changed.
  months: "relative flex flex-col sm:flex-row gap-6",
  month: "space-y-3",
  month_caption: "flex items-center justify-center h-9",
  caption_label: "text-sm font-semibold text-on-surface",

  // Spans the full width of `months` so that with two months shown the
  // arrows sit at the outer edges rather than bracketing the first one.
  // pointer-events are off on the bar and back on for the buttons, so
  // the strip between them doesn't swallow clicks on the caption.
  nav: "absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between pointer-events-none",

  // aria-disabled, NOT disabled: Nav marks the end of the navigable
  // range with aria-disabled and leaves the button enabled. A
  // `disabled:` variant matches nothing here, so the arrow at the
  // boundary would look live and do nothing when clicked.
  button_previous:
    "pointer-events-auto size-8 grid place-items-center rounded-lg text-info-light " +
    "hover:bg-surface-container-high hover:text-on-surface transition-colors " +
    "aria-disabled:opacity-25 aria-disabled:pointer-events-none cursor-pointer",
  button_next:
    "pointer-events-auto size-8 grid place-items-center rounded-lg text-info-light " +
    "hover:bg-surface-container-high hover:text-on-surface transition-colors " +
    "aria-disabled:opacity-25 aria-disabled:pointer-events-none cursor-pointer",

  // The arrow glyph is a bare <polygon> with no fill of its own, so
  // unstyled it paints browser-default black — invisible on the dark
  // theme and off-palette on the light one. fill-current inherits the
  // button's colour, which is what makes it follow the theme and the
  // hover state. The size utilities override the SVG's own width/height
  // attributes (it defaults to 24).
  chevron: "size-4 fill-current",

  month_grid: "w-full border-collapse",
  weekdays: "flex",
  weekday:
    "w-9 text-[11px] font-semibold uppercase tracking-wider text-info-light",
  week: "flex w-full mt-1",

  // The cell, not the button. Range backgrounds live here so they meet
  // edge to edge across the row instead of leaving gaps between days.
  day: "relative w-9 h-9 p-0 text-center text-sm focus-within:relative focus-within:z-20",
  day_button:
    "w-9 h-9 rounded-lg font-normal text-on-surface transition-colors cursor-pointer " +
    "hover:bg-surface-container-high aria-selected:font-semibold " +
    "disabled:pointer-events-none",

  // Both ends of the range are solid; the middle is a tint. Squaring the
  // inner corners is what makes a five-day booking read as one bar
  // rather than five chips.
  range_start:
    "bg-primary/15 rounded-l-lg [&>button]:bg-primary [&>button]:text-on-primary " +
    "[&>button]:hover:bg-primary",
  range_end:
    "bg-primary/15 rounded-r-lg [&>button]:bg-primary [&>button]:text-on-primary " +
    "[&>button]:hover:bg-primary",
  range_middle:
    "bg-primary/15 [&>button]:bg-transparent [&>button]:text-on-surface " +
    "[&>button]:rounded-none [&>button]:hover:bg-primary/25",
  selected: "",

  // A ring rather than a fill, so "today" never competes with the
  // selection it might also be part of.
  today:
    "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-primary/50 " +
    "[&>button]:font-semibold",
  outside: "[&>button]:text-info-light/40",
  disabled: "[&>button]:text-info-light/30 [&>button]:line-through",
  hidden: "invisible",
} as const;

export default function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      // Monday-first: this is an Australian workplace tool and a week that
      // starts on Sunday reads as a mistake to everyone using it.
      weekStartsOn={1}
      className={cn("p-3 select-none", className)}
      classNames={{ ...CALENDAR_CLASS_NAMES, ...classNames }}
      {...props}
    />
  );
}
