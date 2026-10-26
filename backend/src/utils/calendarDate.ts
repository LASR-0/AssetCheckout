import { AppError } from "./errors.js";

///  +-----------------------------------------------------------------+
///  |                  DATES AS CALENDAR DAYS                         |
///  +-----------------------------------------------------------------+
//
//  Some dates in this system are days, not instants. A loan "due back on the
//  5th" means the whole of the 5th; a new starter whose first day is the 12th
//  starts on the 12th wherever the server happens to be. So every such date is
//  normalised to UTC midnight of the chosen day on the way in, and every
//  comparison is made between whole days.
//
//  This is the same contract the frontend's deriveLoanStage reads, and the
//  two MUST agree: the client decides whether to show the Return button and
//  the server decides whether to honour it. If they disagree about what day
//  it is, the button appears and the API refuses it.
///  +-----------------------------------------------------------------+

export const MS_PER_DAY = 86_400_000;

/**
 * Parse a "YYYY-MM-DD" into UTC midnight of that day.
 *
 * Deliberately refuses anything else, a full ISO timestamp included. Accepting
 * one would mean the caller's timezone decided which calendar day the date
 * fell on, and a Brisbane evening submission would book the day after.
 */
export function parseCalendarDate(value: unknown, field: string): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new AppError(`${field} must be a date in YYYY-MM-DD form`, 400);
  }
  const date = new Date(`${value.trim()}T00:00:00.000Z`);
  // `new Date` rolls an impossible day over into the next month rather than
  // failing ("2026-02-30" is 2 March), so check it came back as the same day.
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value.trim()) {
    throw new AppError(`${field} is not a real date`, 400);
  }
  return date;
}

/** UTC midnight of today — the reference point every day comparison uses. */
export function todayUtc(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
}

/** "5 October 2026" — for emails and Snipe notes, never for parsing. */
export function formatCalendarDate(date: Date): string {
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
