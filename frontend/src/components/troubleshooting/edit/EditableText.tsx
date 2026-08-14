import { useEffect, useRef } from "react";

///  +-----------------------------------------------------------------+
///  |                  A FIELD THAT LOOKS LIKE PROSE                  |
///  +-----------------------------------------------------------------+
//
//  An auto-growing textarea styled to match the text it replaces, so turning
//  edit mode on doesn't reflow the page or change how long an article looks.
//
//  A TEXTAREA RATHER THAN contentEditable. contentEditable gives you HTML,
//  and every one of these fields is plain text — a `body` is prose, not
//  markup. Accepting HTML would mean sanitising it, storing it, and deciding
//  what the schema means by a string. A textarea gives back exactly what was
//  typed.
//
//  IT GROWS RATHER THAN SCROLLING. A step body is four or five lines and an
//  editor should see all of it; an inner scrollbar in the middle of a page
//  that also scrolls is a small misery.
///  +-----------------------------------------------------------------+

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** Matches the class of whatever this stands in for. */
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  rows?: number;
  /**
   * How loudly the field announces itself.
   *
   * `primary` is the purple dashed treatment used for the article's actual
   * content — the step titles and bodies somebody came here to write.
   *
   * `muted` is for the metadata around it: the summary and the two facts under
   * it. They are fields, but they are not the work, and giving them the same
   * weight as the prose made the top of every article the loudest thing on the
   * page before an author had read a word of it.
   */
  tone?: "primary" | "muted";
  /**
   * Width follows the text, up to whatever room the parent gives it.
   *
   * For short single facts sitting inline beside other things — "iOS 16 and
   * later" next to the updated date. A field that always claims the full
   * remaining width pushes whatever follows it to the far edge of the page and
   * looks empty for the eighty per cent of values that are four words long.
   *
   * Measured rather than guessed. `field-sizing: content` does exactly this in
   * CSS but is not in Firefox or Safari yet, and a `ch`-based estimate is
   * wrong in a proportional font — "iOS 16" and "WWWWWW" are the same number
   * of characters and nothing like the same width.
   */
  autoWidth?: boolean;
};

const TONES = {
  primary:
    "border-dashed border-primary/40 bg-primary/5 focus:border-primary focus:bg-primary/10",
  muted:
    "border-dashed border-outline bg-surface-container-low/30 focus:border-info-light focus:bg-surface-container-low/50",
} as const;

export default function EditableText({
  value,
  onChange,
  className = "",
  placeholder,
  ariaLabel,
  rows = 1,
  tone = "primary",
  autoWidth = false,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const mirror = useRef<HTMLSpanElement | null>(null);

  // WIDTH FIRST, THEN HEIGHT, and the order is not incidental: how wide the
  // field ends up decides where the text wraps, and where it wraps decides how
  // tall it needs to be. Measuring height first would size it for the previous
  // width and leave a clipped last line every time the text crosses the cap.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (autoWidth && mirror.current) {
      // The mirror carries the same classes, so the same font and padding, and
      // `whitespace-pre` so it reports the width the text WANTS rather than
      // the width it has. `max-width` in CSS does the capping — trying to do
      // it here would need the parent's width, which is the parent's business.
      node.style.width = `${mirror.current.offsetWidth + 2}px`;
    }

    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value, autoWidth, placeholder]);

  // Split so the MIRROR can be sized by its content. It has to carry the same
  // font and padding to measure honestly, but not `w-full` — an absolutely
  // positioned element at 100% width reports its container's width, which is
  // the one number this must not use.
  const shared =
    "resize-none overflow-hidden rounded-md border px-2 py-1 " +
    "outline-none transition-colors " +
    TONES[tone] +
    " " +
    className;

  const classes = `w-full ${shared}`;

  const field = (
    <textarea
      ref={ref}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={autoWidth ? `${classes} max-w-full` : classes}
    />
  );

  if (!autoWidth) return field;

  return (
    <span className="inline-flex min-w-0 max-w-full">
      {/* Off-screen rather than `visibility: hidden`, so it takes no space in
          the flex row it sits in. Falls back to the placeholder so an empty
          field is the size of its own prompt rather than a sliver. */}
      <span
        ref={mirror}
        aria-hidden
        className={`${shared} pointer-events-none absolute -left-[9999px] top-0 w-auto whitespace-pre`}
      >
        {value || placeholder || ""}
      </span>
      {field}
    </span>
  );
}
