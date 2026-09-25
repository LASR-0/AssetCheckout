import { useEffect, useState } from "react";
import ComboboxField from "@/components/ui/comboboxfield";
import { getAccessoryCategories } from "@/api/accessories";
import { getHotspotConfig, setHotspotConfig } from "@/api/settings";
import type { AccessoryCategory } from "@/types/accessoriesType";

///  +-----------------------------------------------------------------+
///  |                  HOTSPOT LOAN CONFIGURATION                     |
///  +-----------------------------------------------------------------+
//
//  Two settings, because a loan only needs two: where the pool is, and how
//  long somebody may book it for.
//
//  THERE IS NO STANDARD/OPTION LAYER here, unlike the accessory card above.
//  A hotspot request is for a hotspot — there is no variant of it that is for
//  something else — so the requester is never asked to choose a category or a
//  model, and IT picks the actual unit at assignment time from whatever is in
//  this category.
//
//  CLEARING THE CATEGORY TURNS LOANS OFF, and says so, rather than leaving
//  the form pointed at a category that no longer exists. The backend refuses
//  new requests with a 503 in that state.
//
//  Writes are optimistic with rollback, and adopt the config the PUT echoes
//  back — the same shape as StockKeepersSelector.
///  +-----------------------------------------------------------------+

const NONE_LABEL = "(hotspot loans disabled)";

export default function HotspotConfiguration() {
  const [categories, setCategories] = useState<AccessoryCategory[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [maxLoanDays, setMaxLoanDays] = useState(30);
  const [daysDraft, setDaysDraft] = useState("30");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [cats, config] = await Promise.all([
          getAccessoryCategories(),
          getHotspotConfig(),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setCategoryId(config.categoryId);
        setMaxLoanDays(config.maxLoanDays);
        setDaysDraft(String(config.maxLoanDays));
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load the hotspot settings");
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

  async function save(next: { categoryId?: number | null; maxLoanDays?: number }) {
    const previous = { categoryId, maxLoanDays };
    if (next.categoryId !== undefined) setCategoryId(next.categoryId);
    if (next.maxLoanDays !== undefined) setMaxLoanDays(next.maxLoanDays);

    try {
      setSaving(true);
      setError(null);
      const saved = await setHotspotConfig({
        categoryId: next.categoryId !== undefined ? next.categoryId : categoryId,
        maxLoanDays: next.maxLoanDays !== undefined ? next.maxLoanDays : maxLoanDays,
      });
      setCategoryId(saved.categoryId);
      setMaxLoanDays(saved.maxLoanDays);
      setDaysDraft(String(saved.maxLoanDays));
    } catch (err) {
      // Roll back to what the server last confirmed, so the card never shows
      // a value that was not saved.
      setCategoryId(previous.categoryId);
      setMaxLoanDays(previous.maxLoanDays);
      setDaysDraft(String(previous.maxLoanDays));
      setError("Couldn't save the hotspot settings");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  function commitDays() {
    const parsed = Number(daysDraft.trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setDaysDraft(String(maxLoanDays));
      return;
    }
    if (parsed === maxLoanDays) return;
    void save({ maxLoanDays: parsed });
  }

  const selectedName =
    categoryId === null
      ? NONE_LABEL
      : categories.find((c) => c.id === categoryId)?.name ?? NONE_LABEL;

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-2">
          Hotspot category
        </label>
        <ComboboxField
          items={categories.map((c) => c.name)}
          defaultValue={selectedName}
          // Combobox is uncontrolled, so this forces the remount that
          // re-applies defaultValue once the async load lands.
          keyHint={`hotspot-category-${categoryId ?? "none"}`}
          disabled={loading || saving}
          placeholder="Pick the accessory category"
          syntheticTop={{
            label: NONE_LABEL,
            onSelect: () => void save({ categoryId: null }),
          }}
          onSelect={(name) => {
            const match = categories.find((c) => c.name === name);
            void save({ categoryId: match?.id ?? null });
          }}
        />
        <p className="mt-2 text-xs text-info-light">
          The Snipe-IT accessory category the loanable hotspots live in. IT is
          offered the records in here and nothing else when assigning a loan.
          {categoryId === null && (
            <>
              {" "}
              <strong className="text-status-pending">
                Loans are currently disabled
              </strong>{" "}
              — new hotspot requests will be refused until a category is set.
            </>
          )}
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium tracking-wider uppercase text-on-surface-variant mb-2">
          Longest booking
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={daysDraft}
            disabled={loading || saving}
            onChange={(e) => setDaysDraft(e.target.value)}
            onBlur={commitDays}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-24 rounded-lg border border-outline bg-surface-container-low px-3 py-2 text-sm text-on-surface focus:border-primary focus:outline-none disabled:opacity-50"
          />
          <span className="text-sm text-info-light">days</span>
        </div>
        <p className="mt-2 text-xs text-info-light">
          A backstop against a mis-typed date turning into an indefinite
          checkout, not a policy — IT can still assign whatever was asked for.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-error bg-error-background rounded-lg p-3">
          <span className="material-symbols-outlined !text-[18px]">info</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
