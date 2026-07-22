import { useEffect, useMemo, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ComboboxField from "@/components/ui/comboboxfield";
import {
  getAccessoriesByCategory,
  setStandardAccessoriesForCategory,
} from "@/api/accessories";
import {
  groupAccessoryProducts,
  findProductBySavedId,
  productPickerLabel,
} from "@/lib/accessoryProducts";
import { iconForCategory } from "@/lib/categoryIcon";
import type {
  AccessoryCategory,
  AccessoryOptionConfig,
  StandardAccessoriesConfig,
  AccessoryProductOption,
} from "@/types/accessoriesType";

/**
 * Per-category configuration of the named options a requester chooses from
 * ("USB-C to Lightning", "Case", ...), each resolving to a primary + optional
 * backup accessory. The accessory analogue of StandardModelsSelector, but a
 * category holds a LIST of options rather than a single primary/backup, so
 * each expanded category is an editable list of option rows.
 *
 * Save model (per the settings design):
 *   - Label edits stage locally and commit on an explicit "Save options"
 *     button, so typing a label doesn't spam the replace-semantics endpoint.
 *   - Primary/backup picks auto-save immediately — BUT only when the block
 *     is clean. If a block has unsaved label edits, pick auto-save is gated
 *     off until Save flushes everything together, so a pick can't silently
 *     commit half-typed labels.
 *   - Every write sends the whole options array (PUT replace semantics).
 *
 * The config is held in local state and updated optimistically; the PUT
 * echoes only { success }, so there's no returned config to adopt.
 */

const NONE_LABEL = "(none)";

type Props = {
  /** Requestable accessory categories only — derived and owned by the parent. */
  categories: AccessoryCategory[];
  /** True while the parent is still loading the category list. */
  categoriesLoading: boolean;
  /** The saved config, owned by the parent (loaded in its bundled GET). */
  config: StandardAccessoriesConfig;
  /** Parent setter so optimistic updates stay in one source of truth. */
  onConfigChange: (next: StandardAccessoriesConfig) => void;
};

export default function StandardAccessoriesSelector({
  categories,
  categoriesLoading,
  config,
  onConfigChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [productsByCategory, setProductsByCategory] = useState<
    Record<number, AccessoryProductOption[]>
  >({});
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(
    new Set()
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Staged label edits per category (categoryId → options with in-progress
  // labels). A category present here is "dirty" and gates its pick auto-save.
  const [staged, setStaged] = useState<
    Record<number, AccessoryOptionConfig[]>
  >({});

  const loading = categoriesLoading;

  // Lazily fetch + group the product catalog for any visible category we
  // haven't cached. Runs again when the category list changes so a newly
  // re-enabled category gets its products without a refresh.
  useEffect(() => {
    const missing = categories.filter((c) => !(c.id in productsByCategory));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const lists = await Promise.all(
          missing.map(async (c) => ({
            categoryId: c.id,
            products: groupAccessoryProducts(
              await getAccessoriesByCategory(c.id)
            ),
          }))
        );
        if (cancelled) return;
        setProductsByCategory((prev) => {
          const next = { ...prev };
          for (const entry of lists) next[entry.categoryId] = entry.products;
          return next;
        });
      } catch (err) {
        if (!cancelled) {
          setError("Failed to load accessories for one or more categories");
          console.error(err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categories, productsByCategory]);

  function toggleExpanded(categoryId: number) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  /** The working option list for a category: staged edits if dirty, else saved. */
  function optionsFor(categoryId: number): AccessoryOptionConfig[] {
    if (categoryId in staged) return staged[categoryId];
    return config[String(categoryId)]?.options ?? [];
  }

  const isDirty = (categoryId: number) => categoryId in staged;

  /** Stage a local edit (used by label typing + add/remove). */
  function stage(categoryId: number, options: AccessoryOptionConfig[]) {
    setStaged((prev) => ({ ...prev, [categoryId]: options }));
  }

  /** Persist a category's options; on success adopt into parent config + clear staged. */
  async function persist(
    categoryId: number,
    options: AccessoryOptionConfig[]
  ) {
    // Drop options with empty labels before saving — an unnamed option can't
    // be shown to requesters. (The backend also trims/dedupes defensively.)
    const cleaned = options
      .map((o) => ({ ...o, label: o.label.trim() }))
      .filter((o) => o.label.length > 0);

    const previousConfig = config;
    // Optimistic: reflect immediately.
    onConfigChange({
      ...config,
      [String(categoryId)]: { options: cleaned },
    });

    try {
      setSaving(true);
      setError(null);
      await setStandardAccessoriesForCategory(categoryId, cleaned);
      setStaged((prev) => {
        const next = { ...prev };
        delete next[categoryId];
        return next;
      });
    } catch (err: any) {
      onConfigChange(previousConfig); // roll back
      setError(err.message || "Failed to save options");
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  ///  ---- Row operations ----

  function addOption(categoryId: number) {
    const current = optionsFor(categoryId);
    stage(categoryId, [
      ...current,
      { label: "", primary: null, backup: null },
    ]);
  }

  function removeOption(categoryId: number, index: number) {
    const current = optionsFor(categoryId);
    const next = current.filter((_, i) => i !== index);
    // Removal is structural — persist immediately rather than staging, unless
    // there are pending label edits (then it folds into the staged set and
    // the explicit Save commits it with the labels).
    if (isDirty(categoryId)) {
      stage(categoryId, next);
    } else {
      persist(categoryId, next);
    }
  }

  function editLabel(categoryId: number, index: number, label: string) {
    const current = optionsFor(categoryId).map((o, i) =>
      i === index ? { ...o, label } : o
    );
    stage(categoryId, current); // staging marks the block dirty → gates picks
  }

  function pickStandard(
    categoryId: number,
    index: number,
    field: "primary" | "backup",
    value: number | null
  ) {
    const current = optionsFor(categoryId).map((o, i) =>
      i === index ? { ...o, [field]: value } : o
    );
    // Auto-save picks ONLY on a clean block. On a dirty block, stage the pick
    // and let the explicit Save flush picks + labels together.
    if (isDirty(categoryId)) {
      stage(categoryId, current);
    } else {
      persist(categoryId, current);
    }
  }

  function saveCategory(categoryId: number) {
    persist(categoryId, optionsFor(categoryId));
  }

  // Count categories with at least one configured (saved) option.
  const configuredCount = categories.filter(
    (c) => (config[String(c.id)]?.options?.length ?? 0) > 0
  ).length;

  return (
    <div className="space-y-2 mt-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider px-3">
        Standard accessories
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-full gap-10 border border-outline text-left px-3 py-2 text-sm rounded-md bg-surface text-info-light hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer flex items-center justify-between">
            <span>
              {loading
                ? "Loading..."
                : `${configuredCount} of ${categories.length} configured`}
            </span>
            <span className="material-symbols-outlined !text-base">tune</span>
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] bg-surface p-2"
          align="end"
        >
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
                const options = optionsFor(cat.id);
                const products = productsByCategory[cat.id] ?? [];
                const dirty = isDirty(cat.id);
                const icon = iconForCategory(cat.name);

                return (
                  <div key={cat.id} className="rounded-md overflow-hidden">
                    <button
                      onClick={() => toggleExpanded(cat.id)}
                      className="w-full flex items-center gap-3 px-2 py-2 text-sm rounded-md hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer text-info-light"
                    >
                      <span className="material-symbols-outlined !text-base text-info-light">
                        {icon}
                      </span>
                      <span className="flex-1 text-left">{cat.name}</span>
                      {options.length > 0 && (
                        <span className="text-xs text-on-surface-variant">
                          {options.length}{" "}
                          {options.length === 1 ? "option" : "options"}
                        </span>
                      )}
                      {dirty && (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-500">
                          Unsaved
                        </span>
                      )}
                      <span
                        className="material-symbols-outlined !text-base text-info-light transition-transform"
                        style={{
                          transform: isExpanded
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                        }}
                      >
                        expand_more
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="px-3 py-3 space-y-4 bg-surface-container/40 rounded-md">
                        {products.length === 0 ? (
                          <div className="text-xs text-info-light italic">
                            No accessories in this category to configure.
                          </div>
                        ) : (
                          <>
                            {options.length === 0 && (
                              <div className="text-xs text-info-light italic">
                                No options yet. Add one below — requesters pick
                                from these; "Something else" is always offered
                                automatically.
                              </div>
                            )}

                            {options.map((opt, index) => (
                              <OptionRow
                                key={index}
                                categoryId={cat.id}
                                index={index}
                                option={opt}
                                products={products}
                                disabled={saving}
                                onLabelChange={(v) =>
                                  editLabel(cat.id, index, v)
                                }
                                onPrimaryChange={(v) =>
                                  pickStandard(cat.id, index, "primary", v)
                                }
                                onBackupChange={(v) =>
                                  pickStandard(cat.id, index, "backup", v)
                                }
                                onRemove={() => removeOption(cat.id, index)}
                              />
                            ))}

                            <div className="flex items-center justify-between pt-1">
                              <button
                                onClick={() => addOption(cat.id)}
                                disabled={saving}
                                className="text-xs font-semibold text-info-light hover:text-modal-text-accent hover:cursor-pointer flex items-center gap-1 disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined !text-sm">
                                  add
                                </span>
                                Add option
                              </button>

                              {dirty && (
                                <button
                                  onClick={() => saveCategory(cat.id)}
                                  disabled={saving}
                                  className="px-4 py-1.5 rounded-md text-xs font-bold text-white twilight-gradient hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-50"
                                >
                                  Save options
                                </button>
                              )}
                            </div>
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

      {saving && <div className="text-xs text-info-light px-3">Saving...</div>}
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                        OPTION ROW                               |
///  +-----------------------------------------------------------------+
//
//  One named option: label text + primary picker + backup picker + remove.
//  Primary and backup exclude each other (a product can't be both slots of
//  the same option). Each picker resolves its saved id back to a product
//  group; an id no longer in the catalog renders as a missing-state entry
//  the admin can see and re-pick.
///  +-----------------------------------------------------------------+

function OptionRow({
  categoryId,
  index,
  option,
  products,
  disabled,
  onLabelChange,
  onPrimaryChange,
  onBackupChange,
  onRemove,
}: {
  categoryId: number;
  index: number;
  option: AccessoryOptionConfig;
  products: AccessoryProductOption[];
  disabled?: boolean;
  onLabelChange: (value: string) => void;
  onPrimaryChange: (value: number | null) => void;
  onBackupChange: (value: number | null) => void;
  onRemove: () => void;
}) {
  return (
    <div className="border border-outline/15 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={option.label}
          disabled={disabled}
          placeholder="Option label (e.g. USB-C to Lightning)"
          onChange={(e) => onLabelChange(e.target.value)}
          className="flex-1 bg-surface border border-outline/20 rounded-md px-2 py-1.5 text-sm text-on-surface-variant transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
        />
        <button
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove option"
          className="shrink-0 text-info-light hover:text-modal-error hover:cursor-pointer disabled:opacity-50"
        >
          <span className="material-symbols-outlined !text-base">delete</span>
        </button>
      </div>

      <ProductSlot
        label="Primary"
        keyId={`primary-${categoryId}-${index}`}
        value={option.primary}
        products={products}
        excludeId={option.backup}
        disabled={disabled}
        onChange={onPrimaryChange}
      />
      <ProductSlot
        label="Backup"
        keyId={`backup-${categoryId}-${index}`}
        value={option.backup}
        products={products}
        excludeId={option.primary}
        disabled={disabled}
        onChange={onBackupChange}
      />
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                       PRODUCT SLOT                              |
///  +-----------------------------------------------------------------+
//
//  A single Primary or Backup picker. Wraps ComboboxField over the
//  deduplicated product list (aggregate stock in the label), with the
//  "(none)" synthetic clear and cross-slot exclusion. A saved id that no
//  longer resolves to a product is surfaced as a "missing" synthetic entry
//  so the admin knows to re-pick rather than seeing a silent blank.
///  +-----------------------------------------------------------------+

function ProductSlot({
  label,
  keyId,
  value,
  products,
  excludeId,
  disabled,
  onChange,
}: {
  label: string;
  keyId: string;
  value: number | null;
  products: AccessoryProductOption[];
  excludeId: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  // Map picker labels back to a representative id on selection.
  const labelToId = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(productPickerLabel(p), p.representativeId);
    return m;
  }, [products]);

  const itemLabels = useMemo(
    () => products.map((p) => productPickerLabel(p)),
    [products]
  );

  // Resolve the saved value → display string. Three cases: none, resolved
  // product, or a saved id absent from the catalog (missing-state).
  const resolved = value !== null ? findProductBySavedId(products, value) : null;
  const missing = value !== null && resolved === null;
  const MISSING_LABEL = `⚠ Saved accessory #${value} no longer in catalog`;

  const initialName =
    value === null
      ? NONE_LABEL
      : resolved
      ? productPickerLabel(resolved)
      : MISSING_LABEL;

  // Exclude the sibling slot's chosen product (match by representative id).
  const excludeProduct =
    excludeId !== null ? findProductBySavedId(products, excludeId) : null;
  const excludeName = excludeProduct
    ? productPickerLabel(excludeProduct)
    : undefined;

  // When missing, inject the missing label as a disabled item so the combobox
  // can display it as the current value without offering it as a re-pick.
  const items = missing ? [MISSING_LABEL, ...itemLabels] : itemLabels;
  const disabledValues = new Set<string>();
  if (missing) disabledValues.add(MISSING_LABEL);
  if (excludeName) disabledValues.add(excludeName);

  return (
    <label className="block">
      <span className="block text-xs font-medium text-info-light mb-1">
        {label}
      </span>
      <ComboboxField
        size="compact"
        keyHint={`${keyId}-${value ?? "none"}`}
        items={items}
        defaultValue={initialName}
        placeholder="Select an accessory..."
        disabled={disabled}
        syntheticTop={{
          label: NONE_LABEL,
          onSelect: () => onChange(null),
        }}
        disabledValues={disabledValues.size ? disabledValues : undefined}
        onSelect={(name) => {
          const id = labelToId.get(name);
          onChange(id ?? null);
        }}
      />
      {missing && (
        <p className="text-[11px] text-amber-500 mt-1">
          The saved accessory was removed from Snipe. Pick a replacement.
        </p>
      )}
    </label>
  );
}