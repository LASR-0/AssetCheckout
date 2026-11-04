import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@/lib/utils";
import { CALENDAR_CLASS_NAMES } from "./calendarClasses";

///  +-----------------------------------------------------------------+
///  |                        THE CALENDAR                             |
///  +-----------------------------------------------------------------+
//
//  react-day-picker, dressed in the design tokens (styles/tokens.css) rather
//  than the stock shadcn palette, so it follows the theme switch and the
//  palette like everything else. Nothing in it is hardcoded to a hue.
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
