import { useEffect, useRef, useState } from "react";
import { getAccessoryCategories } from "@/api/accessories";
import { iconForCategory } from "@/lib/categoryIcon";
import type { AccessoryCategory } from "@/types/accessoriesType";

///  +-----------------------------------------------------------------+
///  |                  ACCESSORY TYPE SELECTOR                        |
///  +-----------------------------------------------------------------+
//
//  Clone of AssetTypeSelector against the accessory categories endpoint.
//  Kept as its own component (rather than parameterising the asset one)
//  so the production asset form stays untouched. iconForCategory already
//  covers most accessory vocabulary (mouse, keyboard, headset, cable...).
///  +-----------------------------------------------------------------+

type Props = {
  value: number;
  onChange: (categoryId: number, categoryName: string) => void;
  // Optional preselect (from ?categoryId= links). Applied once after
  // categories load, only if the id actually exists, and never over a
  // selection the user has already made.
  preselectId?: number | null;
};

export default function AccessoryTypeSelector({ value, onChange, preselectId }: Props) {
  const [categories, setCategories] = useState<AccessoryCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const preselectAttempted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const data = await getAccessoryCategories();
        if (!cancelled) setCategories(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            "Looks like Snipe-IT is unreachable. If you believe this is a mistake, contact your administrator."
          );
          console.error("Failed to load accessory categories", err);
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

  // Apply the preselect through the normal onChange path so all
  // downstream category logic behaves exactly as if the tile was clicked.
  useEffect(() => {
    if (preselectAttempted.current) return;
    if (!preselectId || categories.length === 0) return;
    preselectAttempted.current = true; // one attempt only, match or not
    if (value) return; // user already picked something — don't override
    const match = categories.find((c) => c.id === preselectId);
    if (match) onChange(match.id, match.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, preselectId, value]);

  return (
    <section>
      <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-6">
        1. Accessory Selection
      </label>

      {loading && (
        <div className="flex items-center justify-center py-12 font-semibold text-info-light text-sm">
          <span className="animate-spin h-5 w-5 border-2 border-info-light border-t-transparent rounded-full mr-3" />
          Loading accessory types...
        </div>
      )}

      {error && (
        <div className="flex align-top gap-2 text-sm text-error bg-error-background rounded-xl p-3">
          <span className="material-symbols-outlined mb-5 !text-[18px]">error</span>
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && categories.length === 0 && (
        <div className="text-sm text-info-light italic py-6 text-center">
          No accessory categories found in Snipe-IT.
        </div>
      )}

      {!loading && !error && categories.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const isSelected = value === cat.id;
            const icon = iconForCategory(cat.name);

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onChange(cat.id, cat.name)}
                className={`
                  relative flex hover:cursor-pointer flex-col items-center justify-center p-6 rounded-lg border border-outline transition-all
                  ${isSelected
                    ? "border-purple-500 border-2 bg-surface-container-lowest"
                    : "border-outline-variant/20 hover:bg-surface-container hover:border-outline"}
                `}
              >
                <span className="material-symbols-outlined pb-5 text-3xl text-on-surface-variant">
                  {icon}
                </span>
                <span className="text-sm font-medium text-on-background text-center">
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}