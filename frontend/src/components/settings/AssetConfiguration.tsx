import { useEffect, useMemo, useState } from "react";
import { getAllAssetCategories } from "@/api/categories";
import {
  getRequestableCategoryIds,
  setRequestableCategoryIds,
} from "@/api/settings";
import RequestableCategoriesSelector from "@/components/settings/RequestableCategoriesSelector";
import StandardModelsSelector from "@/components/settings/StandardModelsSelector";
import type { AssetCategory } from "@/types/categoriesType";

/**
 * Owns the category state shared by RequestableCategoriesSelector and
 * StandardModelsSelector so that toggling a category's requestable flag is
 * immediately reflected in the standard-models UI (no refresh required).
 *
 * - `allCategories` + `allowed` live here.
 * - The requestable subset is derived client-side and passed down to
 *   StandardModelsSelector, replacing its previous independent fetch of
 *   the server-filtered category list.
 */
export default function AssetConfigurationSettings() {
  const [allCategories, setAllCategories] = useState<AssetCategory[]>([]);
  const [allowed, setAllowed] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [allCats, allowedIds] = await Promise.all([
          getAllAssetCategories(),
          getRequestableCategoryIds(),
        ]);
        if (cancelled) return;
        setAllCategories(allCats);
        setAllowed(new Set(allowedIds ?? allCats.map((c) => c.id)));
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load categories");
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
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }

    // Optimistic update — StandardModelsSelector reacts instantly via the
    // derived `requestableCategories` below.
    setAllowed(next);

    try {
      setSaving(true);
      setError(null);
      await setRequestableCategoryIds(Array.from(next));
    } catch (err: any) {
      // Roll back so the UI never disagrees with what's persisted.
      setAllowed(previous);
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
      <RequestableCategoriesSelector
        categories={allCategories}
        allowed={allowed}
        loading={loading}
        saving={saving}
        error={error}
        onToggle={toggleAllowed}
      />
      <StandardModelsSelector
        categories={requestableCategories}
        categoriesLoading={loading}
      />
    </div>
  );
}