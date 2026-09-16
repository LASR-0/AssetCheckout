///  +-----------------------------------------------------------------+
///  |                      THE COUNT BADGE                            |
///  +-----------------------------------------------------------------+
//
//  A CIRCLE, NOT A PILL. Fixed width and height with no horizontal padding,
//  so a single digit is round rather than a stubby lozenge — which is the
//  whole reason this exists rather than reusing the status Badge.
//
//  Double digits would burst a fixed circle, so anything past 9 renders as
//  "9+" and the circle keeps its shape. A badge is a nudge, not a readout:
//  the exact figure past nine changes nothing about what the reader does, and
//  they get the real number the moment they click through.
//
//  RENDERS NOTHING AT ZERO. An empty circle is worse than no circle — it
//  draws the eye to say "nothing here" — so the caller can pass the count
//  unconditionally and let this decide.
//
//  ONE COLOUR, ON PURPOSE. It used to carry an "urgent"/"muted" variant, and
//  the second colour immediately meant two badges on the same screen made the
//  same claim in different paint. A count badge only ever says "this many
//  things want you" — if something does not warrant the attention, it should
//  not have a badge at all rather than a quieter one.
//
//  status-error is the token, not a raw red: it is defined in every theme
//  preset (ksb, grayscale, miramare, light and dark alike) and is red in all
//  of them, so the badge stays red wherever it lands without any preset
//  needing to know it exists.
///  +-----------------------------------------------------------------+

type Props = {
  count: number;
  /** Announced to screen readers — the digit alone says nothing useful. */
  label?: string;
  /**
   * Positioning, supplied by the caller. The nav pins it to the corner of a
   * tab; the queue cards sit it inline beside a heading. The badge itself
   * stays layout-agnostic so it can do both.
   */
  className?: string;
};

export default function CountBadge({ count, label, className = "" }: Props) {
  if (!Number.isFinite(count) || count <= 0) return null;

  const display = count > 9 ? "9+" : String(count);

  return (
    <span
      // aria-label rather than title: a tooltip on a 16px circle inside a nav
      // link is not discoverable, and the link's own text already carries the
      // hover affordance.
      aria-label={label ? `${count} ${label}` : `${count} items`}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-status-error text-[9px] font-bold leading-none text-white tabular-nums ${className}`}
    >
      {display}
    </span>
  );
}
