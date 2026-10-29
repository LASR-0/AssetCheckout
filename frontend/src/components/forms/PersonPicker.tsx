import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Dot } from "@/components/ui/pills";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { siteColoursQuery } from "@/api/queries";
import { scrollRoot } from "@/lib/scrollRoot";
import type { User } from "@/components/request-form/UserSelect";
import { initials } from "./helpers";

///  +-----------------------------------------------------------------+
///  |                       PICK A PERSON                             |
///  +-----------------------------------------------------------------+
//
//  A search over the Snipe-IT directory. Each result shows who it is and,
//  by default, their site, because two Sarahs are told apart by where they
//  work. The number-reuse picker shows each person's mobile instead.
//
//  Once someone is picked the search folds into a card with their name and
//  a "Change" button, so the choice reads as made rather than as a field
//  still waiting for input.
//
//  The results are anchored to the whole field, not the text box inside it,
//  so the list lines up with the field's edges rather than starting after
//  the search icon.
//
//  They always open BELOW the field, never flipped above it. A list that
//  jumps above the field when it sits low on the screen reads as a different
//  control. Opening, the picker scrolls the page until there is ROOM under
//  the field; the forms leave enough space at their foot for the last one
//  (FormLayout). Without the scroll, a field near the bottom of the window
//  would open as a one-row sliver (see ui/combobox).
///  +-----------------------------------------------------------------+

/** Space the results want under the field, in design px: about five people. */
const ROOM = 288;

/** Scrolls the page, if it needs to, so the results have ROOM below the field. */
function makeRoomBelow(field: HTMLElement | null) {
  const root = scrollRoot();
  if (!field || !root) return;
  const designPx = parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
  const short = ROOM * designPx - (root.getBoundingClientRect().bottom - field.getBoundingClientRect().bottom);
  if (short <= 0) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.scrollBy({ top: short, behavior: reduce ? "auto" : "smooth" });
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="grid size-7.5 flex-none place-items-center rounded-full bg-track fs-11 font-semibold text-tx2"
    >
      {initials(name)}
    </span>
  );
}

/** What shows beside a person: their site, or (for number reuse) their mobile. */
export type PersonSub = { text: string; mono?: boolean; muted?: boolean };

type Props = {
  users: User[];
  value: User | null;
  onChange: (user: User | null) => void;
  placeholder: string;
  /** Accessible name for the search. */
  label: string;
  /** Overrides the default sub-line (the person's site). */
  sub?: (user: User) => PersonSub;
  /** People who can't be picked here (e.g. the requestee as their own approver). */
  exclude?: (user: User) => boolean;
  invalid?: boolean;
};

export function PersonPicker({ users, value, onChange, placeholder, label, sub, exclude, invalid }: Props) {
  const { data: siteColours } = useQuery(siteColoursQuery);
  // Set by "Change", so the search it reveals is ready to type into.
  const [focusOnMount, setFocusOnMount] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);

  const siteOf = (u: User): PersonSub =>
    u.locationName ? { text: u.locationName } : { text: "No site recorded", muted: true };
  const subOf = sub ?? siteOf;
  const items = exclude ? users.filter((u) => !exclude(u)) : users;

  if (value) {
    const s = subOf(value);
    return (
      <div className="flex min-h-12 items-center gap-2.5 rounded-10 border border-line bg-subtle py-1.5 pr-1.5 pl-2.5">
        <Avatar name={value.name} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate fs-14 font-medium text-tx">{value.name}</span>
          {sub && (
            <span className={cn("fs-12", s.mono ? "font-mono text-tx3" : "text-mut", s.muted && "italic")}>{s.text}</span>
          )}
        </span>
        {!sub && value.locationName && (
          <span className="inline-flex h-5.5 flex-none items-center gap-1.25 rounded-pill border border-line bg-sheet px-2 fs-11.5 whitespace-nowrap text-tx2">
            <Dot colour={value.locationId != null ? siteColours?.[String(value.locationId)] ?? null : null} />
            {value.locationName}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setFocusOnMount(true);
            onChange(null);
          }}
          className="h-8.5 flex-none cursor-pointer rounded-8 px-2.5 font-sans fs-12 font-medium text-tx3 outline-none hover:bg-hover hover:text-tx focus-visible:outline-2 focus-visible:outline-brand"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <Combobox<User>
      items={items}
      value={null}
      onValueChange={(u) => u && onChange(u)}
      itemToStringLabel={(u) => u.name}
      itemToStringValue={(u) => u.id}
      autoHighlight
      onOpenChange={(open) => open && makeRoomBelow(fieldRef.current)}
    >
      <div ref={fieldRef}>
        <ComboboxInput
          size="lg"
          showTrigger={false}
          placeholder={placeholder}
          aria-label={label}
          aria-invalid={invalid || undefined}
          autoFocus={focusOnMount}
          className="w-full"
        >
          <InputGroupAddon align="inline-start">
            <Icon name="search" size={18} />
          </InputGroupAddon>
        </ComboboxInput>
      </div>
      {/* Bounded by the page's scroller, so the list stops at the footer. */}
      <ComboboxContent anchor={fieldRef} alwaysBelow collisionBoundary={scrollRoot() ?? undefined}>
        <ComboboxEmpty className="py-3.5 fs-13.5">No one matches that.</ComboboxEmpty>
        <ComboboxList className="max-h-[min(--spacing(80),calc(var(--available-height)-2px))] p-1.5">
          {(u: User) => {
            const s = subOf(u);
            return (
              <ComboboxItem key={u.id} value={u} className="min-h-13.5 gap-3 rounded-8 py-2 pl-3">
                <Avatar name={u.name} />
                <span className="min-w-0 flex-1 truncate fs-15 font-medium">{u.name}</span>
                <span
                  className={cn(
                    "fs-13 whitespace-nowrap",
                    s.mono ? "font-mono text-tx3" : s.muted ? "text-mut italic" : "text-tx3"
                  )}
                >
                  {s.text}
                </span>
              </ComboboxItem>
            );
          }}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
