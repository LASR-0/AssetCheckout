import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getAllAssetCategories,
} from "@/api/categories";
import {
  getRequestableCategoryIds,
  setRequestableCategoryIds,
} from "@/api/settings";
import { iconForCategory } from "@/lib/categoryIcon";
import type { AssetCategory } from "@/types/categoriesType";

export default function RequestableCategoriesSelector() {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
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
        setCategories(allCats);
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

  const toggle = async (id: number) => {
    const next = new Set(allowed);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setAllowed(next);

    try {
      setSaving(true);
      setError(null);
      await setRequestableCategoryIds(Array.from(next));
    } catch (err: any) {
      setError(err.message || "Failed to save");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2 border-t border-outline/20 mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider px-3">
        Requestable categories
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-full text-left px-3 py-2 text-sm rounded-md bg-surface text-info-light hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer flex items-center justify-between">
            <span>
              {loading
                ? "Loading..."
                : `${allowed.size} of ${categories.length} allowed`}
            </span>
            <span className="material-symbols-outlined !text-base">tune</span>
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-[var(--radix-popover-trigger-width)] bg-surface p-2" align="end">
          {loading && (
            <div className="text-sm text-info-light italic py-3 text-center">
              Loading...
            </div>
          )}

          {error && (
            <div className="text-xs text-error bg-error-background rounded-md p-2 mb-2">
              {error}
            </div>
          )}

          {!loading && categories.length === 0 && (
            <div className="text-sm text-info-light italic py-3 text-center">
              No categories found
            </div>
          )}

          {!loading && categories.length > 0 && (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {categories.map((cat) => {
                const isAllowed = allowed.has(cat.id);
                return (
                  <label
                    key={cat.id}
                    className="flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer text-info-light"
                  >
                    <input
                      type="checkbox"
                      checked={isAllowed}
                      onChange={() => toggle(cat.id)}
                      disabled={saving}
                      className="w-4 h-4 hover:cursor-pointer rounded"
                    />
                    <span className="material-symbols-outlined !text-base text-info-light">
                      {iconForCategory(cat.name)}
                    </span>
                    <span className="flex-1">{cat.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {saving && (
        <div className="text-xs text-info-light px-3">Saving...</div>
      )}
    </div>
  );
}