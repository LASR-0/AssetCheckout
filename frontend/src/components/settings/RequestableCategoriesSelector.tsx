import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { iconForCategory } from "@/lib/categoryIcon";
import type { AssetCategory } from "@/types/categoriesType";

/**
 * Presentational checkbox list of asset categories. State (the full category
 * list, the allowed set, and persistence) is owned by
 * AssetConfigurationSettings so that changes here propagate immediately to
 * StandardModelsSelector without a page refresh.
 */

type Props = {
  categories: AssetCategory[];
  allowed: Set<number>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onToggle: (id: number) => void;
};

export default function RequestableCategoriesSelector({
  categories,
  allowed,
  loading,
  saving,
  error,
  onToggle,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2  mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider px-3">
        Requestable categories
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-full border rounded-md border-outline text-left px-3 py-2 text-sm rounded-md bg-surface text-info-light hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer flex items-center justify-between">
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
                      onChange={() => onToggle(cat.id)}
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