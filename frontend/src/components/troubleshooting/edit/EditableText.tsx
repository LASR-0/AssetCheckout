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
};

export default function EditableText({
  value,
  onChange,
  className = "",
  placeholder,
  ariaLabel,
  rows = 1,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Height follows content. Reset to auto first or it can only ever grow —
  // deleting a paragraph would leave the box the size it used to be.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={
        "w-full resize-none rounded-md border border-dashed border-primary/40 bg-primary/5 " +
        "px-2 py-1 outline-none transition-colors focus:border-primary focus:bg-primary/10 " +
        className
      }
    />
  );
}
