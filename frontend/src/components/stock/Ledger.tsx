import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { stockAccessoriesQuery, stockAssetsQuery } from "@/api/queries";
import { useSettledSearch } from "@/hooks/useSettledSearch";
import { iconForCategory } from "@/lib/categoryIcon";
import type { LocationAccessory, LocationAsset } from "@/types/snipeTypes";
import {
  AGE_OPTIONS,
  EMPTY_ACCESSORY_FILTERS,
  EMPTY_FILTERS,
  TILE_TEST,
  applyAccessoryFilters,
  applyFilters,
  countsExcluding,
  distinct,
  isOld,
  outFor,
  sortAccessories,
  sortAssets,
  type AccessoryFilterState,
  type AccessorySortKey,
  type AccessoryTile,
  type AssetTile,
  type AssignFilter,
  type SortKey,
  type StockFilterState,
} from "./stockFilters";
import type { Site } from "./useStock";

///  +-----------------------------------------------------------------+
///  |                  THE LEDGER                                     |
///  +-----------------------------------------------------------------+
//
//  Everything Snipe-IT records at the site, whether or not it ever came
//  through a request: "whose is that one on the shelf?". Accessories first,
//  because keepers hand out far more keyboards than laptops.
//
//  A calm operator table: the tiles are filters you can click (Total clears
//  them), the menus count what picking each option would give you, and the
//  headers sort. If Snipe-IT can't be reached the ledger says so on its own;
//  the queues beside it keep working.
///  +-----------------------------------------------------------------+

type Mode = "acc" | "assets";
const SIZES = [10, 25, 50];
const ANY = "ALL";

const ASSET_COLS = "grid-cols-[minmax(6rem,.8fr)_minmax(10.625rem,1.6fr)_8.25rem_minmax(6.25rem,.8fr)_8.625rem_minmax(10rem,1.2fr)_4.375rem]";
const ACC_COLS = "grid-cols-[minmax(13.75rem,2.2fr)_10.625rem_minmax(6.25rem,.9fr)_4rem_6rem_6rem]";

function initials(name: string): string {
  return name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function Tile({ label, icon, value, hint, on, warn, onClick }: { label: string; icon: string; value: number; hint: string; on: boolean; warn?: boolean; onClick: (() => void) | null }) {
  return (
    <button
      type="button"
      aria-pressed={onClick ? on : undefined}
      disabled={!onClick}
      onClick={onClick ?? undefined}
      className={cn(
        "flex min-w-40 flex-[1_1_0] flex-col items-start gap-1.25 rounded-10 border px-3 py-2.5 text-left font-sans text-tx outline-none focus-visible:outline-2 focus-visible:outline-brand max-phone:flex-[0_0_10rem]",
        on ? "border-brand bg-brand-sub shadow-[0_0_0_1px_var(--brand)]" : "border-line bg-sheet",
        onClick ? "cursor-pointer hover:border-strong" : "cursor-default"
      )}
    >
      <span className="flex items-center gap-1.25 font-title fs-9.5 font-medium tracking-label whitespace-nowrap text-mut uppercase">
        <Icon name={icon} size={14} weight={300} className={warn ? "text-prog" : "text-mut"} />
        {label}
      </span>
      <span className="font-head fs-22 leading-[1.1] font-medium tracking-head max-phone:fs-20">{value}</span>
      <span className="fs-11.5 leading-[1.35] text-pretty text-mut">{hint}</span>
    </button>
  );
}

function FilterSelect({ icon, label, value, onChange, options }: { icon: string; label: string; value: string; onChange: (v: string) => void; options: { v: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="h-9 w-auto gap-1.5 rounded-9 pr-1.5 pl-2.25 fs-13 text-tx2 max-phone:h-11 max-phone:flex-[1_1_8.75rem]">
        <Icon name={icon} size={16} weight={300} className="text-mut" />
        <span className="min-w-0 flex-1 truncate text-left">
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={options[0].v}>{options[0].label}</SelectItem>
        {options.length > 1 && <SelectSeparator />}
        {options.slice(1).map((o) => (
          <SelectItem key={o.v} value={o.v}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A sortable column heading. */
function Head({ label, active, desc, num, onClick }: { label: string; active: boolean; desc: boolean; num?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="columnheader"
      aria-sort={active ? (desc ? "descending" : "ascending") : "none"}
      onClick={onClick}
      className={cn(
        "flex h-full cursor-pointer items-center gap-0.75 border-0 bg-transparent p-0 font-sans fs-12 whitespace-nowrap",
        num && "justify-end",
        active ? "font-medium text-tx" : "text-mut hover:text-tx"
      )}
    >
      {label}
      <Icon name={active ? (desc ? "arrow_downward" : "arrow_upward") : "unfold_more"} size={14} className={active ? "" : "opacity-45"} />
    </button>
  );
}

function CategoryPill({ name }: { name: string | null }) {
  if (!name) return <span className="text-mut">—</span>;
  return (
    <span className="inline-flex h-5.5 max-w-full items-center gap-1 overflow-hidden rounded-pill border border-line pr-2 pl-1.5 fs-12 whitespace-nowrap text-tx2">
      <Icon name={iconForCategory(name)} size={14} weight={300} />
      <span className="truncate">{name}</span>
    </span>
  );
}

function StatusPill({ a }: { a: LocationAsset }) {
  const tone = a.assignedTo ? "neutral" : a.available ? "ok" : "prog";
  return (
    <span
      className={cn(
        "inline-flex h-5.5 max-w-full items-center gap-1.5 overflow-hidden rounded-6 px-2 fs-12 font-medium whitespace-nowrap",
        tone === "ok" && "bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]",
        tone === "prog" && "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]",
        tone === "neutral" && "bg-track text-tx2"
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", tone === "ok" ? "bg-ok" : tone === "prog" ? "bg-prog" : "bg-mut")} />
      <span className="truncate">{a.statusLabel ?? "No status"}</span>
    </span>
  );
}

function Holder({ a, me }: { a: LocationAsset; me: string }) {
  const mine = a.assignedKind === "user" && !!me && a.assignedTo === me;
  const shelf = !a.assignedTo;
  return (
    <span className="flex min-w-0 items-center gap-1.75 fs-13 whitespace-nowrap">
      <span
        aria-hidden
        className={cn(
          "grid size-6 flex-none place-items-center rounded-full fs-10.5 font-semibold",
          mine ? "bg-brand-sub text-brand-tx" : "bg-track text-tx3"
        )}
      >
        {shelf ? <Icon name="shelves" size={15} weight={300} /> : a.assignedKind === "user" ? initials(a.assignedTo!) : <Icon name="location_on" size={15} weight={300} />}
      </span>
      <span className={cn("truncate", shelf ? "text-mut" : mine ? "font-medium text-brand-tx" : "text-tx")}>
        {shelf ? "On the shelf" : mine ? "You" : a.assignedTo}
      </span>
    </span>
  );
}

function Avail({ n }: { n: number }) {
  return n > 0 ? (
    <span className="inline-grid h-5.5 min-w-6.5 place-items-center rounded-6 bg-ok-bg px-1.75 fs-12 font-semibold text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]">{n}</span>
  ) : (
    <span className="inline-flex h-5.5 items-center rounded-6 bg-prog-bg px-2 fs-12 font-medium whitespace-nowrap text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]">Out of stock</span>
  );
}

function Box({ children, dashed }: { children: ReactNode; dashed?: boolean }) {
  return (
    <div className={cn("mx-4 mb-4 flex flex-col items-center gap-2 rounded-12 px-5 py-7 text-center max-phone:mx-3.5", dashed && "border border-dashed border-strong")}>
      {children}
    </div>
  );
}

type Props = {
  site: Site;
  me: string;
  phone: boolean;
  /** Fill the column it sits in and scroll its own table, keeping the
   *  heading, tiles, filters and pager in view (desktop). */
  fill?: boolean;
};

export function Ledger({ site, me, phone, fill }: Props) {
  const [mode, setMode] = useState<Mode>("acc");
  const [af, setAf] = useState<StockFilterState>(EMPTY_FILTERS);
  const [cf, setCf] = useState<AccessoryFilterState>(EMPTY_ACCESSORY_FILTERS);
  const [assetSort, setAssetSort] = useState<SortKey>("assetTag");
  const [accSort, setAccSort] = useState<AccessorySortKey>("name");
  const [desc, setDesc] = useState(false);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  const assetsQ = useQuery({ ...stockAssetsQuery(site.id), enabled: mode === "assets" });
  const accsQ = useQuery({ ...stockAccessoriesQuery(site.id), enabled: mode === "acc" });
  const isA = mode === "assets";
  const q = isA ? assetsQ : accsQ;
  const assets = assetsQ.data ?? NONE_A;
  const accs = accsQ.data ?? NONE_C;
  const all = isA ? assets.length : accs.length;

  // Any change to what's shown starts again from the first page.
  const patchA = (p: Partial<StockFilterState>) => {
    setAf((f) => ({ ...f, ...p }));
    setPage(0);
  };
  const patchC = (p: Partial<AccessoryFilterState>) => {
    setCf((f) => ({ ...f, ...p }));
    setPage(0);
  };
  function switchMode(m: Mode) {
    setMode(m);
    setPage(0);
    setDesc(false);
  }
  function sortBy<K extends string>(key: K, current: K, set: (k: K) => void) {
    if (key === current) setDesc((d) => !d);
    else {
      set(key);
      setDesc(false);
    }
    setPage(0);
  }

  // The box shows what's typed; the table follows once typing pauses.
  const assetSearch = useSettledSearch(af.search);
  const accSearch = useSettledSearch(cf.search);
  const afS = useMemo(() => ({ ...af, search: assetSearch }), [af, assetSearch]);
  const cfS = useMemo(() => ({ ...cf, search: accSearch }), [cf, accSearch]);

  const assetRows = useMemo(() => sortAssets(applyFilters(assets, afS, undefined, me), assetSort, desc), [assets, afS, me, assetSort, desc]);
  const accRows = useMemo(() => sortAccessories(applyAccessoryFilters(accs, cfS), accSort, desc), [accs, cfS, accSort, desc]);
  const total = isA ? assetRows.length : accRows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const safe = Math.min(page, pages - 1);
  const from = safe * size;

  const anyFilter = isA
    ? JSON.stringify(af) !== JSON.stringify(EMPTY_FILTERS)
    : JSON.stringify(cf) !== JSON.stringify(EMPTY_ACCESSORY_FILTERS);
  const clear = () => (isA ? patchA(EMPTY_FILTERS) : patchC(EMPTY_ACCESSORY_FILTERS));

  // ---- tiles ----
  const assetTiles: { k: AssetTile; label: string; icon: string; hint: string; warn?: boolean }[] = [
    { k: "all", label: "Total", icon: "inventory_2", hint: "recorded in Snipe-IT" },
    { k: "shelf", label: "On the shelf", icon: "shelves", hint: "at this site, unassigned" },
    { k: "people", label: "With people", icon: "person", hint: "checked out to a person" },
    { k: "out", label: "Checked out", icon: "output", hint: "to a person or place" },
    { k: "avail", label: "Available", icon: "check_circle", hint: "ready to hand out" },
    { k: "old", label: "Out over a year", icon: "history", hint: "worth a refresh check", warn: true },
  ];
  const oos = accs.filter((a) => a.remaining <= 0).length;

  // ---- facets ----
  const catOptions = (values: string[], counts: Map<string, number>, anyLabel = "Any category") => [
    { v: ANY, label: anyLabel },
    ...values.map((v) => ({ v, label: `${v} (${counts.get(v) ?? 0})` })),
  ];
  const assetCats = distinct(assets, (a) => a.categoryName);
  const assetCatCounts = countsExcluding(assets, afS, "category", (a) => a.categoryName);
  const statuses = distinct(assets, (a) => a.statusLabel);
  const statusCounts = countsExcluding(assets, afS, "status", (a) => a.statusLabel);
  const ageBase = applyFilters(assets, afS, "age", me);
  const assignBase = applyFilters(assets, afS, "assign", me);
  const accCats = distinct(accs, (a) => a.categoryName);
  const accCatBase = applyAccessoryFilters(accs, cfS, "category");
  const accCatCounts = new Map<string, number>();
  for (const a of accCatBase) if (a.categoryName) accCatCounts.set(a.categoryName, (accCatCounts.get(a.categoryName) ?? 0) + 1);
  const availBase = applyAccessoryFilters(accs, cfS, "avail");

  const ASSIGN: { k: AssignFilter; label: string; test: (a: LocationAsset) => boolean }[] = [
    { k: "ALL", label: "Everything", test: () => true },
    { k: "SHELF", label: "On the shelf", test: (a) => !a.assignedTo },
    { k: "PERSON", label: "With a person", test: (a) => a.assignedKind === "user" },
    { k: "YOU", label: "With you", test: (a) => a.assignedKind === "user" && !!me && a.assignedTo === me },
  ];

  const shownAssets = assetRows.slice(from, from + size);
  const shownAccs = accRows.slice(from, from + size);

  return (
    <section
      aria-label="Ledger"
      data-tour="stock-ledger"
      className={cn("flex min-w-0 flex-col overflow-hidden rounded-14 border border-line bg-sheet", fill && "min-h-0")}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5 px-4 pt-4 pb-3 max-phone:px-3.5 max-phone:pt-3.5 max-phone:pb-2.5">
        <div className="min-w-0 flex-[1_1_16.25rem]">
          <h2 className="m-0 fs-15 font-medium">
            {isA ? "Assets" : "Accessories"} at {site.name}
          </h2>
          <p className="m-0 mt-0.5 fs-12.5 text-mut">Everything Snipe-IT records here, whether or not it came through a request.</p>
        </div>
        <SegmentedControl<Mode>
          label="Ledger"
          value={mode}
          onValueChange={switchMode}
          options={[
            { value: "acc", label: "Accessories", icon: "headphones" },
            { value: "assets", label: "Assets", icon: "laptop_windows" },
          ]}
        />
      </div>

      {q.isError ? (
        <Box dashed>
          <Icon name="cloud_off" size={24} weight={300} className="text-stop" />
          <div className="fs-14 font-medium">Couldn't reach Snipe-IT for the inventory.</div>
          <div className="max-w-95 fs-13 text-pretty text-mut">The queues on this page still work. Handovers and returns are saved as normal.</div>
          <Button variant="secondary" className="mt-1.5 h-9 gap-1.5 px-3.5 fs-13" onClick={() => void q.refetch()}>
            <Icon name="refresh" size={17} />
            {q.isFetching ? "Trying…" : "Try again"}
          </Button>
        </Box>
      ) : q.isPending ? (
        <div aria-busy className="flex flex-col gap-2 px-4 pb-4">
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-21 flex-1 animate-pulse rounded-10 bg-track" />
            ))}
          </div>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-8 bg-track" />
          ))}
        </div>
      ) : all === 0 ? (
        <Box dashed>
          <Icon name="shelves" size={24} weight={300} className="text-mut" />
          <div className="fs-14 font-medium">Snipe-IT has no {isA ? "assets" : "accessories"} recorded at this location</div>
        </Box>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto px-4 pb-3 max-phone:px-3.5 max-phone:[mask-image:linear-gradient(to_right,#000_calc(100%-2.75rem),transparent)]">
            {isA
              ? assetTiles.map((t) => (
                  <Tile
                    key={t.k}
                    label={t.label}
                    icon={t.icon}
                    hint={t.hint}
                    value={assets.filter(TILE_TEST[t.k]).length}
                    on={af.tile === t.k && t.k !== "all"}
                    warn={t.warn}
                    onClick={() => patchA({ tile: af.tile === t.k ? "all" : t.k })}
                  />
                ))
              : (
                  [
                    { k: "all" as AccessoryTile, label: "Lines here", icon: "category", hint: "distinct accessories", value: accs.length },
                    { k: null, label: "Units held", icon: "inventory_2", hint: "total recorded here", value: accs.reduce((n, a) => n + a.qty, 0) },
                    { k: "avail" as AccessoryTile, label: "Available", icon: "check_circle", hint: "units ready to hand out", value: accs.reduce((n, a) => n + Math.max(0, a.remaining), 0) },
                    { k: "oos" as AccessoryTile, label: "Out of stock", icon: "remove_shopping_cart", hint: "lines with none left", value: oos, warn: oos > 0 },
                  ] as const
                ).map((t) => (
                  <Tile
                    key={t.label}
                    label={t.label}
                    icon={t.icon}
                    hint={t.hint}
                    value={t.value}
                    on={t.k != null && t.k !== "all" && cf.tile === t.k}
                    warn={"warn" in t ? t.warn : false}
                    onClick={t.k == null ? null : () => patchC({ tile: cf.tile === t.k ? "all" : t.k! })}
                  />
                ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 pb-3 max-phone:px-3.5">
            <label className="flex h-9 min-w-0 flex-[1_1_13.75rem] items-center gap-2 rounded-9 border border-strong bg-sheet px-2.5 fs-13 text-mut transition-colors focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-sub)] hover:border-mut max-phone:h-11 max-phone:flex-[1_1_100%]">
              <Icon name="search" size={18} weight={300} />
              <input
                value={isA ? af.search : cf.search}
                onChange={(e) => (isA ? patchA({ search: e.target.value }) : patchC({ search: e.target.value }))}
                placeholder={isA ? "Tag, serial, model or holder" : "Name, model or manufacturer"}
                aria-label={isA ? "Search assets" : "Search accessories"}
                className="min-w-0 flex-1 border-0 bg-transparent font-sans text-tx outline-none placeholder:text-placeholder"
              />
              {(isA ? af.search : cf.search) && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => (isA ? patchA({ search: "" }) : patchC({ search: "" }))}
                  className="grid size-5.5 cursor-pointer place-items-center rounded-6 border-0 bg-transparent text-mut hover:bg-hover"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </label>
            {isA ? (
              <>
                <FilterSelect icon="category" label="Category" value={af.category} onChange={(v) => patchA({ category: v })} options={catOptions(assetCats, assetCatCounts)} />
                <FilterSelect
                  icon="label"
                  label="Status"
                  value={af.status}
                  onChange={(v) => patchA({ status: v })}
                  options={[{ v: ANY, label: "Any status" }, ...statuses.map((s) => ({ v: s, label: `${s} (${statusCounts.get(s) ?? 0})` }))]}
                />
                <FilterSelect
                  icon="schedule"
                  label="How long it's been out"
                  value={af.age}
                  onChange={(v) => patchA({ age: v as StockFilterState["age"] })}
                  options={AGE_OPTIONS.map((o) => ({
                    v: o.value,
                    label: o.value === "ALL" ? o.label : `${o.label} (${applyFilters(ageBase, { ...EMPTY_FILTERS, age: o.value }).length})`,
                  }))}
                />
                <SegmentedControl<AssignFilter>
                  label="Held by"
                  value={af.assign}
                  onValueChange={(v) => patchA({ assign: v })}
                  options={ASSIGN.map((o) => ({
                    value: o.k,
                    label: (
                      <>
                        {o.label}
                        <span className="fs-11 font-normal text-mut">{assignBase.filter(o.test).length}</span>
                      </>
                    ),
                  }))}
                  className="max-w-full overflow-x-auto *:h-6.5 *:fs-12.5 max-phone:*:h-9.5"
                />
              </>
            ) : (
              <>
                <FilterSelect icon="category" label="Category" value={cf.category} onChange={(v) => patchC({ category: v })} options={catOptions(accCats, accCatCounts)} />
                <FilterSelect
                  icon="inventory"
                  label="Availability"
                  value={cf.avail}
                  onChange={(v) => patchC({ avail: v as AccessoryFilterState["avail"] })}
                  options={[
                    { v: ANY, label: "Any availability" },
                    { v: "in", label: `In stock (${availBase.filter((a) => a.remaining > 0).length})` },
                    { v: "out", label: `Out of stock (${availBase.filter((a) => a.remaining <= 0).length})` },
                  ]}
                />
              </>
            )}
            {anyFilter && (
              <Button variant="ghost" className="h-9 px-2.5 fs-13 text-brand-tx hover:bg-brand-sub hover:text-brand-tx" onClick={clear}>
                Clear filters
              </Button>
            )}
          </div>

          <div className={cn("min-w-0 border-t border-line2", fill ? "min-h-0 flex-1 overflow-auto" : "overflow-x-auto")}>
            <div role="table" aria-label={isA ? "Assets" : "Accessories"} className={cn(!phone && (isA ? "min-w-250" : "min-w-205"))}>
              {!phone && (
                <div
                  role="row"
                  className={cn("sticky top-0 z-1 grid h-8.5 items-center gap-x-3.5 border-b border-line2 bg-subtle px-4", isA ? ASSET_COLS : ACC_COLS)}
                >
                  {isA
                    ? (
                        [
                          ["assetTag", "Asset tag"],
                          ["model", "Model"],
                          ["categoryName", "Category"],
                          ["serial", "Serial"],
                          ["statusLabel", "Status"],
                          ["assignedTo", "Held by"],
                          ["age", "Out for", true],
                        ] as [SortKey, string, boolean?][]
                      ).map(([k, label, num]) => (
                        <Head key={k} label={label} num={num} active={assetSort === k} desc={desc} onClick={() => sortBy(k, assetSort, setAssetSort)} />
                      ))
                    : (
                        [
                          ["name", "Accessory"],
                          ["categoryName", "Category"],
                          ["manufacturer", "Manufacturer"],
                          ["qty", "Total", true],
                          ["out", "Checked out", true],
                          ["remaining", "Available", true],
                        ] as [AccessorySortKey, string, boolean?][]
                      ).map(([k, label, num]) => (
                        <Head key={k} label={label} num={num} active={accSort === k} desc={desc} onClick={() => sortBy(k, accSort, setAccSort)} />
                      ))}
                </div>
              )}

              <div key={[mode, safe, size, JSON.stringify(isA ? afS : cfS), isA ? assetSort : accSort, desc].join("|")} role="rowgroup">
              {total === 0 ? (
                <div className="flex flex-col items-center gap-1.5 px-5 py-10 text-center">
                  <div className="fs-14 font-medium">No {isA ? "assets" : "accessories"} match these filters</div>
                  <div className="fs-13 text-mut">Try a different search, or clear the filters.</div>
                  <Button variant="secondary" className="mt-2 h-9 px-3.5 fs-13" onClick={clear}>
                    Clear filters
                  </Button>
                </div>
              ) : isA ? (
                shownAssets.map((a, i) =>
                  phone ? (
                    <div key={a.id} role="row" style={rowIn(i)} className={cn("flex flex-col gap-1.25 border-b border-line2 px-3.5 py-2.75", ROW_IN)}>
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate fs-14 font-medium">{a.model ?? a.name ?? "Unknown model"}</span>
                        <StatusPill a={a} />
                      </div>
                      <div className="flex min-w-0 items-center gap-2 fs-12.5 whitespace-nowrap text-tx3">
                        <span className="font-mono fs-12">{a.assetTag}</span>
                        <span className="text-strong">·</span>
                        <span className="min-w-0 truncate">{a.assignedTo ? (a.assignedKind === "user" && a.assignedTo === me ? "You" : a.assignedTo) : "On the shelf"}</span>
                        <span className={cn("ml-auto fs-12", isOld(a) ? "font-medium text-prog" : "text-mut")}>{outFor(a)}</span>
                      </div>
                    </div>
                  ) : (
                    <div key={a.id} role="row" style={rowIn(i)} className={cn("grid min-h-11.5 items-center gap-x-3.5 border-b border-line2 px-4 py-1.25", ASSET_COLS, ROW_IN)}>
                      <span className="font-mono fs-12 whitespace-nowrap text-tx2">{a.assetTag}</span>
                      <span className="flex min-w-0 flex-col gap-px">
                        <span className="truncate fs-13">{a.model ?? a.name ?? "Unknown model"}</span>
                        <span className="truncate fs-11.5 text-mut">{a.manufacturer}</span>
                      </span>
                      <span className="flex min-w-0">
                        <CategoryPill name={a.categoryName} />
                      </span>
                      <span className="truncate font-mono fs-12 text-tx3">{a.serial ?? "—"}</span>
                      <span className="flex min-w-0">
                        <StatusPill a={a} />
                      </span>
                      <Holder a={a} me={me} />
                      <span className={cn("flex items-center justify-end gap-0.75 fs-12.5 whitespace-nowrap", isOld(a) ? "font-medium text-prog" : "text-tx3")}>
                        {isOld(a) && <Icon name="history" size={14} />}
                        {outFor(a)}
                      </span>
                    </div>
                  )
                )
              ) : (
                shownAccs.map((a, i) =>
                  phone ? (
                    <div key={a.id} role="row" style={rowIn(i)} className={cn("flex items-center gap-3 border-b border-line2 px-3.5 py-2.75", ROW_IN)}>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate fs-14 font-medium">{a.name}</span>
                        <span className="truncate fs-12.5 text-mut">
                          {a.categoryName ?? "Uncategorised"} · {a.qty} held
                        </span>
                      </div>
                      <Avail n={a.remaining} />
                    </div>
                  ) : (
                    <div key={a.id} role="row" style={rowIn(i)} className={cn("grid min-h-11.5 items-center gap-x-3.5 border-b border-line2 px-4 py-1.25", ACC_COLS, ROW_IN)}>
                      <span className="flex min-w-0 flex-col gap-px">
                        <span className="truncate fs-13">{a.name}</span>
                        <span className="truncate font-mono fs-11 text-mut">{a.modelNumber ?? "—"}</span>
                      </span>
                      <span className="flex min-w-0">
                        <CategoryPill name={a.categoryName} />
                      </span>
                      <span className="truncate fs-13 text-tx3">{a.manufacturer ?? "—"}</span>
                      <span className="text-right fs-13">{a.qty}</span>
                      <span className="text-right fs-13 text-tx3">{a.qty - a.remaining}</span>
                      <span className="flex justify-end">
                        <Avail n={a.remaining} />
                      </span>
                    </div>
                  )
                )
              )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line2 px-3.5 py-2.5 fs-12.5 text-mut">
            <span>
              {total
                ? `Showing ${from + 1}–${Math.min(total, from + size)} of ${total}${total !== all ? ` (${all} at this site)` : ""}`
                : `0 of ${all}`}
            </span>
            <span className="flex items-center gap-2.5">
              <label className="flex items-center gap-1.5">
                Rows
                <Select
                  value={String(size)}
                  onValueChange={(v) => {
                    setSize(Number(v));
                    setPage(0);
                  }}
                >
                  <SelectTrigger aria-label="Rows per page" className="h-7.5 w-auto gap-1 rounded-7 pr-1 pl-2 fs-12.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZES.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button variant="secondary" size="icon-sm" aria-label="Previous page" disabled={safe === 0} onClick={() => setPage(safe - 1)} className="size-7.5">
                <Icon name="chevron_left" size={18} />
              </Button>
              <span className="font-mono fs-12">
                {safe + 1} / {pages}
              </span>
              <Button variant="secondary" size="icon-sm" aria-label="Next page" disabled={safe >= pages - 1} onClick={() => setPage(safe + 1)} className="size-7.5">
                <Icon name="chevron_right" size={18} />
              </Button>
            </span>
          </div>
        </>
      )}
    </section>
  );
}

const NONE_A: LocationAsset[] = [];
const NONE_C: LocationAccessory[] = [];
