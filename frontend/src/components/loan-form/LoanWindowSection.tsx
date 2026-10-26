"use client";

import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import Calendar from "@/components/ui/calendar";
import { useIsDesktop } from "@/hooks/useIsDesktop";

///  +-----------------------------------------------------------------+
///  |                   HOW LONG DO YOU NEED IT                       |
///  +-----------------------------------------------------------------+
//
//  A range picker and a running day count, and the count is the point. The
//  question people actually ask themselves is "how many days is that" — they
//  know they need it Monday to Thursday and have to work out whether that is
//  three days or four. Showing the answer back removes the arithmetic and,
//  more usefully, makes an accidental month obvious at a glance.
//
//  BOTH ENDS ARE INCLUSIVE. Picking up and returning on the same day is a
//  one-day loan. The server counts it the same way — see createLoanRequest.
//
//  DATES ARE CALENDAR DAYS, NEVER INSTANTS. The picker hands back local
//  midnights; toDateString below takes the local Y-M-D parts and formats them
//  as "YYYY-MM-DD", which is the only shape the API accepts. Sending an ISO
//  timestamp would let the browser's timezone decide which day a loan fell on,
//  and a Brisbane evening booking would land on tomorrow.
///  +-----------------------------------------------------------------+

/** Local calendar parts as "YYYY-MM-DD" — what the API takes, and all it takes. */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Inclusive day count across a range. */
export function countDays(range: DateRange | undefined): number {
  if (!range?.from) return 0;
  const to = range.to ?? range.from;
  const from = new Date(range.from.getFullYear(), range.from.getMonth(), range.from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((end.getTime() - from.getTime()) / 86_400_000) + 1;
}

const LONG_FORMAT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  day: "numeric",
  month: "short",
};

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  /** Longest window the server will accept. Shown, not silently enforced. */
  maxDays: number;
  label?: string;
};

export default function LoanWindowSection({
  value,
  onChange,
  maxDays,
  label = "2. When do you need it?",
}: Props) {
  const days = countDays(value);
  const tooLong = days > maxDays;

  // Nothing before today is selectable. A loan that started last week is not a
  // booking, it is a typo, and the server refuses it — so the picker should
  // not offer it in the first place.
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  // TWO MONTHS ON DESKTOP, and it is not decoration. Most loans are booked a
  // few days out, and a good share of those cross a month boundary — a
  // booking made on the 30th almost always does. With one month visible that
  // range cannot be dragged: you pick the start, navigate, then hunt for the
  // end, having lost sight of where you began. Both months on screen makes it
  // one gesture. Phones have no room for the second, so they keep the arrows.
  const isDesktop = useIsDesktop();

  return (
    <div>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-4">
        {label}
      </label>

      <div className="rounded-xl border border-outline bg-surface-container-low overflow-hidden">
        <div className="flex justify-center">
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            disabled={{ before: today }}
            // Bounds the arrows rather than only greying out the cells: there
            // is nothing to see behind the current month, so being able to
            // page back into it is just a way to lose the calendar.
            startMonth={today}
            numberOfMonths={isDesktop ? 2 : 1}
          />
        </div>

        {/* The running total. Present even when empty so the panel does not
            change height on the first click — a layout jump under the cursor
            mid-selection is how a second date gets picked by accident. */}
        <div
          className={`flex flex-wrap items-center gap-2 border-t border-outline px-4 py-3 text-sm ${
            tooLong ? "bg-error-background text-error" : "bg-surface-container-lowest text-info-light"
          }`}
        >
          <span className="material-symbols-outlined !text-[18px]">
            {tooLong ? "warning" : "date_range"}
          </span>

          {!value?.from ? (
            <span>Pick the first day you need it.</span>
          ) : !value.to ? (
            <span>
              From{" "}
              <strong className="text-on-surface font-semibold">
                {value.from.toLocaleDateString("en-AU", LONG_FORMAT)}
              </strong>{" "}
              — now pick the day you'll bring it back.
            </span>
          ) : (
            <span>
              <strong className={tooLong ? "font-semibold" : "text-on-surface font-semibold"}>
                {value.from.toLocaleDateString("en-AU", LONG_FORMAT)}
              </strong>{" "}
              to{" "}
              <strong className={tooLong ? "font-semibold" : "text-on-surface font-semibold"}>
                {value.to.toLocaleDateString("en-AU", LONG_FORMAT)}
              </strong>{" "}
              · {days} day{days === 1 ? "" : "s"}
              {tooLong && ` — that's longer than the ${maxDays}-day maximum.`}
            </span>
          )}
        </div>
      </div>

      <p className="mt-2 ml-1 text-xs text-info-light">
        You'll return it to your stock keeper on the last day. We'll remind you
        before it's due.
      </p>
    </div>
  );
}
