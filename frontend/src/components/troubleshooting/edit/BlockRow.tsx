import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

///  +-----------------------------------------------------------------+
///  |            ONE ROW OF THE GUTTER RAIL                            |
///  +-----------------------------------------------------------------+
//
//  A step is not a flat list of text boxes. It has a body, and it may carry a
//  note, a warning, a screenshot or a link somewhere else — and the OLD editor
//  rendered all five as the same white box in a stack, so nothing on screen
//  said which was which. An author had to remember that the third box was the
//  warning.
//
//  So each block gets a label in the gutter and a coloured spine down its left
//  edge, and the two agree. The colour is the only thing repeated between them,
//  which is what makes the type readable at a glance without reading a word.
//
//  THE GUTTER ALSO CARRIES THE HINT — "cost of getting it wrong", "aside, safe
//  to skip". Those are the distinction between a note and a warning, and the
//  distinction is the whole reason there are two: a warning that turns out to
//  be an aside makes every other warning worth less. Putting it beside the
//  field is where somebody reads it while choosing.
//
//  ACTIONS LIVE IN A MENU rather than a row of icon buttons. With four block
//  types each needing move, remove and sometimes more, the old inline buttons
//  came to nine targets per step competing with the text for attention.
///  +-----------------------------------------------------------------+

/** The four things a step can carry, and how each announces itself. */
export type BlockKind = "note" | "warn" | "figure" | "branch";

/**
 * Every class WRITTEN OUT IN FULL, never composed at runtime.
 *
 * Tailwind generates CSS by scanning source text for literal class names, so
 * `hover:${style.tint}` produces a class that exists in the DOM and nowhere in
 * the stylesheet — it renders as nothing, silently, and only in the built app.
 * The repetition below is the cost of that being impossible.
 */
type Style = {
  label: string;
  /** Material Symbols name. */
  icon: string;
  /** What it is FOR, in the gutter — the note/warning distinction lives here. */
  hint: string;
  /** Icon and type label. */
  accent: string;
  /** The spine down the left edge of the panel. */
  spine: string;
  /** The panel's own tint. */
  tint: string;
  /** The dashed Insert button, which is the same colour before the row exists. */
  insert: string;
};

export const BLOCK_STYLES: Record<BlockKind, Style> = {
  note: {
    label: "Note",
    icon: "info",
    hint: "Aside, safe to skip",
    accent: "text-block-note",
    spine: "border-l-block-note",
    tint: "bg-block-note/10",
    insert:
      "text-block-note border-block-note/40 hover:bg-block-note/10 hover:border-block-note",
  },
  warn: {
    label: "Warning",
    icon: "warning",
    hint: "Cost of getting it wrong",
    accent: "text-block-warn",
    spine: "border-l-block-warn",
    tint: "bg-block-warn/10",
    insert:
      "text-block-warn border-block-warn/40 hover:bg-block-warn/10 hover:border-block-warn",
  },
  figure: {
    label: "Figure",
    icon: "image",
    hint: "Screenshot and its menu path",
    accent: "text-block-figure",
    spine: "border-l-block-figure",
    tint: "bg-block-figure/10",
    insert:
      "text-block-figure border-block-figure/40 hover:bg-block-figure/10 hover:border-block-figure",
  },
  branch: {
    label: "Article link",
    icon: "subdirectory_arrow_right",
    hint: "Sends them elsewhere",
    accent: "text-block-link",
    spine: "border-l-block-link",
    tint: "bg-block-link/10",
    insert:
      "text-block-link border-block-link/40 hover:bg-block-link/10 hover:border-block-link",
  },
};

///  +-----------------------------------------------------------------+
//  SHADCN'S OWN TOKENS DO NOT EXIST IN THIS APP. `App.css` — where --popover,
//  --accent, --muted and the rest are defined — is never imported; only
//  index.css is. So `bg-popover` and `focus:bg-accent`, which is what the
//  stock dropdown uses for its panel and its highlighted row, generate NO CSS:
//  a transparent menu whose items do not respond to the pointer or the
//  keyboard at all.
//
//  These spell the same thing in the app's own tokens. Exported so the step
//  menu and the block menus cannot drift apart, and so there is one place to
//  delete from if the shadcn tokens are ever defined properly.
///  +-----------------------------------------------------------------+

export const MENU_PANEL =
  "bg-surface-container-lowest border border-outline text-on-surface shadow-lg";

/** `focus:` rather than `hover:` — Radix moves DOM focus with the pointer AND
 *  with the arrow keys, so styling focus covers both and keeps them identical.
 *  Styling hover alone would leave keyboard users with no highlight. */
export const MENU_ITEM =
  "focus:bg-surface-container-low focus:text-on-background data-[highlighted]:bg-surface-container-low";

export const MENU_ITEM_DANGER =
  "text-error focus:bg-error-background focus:text-error data-[highlighted]:bg-error-background";

type Props = {
  kind: BlockKind;
  children: ReactNode;
  onRemove: () => void;
  /** Omitted where the block cannot move — a step has one of each, so today
   *  only the step itself reorders. Kept in the API because the menu is the
   *  natural home for it if blocks ever become repeatable. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

export default function BlockRow({
  kind,
  children,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: Props) {
  const style = BLOCK_STYLES[kind];

  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 border-t border-outline/30 pt-3.5">
      <div className="flex flex-col items-start gap-1 pt-0.5">
        <span className={`material-symbols-outlined !text-[17px] ${style.accent}`}>
          {style.icon}
        </span>
        <span
          className={`text-[10px] font-bold uppercase tracking-[0.13em] ${style.accent}`}
        >
          {style.label}
        </span>
        <span className="text-[11px] leading-tight text-info-light">{style.hint}</span>
      </div>

      <div
        className={`flex min-w-0 flex-col gap-2 rounded-r-lg border-l-2 px-3.5 py-2.5 ${style.spine} ${style.tint}`}
      >
        <div className="flex justify-end -mb-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`${style.label} actions`}
              className="grid size-6 place-items-center rounded-md text-info-light transition-colors hover:bg-surface-container-low hover:text-on-background data-[state=open]:bg-surface-container-low data-[state=open]:text-on-background hover:cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">more_horiz</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={`w-44 ${MENU_PANEL}`}>
              {onMoveUp && (
                <DropdownMenuItem
                  disabled={!canMoveUp}
                  onSelect={onMoveUp}
                  className={MENU_ITEM}
                >
                  Move up
                </DropdownMenuItem>
              )}
              {onMoveDown && (
                <DropdownMenuItem
                  disabled={!canMoveDown}
                  onSelect={onMoveDown}
                  className={MENU_ITEM}
                >
                  Move down
                </DropdownMenuItem>
              )}
              {(onMoveUp || onMoveDown) && <DropdownMenuSeparator />}
              <DropdownMenuItem onSelect={onRemove} className={MENU_ITEM_DANGER}>
                Remove {style.label.toLowerCase()}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {children}
      </div>
    </div>
  );
}

/** The gutter label for a row that is not an optional block — the step's own
 *  title and body. Same column, same type scale, so the rail reads as one. */
export function RailLabel({ children }: { children: ReactNode }) {
  return (
    <div className="pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-info-light">
      {children}
    </div>
  );
}
