import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import type { User } from "@/components/request-form/UserSelect";
import { PersonPicker } from "./PersonPicker";

export type ForMode = "me" | "other";

type Props = {
  mode: ForMode;
  onMode: (mode: ForMode) => void;
  me: User | null;
  users: User[];
  /** The person picked under "Someone else". */
  other: User | null;
  onOther: (user: User | null) => void;
  invalid?: boolean;
};

function Choice({
  on,
  icon,
  title,
  sub,
  onClick,
  invalid,
}: {
  on: boolean;
  icon: string;
  title: string;
  sub: string;
  onClick: () => void;
  invalid?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-14 cursor-pointer items-center gap-3 rounded-10 border px-3.5 py-2.5 text-left font-sans text-tx outline-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        on
          ? "border-brand bg-brand-sub shadow-[inset_0_0_0_1px_var(--brand)]"
          : invalid
            ? "border-stop-line bg-sheet hover:border-strong"
            : "border-line bg-sheet hover:border-strong"
      )}
    >
      <Icon name={icon} size={20} weight={300} fill={on} className={on ? "text-brand" : "text-tx3"} />
      <span className="flex min-w-0 flex-col gap-px">
        <span className="fs-13.5 font-medium">{title}</span>
        <span className="truncate fs-12 text-tx3">{sub}</span>
      </span>
    </button>
  );
}

/** "For me" or "Someone else", and the search for who. */
export function WhoFor({ mode, onMode, me, users, other, onOther, invalid }: Props) {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,12.5rem),1fr))] gap-2">
        <Choice on={mode === "me"} icon="person" title="For me" sub={me?.name ?? "You"} onClick={() => onMode("me")} invalid={invalid} />
        <Choice
          on={mode === "other"}
          icon="group"
          title="Someone else"
          sub="Search by name"
          onClick={() => onMode("other")}
          invalid={invalid}
        />
      </div>
      {mode === "other" && (
        <PersonPicker
          users={users}
          value={other}
          onChange={onOther}
          placeholder="Search Snipe-IT users"
          label="Who it's for"
          exclude={me ? (u) => u.id === me.id : undefined}
          invalid={invalid}
        />
      )}
    </>
  );
}
