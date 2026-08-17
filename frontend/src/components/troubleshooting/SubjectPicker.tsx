import { iconForSubjectKey } from "@/lib/categoryIcon";
import type { SubjectPickerTile } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                      SUBJECT PICKER                             |
///  +-----------------------------------------------------------------+
//
//  What are you having trouble with? Applications first, then devices.
//
//  TWO SECTIONS, NOT ONE GRID. "My OneDrive won't sync" is not a question
//  about which laptop you have, and mixing OneDrive in among the hardware
//  tiles would ask people to answer a question they don't have. Applications
//  lead because they are the half of the support load nobody currently has
//  anywhere to look up.
//
//  Which entries appear is decided server-side (requestable Snipe categories,
//  unioned with the subjects we have articles for) — this only renders the
//  answer.
//
//  NOT built on the home page's TileBody. That component hardcodes
//  "Request →" as, in its own words, "the tile's purpose", carries the
//  holdings band, and its comments are largely about keeping its two callers
//  from drifting. A picker tile needs a selected state and no request
//  affordance, so reusing it would have meant parameterising away most of
//  what it is. The visual vocabulary is shared instead — same icon set, same
//  tokens.
///  +-----------------------------------------------------------------+

type Props = {
  subjects: SubjectPickerTile[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
};

function Tile({
  subject,
  selected,
  onSelect,
}: {
  subject: SubjectPickerTile;
  selected: boolean;
  onSelect: (key: string) => void;
}) {
  // Disabled means it earned a place — requestable, or an app we intend to
  // cover — but nothing is written yet. It stays on the grid rather than
  // being dropped, so the gap in the library is visible.
  const disabled = !subject.available;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(subject.key)}
      title={
        disabled
          ? `No troubleshooting steps for ${subject.label.toLowerCase()} yet`
          : `${subject.articleCount} of ${subject.symptomCount} symptoms covered`
      }
      className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
        disabled
          ? "border-outline/40 bg-surface-container-low/10 cursor-not-allowed opacity-55"
          : selected
          ? "border-primary bg-primary/10 cursor-pointer"
          // `surface-container-lowest`, not `surface`: it is pure white in the
          // light theme and the darkest value in the dark one, so the tile
          // reads as a raised card against the page in both rather than
          // dissolving into it — `--surface` and `--background` are the same
          // value, so a tile on `bg-surface` has no edge but its border.
          : "border-outline bg-surface-container-lowest hover:bg-surface-container-low/30 hover:cursor-pointer"
      }`}
    >
      <span
        className={`material-symbols-outlined !text-2xl ${
          selected && !disabled ? "text-primary" : "text-info-light"
        }`}
      >
        {iconForSubjectKey(subject.key)}
      </span>
      <span
        className={`text-sm font-semibold ${
          selected && !disabled ? "text-primary" : "text-on-background"
        }`}
      >
        {subject.label}
      </span>
      {/* Says why a tile can't be clicked, in words, on the tile — rather
          than leaving the greying out to be interpreted. */}
      {disabled && <span className="text-[11px] text-info-light">No steps yet</span>}
    </button>
  );
}

export default function SubjectPicker({ subjects, selectedKey, onSelect }: Props) {
  const apps = subjects.filter((s) => s.kind === "app");
  const devices = subjects.filter((s) => s.kind === "device");

  return (
    <div className="flex flex-col gap-5">
      {apps.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
            Apps &amp; accounts
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {apps.map((subject) => (
              <Tile
                key={subject.key}
                subject={subject}
                selected={subject.key === selectedKey}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {devices.length > 0 && (
        <div className="flex flex-col gap-2">
          {/* The heading only earns its place once there is something above
              it to distinguish from. */}
          {apps.length > 0 && (
            <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
              Devices
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {devices.map((subject) => (
              <Tile
                key={subject.key}
                subject={subject}
                selected={subject.key === selectedKey}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
