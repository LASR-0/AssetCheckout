import { useEffect, useMemo, useState } from "react";
import {
  getAllAccessoryCategories,
  getAccessorySettings,
  setRequestableAccessoryCategoryIds,
} from "@/api/accessories";
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
export default function AccessoryConfigurationSettings() {
  const [allCategories, setAllCategories] = useState<AccessoryCategory[]>([]);
  const [allowed, setAllowed] = useState<Set<number>>(new Set());
  const [standardConfig, setStandardConfig] =
    useState<StandardAccessoriesConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [allCats, settings] = await Promise.all([
          getAllAccessoryCategories(),
          getAccessorySettings(),
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

  return (
    <div className="space-y-6">
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
      />
    </div>
  );
}