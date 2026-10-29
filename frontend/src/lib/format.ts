///  +-----------------------------------------------------------------+
///  |                  DATES, THE WAY THE DESIGNS WRITE THEM            |
///  +-----------------------------------------------------------------+
//
//  en-AU throughout: "26 Oct", "Monday, 26 October".
//
//  TWO KINDS OF DATE. An event (approved, shipped, collected) is an instant,
//  shown in the viewer's own timezone. A picked DAY (a loan's due date, a new
//  starter's start date) is written as UTC midnight of that day, so it is
//  read in UTC; reading it locally would show the day before for anyone west
//  of Greenwich and is exactly the off-by-one lib/stage.ts guards against.
///  +-----------------------------------------------------------------+

// Three letters, always. Intl's en-AU abbreviations are "June", "July" and
// "Sept", which the designs (and a narrow column) don't want.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY = new Intl.DateTimeFormat("en-AU", { weekday: "long" });
const DAY_MONTH = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "long" });

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** An event, in the viewer's timezone: "26 Oct". Empty for no date. */
export function shortDate(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : "";
}

/** A picked calendar day (due date, start date): "3 Nov". */
export function dayDate(iso: string | null | undefined): string {
  const d = parse(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "";
}

/** "Monday, 26 October". Composed, because en-AU drops the comma. */
export function longDate(date: Date): string {
  return `${WEEKDAY.format(date)}, ${DAY_MONTH.format(date)}`;
}
