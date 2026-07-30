import { useEffect, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getAllAssetCategories } from "@/api/categories";
import InfoHint from "@/components/ui/infohint";
import {
  getRequestableCategoryIds,
  getAccessoryAssetMap,
  setAccessoryCategoriesForAssetCategory,
} from "@/api/settings";
import {
  getAllAccessoryCategories,
  getAccessorySettings,
} from "@/api/accessories";
import { iconForCategory } from "@/lib/categoryIcon";
import type { AssetCategory } from "@/types/categoriesType";
import type {
  AccessoryCategory,
  AssetAccessoryCategoryMap,
} from "@/types/accessoriesType";

/**
 * L3 — Accessory availability by asset category. One row per requestable
 * ASSET category; each maps to zero or more requestable ACCESSORY categories
 * (removable chips + a popover-checkbox add). At request time the backend
 * unions these across the assets a user actually holds.
 *
 * Self-contained owner (needs BOTH domains' requestable sets). Rows come from
 * requestable asset categories, tag pool from requestable accessory
 * categories. Rows save one at a time — optimistic + rollback, adopting the
 * map the PUT echoes back.
 *
 * `refreshKey` is bumped by SettingsPage when Asset Configuration changes the
 * requestable-asset set, so rows re-derive without a manual page refresh.
 */
type Props = {
  refreshKey?: number;
};

export default function AccessoryAssetMap({ refreshKey = 0 }: Props) {
  const [allAssetCats, setAllAssetCats] = useState<AssetCategory[]>([]);
  const [reqAssetIds, setReqAssetIds] = useState<number[] | null>(null);
  const [accPool, setAccPool] = useState<AccessoryCategory[]>([]);
  const [allAccById, setAllAccById] = useState<Map<number, string>>(new Map());
  const [map, setMap] = useState<AssetAccessoryCategoryMap>({});
  const [loading, setLoading] = useState(true);
  const [savingRows, setSavingRows] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Initial bundled load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [allAssetCatsRes, reqAssetIdsRes, allAccCats, accSettings, initialMap] =
          await Promise.all([
            getAllAssetCategories(),
            getRequestableCategoryIds(),
            getAllAccessoryCategories(),
            getAccessorySettings(),
            getAccessoryAssetMap(),
          ]);
        if (cancelled) return;

        setAllAssetCats(allAssetCatsRes);
        setReqAssetIds(reqAssetIdsRes);

        // Tag pool: requestable accessory categories (null = all allowed).
        const reqAccIds = accSettings.requestableCategoryIds;
        const reqAccSet = reqAccIds ? new Set(reqAccIds) : null;
        setAccPool(
          reqAccSet ? allAccCats.filter((c) => reqAccSet.has(c.id)) : allAccCats
        );

        // Name resolver spans ALL accessory categories, so a mapped category
        // that's since been un-requestabled still renders (flagged).
        setAllAccById(new Map(allAccCats.map((c) => [c.id, c.name])));
        setMap(initialMap);
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load accessory availability");
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

  // Re-derive rows when the requestable-asset set changes in Asset Config.
  // Only that set can shift out from under us here, so refetch just it —
  // leaving map, pool, and any in-flight row save untouched.
  useEffect(() => {
    if (refreshKey === 0) return; // initial load already handled first paint
    let cancelled = false;
    (async () => {
      try {
        const ids = await getRequestableCategoryIds();
        if (!cancelled) setReqAssetIds(ids);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const assetRows = useMemo(() => {
    if (!reqAssetIds) return allAssetCats;
    const set = new Set(reqAssetIds);
    return allAssetCats.filter((c) => set.has(c.id));
  }, [allAssetCats, reqAssetIds]);

  const poolIds = useMemo(() => new Set(accPool.map((c) => c.id)), [accPool]);

  async function updateRow(assetCatId: number, nextIds: number[]) {
    const key = String(assetCatId);
    const previous = map;
    const optimistic: AssetAccessoryCategoryMap = { ...map };
    if (nextIds.length === 0) delete optimistic[key];
    else optimistic[key] = nextIds;
    setMap(optimistic);

    setSavingRows((s) => new Set(s).add(assetCatId));
    setError(null);
    try {
      const saved = await setAccessoryCategoriesForAssetCategory(
        assetCatId,
        nextIds
      );
      setMap(saved); // adopt authoritative
    } catch (err: any) {
      setMap(previous); // roll back
      setError(err.message || "Failed to save");
      console.error(err);
    } finally {
      setSavingRows((s) => {
        const n = new Set(s);
        n.delete(assetCatId);
        return n;
      });
    }
  }

  function toggleTag(assetCatId: number, accCatId: number) {
    const current = map[String(assetCatId)] ?? [];
    const next = current.includes(accCatId)
      ? current.filter((id) => id !== accCatId)
      : [...current, accCatId];
    updateRow(assetCatId, next);
  }

  const configuredCount = assetRows.filter(
    (c) => (map[String(c.id)]?.length ?? 0) > 0
  ).length;

  // Any visible row mapped to an accessory category that's no longer
  // requestable. Drives the explanation of the flagged chips, so it only
  // appears when there's actually one on screen to explain. Same test MapRow
  // uses per chip.
  const hasStaleMapping = useMemo(
    () =>
      assetRows.some((row) =>
        (map[String(row.id)] ?? []).some((accId) => !poolIds.has(accId))
      ),
    [assetRows, map, poolIds]
  );

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-error bg-error-background rounded-md p-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-info-light italic py-3">Loading...</div>
      ) : assetRows.length === 0 ? (
        <div className="text-sm text-info-light italic py-3">
          No requestable asset categories. Configure these under Asset
          Configuration first.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 text-xs text-info-light px-1">
            {configuredCount} of {assetRows.length} asset categories mapped
            {/* Two behaviours admins can't infer: an unmapped row blocks the
                accessory entirely, and un-requestabling doesn't destroy the
                mapping. Both cause "where did my configuration go?". */}
            <InfoHint side="right">
              A row with nothing mapped means holders of that asset category
              can request no accessories at all — this is what a user is
              allowed, so leaving it empty blocks rather than permits.
              Un-requestabling an asset category hides its row but keeps the
              mapping; making it requestable again brings the row back
              unchanged.
            </InfoHint>
          </div>

          {/* Explains the flagged chips before an admin meets one, since a
              greyed chip that only offers "remove" reads like an error. */}
          {hasStaleMapping && (
            <div className="rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-1.5 text-[11px] font-semibold text-status-pending leading-relaxed">
              Chips marked with a warning point at accessory categories that
              are no longer requestable, so they currently have no effect. They
              stay visible rather than vanishing silently — click one to remove
              it, or make the category requestable again under Accessory
              Configuration.
            </div>
          )}
          <div className="rounded-lg  divide-y divide-outline/15 overflow-hidden">
          <div className="space-y-2">
            {assetRows.map((row) => (
              <MapRow
                key={row.id}
                assetCategory={row}
                mappedIds={map[String(row.id)] ?? []}
                pool={accPool}
                poolIds={poolIds}
                nameById={allAccById}
                saving={savingRows.has(row.id)}
                onToggle={(accId) => toggleTag(row.id, accId)}
              />
            ))}
          </div>
          </div>
        </>
      )}
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                          MAP ROW                                |
///  +-----------------------------------------------------------------+

function MapRow({
  assetCategory,
  mappedIds,
  pool,
  poolIds,
  nameById,
  saving,
  onToggle,
}: {
  assetCategory: AssetCategory;
  mappedIds: number[];
  pool: AccessoryCategory[];
  poolIds: Set<number>;
  nameById: Map<number, string>;
  saving: boolean;
  onToggle: (accCatId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const mappedSet = new Set(mappedIds);

  return (
    <div className="rounded-lg border border-outline overflow-hidden">
      {/* Header — asset category name (left) + Add trigger (right) */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-surface/50 border-b border-outline/15">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined !text-base text-info-light">
            {iconForCategory(assetCategory.name)}
          </span>
          <span className="text-sm font-semibold text-info-light truncate">
            {assetCategory.name}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saving && (
            <span className="text-[11px] text-info-light/70">Saving…</span>
          )}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                disabled={saving}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs bg-status-success/10 border border-dashed border-status-success/50 border-outline/40 text-status-success hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined !text-[13px]">
                  add
                </span>
                Add
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 bg-surface p-2" align="end">
              {pool.length === 0 ? (
                <div className="text-sm text-info-light italic py-3 text-center">
                  No requestable accessory categories. Configure these under
                  Accessory Configuration first.
                </div>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {pool.map((acc) => (
                    <label
                      key={acc.id}
                      className="flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer text-info-light"
                    >
                      <input
                        type="checkbox"
                        checked={mappedSet.has(acc.id)}
                        onChange={() => onToggle(acc.id)}
                        disabled={saving}
                        className="w-4 h-4 hover:cursor-pointer rounded"
                      />
                      <span className="material-symbols-outlined !text-base text-info-light">
                        {iconForCategory(acc.name)}
                      </span>
                      <span className="flex-1">{acc.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Tags — click a tag to remove it */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-3">
        {mappedIds.length === 0 && (
          <span className="text-xs text-info-light/60 italic">
            No accessories — users with this asset request nothing extra
          </span>
        )}

        {mappedIds.map((accId) => {
          const stale = !poolIds.has(accId);
          return (
            <button
              key={accId}
              onClick={() => onToggle(accId)}
              disabled={saving}
              title={
                stale
                  ? "No longer a requestable accessory category — click to remove"
                  : "Click to remove"
              }
              className={`group inline-flex items-center gap-1 pl-2 pr-1.5 py-0.5 rounded-full text-xs border transition-colors hover:cursor-pointer disabled:opacity-50 ${
                stale
                  ? "border-amber-500/40 text-amber-500 bg-amber-500/5 hover:border-amber-500/70"
                  : "border-outline/20 text-info-light bg-surface hover:border-modal-error/50 hover:text-modal-error"
              }`}
            >
              {stale && (
                <span className="material-symbols-outlined !text-[13px]">
                  warning
                </span>
              )}
              <span>{nameById.get(accId) ?? `#${accId}`}</span>
              <span className="material-symbols-outlined !text-[13px] opacity-60 group-hover:opacity-100">
                close
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}