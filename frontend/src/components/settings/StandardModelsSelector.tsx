import { useEffect, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import ComboboxField from "@/components/ui/comboboxfield";
import { getModelsForCategory } from "@/api/categories";
import {
  getStandardModels,
  setStandardModelsForCategory,
} from "@/api/settings";
import { iconForCategory } from "@/lib/categoryIcon";
import type { AssetCategory, CategoryModel } from "@/types/categoriesType";
import type { StandardModelsConfig } from "@/types/settingsType";

/**
 * Per-category configuration of which model is the standard issue for a given
 * category, with an optional backup. Used by the standard-request auto-checkout
 * flow to pick which model's assets to deploy.
 *
 * The requestable category list is passed in from AssetConfigurationSettings
 * (rather than fetched here) so that enabling/disabling a category in
 * RequestableCategoriesSelector is reflected immediately. Saved config for a
 * category that gets disabled is retained (so re-enabling restores it) but is
 * excluded from the "X of Y configured" count while hidden.
 *
 * LAYOUT — master/detail in the shared ResponsiveDialog, matching
 * StandardAccessoriesSelector:
 *   - Desktop = Dialog, fixed height, category rail + the ONE selected
 *     category's pickers, each column scrolling independently.
 *   - Mobile = Drawer. ResponsiveDialogContent already wraps drawer children in
 *     its own scroll container, so the mobile layout is a single flowing column
 *     with NO inner scrollers — rail until a category is picked, pickers (with
 *     a back row) after.
 *
 * Unlike the accessories editor there's no staging or explicit commit here: a
 * category is just a primary + an optional backup, so each pick auto-saves on
 * change exactly as it did before.
 */

const NONE_LABEL = "(none)";

type Props = {
  /** Requestable categories only — derived and owned by the parent. */
  categories: AssetCategory[];
  /** True while the parent is still loading the category list. */
  categoriesLoading: boolean;
};

export default function StandardModelsSelector({
  categories,
  categoriesLoading,
}: Props) {
  const isDesktop = useIsDesktop();

  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<StandardModelsConfig>({});
  const [modelsByCategory, setModelsByCategory] = useState<Record<number, CategoryModel[]>>({});
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loading = categoriesLoading || configLoading;

  // Load the saved standard-models config once on mount.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setConfigLoading(true);
        setError(null);
        const savedConfig = await getStandardModels();
        if (cancelled) return;
        setConfig(savedConfig);
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load standard model configuration");
          console.error(err);
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch model lists lazily for any visible category we haven't cached yet.
  // Runs again whenever the category list changes (e.g. a category is
  // re-enabled), so newly visible categories get their models without a
  // refresh. Cached entries are kept when a category is hidden.
  useEffect(() => {
    const missing = categories.filter((c) => !(c.id in modelsByCategory));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const modelLists = await Promise.all(
          missing.map(async (c) => ({
            categoryId: c.id,
            models: await getModelsForCategory(c.id),
          }))
        );
        if (cancelled) return;
        setModelsByCategory((prev) => {
          const next = { ...prev };
          for (const entry of modelLists) {
            next[entry.categoryId] = entry.models;
          }
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load models for one or more categories");
          console.error(err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categories, modelsByCategory]);

  async function updateCategoryStandard(
    categoryId: number,
    field: "primary" | "backup",
    value: number | null
  ) {
    const current = config[String(categoryId)] ?? { primary: null, backup: null };
    const updated = { ...current, [field]: value };

    setConfig((prev) => ({ ...prev, [String(categoryId)]: updated }));

    try {
      setSaving(true);
      setError(null);
      const newConfig = await setStandardModelsForCategory(
        categoryId,
        updated.primary,
        updated.backup
      );
      setConfig(newConfig);
    } catch (err: any) {
      setConfig((prev) => ({ ...prev, [String(categoryId)]: current }));
      setError(err.message || "Failed to save");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // Resolve the selection against the live list: a category that stops being
  // requestable while selected falls back to the rail rather than an orphan pane.
  const selectedCategory =
    selectedCategoryId === null
      ? null
      : categories.find((c) => c.id === selectedCategoryId) ?? null;

  // Count only categories that are currently requestable. Config entries for
  // disabled categories are retained in state but must not inflate the count
  // (previously produced "5 of 4 configured").
  const configuredCount = categories.filter(
    (c) => (config[String(c.id)]?.primary ?? null) !== null
  ).length;

  const rail = (
    <CategoryRail
      categories={categories}
      selectedId={selectedCategory?.id ?? null}
      isDesktop={isDesktop}
      configFor={(id) => config[String(id)] ?? { primary: null, backup: null }}
      onSelect={setSelectedCategoryId}
    />
  );

  const pane =
    selectedCategory === null ? null : (
      <CategoryPane
        category={selectedCategory}
        catConfig={
          config[String(selectedCategory.id)] ?? { primary: null, backup: null }
        }
        models={modelsByCategory[selectedCategory.id] ?? []}
        saving={saving}
        // Desktop owns its scrolling; the drawer's wrapper owns it on mobile.
        scrollable={isDesktop}
        showBack={!isDesktop}
        onBack={() => setSelectedCategoryId(null)}
        onChange={(field, value) =>
          updateCategoryStandard(selectedCategory.id, field, value)
        }
      />
    );

  return (
    <div className="space-y-2 mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider px-3">
        Standard models
      </div>

      <button
        onClick={() => setOpen(true)}
        className="w-full gap-10 border border-outline text-left px-3 py-2 text-sm rounded-md bg-surface text-info-light hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer flex items-center justify-between"
      >
        <span>
          {loading
            ? "Loading..."
            : `${configuredCount} of ${categories.length} configured`}
        </span>
        <span className="material-symbols-outlined !text-base">tune</span>
      </button>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent
          className={
            isDesktop
              ? // [&>button]:hidden drops DialogContent's built-in close X in
                // favour of the labelled control in the header, so this reads
                // the same as the accessories dialog.
                "flex flex-col p-0 gap-0 bg-surface !max-w-none w-[min(1280px,calc(100vw-4rem))] h-[min(640px,calc(100vh-8rem))] [&>button]:hidden"
              : "bg-surface max-h-[85vh]"
          }
        >
          <ResponsiveDialogHeader
            className={
              isDesktop
                ? "shrink-0 px-4 py-3 border-b border-outline text-left"
                : "px-4 pt-4 pb-2 text-left"
            }
          >
            <div className="flex items-center gap-3">
              <ResponsiveDialogTitle className="flex-1 text-sm font-semibold text-on-surface-variant">
                Standard models
              </ResponsiveDialogTitle>

              {saving && (
                <span className="shrink-0 text-xs text-info-light">
                  Saving...
                </span>
              )}

              <button
                onClick={() => setOpen(false)}
                className="shrink-0 flex items-center gap-1 text-xs font-semibold text-info-light hover:text-modal-error hover:cursor-pointer"
              >
                <span className="material-symbols-outlined !text-base">
                  close
                </span>
                Close
              </button>
            </div>
          </ResponsiveDialogHeader>

          {error && (
            <div className="shrink-0 text-xs text-error bg-error-background px-4 py-2">
              {error}
            </div>
          )}

          {loading && (
            <div className="px-4 py-10 text-center text-sm text-info-light italic">
              Loading...
            </div>
          )}

          {!loading && categories.length === 0 && (
            <div className="px-6 py-10 text-center text-sm text-info-light italic">
              No requestable categories. Configure these first.
            </div>
          )}

          {!loading &&
            categories.length > 0 &&
            (isDesktop ? (
              <div className="flex-1 min-h-0 grid grid-cols-[220px_minmax(0,1fr)]">
                {rail}
                <div className="flex min-h-0 flex-col">
                  {pane ?? (
                    <div className="flex-1 grid place-items-center px-6 text-center text-sm text-info-light italic">
                      Select a category to set its standard model.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Drawer: one pane at a time, natural height, no inner scrollers.
              <div>{pane ?? rail}</div>
            ))}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                       CATEGORY RAIL                             |
///  +-----------------------------------------------------------------+
//
//  The master half. A column on desktop (its own scroller, tinted a step
//  darker than the detail side so the two halves read as separate surfaces);
//  the drawer's first screen on mobile, where each row gets a chevron because
//  tapping navigates rather than selects in place.
//
//  The P / P + B badge is carried over from the old accordion header.
///  +-----------------------------------------------------------------+

function CategoryRail({
  categories,
  selectedId,
  isDesktop,
  configFor,
  onSelect,
}: {
  categories: AssetCategory[];
  selectedId: number | null;
  isDesktop: boolean;
  configFor: (categoryId: number) => { primary: number | null; backup: number | null };
  onSelect: (categoryId: number) => void;
}) {
  return (
    <div
      className={
        isDesktop
          ? "min-h-0 overflow-y-auto overscroll-contain border-r border-outline p-2 bg-surface-container-low/30"
          : "px-2 py-1 bg-surface-container-low/30"
      }
    >
      {categories.map((cat) => {
        const catConfig = configFor(cat.id);
        const active = isDesktop && selectedId === cat.id;

        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`w-full flex items-center gap-2 px-2 py-2 text-sm rounded-md hover:cursor-pointer text-left ${
              active
                ? "bg-surface text-on-surface-variant"
                : "text-info-light hover:brightness-95 dark:hover:brightness-150"
            }`}
          >
            <span className="material-symbols-outlined !text-base shrink-0">
              {iconForCategory(cat.name)}
            </span>
            <span className="flex-1 truncate">{cat.name}</span>
            {catConfig.primary !== null && (
              <span className="shrink-0 text-xs text-on-surface-variant">
                {catConfig.backup !== null ? "P + B" : "P"}
              </span>
            )}
            {!isDesktop && (
              <span className="material-symbols-outlined !text-base shrink-0 text-info-light">
                chevron_right
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                       CATEGORY PANE                             |
///  +-----------------------------------------------------------------+
//
//  The detail half: a header (back on mobile, category name) over the primary
//  and backup pickers. Purely presentational — the write happens in the
//  parent's auto-save. `scrollable` decides whether the body owns a scroll
//  region (desktop) or flows into the drawer's own scroller (mobile).
///  +-----------------------------------------------------------------+

function CategoryPane({
  category,
  catConfig,
  models,
  saving,
  scrollable,
  showBack,
  onBack,
  onChange,
}: {
  category: AssetCategory;
  catConfig: { primary: number | null; backup: number | null };
  models: CategoryModel[];
  saving: boolean;
  scrollable: boolean;
  showBack: boolean;
  onBack: () => void;
  onChange: (field: "primary" | "backup", value: number | null) => void;
}) {
  return (
    <>
      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-outline bg-surface-container-low/30">
        {showBack && (
          <button
            onClick={onBack}
            aria-label="Back to categories"
            className="shrink-0 text-info-light hover:cursor-pointer"
          >
            <span className="material-symbols-outlined !text-base">
              arrow_back
            </span>
          </button>
        )}

        <span className="material-symbols-outlined !text-base text-info-light shrink-0">
          {iconForCategory(category.name)}
        </span>
        <span className="flex-1 truncate text-sm text-on-surface-variant">
          {category.name}
        </span>
      </div>

      <div
        className={`px-3 py-3 ${
          scrollable ? "flex-1 min-h-0 overflow-y-auto overscroll-contain" : ""
        }`}
      >
        {models.length === 0 ? (
          <div className="text-xs text-info-light italic">
            No models in this category.
          </div>
        ) : (
          <div
            className={`grid gap-3 ${scrollable ? "grid-cols-2" : "grid-cols-1"}`}
          >
            <ModelSlot
              label="Primary"
              categoryId={category.id}
              field="primary"
              value={catConfig.primary}
              models={models}
              excludeId={catConfig.backup}
              disabled={saving}
              onChange={(v) => onChange("primary", v)}
            />
            <ModelSlot
              label="Backup"
              categoryId={category.id}
              field="backup"
              value={catConfig.backup}
              models={models}
              excludeId={catConfig.primary}
              disabled={saving}
              onChange={(v) => onChange("backup", v)}
            />
          </div>
        )}
      </div>
    </>
  );
}

///  +-----------------------------------------------------------------+
///  |                       MODEL SLOT                                |
///  +-----------------------------------------------------------------+
//
//  One Primary or Backup picker for a single category. Thin wrapper
//  around ComboboxField that knows about the synthetic "(none)" entry
//  and the cross-slot exclusion (Primary can't equal Backup).
///  +-----------------------------------------------------------------+

function ModelSlot({
  label,
  categoryId,
  field,
  value,
  models,
  excludeId,
  disabled,
  onChange,
}: {
  label: string;
  categoryId: number;
  field: "primary" | "backup";
  value: number | null;
  models: CategoryModel[];
  excludeId: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  const initialName =
    value !== null
      ? models.find((m) => m.id === value)?.name ?? ""
      : NONE_LABEL;

  const excludeName =
    excludeId !== null
      ? models.find((m) => m.id === excludeId)?.name
      : undefined;

  return (
    <label className="block">
      <span className="block text-xs font-medium text-info-light mb-1">{label}</span>
      <ComboboxField
        size="normal"
        keyHint={`${field}-${categoryId}-${value ?? "none"}`}
        items={models.map((m) => m.name)}
        defaultValue={initialName}
        placeholder="Select a model..."
        disabled={disabled}
        syntheticTop={{
          label: NONE_LABEL,
          onSelect: () => onChange(null),
        }}
        disabledValues={excludeName ? new Set([excludeName]) : undefined}
        onSelect={(name) => {
          const model = models.find((m) => m.name === name);
          onChange(model?.id ?? null);
        }}
      />
    </label>
  );
}