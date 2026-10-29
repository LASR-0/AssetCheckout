import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Dot } from "@/components/ui/pills";
import { InputGroupAddon } from "@/components/ui/input-group";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { siteColoursQuery } from "@/api/queries";
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
///  +-----------------------------------------------------------------+

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid flex-none place-items-center rounded-full bg-track font-semibold text-tx2",
        size === "md" ? "size-7.5 fs-11" : "size-7 fs-10.5"
      )}
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
    >
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
      <ComboboxContent>
        <ComboboxEmpty>No one matches that.</ComboboxEmpty>
        <ComboboxList>
          {(u: User) => {
            const s = subOf(u);
            return (
              <ComboboxItem key={u.id} value={u} className="min-h-11.5 gap-2.5 py-1.5">
                <Avatar name={u.name} size="sm" />
                <span className="min-w-0 flex-1 truncate fs-13.5 font-medium">{u.name}</span>
                <span
                  className={cn(
                    "fs-12 whitespace-nowrap",
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
