import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useIsDesktop } from "@/hooks/useIsDesktop";
import ComboboxField from "@/components/ui/comboboxfield";
import InfoHint from "@/components/ui/infohint";
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
 * category holds a LIST of options rather than a single primary/backup.
 *
 * Each option also carries two OPTIONAL request-table labels — displayLabel
 * (shown in place of the raw option name) and accessoryLabel (the correlating
 * accessory, e.g. "iPad A16"). Both are free text, admin-only, and never seen
 * by requesters; they only affect how the row reads in the request log. Blank
 * falls back (displayLabel → the option label; accessoryLabel → the primary's
 * Snipe name).
 *
 * LAYOUT — master/detail in the shared ResponsiveDialog:
 *   - Desktop = Dialog, fixed height, two columns: category rail + the ONE
 *     selected category's editor, each scrolling independently.
 *   - Mobile = Drawer. ResponsiveDialogContent already wraps drawer children in
 *     its own scroll container, so the mobile layout is a single flowing column
 *     with NO inner scrollers — rail until a category is picked, editor (with a
 *     back row) after.
 *   - Option rows are collapsed to a summary line; one expands at a time.
 *
 * SAVE MODEL — nothing is written until "Save changes":
 *   - EVERY mutation stages, including picks and deletes. An option removed
 *     here is gone from the UI but still in Snipe until the flush.
 *   - Save flushes all dirty categories in parallel and adopts the successful
 *     ones into the parent config in ONE update. Failures keep their staged
 *     edits and are named in the error.
 *   - Discard (the header control) throws away every staged edit. Dismissing
 *     with Esc or an outside click only closes — the staging survives, so a
 *     misclick costs nothing. That asymmetry is deliberate: destructive intent
 *     needs a deliberate target.
 *
 * Dirtiness is by CONTENT, not by presence of a staged entry: staging an edit
 * that lands back on the saved value drops the staged entry, so the category
 * goes clean again and its unsaved marker disappears. Specifically it is the
 * content that would be SENT (post-cleanOptions), so a row that carries nothing
 * yet — no label — is not a pending change and does not arm Save.
 */

const NONE_LABEL = "(none)";

/** Stable empty set so an omitted `unmappedIds` doesn't remount the rail. */
const EMPTY_ID_SET: Set<number> = new Set();

/**
 * Compare two option lists for equality.
 *
 * Deliberately compares the RAW text (only treating null/undefined and "" as
 * the same, since both render as an empty input) rather than trimmed text: a
 * trimming comparison would call "Case " equal to "Case" and prune the staged
 * entry mid-keystroke, snapping the user's trailing space out of the input.
 */
function sameText(a?: string | null, b?: string | null) {
  return (a ?? "") === (b ?? "");
}

function optionsEqual(
  a: AccessoryOptionConfig[],
  b: AccessoryOptionConfig[]
): boolean {
  if (a.length !== b.length) return false;
  return a.every((opt, i) => {
    const saved = b[i];
    return (
      sameText(opt.label, saved.label) &&
      sameText(opt.displayLabel, saved.displayLabel) &&
      sameText(opt.accessoryLabel, saved.accessoryLabel) &&
      (opt.primary ?? null) === (saved.primary ?? null) &&
      (opt.backup ?? null) === (saved.backup ?? null)
    );
  });
}

/**
 * Normalise a working list into what actually gets sent. Options with empty
 * labels are dropped — an unnamed option can't be shown to requesters — and
 * blank display/accessory labels become null (the backend also cleans
 * defensively).
 */
function cleanOptions(options: AccessoryOptionConfig[]): AccessoryOptionConfig[] {
  return options
    .map((o) => ({
      ...o,
      label: o.label.trim(),
      displayLabel: o.displayLabel?.trim() ? o.displayLabel.trim() : null,
      accessoryLabel: o.accessoryLabel?.trim() ? o.accessoryLabel.trim() : null,
    }))
    .filter((o) => o.label.length > 0);
}

/** "Cables", "Cables and Docks", "Cables, Docks and Mouses" */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

type Props = {
  /** Requestable accessory categories only — derived and owned by the parent. */
  categories: AccessoryCategory[];
  /** True while the parent is still loading the category list. */
  categoriesLoading: boolean;
  /** The saved config, owned by the parent (loaded in its bundled GET). */
  config: StandardAccessoriesConfig;
  /** Parent setter so optimistic updates stay in one source of truth. */
  onConfigChange: (next: StandardAccessoriesConfig) => void;
  /**
   * Requestable categories that no asset category maps to (L3), so no user can
   * request them yet. Flagged in the rail. Owned by the parent, which is the
   * only place that holds both the requestable set and the asset map.
   */
  unmappedIds?: Set<number>;
};

export default function StandardAccessoriesSelector({
  categories,
  categoriesLoading,
  config,
  onConfigChange,
  unmappedIds,
}: Props) {
  const isDesktop = useIsDesktop();

  const [open, setOpen] = useState(false);
  const [productsByCategory, setProductsByCategory] = useState<
    Record<number, AccessoryProductOption[]>
  >({});
  // Master/detail selection. null = show the rail (and, on desktop, an empty
  // detail pane). Survives close/reopen along with `staged`.
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Categories whose product fetch rejected. Held so a persistent failure is
  // excluded from `missing` below — otherwise the effect would re-run on every
  // productsByCategory change and retry it forever. Cleared when the dialog is
  // opened, which makes reopening a retry rather than needing a page reload.
  const [failedProductLoads, setFailedProductLoads] = useState<Set<number>>(
    () => new Set()
  );

  // Working copies per category (categoryId → options with in-progress edits).
  // An entry only exists while it DIFFERS from the saved config — stage() drops
  // it the moment the two match again. Held here rather than inside the dialog,
  // so dismissing and reopening loses nothing.
  const [staged, setStaged] = useState<
    Record<number, AccessoryOptionConfig[]>
  >({});

  const loading = categoriesLoading;

  // Lazily fetch + group the product catalog for any visible category we
  // haven't cached. Runs again when the category list changes so a newly
  // re-enabled category gets its products without a refresh.
  //
  // Settled per category, not all-or-nothing: this used to be Promise.all, so
  // a single failing category discarded the whole batch and left EVERY picker
  // empty — with no recovery, since a rejected fetch leaves the deps unchanged
  // and the effect never re-runs. Now the ones that load are kept and only the
  // failures are named.
  useEffect(() => {
    const missing = categories.filter(
      (c) => !(c.id in productsByCategory) && !failedProductLoads.has(c.id)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.allSettled(
        missing.map(async (c) => ({
          categoryId: c.id,
          products: groupAccessoryProducts(await getAccessoriesByCategory(c.id)),
        }))
      );
      if (cancelled) return;

      const loaded = results.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : []
      );
      const failed = missing.filter((_, i) => results[i].status === "rejected");

      if (loaded.length > 0) {
        setProductsByCategory((prev) => {
          const next = { ...prev };
          for (const entry of loaded) next[entry.categoryId] = entry.products;
          return next;
        });
      }

      if (failed.length > 0) {
        results.forEach((r) => {
          if (r.status === "rejected") console.error(r.reason);
        });
        setFailedProductLoads((prev) => {
          const next = new Set(prev);
          for (const c of failed) next.add(c.id);
          return next;
        });
        setError(
          `Couldn't load accessories for ${joinNames(
            failed.map((c) => c.name)
          )}. Close and reopen to retry.`
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [categories, productsByCategory, failedProductLoads]);

  /** The last-saved option list for a category. */
  function savedOptionsFor(categoryId: number): AccessoryOptionConfig[] {
    return config[String(categoryId)]?.options ?? [];
  }

  /** The working option list for a category: staged edits if dirty, else saved. */
  function optionsFor(categoryId: number): AccessoryOptionConfig[] {
    if (categoryId in staged) return staged[categoryId];
    return savedOptionsFor(categoryId);
  }

  /**
   * Dirty = there's a staged list AND it differs from what would actually be
   * SENT. Compared after cleanOptions on both sides, which is the point: a
   * freshly added row with no label yet is dropped by cleanOptions, so it is
   * not a pending change and must not be counted as one. Previously the raw
   * comparison marked the category dirty, enabled Save, fired a PUT that wrote
   * back the identical list, and the blank row vanished with no explanation.
   *
   * Note this is deliberately a different comparison from the pruning in
   * stage(), which stays RAW so that in-progress text (a trailing space, say)
   * survives in the input instead of being snapped away mid-keystroke. The two
   * answer different questions: stage() asks "is there anything to hold onto",
   * this asks "is there anything to save".
   *
   * The content check is also belt-and-braces: it covers a staged list that
   * matches a config change which arrived from the parent.
   */
  function isDirty(categoryId: number): boolean {
    if (!(categoryId in staged)) return false;
    return !optionsEqual(
      cleanOptions(staged[categoryId]),
      cleanOptions(savedOptionsFor(categoryId))
    );
  }

  /**
   * Stage an edit. If it lands back on the saved state, drop the staged entry
   * entirely so the category reads as clean — the two lists are identical, so
   * nothing visible changes.
   */
  function stage(categoryId: number, options: AccessoryOptionConfig[]) {
    const saved = savedOptionsFor(categoryId);
    setStaged((prev) => {
      const next = { ...prev };
      if (optionsEqual(options, saved)) delete next[categoryId];
      else next[categoryId] = options;
      return next;
    });
  }

  ///  ---- Row operations (all staging, none of them write) ----

  function addOption(categoryId: number) {
    stage(categoryId, [
      ...optionsFor(categoryId),
      { label: "", displayLabel: null, accessoryLabel: null, primary: null, backup: null },
    ]);
  }

  function removeOption(categoryId: number, index: number) {
    stage(
      categoryId,
      optionsFor(categoryId).filter((_, i) => i !== index)
    );
  }

  function editField(
    categoryId: number,
    index: number,
    patch: Partial<AccessoryOptionConfig>
  ) {
    stage(
      categoryId,
      optionsFor(categoryId).map((o, i) => (i === index ? { ...o, ...patch } : o))
    );
  }

  ///  ---- Commit / abandon ----

  /**
   * Flush every dirty category. One PUT each (the endpoint is per-category with
   * replace semantics), fired in parallel, then a SINGLE config update for the
   * ones that landed — looping onConfigChange would read a stale `config` from
   * this closure and drop all but the last write.
   */
  async function saveAll() {
    const payloads = categories
      .filter((c) => isDirty(c.id))
      .map((c) => ({
        id: c.id,
        name: c.name,
        cleaned: cleanOptions(optionsFor(c.id)),
      }));

    if (payloads.length === 0) {
      setOpen(false);
      return;
    }

    setSaving(true);
    setError(null);

    const results = await Promise.allSettled(
      payloads.map((p) => setStandardAccessoriesForCategory(p.id, p.cleaned))
    );

    const saved = payloads.filter((_, i) => results[i].status === "fulfilled");
    const failed = payloads.filter((_, i) => results[i].status === "rejected");

    if (saved.length > 0) {
      const nextConfig = { ...config };
      for (const p of saved) nextConfig[String(p.id)] = { options: p.cleaned };
      onConfigChange(nextConfig);

      // Only the successful categories lose their staging; the rest stay dirty
      // and editable so a retry doesn't start from scratch.
      setStaged((prev) => {
        const next = { ...prev };
        for (const p of saved) delete next[p.id];
        return next;
      });
    }

    setSaving(false);

    if (failed.length > 0) {
      results.forEach((r) => {
        if (r.status === "rejected") console.error(r.reason);
      });
      setError(
        `Couldn't save ${joinNames(failed.map((p) => p.name))}. Those changes are still here — try again.`
      );
      return;
    }

    setOpen(false);
  }

  /** Throw away every staged edit and close. Only reachable from the header control. */
  function discardAll() {
    setStaged({});
    setError(null);
    setOpen(false);
  }

  /** Esc / outside click / the drawer swipe. Closes, keeps staging. */
  function handleOpenChange(next: boolean) {
    if (saving) return;
    setOpen(next);
  }

  /**
   * Open the dialog, clearing any previous error and forgetting which product
   * fetches failed so they are attempted again. Staged edits are untouched —
   * reopening is a retry, never a reset.
   */
  function openDialog() {
    setError(null);
    setFailedProductLoads(new Set());
    setOpen(true);
  }

  ///  ---- Derived ----

  // Resolve the selection against the live list: a category that stops being
  // requestable while selected falls back to the rail rather than an orphan pane.
  const selectedCategory =
    selectedCategoryId === null
      ? null
      : categories.find((c) => c.id === selectedCategoryId) ?? null;

  // Categories with at least one PERSISTED option.
  const configuredCount = categories.filter(
    (c) => (config[String(c.id)]?.options?.length ?? 0) > 0
  ).length;

  const dirtyCount = categories.filter((c) => isDirty(c.id)).length;

  const rail = (
    <CategoryRail
      categories={categories}
      selectedId={selectedCategory?.id ?? null}
      isDesktop={isDesktop}
      countFor={(id) => optionsFor(id).length}
      dirtyFor={isDirty}
      unmappedIds={unmappedIds ?? EMPTY_ID_SET}
      onSelect={setSelectedCategoryId}
    />
  );

  const pane =
    selectedCategory === null ? null : (
      <CategoryPane
        // Remounts per category, which resets the row expansion for free.
        key={selectedCategory.id}
        category={selectedCategory}
        options={optionsFor(selectedCategory.id)}
        products={productsByCategory[selectedCategory.id] ?? []}
        saving={saving}
        // Desktop owns its scrolling; the drawer's wrapper owns it on mobile.
        scrollable={isDesktop}
        showBack={!isDesktop}
        onBack={() => setSelectedCategoryId(null)}
        onAdd={() => addOption(selectedCategory.id)}
        onEdit={(i, patch) => editField(selectedCategory.id, i, patch)}
        onRemove={(i) => removeOption(selectedCategory.id, i)}
      />
    );

  return (
    <div className="space-y-2 pt-3">
      <div className="text-xs font-semibold text-info-light uppercase tracking-wider px-3">
        Standard accessories
      </div>

      <button
        onClick={openDialog}
        className="w-full gap-10 border border-outline text-left px-3 py-2 text-sm rounded-md bg-surface text-info-light hover:brightness-95 dark:hover:brightness-150 hover:cursor-pointer flex items-center justify-between"
      >
        <span>
          {loading
            ? "Loading..."
            : `${configuredCount} of ${categories.length} configured`}
          {dirtyCount > 0 && (
            <span className="text-amber-500"> · {dirtyCount} unsaved</span>
          )}
        </span>
        <span className="material-symbols-outlined !text-base">tune</span>
      </button>

      <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
        <ResponsiveDialogContent
          className={
            isDesktop
              ? // [&>button]:hidden drops DialogContent's built-in close X — the
                // header carries a labelled Discard in its place, so the corner
                // control can't be mistaken for a plain dismiss.
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
                Standard accessories
              </ResponsiveDialogTitle>

              <button
                onClick={dirtyCount > 0 ? discardAll : () => setOpen(false)}
                disabled={saving}
                className="shrink-0 flex items-center gap-1 text-xs font-semibold text-info-light hover:text-modal-error hover:cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined !text-base">
                  close
                </span>
                {dirtyCount > 0 ? "Discard changes" : "Close"}
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
                    // Not just "pick something" — this is the first place an
                    // admin lands, so it's where the editor explains what it
                    // is for before they have chosen anything.
                    <div className="flex-1 grid place-items-center px-6 py-8">
                      <div className="max-w-sm space-y-3 text-center">
                        <span className="material-symbols-outlined !text-[28px] text-info-light">
                          tune
                        </span>
                        <p className="text-sm text-on-surface-variant">
                          Pick a category on the left to set up its options.
                        </p>
                        <p className="text-xs text-info-light leading-relaxed">
                          Options are the named choices a requester picks from
                          when they ask for this kind of accessory — for
                          example "iPad A16 - Case". Each one points at a
                          specific accessory in Snipe-IT, so you control
                          exactly what gets handed out.
                        </p>
                        <p className="text-xs text-info-light leading-relaxed">
                          Only categories you've made requestable appear here.
                          Nothing is saved until you press{" "}
                          <span className="font-semibold">Save changes</span>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Drawer: one pane at a time, natural height, no inner scrollers.
              <div>{pane ?? rail}</div>
            ))}

          {!loading && categories.length > 0 && (
            <ResponsiveDialogFooter
              className={
                isDesktop
                  ? "shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-outline bg-surface-container-low/30"
                  : "px-4 pb-4 pt-2 gap-2"
              }
            >
              {/* When there ARE staged changes, say that they haven't been
                  written yet. A removed option disappears from the list
                  immediately, which otherwise looks like the delete has
                  already gone through. */}
              <span className="flex-1 text-xs mx-5 text-info-light">
                {dirtyCount === 0 ? (
                  "No unsaved changes"
                ) : (
                  <>
                    {`${dirtyCount} ${
                      dirtyCount === 1 ? "category" : "categories"
                    } with unsaved changes`}
                    <span className="hidden sm:inline">
                      {" "}
                      — nothing is written to Snipe-IT, including removals,
                      until you save.
                    </span>
                  </>
                )}
              </span>
              <button
                onClick={saveAll}
                disabled={saving || dirtyCount === 0}
                className="shrink-0 px-5 py-2 mx-5 my-5 rounded-md text-xs font-bold text-white twilight-gradient hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            </ResponsiveDialogFooter>
          )}
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
//  darker than the editor so the two halves read as separate surfaces); the
//  drawer's first screen on mobile, where each row gets a chevron because
//  tapping navigates rather than selects in place.
///  +-----------------------------------------------------------------+

function CategoryRail({
  categories,
  selectedId,
  isDesktop,
  countFor,
  dirtyFor,
  unmappedIds,
  onSelect,
}: {
  categories: AccessoryCategory[];
  selectedId: number | null;
  isDesktop: boolean;
  countFor: (categoryId: number) => number;
  dirtyFor: (categoryId: number) => boolean;
  /** Requestable but mapped to no asset category — invisible to every user. */
  unmappedIds: Set<number>;
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
        const count = countFor(cat.id);
        const dirty = dirtyFor(cat.id);
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
            {/* Flags the category right where an admin is configuring its
                options — the options are wasted effort until it's mapped. */}
            {unmappedIds.has(cat.id) && (
              <span
                title="Requestable, but no asset category maps to it — no user can request this yet"
                aria-label="Not requestable by any user yet"
                className="material-symbols-outlined !text-[15px] shrink-0 text-status-pending"
              >
                report
              </span>
            )}
            {dirty ? (
              <span
                aria-label="Unsaved changes"
                className="shrink-0 size-1.5 rounded-full bg-amber-500"
              />
            ) : (
              count > 0 && (
                <span className="shrink-0 text-xs text-on-surface-variant">
                  {count}
                </span>
              )
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
//  The detail half: a header (back on mobile, name, Add) over the option rows.
//  Purely presentational — every mutation is a callback, all state lives in the
//  parent except which row is open. `scrollable` decides whether the body owns
//  a scroll region (desktop) or flows into the drawer's own scroller (mobile).
///  +-----------------------------------------------------------------+

function CategoryPane({
  category,
  options,
  products,
  saving,
  scrollable,
  showBack,
  onBack,
  onAdd,
  onEdit,
  onRemove,
}: {
  category: AccessoryCategory;
  options: AccessoryOptionConfig[];
  products: AccessoryProductOption[];
  saving: boolean;
  scrollable: boolean;
  showBack: boolean;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (index: number, patch: Partial<AccessoryOptionConfig>) => void;
  onRemove: (index: number) => void;
}) {
  // One row open at a time. Indices are positional, so add/remove has to keep
  // this in step or the wrong row stays open after the list shifts.
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const empty = products.length === 0;

  function handleAdd() {
    setExpandedIndex(options.length); // the index the new row will occupy
    onAdd();
  }

  function handleRemove(index: number) {
    setExpandedIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
    onRemove(index);
  }

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

        {!empty && (
          <button
            onClick={handleAdd}
            disabled={saving}
            className="shrink-0 text-xs font-semibold text-info-light hover:text-status-success hover:cursor-pointer flex items-center gap-1 disabled:opacity-50"
          >
            <span className="material-symbols-outlined !text-sm">add</span>
            Add option
          </button>
        )}
      </div>

      <div
        className={`px-3 py-3 space-y-2 ${
          scrollable ? "flex-1 min-h-0 overflow-y-auto overscroll-contain" : ""
        }`}
      >
        {empty ? (
          <div className="text-xs text-info-light italic">
            No accessories in this category to configure.
          </div>
        ) : (
          <>
            {options.length === 0 && (
              // An empty list is NOT broken — it means the zero-config
              // fallback applies. Say so, because a blank editor otherwise
              // reads as "nothing configured, nothing works", and then
              // recommend the convention that avoids relying on it.
              <div className="space-y-2 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-3 py-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-status-pending">
                  <span className="material-symbols-outlined !text-[14px]">
                    info
                  </span>
                  No options set — this category still works
                </p>
                <p className="text-xs text-info-light leading-relaxed">
                  With no options configured, a standard request here is
                  fulfilled automatically: the first accessory in this category
                  that has stock is picked for the requester, in name order.
                  Nobody chooses — they just get whatever comes up first.
                </p>
                <p className="text-xs text-info-light leading-relaxed">
                  Adding options takes that decision back. Even where there's
                  really only one sensible item, a single option named{" "}
                  <span className="font-semibold text-on-surface-variant">
                    Standard
                  </span>{" "}
                  is worth setting: you decide which accessory it resolves to,
                  and a requester who needs something different still has
                  "Something else", which flags the request as non-standard for
                  you to review.
                </p>
              </div>
            )}

            {options.map((opt, index) => (
              <OptionRow
                key={index}
                categoryId={category.id}
                index={index}
                option={opt}
                products={products}
                disabled={saving}
                expanded={expandedIndex === index}
                wide={scrollable}
                onToggle={() =>
                  setExpandedIndex((prev) => (prev === index ? null : index))
                }
                onEdit={(patch) => onEdit(index, patch)}
                onRemove={() => handleRemove(index)}
              />
            ))}
          </>
        )}
      </div>
    </>
  );
}

///  +-----------------------------------------------------------------+
///  |                        OPTION ROW                               |
///  +-----------------------------------------------------------------+
//
//  Collapsed: one line — name plus the primary it resolves to. Expanded: the
//  label, both request-table labels, and the two pickers. Primary and backup
//  exclude each other (a product can't be both slots of the same option).
///  +-----------------------------------------------------------------+

function OptionRow({
  categoryId,
  index,
  option,
  products,
  disabled,
  expanded,
  wide,
  onToggle,
  onEdit,
  onRemove,
}: {
  categoryId: number;
  index: number;
  option: AccessoryOptionConfig;
  products: AccessoryProductOption[];
  disabled?: boolean;
  expanded: boolean;
  wide: boolean;
  onToggle: () => void;
  onEdit: (patch: Partial<AccessoryOptionConfig>) => void;
  onRemove: () => void;
}) {
  const title = option.label.trim() || "Untitled option";

  // Summary of what this option resolves to. Mirrors ProductSlot's three cases
  // so the collapsed line never disagrees with the picker underneath it.
  const primaryProduct =
    option.primary !== null
      ? findProductBySavedId(products, option.primary)
      : null;
  const summary =
    option.primary === null
      ? "No accessory set"
      : primaryProduct
      ? productPickerLabel(primaryProduct)
      : `Saved accessory #${option.primary} no longer in catalog`;
  const summaryMuted = option.primary === null || primaryProduct === null;

  return (
    <div className="border border-outline rounded-lg overflow-hidden">
      <div className="flex bg-surface-container-low/30 items-center gap-2 px-3 py-2">
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-1 min-w-0 flex items-center gap-2 text-left hover:cursor-pointer"
        >
          <span
            className="material-symbols-outlined !text-base shrink-0 text-info-light transition-transform"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}
          >
            chevron_right
          </span>
          <span
            className={`shrink-0 text-sm ${
              option.label.trim()
                ? "text-on-surface-variant"
                : "text-info-light italic"
            }`}
          >
            {title}
          </span>
          <span
            className={`flex-1 min-w-0 truncate text-xs ${
              summaryMuted ? "text-info-light italic" : "text-info-light"
            }`}
          >
            {summary}
          </span>
        </button>

        <button
          onClick={onRemove}
          disabled={disabled}
          aria-label="Remove option"
          className="shrink-0 text-info-light hover:text-modal-error hover:cursor-pointer disabled:opacity-50"
        >
          <span className="material-symbols-outlined !text-base">delete</span>
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-outline">
          <label className="block">
            <span className="flex items-center gap-1.5 text-xs font-medium text-info-light mb-1">
              Option label
              <InfoHint side="right">
                Also what gets stored on the request, so changing it later
                won't retitle requests that were already submitted.
              </InfoHint>
            </span>
            <input
              value={option.label}
              disabled={disabled}
              placeholder="e.g. iPad A16 - Case"
              onChange={(e) => onEdit({ label: e.target.value })}
              className="w-full bg-surface-container-low/30 border border-outline rounded-md px-2 py-1.5 text-sm text-on-surface-variant transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
            />
            {/* The single most important line in this dialog: it's the only
                field the requester ever sees, and they see it with no other
                context. */}
            <span className="mt-1 block text-[11px] text-info-light leading-relaxed">
              This is the choice requesters see in the accessory request form.
              Name it by model and type — "iPad A16 - Screen Protector" — since
              a bare "Screen Protector" is ambiguous as soon as two device
              generations are in play.
            </span>
          </label>

          {/* Optional request-table labels. Blank falls back (display → option
              label; accessory → the primary's Snipe name). Requesters never see
              these — they only shape how the row reads in the request log.
              Each gets its own label and hint: three fields on this row are
              called some variant of "label", and one shared blurb left admins
              guessing which was which. */}
          <div className="space-y-2">
            <span className="block text-[11px] font-medium text-info-light/70">
              Request-table labels (optional) — admin view only, never shown to
              requesters
            </span>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-info-light mb-1">
                  Type
                  <InfoHint side="top">
                    Shown in the Request Type column of the requests table in
                    place of the option label. Use it to shorten a long option
                    name down to what you need when scanning the table. Leave
                    blank to show the option label itself.
                  </InfoHint>
                </span>
                <input
                  value={option.displayLabel ?? ""}
                  disabled={disabled}
                  placeholder="e.g. Case"
                  onChange={(e) => onEdit({ displayLabel: e.target.value })}
                  className="w-full bg-surface-container-low/30 border border-outline rounded-md px-2 py-1.5 text-sm text-on-surface-variant transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
                />
              </label>

              <label className="block">
                <span className="flex items-center gap-1.5 text-[11px] font-medium text-info-light mb-1">
                  Accessory name
                  <InfoHint side="top">
                    The correlating accessory, shown to admins on the request
                    row so you can tell what to actually prepare. Use a clean
                    product name — "iPad A16" — rather than the full Snipe-IT
                    record title. Leave blank to show the primary accessory's
                    Snipe-IT name.
                  </InfoHint>
                </span>
                <input
                  value={option.accessoryLabel ?? ""}
                  disabled={disabled}
                  placeholder="e.g. iPad A16"
                  onChange={(e) => onEdit({ accessoryLabel: e.target.value })}
                  className="w-full bg-surface-container-low/30 border border-outline rounded-md px-2 py-1.5 text-sm text-on-surface-variant transition-all focus:outline-none focus:ring-2 focus:ring-modal-brand/20 disabled:opacity-60"
                />
              </label>
            </div>
          </div>

          <div className={`grid gap-2 ${wide ? "grid-cols-2" : "grid-cols-1"}`}>
            <ProductSlot
              label="Primary"
              keyId={`primary-${categoryId}-${index}`}
              value={option.primary}
              products={products}
              excludeId={option.backup}
              disabled={disabled}
              onChange={(v) => onEdit({ primary: v })}
            />
            <ProductSlot
              label="Backup"
              keyId={`backup-${categoryId}-${index}`}
              value={option.backup}
              products={products}
              excludeId={option.primary}
              disabled={disabled}
              onChange={(v) => onEdit({ backup: v })}
            />
          </div>

          {/* The resolution chain is worth stating because its last step is
              counter-intuitive: it fails rather than substituting. */}
          <p className="text-[11px] text-info-light leading-relaxed">
            Requests for this option take the primary accessory, preferring a
            record at the requester's own site. If none is in stock anywhere it
            falls back to the backup. If both are out of stock the request
            can't be fulfilled — it won't substitute a different accessory from
            the category.
          </p>
        </div>
      )}
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
      <span className="flex items-center gap-1.5 text-xs font-medium text-info-light mb-1">
        {label}
        {/* The stock number in this picker is the one figure an admin is most
            likely to misread — Snipe stores accessories per location, so the
            same product appears once per site and the picker sums them. */}
        <InfoHint side="top">
          Stock shown next to each accessory is the total across every
          Snipe-IT location, not one site's. The same product is stored once
          per location and listed here as a single entry with the counts added
          together.
        </InfoHint>
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
    </label>
  );
}