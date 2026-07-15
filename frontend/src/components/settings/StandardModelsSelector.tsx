import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
 * Each category is its own collapsible section to keep the popover height
 * manageable when the org has many categories. Auto-saves on change.
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
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<StandardModelsConfig>({});
  const [modelsByCategory, setModelsByCategory] = useState<Record<number, CategoryModel[]>>({});
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
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

  function toggleExpanded(categoryId: number) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }

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

  // Count only categories that are currently requestable. Config entries for
  // disabled categories are retained in state but must not inflate the count
  // (previously produced "5 of 4 configured").
  const configuredCount = categories.filter(
    (c) => (config[String(c.id)]?.primary ?? null) !== null
  ).length;

  return (
    <div className="space-y-2 border-t border-outline/20 mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider px-3">
        Standard models
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-full gap-10 text-left px-3 py-2 text-sm rounded-md bg-surface text-info-light hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer flex items-center justify-between">
            <span>
              {loading
                ? "Loading..."
                : `${configuredCount} of ${categories.length} configured`}
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
              No requestable categories. Configure these first.
            </div>
          )}

          {!loading && categories.length > 0 && (
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {categories.map((cat) => {
                const isExpanded = expandedCategories.has(cat.id);
                const catConfig = config[String(cat.id)] ?? { primary: null, backup: null };
                const models = modelsByCategory[cat.id] ?? [];
                const icon = iconForCategory(cat.name);

                return (
                  <div key={cat.id} className="rounded-md overflow-hidden">
                    {/* Category header — clickable to expand/collapse */}
                    <button
                      onClick={() => toggleExpanded(cat.id)}
                      className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer text-info-light"
                    >
                      <span className="material-symbols-outlined !text-base text-info-light">
                        {icon}
                      </span>
                      <span className="flex-1 text-left">{cat.name}</span>
                      {catConfig.primary !== null && (
                        <span className="text-xs text-on-surface-variant">
                          {catConfig.backup !== null ? "P + B" : "P"}
                        </span>
                      )}
                      <span
                        className="material-symbols-outlined !text-base text-info-light transition-transform"
                        style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                      >
                        expand_more
                      </span>
                    </button>

                    {/* Expanded body — primary + backup pickers */}
                    {isExpanded && (
                      <div className="px-3 py-3 space-y-3 bg-surface-container/40 rounded-md">
                        {models.length === 0 ? (
                          <div className="text-xs text-info-light italic">
                            No models in this category.
                          </div>
                        ) : (
                          <>
                            <ModelSlot
                              label="Primary"
                              categoryId={cat.id}
                              field="primary"
                              value={catConfig.primary}
                              models={models}
                              excludeId={catConfig.backup}
                              disabled={saving}
                              onChange={(v) =>
                                updateCategoryStandard(cat.id, "primary", v)
                              }
                            />
                            <ModelSlot
                              label="Backup"
                              categoryId={cat.id}
                              field="backup"
                              value={catConfig.backup}
                              models={models}
                              excludeId={catConfig.primary}
                              disabled={saving}
                              onChange={(v) =>
                                updateCategoryStandard(cat.id, "backup", v)
                              }
                            />
                          </>
                        )}
                      </div>
                    )}
                  </div>
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
        size="compact"
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