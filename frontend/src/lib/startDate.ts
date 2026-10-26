///  +-----------------------------------------------------------------+
///  |                  A NEW STARTER'S FIRST DAY                      |
///  +-----------------------------------------------------------------+
//
//  Request.startDate is a calendar day stored at UTC midnight, the same
//  contract as the loan dates. It is read here as a DAY — its UTC parts —
//  never as an instant in the viewer's timezone, or a Brisbane browser would
//  show the 12th as the 12th and a server in UTC would hold until the 12th,
//  while one in the Americas would display the 11th.
//
//  "Pending" is the server's rule (isHeldForStartDate): the day has not
//  arrived yet. Today itself is not pending — day one is when the ladder
//  starts counting.
///  +-----------------------------------------------------------------+

/** Today's calendar day as a UTC-midnight timestamp, from the viewer's own clock. */
function todayAsUtcDay(now: Date): number {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
}

/** True while the requestee has not started yet — reminders are being held. */
export function isStartPending(
  startDate: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!startDate) return false;
  const day = new Date(startDate).getTime();
  if (Number.isNaN(day)) return false;
  return day > todayAsUtcDay(now);
}

/** "12 Nov" — the chip. */
export function formatStartShort(startDate: string): string {
  return new Date(startDate).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** "Thursday 12 November 2026" — the tooltip and the dialog. */
export function formatStartLong(startDate: string): string {
  return new Date(startDate).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The stored day as a local Date, for handing to the calendar picker. */
export function startDateToLocal(startDate: string): Date {
  const d = new Date(startDate);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}
