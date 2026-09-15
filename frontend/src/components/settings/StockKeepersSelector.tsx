import { useEffect, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import InfoHint from "@/components/ui/infohint";
import UserSelect, { type User } from "@/components/request-form/UserSelect";
import { getLocations } from "@/api/snipe";
import { fetchUsers } from "@/api/users";
import { getStockKeepers, setStockKeepersForLocation } from "@/api/settings";
import type { SnipeNamedRecord } from "@/types/snipeTypes";
import type {
  StockKeeperEntry,
  StockKeepersConfig,
} from "@/types/settingsType";
import { DEFAULT_MAX_STOCK_KEEPERS } from "@/types/settingsType";

///  +-----------------------------------------------------------------+
///  |                   STOCK KEEPERS BY LOCATION                     |
///  +-----------------------------------------------------------------+
//
//  One row per Snipe location; each holds up to three people who can mark a
//  request at that site ready to collect. Rows save one at a time —
//  optimistic + rollback, adopting the config the PUT echoes back — which is
//  the same contract AccessoryAssetMap uses for its per-row edits.
//
//  THE CAP COMES FROM THE SERVER, not from a constant here. The backend
//  rejects an over-cap write regardless, so a hardcoded 3 in the UI could
//  only ever disagree with it; DEFAULT_MAX_STOCK_KEEPERS is the pre-load
//  placeholder, not the rule.
//
//  A LOCATION WITH NO KEEPERS IS NOT BROKEN — admins can act as stock keeper
//  anywhere, so an empty row means "IT handles this site" rather than "this
//  site's requests will strand". That is worth saying on screen, because the
//  empty state otherwise reads as an unfinished configuration.
///  +-----------------------------------------------------------------+

export default function StockKeepersSelector() {
  const [locations, setLocations] = useState<SnipeNamedRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [config, setConfig] = useState<StockKeepersConfig>({});
  const [maxPerLocation, setMaxPerLocation] = useState(DEFAULT_MAX_STOCK_KEEPERS);
  const [loading, setLoading] = useState(true);
  const [savingRows, setSavingRows] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [locationsRes, usersRes, keepersRes] = await Promise.all([
          getLocations(),
          fetchUsers(),
          getStockKeepers(),
        ]);
        if (cancelled) return;

        setLocations(locationsRes);
        setUsers(usersRes);
        setConfig(keepersRes.config);
        setMaxPerLocation(keepersRes.maxPerLocation);
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load stock keepers");
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateRow(
    locationId: number,
    next: StockKeeperEntry[],
    locationName: string | null
  ) {
    const key = String(locationId);
    const previous = config;

    const optimistic: StockKeepersConfig = { ...config };
    if (next.length === 0) delete optimistic[key];
    else optimistic[key] = { locationName, keepers: next };
    setConfig(optimistic);

    setSavingRows((s) => new Set(s).add(locationId));
    setError(null);
    try {
      const saved = await setStockKeepersForLocation(locationId, next, locationName);
      setConfig(saved.config); // adopt authoritative
      setMaxPerLocation(saved.maxPerLocation);
    } catch (err: any) {
      setConfig(previous); // roll back
      setError(err.message || "Failed to save");
      console.error(err);
    } finally {
      setSavingRows((s) => {
        const n = new Set(s);
        n.delete(locationId);
        return n;
      });
    }
  }

  function addKeeper(location: SnipeNamedRecord, user: User) {
    const locationId = location.id;
    const current = config[String(locationId)]?.keepers ?? [];
    // The User id is typed as a string but arrives from Snipe as a number;
    // coerced here so the comparison against StockKeeperEntry.userId (and the
    // backend's own numeric check) can't silently fail on "12" vs 12.
    const userId = Number(user.id);
    if (!Number.isFinite(userId)) return;
    if (current.some((k) => k.userId === userId)) return;
    if (current.length >= maxPerLocation) return;

    updateRow(
      locationId,
      [...current, { userId, name: user.name, email: user.email }],
      location.name
    );
  }

  function removeKeeper(location: SnipeNamedRecord, userId: number) {
    const current = config[String(location.id)]?.keepers ?? [];
    updateRow(
      location.id,
      current.filter((k) => k.userId !== userId),
      location.name
    );
  }

  const coveredCount = useMemo(
    () =>
      locations.filter((l) => (config[String(l.id)]?.keepers.length ?? 0) > 0)
        .length,
    [locations, config]
  );

  // Assignments pointing at locations Snipe no longer returns. Kept visible
  // rather than dropped, because the people in them still hold the role and
  // the only way to clear one is to see it.
  const orphanedKeys = useMemo(() => {
    const live = new Set(locations.map((l) => String(l.id)));
    return Object.keys(config).filter((k) => !live.has(k));
  }, [locations, config]);

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-error bg-error-background rounded-md p-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-info-light italic py-3">Loading...</div>
      ) : locations.length === 0 ? (
        <div className="text-sm text-info-light italic py-3">
          No locations found in Snipe-IT.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-xs text-info-light px-1">
            {coveredCount} of {locations.length} locations have a stock keeper
            <InfoHint side="right">
              A stock keeper marks hardware at their site ready to collect —
              whether it was already there or has just been shipped in. Up to{" "}
              {maxPerLocation} per location, so a site still has cover when the
              usual keeper is away. Leaving a location empty is safe: admins
              can act as stock keeper anywhere, so its requests fall to IT
              rather than stalling.
            </InfoHint>
          </div>

          <div className="space-y-2">
            {locations.map((location) => (
              <LocationRow
                key={location.id}
                location={location}
                keepers={config[String(location.id)]?.keepers ?? []}
                users={users}
                maxPerLocation={maxPerLocation}
                saving={savingRows.has(location.id)}
                onAdd={(user) => addKeeper(location, user)}
                onRemove={(userId) => removeKeeper(location, userId)}
              />
            ))}
          </div>

          {orphanedKeys.length > 0 && (
            <div className="rounded-lg border border-dashed border-status-pending bg-status-pending/10 p-3 space-y-1.5">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-status-pending">
                <span className="material-symbols-outlined !text-[16px]">
                  wrong_location
                </span>
                {orphanedKeys.length === 1
                  ? "1 assignment points at a location that no longer exists"
                  : `${orphanedKeys.length} assignments point at locations that no longer exist`}
              </p>
              <p className="text-xs text-info-light leading-relaxed">
                These locations aren't in Snipe-IT any more, so nothing can be
                requested against them and the people below have no site to
                keep. Clear them to tidy up.
              </p>
              <div className="space-y-1.5 pt-0.5">
                {orphanedKeys.map((key) => (
                  <div key={key} className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-on-surface-variant">
                      {config[key]?.locationName ?? `Location #${key}`}
                    </span>
                    {(config[key]?.keepers ?? []).map((k) => (
                      <span
                        key={k.userId}
                        className="inline-flex items-center rounded-full border border-status-pending/40 bg-surface px-2 py-0.5 text-[11px] text-on-surface-variant"
                      >
                        {k.name}
                      </span>
                    ))}
                    <button
                      onClick={() => updateRow(Number(key), [], null)}
                      disabled={savingRows.has(Number(key))}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] border border-outline/40 text-info-light hover:text-modal-error hover:border-modal-error/50 hover:cursor-pointer disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined !text-[13px]">
                        close
                      </span>
                      Clear
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                        LOCATION ROW                             |
///  +-----------------------------------------------------------------+

function LocationRow({
  location,
  keepers,
  users,
  maxPerLocation,
  saving,
  onAdd,
  onRemove,
}: {
  location: SnipeNamedRecord;
  keepers: StockKeeperEntry[];
  users: User[];
  maxPerLocation: number;
  saving: boolean;
  onAdd: (user: User) => void;
  onRemove: (userId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const atCap = keepers.length >= maxPerLocation;

  // Already-assigned people are removed from the picker rather than shown and
  // rejected — the add is a no-op for a duplicate, which would otherwise look
  // like the row silently failing to save.
  const assigned = useMemo(
    () => new Set(keepers.map((k) => k.userId)),
    [keepers]
  );
  const selectable = useMemo(
    () => users.filter((u) => !assigned.has(Number(u.id))),
    [users, assigned]
  );

  return (
    <div className="rounded-lg border border-outline overflow-hidden">
      {/* Header — location name (left) + Add trigger (right) */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface/50 border-b border-outline/15">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined !text-base text-info-light">
            warehouse
          </span>
          <span className="text-sm font-semibold text-info-light truncate">
            {location.name}
          </span>
          <span className="text-[11px] text-info-light/60 shrink-0">
            {keepers.length}/{maxPerLocation}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saving && (
            <span className="text-[11px] text-info-light/70">Saving…</span>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                disabled={saving || atCap}
                title={
                  atCap
                    ? `This location already has the maximum of ${maxPerLocation} stock keepers`
                    : undefined
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-status-success/10 border border-dashed border-status-success/50 border-outline/40 text-status-success hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined !text-[13px]">
                  add
                </span>
                Add
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 bg-surface p-2" align="end">
              <UserSelect
                users={selectable}
                value={null}
                onSelect={(user) => {
                  onAdd(user);
                  setOpen(false);
                }}
                placeholder="Search people..."
                disabled={saving}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Keepers — click one to remove it */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-3">
        {keepers.length === 0 && (
          <span className="text-xs text-info-light/60 italic">
            No stock keeper — IT covers collections at this site
          </span>
        )}

        {keepers.map((keeper) => (
          <button
            key={keeper.userId}
            onClick={() => onRemove(keeper.userId)}
            disabled={saving}
            title={
              keeper.email
                ? `${keeper.email} — click to remove`
                : "No email on record — click to remove"
            }
            className="group inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full text-xs border transition-colors hover:cursor-pointer disabled:opacity-50 border-outline/20 text-info-light bg-surface hover:border-modal-error/50 hover:text-modal-error"
          >
            {/* An email-less keeper can be assigned but can never be notified,
                so the gap is flagged where the assignment is made rather than
                discovered when a reminder silently goes nowhere. */}
            {!keeper.email && (
              <span
                className="material-symbols-outlined !text-[13px] text-amber-500"
                title="No email on record — this person can't be notified"
              >
                warning
              </span>
            )}
            <span>{keeper.name}</span>
            <span className="material-symbols-outlined !text-[13px] opacity-60 group-hover:opacity-100">
              close
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
