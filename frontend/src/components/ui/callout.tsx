///  +-----------------------------------------------------------------+
///  |                          CALLOUT                                |
///  +-----------------------------------------------------------------+
//
//  A tinted, left-accented block for a note or a warning inside prose. The
//  troubleshooting article steps are the first caller; anything else in the
//  app that needs "read this before you click" should use it rather than
//  hand-rolling the markup, so a restyle lands in one place.
//
//  Built the same way as Badge: one shell, a style map per variant, and no
//  per-caller class strings.
//
///  ── A NOTE ON THE COLOURS ────────────────────────────────────────────
//
//  The design mockup rendered notes in blue. This app has no blue token, and
//  that is deliberate rather than an oversight: --status-pending carries the
//  comment "the notice/info colour — 'read this before you click' boxes",
//  and it is orange. So `note` is orange here and `warn` is red.
//
//  The pair is still distinguishable, but they are neighbours on the wheel
//  where the mockup had them opposite, so `warn` leans on its icon and its
//  heavier tint to separate itself. Introducing a blue token to recover the
//  mockup's contrast was the alternative, and it would have put a colour in
//  the palette that means "info" in exactly one component while
//  --status-pending kept meaning it everywhere else.
///  +-----------------------------------------------------------------+

export type CalloutVariant = "note" | "warn";

const VARIANTS: Record<
  CalloutVariant,
  { icon: string; label: string; bg: string; border: string; text: string }
> = {
  note: {
    icon: "info",
    label: "Note",
    bg: "bg-status-pending/10",
    border: "border-l-status-pending",
    text: "text-status-pending",
  },
  warn: {
    icon: "warning",
    label: "Careful",
    // A heavier tint than note. With the two hues adjacent, the weight is
    // doing work the hue can't.
    bg: "bg-status-error/15",
    border: "border-l-status-error",
    text: "text-status-error",
  },
};

export type CalloutProps = {
  variant: CalloutVariant;
  children: React.ReactNode;
  /** Overrides the variant's default ("Note" / "Careful"). */
  label?: string;
  className?: string;
};

export function Callout({ variant, children, label, className = "" }: CalloutProps) {
  const style = VARIANTS[variant];

  return (
    <div
      className={`flex gap-3 rounded-lg border border-outline border-l-3 ${style.border} ${style.bg} px-4 py-3 ${className}`}
    >
      <span className={`material-symbols-outlined !text-[18px] shrink-0 ${style.text}`}>
        {style.icon}
      </span>
      <div className="min-w-0 text-sm">
        <span className={`font-semibold ${style.text}`}>{label ?? style.label} </span>
        <span className="text-on-surface-variant">{children}</span>
      </div>
    </div>
  );
}
