import type { LocationAccessory, LocationAsset } from "@/types/snipeTypes";

///  +-----------------------------------------------------------------+
///  |            THE LEDGER'S FILTER + SORT RULES                     |
///  +-----------------------------------------------------------------+
//
//  Pulled out of the page so they can be tested without rendering anything.
//  The facet-count behaviour in particular is easy to get subtly wrong and
//  impossible to eyeball: see countsExcluding.
//
//  OPTIONS ARE DERIVED FROM THE DATA, not declared. Statuses and categories
//  come from Snipe and differ per instance — a hardcoded list would show
//  filters for statuses this company doesn't use and silently omit the ones
//  it does.
///  +-----------------------------------------------------------------+

/** The summary tiles double as filters (Total clears it). */
export type AssetTile = "all" | "shelf" | "people" | "out" | "avail" | "old";
export type AssignFilter = "ALL" | "SHELF" | "PERSON" | "YOU";
/** How long it has been out: checked-out assets only. */
export type AgeFilter = "ALL" | "lt6" | "6to12" | "gt1";

export type StockFilterState = {
  tile: AssetTile;
  search: string;
  status: string;
  category: string;
  assign: AssignFilter;
  age: AgeFilter;
};

export const EMPTY_FILTERS: StockFilterState = {
  tile: "all",
  search: "",
  status: "ALL",
  category: "ALL",
  assign: "ALL",
  age: "ALL",
};

export const AGE_OPTIONS: { value: AgeFilter; label: string }[] = [
  { value: "ALL", label: "Any age" },
  { value: "lt6", label: "Out under 6 months" },
  { value: "6to12", label: "Out 6–12 months" },
  { value: "gt1", label: "Out over a year" },
];

/** Whole days since an ISO-ish timestamp, or null when there isn't one. */
export function daysSince(value: string | null): number | null {
  if (!value) return null;
  // Snipe returns "2026-01-04 09:15:00", which Safari refuses as a Date. The
  // space is swapped for a T so every browser reads it the same way.
  const parsed = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  const ms = parsed.getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 86_400_000));
}

/** How long it's been out, compactly: "12d", "5mo", "1.4y". "—" on the shelf. */
export function outFor(a: LocationAsset): string {
  if (!a.assignedTo) return "—";
  const days = daysSince(a.lastCheckout);
  if (days === null) return "—";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/** "3d ago" / "5mo ago" / "1.4y ago" — an age, not a date. */
export function sinceLabel(value: string | null): string {
  const days = daysSince(value);
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

/** Out (to anyone or anywhere) for over a year: worth a refresh check. */
export function isOld(a: LocationAsset): boolean {
  return !!a.assignedTo && (daysSince(a.lastCheckout) ?? 0) > 365;
}

/** What each tile counts, and narrows to when picked. */
export const TILE_TEST: Record<AssetTile, (a: LocationAsset) => boolean> = {
  all: () => true,
  shelf: (a) => !a.assignedTo,
  people: (a) => a.assignedKind === "user",
  out: (a) => !!a.assignedTo,
  avail: (a) => !a.assignedTo && a.available,
  old: isOld,
};

/** Everything the free-text box searches. */
function haystack(a: LocationAsset): string {
  return [a.assetTag, a.serial, a.model, a.name, a.assignedTo ?? "on the shelf"]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Apply the filters, optionally skipping one of them.
 *
 * `skip` is what makes the facet counts honest — see countsExcluding. `me`
 * is the viewer's name, for "With you".
 */
export function applyFilters(
  assets: LocationAsset[],
  f: StockFilterState,
  skip?: keyof StockFilterState,
  me = ""
): LocationAsset[] {
  const needle = f.search.trim().toLowerCase();

  return assets.filter((a) => {
    if (skip !== "tile" && !TILE_TEST[f.tile](a)) return false;
    if (skip !== "search" && needle && !haystack(a).includes(needle)) return false;
    if (skip !== "status" && f.status !== "ALL" && a.statusLabel !== f.status) return false;
    if (skip !== "category" && f.category !== "ALL" && a.categoryName !== f.category) {
      return false;
    }
    if (skip !== "assign" && f.assign !== "ALL") {
      if (f.assign === "SHELF" && a.assignedTo) return false;
      if (f.assign === "PERSON" && a.assignedKind !== "user") return false;
      if (f.assign === "YOU" && (!me || a.assignedKind !== "user" || a.assignedTo !== me)) return false;
    }
    if (skip !== "age" && f.age !== "ALL") {
      // Shelf stock has no "out for": it's in the building.
      const days = a.assignedTo ? daysSince(a.lastCheckout) : null;
      if (days === null) return false;
      if (f.age === "lt6" && days >= 183) return false;
      if (f.age === "6to12" && (days < 183 || days > 365)) return false;
      if (f.age === "gt1" && days <= 365) return false;
    }
    return true;
  });
}

///  +-----------------------------------------------------------------+
///  |        A FACET COUNT EXCLUDES ITS OWN FILTER                    |
///  +-----------------------------------------------------------------+
//
//  The number beside "Laptop" in the Category menu must mean "how many you'd
//  get if you picked this", which requires counting against everything EXCEPT
//  the category filter itself.
//
//  Count against the fully filtered set instead and the menu collapses the
//  moment you use it: pick Laptop, reopen the menu, and every other category
//  reads 0 — because none of them are laptops. The list becomes a mirror of
//  the choice already made and you can never switch to Phone without clearing
//  first. That is the bug this exists to avoid, and it looks like correct
//  behaviour until somebody tries to change their mind.
///  +-----------------------------------------------------------------+

export function countsExcluding(
  assets: LocationAsset[],
  f: StockFilterState,
  facet: keyof StockFilterState,
  valueOf: (a: LocationAsset) => string | null
): Map<string, number> {
  const base = applyFilters(assets, f, facet);
  const counts = new Map<string, number>();
  for (const a of base) {
    const key = valueOf(a);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** Distinct values present, sorted, for building a facet's option list. */
export function distinct<T>(
  assets: T[],
  valueOf: (a: T) => string | null
): string[] {
  const seen = new Set<string>();
  for (const a of assets) {
    const v = valueOf(a);
    if (v) seen.add(v);
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

export type SortKey =
  | "assetTag"
  | "model"
  | "categoryName"
  | "serial"
  | "statusLabel"
  | "assignedTo"
  | "age";

/**
 * Sort a page of assets.
 *
 * Nulls always sort LAST regardless of direction: an asset with no serial is
 * missing data, not the smallest serial, and burying a column's worth of "—"
 * at the top of an ascending sort helps nobody.
 */
export function sortAssets(
  assets: LocationAsset[],
  key: SortKey,
  desc: boolean
): LocationAsset[] {
  const dir = desc ? -1 : 1;

  const valueOf = (a: LocationAsset): string | number | null => {
    if (key === "age") return daysSince(a.lastCheckout);
    if (key === "assignedTo") return a.assignedTo;
    if (key === "serial") return a.serial;
    if (key === "model") return a.model ?? a.name;
    if (key === "categoryName") return a.categoryName;
    if (key === "statusLabel") return a.statusLabel;
    return a.assetTag;
  };

  return [...assets].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
}

///  +-----------------------------------------------------------------+
///  |              THE ACCESSORY HALF OF THE LEDGER                   |
///  +-----------------------------------------------------------------+
//
//  Kept separate from the asset filters rather than generalised over both.
//  Only two of the asset facets mean anything here — search and category —
//  because an accessory line has no status label, no single holder and no
//  checkout date. Forcing one shape over both would give the accessory view
//  three filters that can only ever return everything, which reads as broken
//  rather than as not-applicable.
///  +-----------------------------------------------------------------+

/** Lines here (all), lines with stock, lines with none. */
export type AccessoryTile = "all" | "avail" | "oos";

export type AccessoryFilterState = {
  tile: AccessoryTile;
  search: string;
  category: string;
  /** In stock, or out of it. */
  avail: "ALL" | "in" | "out";
};

export const EMPTY_ACCESSORY_FILTERS: AccessoryFilterState = {
  tile: "all",
  search: "",
  category: "ALL",
  avail: "ALL",
};

function accessoryHaystack(a: LocationAccessory): string {
  return [a.name, a.modelNumber, a.manufacturer, a.categoryName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function applyAccessoryFilters(
  rows: LocationAccessory[],
  f: AccessoryFilterState,
  skip?: keyof AccessoryFilterState
): LocationAccessory[] {
  const needle = f.search.trim().toLowerCase();
  return rows.filter((a) => {
    if (skip !== "search" && needle && !accessoryHaystack(a).includes(needle)) {
      return false;
    }
    if (skip !== "category" && f.category !== "ALL" && a.categoryName !== f.category) {
      return false;
    }
    if (skip !== "tile" && f.tile !== "all" && (f.tile === "avail") !== a.remaining > 0) return false;
    if (skip !== "avail" && f.avail !== "ALL" && (f.avail === "in") !== a.remaining > 0) return false;
    return true;
  });
}

export type AccessorySortKey =
  | "name"
  | "categoryName"
  | "manufacturer"
  | "qty"
  | "out"
  | "remaining";

/**
 * Sort accessory lines. Nulls last in both directions, as on the asset side —
 * a missing manufacturer is absent data, not an empty-string name.
 */
export function sortAccessories(
  rows: LocationAccessory[],
  key: AccessorySortKey,
  desc: boolean
): LocationAccessory[] {
  const dir = desc ? -1 : 1;
  const valueOf = (a: LocationAccessory) => (key === "out" ? a.qty - a.remaining : a[key]);
  return [...rows].sort((a, b) => {
    const av = valueOf(a);
    const bv = valueOf(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
}
