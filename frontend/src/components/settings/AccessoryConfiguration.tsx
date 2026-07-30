import { useEffect, useMemo, useState } from "react";
import {
  getAllAccessoryCategories,
  getAccessorySettings,
  setRequestableAccessoryCategoryIds,
} from "@/api/accessories";
import { getAccessoryAssetMap } from "@/api/settings";
import RequestableAccessoryCategoriesSelector from "@/components/settings/RequestableAccessoryCategoriesSelector";
import StandardAccessoriesSelector from "@/components/settings/StandardAccessoriesSelector";
import type {
  AccessoryCategory,
  StandardAccessoriesConfig,
} from "@/types/accessoriesType";

/**
 * Owns the state shared by the two accessory settings selectors — the full
 * category list, the requestable (allowed) set, and the standard-options
 * config — so toggling a category's requestable flag immediately reflects in
 * the options editor without a refresh. The accessory twin of
 * AssetConfigurationSettings.
 *
 * One bundled admin call (getAccessorySettings) loads both the whitelist and
 * the option config; the full category list is a second call. The whitelist
 * PUT and the option PUTs echo only { success }, so both selectors hold their
 * state here and update it optimistically.
 */
export default function AssetConfigurationSettings({
    onRequestableChange,
  }: {
    onRequestableChange?: () => void;
  } = {}) {
  const [allCategories, setAllCategories] = useState<AccessoryCategory[]>([]);
  const [allowed, setAllowed] = useState<Set<number>>(new Set());
  const [standardConfig, setStandardConfig] =
    useState<StandardAccessoriesConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The L3 map, read-only here. Owned and edited by AccessoryAssetMap; we hold
  // a copy purely to detect requestable categories that no asset category maps
  // to, which are invisible to every user. Fetch failure is non-fatal — the
  // diagnostic just stays quiet rather than blocking the editors.
  const [assetMap, setAssetMap] = useState<Record<string, number[]> | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [allCats, settings, mapResult] = await Promise.all([
          getAllAccessoryCategories(),
          getAccessorySettings(),
          getAccessoryAssetMap().catch(() => null),
        ]);
        if (cancelled) return;
        setAllCategories(allCats);
        // null whitelist = all categories allowed (mirrors the asset default).
        setAllowed(
          new Set(
            settings.requestableCategoryIds ?? allCats.map((c) => c.id)
          )
        );
        setStandardConfig(settings.standardAccessories);
        setAssetMap(mapResult);
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load accessory configuration");
          console.error(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAllowed = async (id: number) => {
    const previous = allowed;
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else next.add(id);

    setAllowed(next); // optimistic

    try {
      setSaving(true);
      setError(null);
      await setRequestableAccessoryCategoryIds(Array.from(next));
      onRequestableChange?.();
    } catch (err: any) {
      setAllowed(previous); // roll back
      setError(err.message || "Failed to save");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const requestableCategories = useMemo(
    () => allCategories.filter((c) => allowed.has(c.id)),
    [allCategories, allowed]
  );

  /**
   * The intersection diagnostic: requestable categories that no asset category
   * maps to. These are the trap case — configured here, saved successfully, and
   * requestable by nobody, because visibility comes from the asset map (L3) and
   * this layer only filters it.
   *
   * Computed rather than explained: the state is knowable, so say which
   * categories are affected right now instead of describing the failure mode
   * and leaving the admin to work out whether it applies to them.
   *
   * Null map (endpoint unreachable) yields no warning rather than a false one.
   */
  const unmappedRequestable = useMemo(() => {
    if (assetMap === null) return [];
    const mapped = new Set<number>();
    for (const ids of Object.values(assetMap)) {
      for (const id of ids) mapped.add(id);
    }
    return requestableCategories.filter((c) => !mapped.has(c.id));
  }, [assetMap, requestableCategories]);

  const unmappedIdSet = useMemo(
    () => new Set(unmappedRequestable.map((c) => c.id)),
    [unmappedRequestable]
  );

  return (
    <div className="space-y-6">
      {/* Only meaningful once the category list has loaded, and only when
          something is actually wrong. */}
      {!loading && unmappedRequestable.length > 0 && (
        <div className="rounded-lg border border-dashed border-status-pending bg-status-pending/10 p-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-status-pending">
            <span className="material-symbols-outlined !text-[16px]">
              report
            </span>
            {unmappedRequestable.length === 1
              ? "1 category can't be requested by anyone"
              : `${unmappedRequestable.length} categories can't be requested by anyone`}
          </p>
          <p className="text-xs text-info-light leading-relaxed">
            {unmappedRequestable.length === 1 ? "This is" : "These are"}{" "}
            requestable and{" "}
            {unmappedRequestable.length === 1 ? "may" : "may each"} have options
            configured, but no asset category maps to{" "}
            {unmappedRequestable.length === 1 ? "it" : "them"} under{" "}
            <span className="font-semibold text-on-surface-variant">
              Accessory Availability by Asset
            </span>
            , so nobody can see{" "}
            {unmappedRequestable.length === 1 ? "it" : "them"} in the request
            form. Map{" "}
            {unmappedRequestable.length === 1 ? "it" : "them"} to at least one
            asset category to make{" "}
            {unmappedRequestable.length === 1 ? "it" : "them"} available.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {unmappedRequestable.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center rounded-full border border-status-pending/40 bg-surface px-2 py-0.5 text-[11px] font-semibold text-on-surface-variant"
              >
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <RequestableAccessoryCategoriesSelector
        categories={allCategories}
        allowed={allowed}
        loading={loading}
        saving={saving}
        error={error}
        onToggle={toggleAllowed}
      />
      <StandardAccessoriesSelector
        categories={requestableCategories}
        categoriesLoading={loading}
        config={standardConfig}
        onConfigChange={setStandardConfig}
        unmappedIds={unmappedIdSet}
      />
    </div>
  );
}