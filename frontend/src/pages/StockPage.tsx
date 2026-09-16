import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/useAuth";
import { getAccessoriesAtLocation, getAssetsAtLocation } from "@/api/stock";
import { getLocations } from "@/api/snipe";
import RequestsPagination from "@/components/request-table/RequestPagination";
import { getRequests } from "@/api/requests";
import { deriveFulfilment } from "@/components/ui/statusbadge";
import { canActAsStockKeeper } from "@/lib/permissions";
import CountBadge from "@/components/ui/countbadge";
import { iconForCategory } from "@/lib/categoryIcon";
import {
  AGE_OPTIONS,
  EMPTY_FILTERS,
  applyFilters,
  countsExcluding,
  daysSince,
  distinct,
  sinceLabel,
  sortAssets,
  type AgeFilter,
  type AssignFilter,
  type SortKey,
  type StockFilterState,
  EMPTY_ACCESSORY_FILTERS,
  applyAccessoryFilters,
  sortAccessories,
  type AccessoryFilterState,
  type AccessorySortKey,
} from "@/components/stock/stockFilters";
import type {
  LocationAccessory,
  LocationAsset,
  SnipeNamedRecord,
} from "@/types/snipeTypes";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                     THE STOCK KEEPER'S PAGE                     |
///  +-----------------------------------------------------------------+
//
//  TWO THINGS THE REQUESTS LOG CANNOT SHOW, which is why this is a page and
//  not another filter on that table:
//
//    1. THE HANDOVER QUEUE — the requests at this site waiting on the person
//       reading the page. The log can be filtered down to these, but it opens
//       on everything and they have to go looking; this opens on the work.
//
//    2. THE LEDGER — every asset Snipe places at the site, whether or not a
//       request in this app ever touched it. Different data, no request row
//       behind it, and it answers what a keeper is actually asked: "whose is
//       that one?"
//
//  SCOPED TO ASSIGNMENTS, NOT TO ROLE. An admin with no assignment can act as
//  a keeper anywhere but has no home site, so there is nothing for this page
//  to open on — they get the requests log, which already shows everything.
//
//  EVERY SITE'S COUNTS ARE FETCHED UP FRONT so the location chips can carry
//  real numbers and switching between them is instant. Bounded by how many
//  sites one person keeps, which is a handful — the cap in settings is on
//  keepers per location, so this is not the number that grows.
///  +-----------------------------------------------------------------+

const PAGE_SIZES = [10, 25, 50];

export default function StockPage() {
  const { role, stockKeeperLocations, isLoading: authLoading } = useAuth();

  ///  +-----------------------------------------------------------------+
  ///  |        THE DEFAULT SITE IS DERIVED, NOT SYNCED                  |
  ///  +-----------------------------------------------------------------+
  //
  //  `pickedSite` holds only what the reader has actually chosen. The site in
  //  effect falls back to their first assignment, computed during render.
  //
  //  This used to be an effect that wrote the default into state, which meant
  //  the first paint had no site at all and everything downstream rendered
  //  empty for a frame before a second render filled it in — a cascading
  //  render the lint rule is pointing at, and a visible flash of "no assets"
  //  on every visit.
  ///  +-----------------------------------------------------------------+
  const [pickedSite, setPickedSite] = useState<number | null>(null);
  const siteId = pickedSite ?? stockKeeperLocations[0]?.id ?? null;
  const setSiteId = setPickedSite;
  const [assetsBySite, setAssetsBySite] = useState<Map<number, LocationAsset[]>>(
    new Map()
  );
  const [requests, setRequests] = useState<Request[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState<string | null>(null);

  ///  +-----------------------------------------------------------------+
  ///  |             ADMINS ARE NOT LIMITED TO THEIR OWN SITES           |
  ///  +-----------------------------------------------------------------+
  //
  //  canActAsStockKeeper already lets an admin act at every location, and the
  //  assets endpoint honours that — but the page only ever offered the sites
  //  they were explicitly assigned to, so the capability was unreachable from
  //  the UI. An admin covering for an absent keeper had to assign themselves
  //  in settings first, which is a configuration change to do a five-second
  //  job.
  //
  //  The full location list is fetched ONLY for admins, and only once. It is
  //  a single Snipe call, and for everybody else the chips are their own
  //  assignments, which they already have from /auth/role.
  ///  +-----------------------------------------------------------------+
  const isAdmin = role === "ADMIN";
  const [allLocations, setAllLocations] = useState<SnipeNamedRecord[]>([]);
  const [adminSite, setAdminSite] = useState<{ id: number; name: string } | null>(null);
  const [locationsOpen, setLocationsOpen] = useState(false);

  ///  +-----------------------------------------------------------------+
  ///  |              TWO LEDGERS, ONE PAGE                              |
  ///  +-----------------------------------------------------------------+
  //
  //  A keeper hands out both, so both belong here — but they are genuinely
  //  different shapes, not two filters over one list. An asset is a serialised
  //  thing with a tag, a holder and a checkout date; an accessory is a line
  //  with a quantity. They get their own columns, their own filters and their
  //  own tiles, and the select says which you are looking at.
  //
  //  The QUEUES above are shared and never switch: a request for a keyboard
  //  and a request for a laptop are both waiting on the same person, and
  //  hiding half the handover queue behind a ledger toggle would be a good way
  //  to lose track of one.
  ///  +-----------------------------------------------------------------+
  const [mode, setMode] = useState<"ASSETS" | "ACCESSORIES">("ASSETS");
  const [accessoriesBySite, setAccessoriesBySite] = useState<
    Map<number, LocationAccessory[]>
  >(new Map());
  const [accessoryFilters, setAccessoryFilters] = useState<AccessoryFilterState>(
    EMPTY_ACCESSORY_FILTERS
  );
  const [accessorySort, setAccessorySort] = useState<AccessorySortKey>("name");

  const [filters, setFilters] = useState<StockFilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("assetTag");
  const [desc, setDesc] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Any filter change invalidates the current page number — page 4 of a
  // two-page result is an empty table that looks like a broken filter.
  // Page numbers do not carry between ledgers — page 4 of the assets list is
  // usually past the end of a shorter accessory list, which renders as an
  // empty table and reads as a broken switch.
  function switchMode(next: "ASSETS" | "ACCESSORIES") {
    setMode(next);
    setPage(1);
  }

  function patch(next: Partial<StockFilterState>) {
    setFilters((f) => ({ ...f, ...next }));
    setPage(1);
  }

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getLocations();
        if (!cancelled) setAllLocations(rows);
      } catch (err) {
        // The picker just won't populate; the keeper chips still work.
        console.error("Failed to load locations", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // One pass over every site the reader keeps. Partial failure is tolerated:
  // a site whose fetch fails is simply absent from the map and reads as empty,
  // rather than blanking the sites that did load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Both branches set state from inside the async body rather than
      // synchronously in the effect, so neither triggers a cascading render.
      if (stockKeeperLocations.length === 0) {
        setLoadingAssets(false);
        return;
      }
      setLoadingAssets(true);
      setAssetError(null);
      const results = await Promise.allSettled(
        stockKeeperLocations.map(async (l) => [l.id, await getAssetsAtLocation(l.id)] as const)
      );
      if (cancelled) return;

      const map = new Map<number, LocationAsset[]>();
      let failures = 0;
      for (const r of results) {
        if (r.status === "fulfilled") map.set(r.value[0], r.value[1]);
        else failures++;
      }
      setAssetsBySite(map);
      setAssetError(
        failures === 0
          ? null
          : failures === results.length
          ? "Couldn't reach Snipe-IT for the inventory."
          : `Couldn't load ${failures} of ${results.length} locations.`
      );
      setLoadingAssets(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [stockKeeperLocations]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getRequests({});
        if (!cancelled) setRequests(data.requests);
      } catch (err) {
        // The ledger is still useful without the queues, so this stays quiet.
        console.error("Failed to load requests", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A site the reader is not assigned to — an admin's pick — was never in the
  // prefetch, so it is fetched on demand and cached alongside the rest.
  useEffect(() => {
    if (siteId === null || assetsBySite.has(siteId)) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingAssets(true);
        const rows = await getAssetsAtLocation(siteId);
        if (cancelled) return;
        setAssetsBySite((prev) => new Map(prev).set(siteId, rows));
        setAssetError(null);
      } catch (err) {
        if (!cancelled) {
          setAssetError(
            err instanceof Error ? err.message : "Couldn't load this location."
          );
        }
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, assetsBySite]);

  // Accessories come from a shared cached catalogue rather than a per-location
  // query, so this is cheap — but it is still only fetched for a site somebody
  // actually looks at, and only once.
  useEffect(() => {
    if (siteId === null || accessoriesBySite.has(siteId)) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getAccessoriesAtLocation(siteId);
        if (!cancelled) {
          setAccessoriesBySite((prev) => new Map(prev).set(siteId, rows));
        }
      } catch (err) {
        // The asset ledger and the queues are unaffected, so this stays quiet
        // and the accessory view shows its empty state.
        console.error("Failed to load accessories", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId, accessoriesBySite]);

  // The chips cover assigned sites; adminSite covers anything else they picked.
  const site =
    stockKeeperLocations.find((l) => l.id === siteId) ??
    (adminSite && adminSite.id === siteId ? adminSite : null);
  const siteAssets = useMemo(
    () => (siteId === null ? [] : assetsBySite.get(siteId) ?? []),
    [assetsBySite, siteId]
  );

  /**
   * Requests at this site waiting on the reader: fulfilled, not yet handed
   * over, and theirs to hand over.
   *
   * A legacy shipment is excluded — its requester closes it themselves, and
   * putting it in somebody's queue would invite two people to race for it.
   */
  const handoverQueue = useMemo(() => {
    if (siteId === null) return [];
    return requests.filter((r) => {
      if ((r.userLocationId ?? null) !== siteId) return false;
      if (r.legacyShipment) return false;
      if (!canActAsStockKeeper(role, stockKeeperLocations, r.userLocationId ?? null)) {
        return false;
      }
      const stage = deriveFulfilment(r);
      return stage.isCollectAwaitingPrep || stage.isShipped;
    });
  }, [requests, siteId, role, stockKeeperLocations]);

  /** Handed over, still sitting with the keeper until somebody picks it up. */
  const awaitingCollection = useMemo(() => {
    if (siteId === null) return [];
    return requests.filter(
      (r) =>
        (r.userLocationId ?? null) === siteId && deriveFulfilment(r).isReadyToCollect
    );
  }, [requests, siteId]);

  // ── Ledger derivation ──
  const filtered = useMemo(
    () => applyFilters(siteAssets, filters),
    [siteAssets, filters]
  );
  const sorted = useMemo(() => sortAssets(filtered, sort, desc), [filtered, sort, desc]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const slice = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const siteAccessories = useMemo(
    () => (siteId === null ? [] : accessoriesBySite.get(siteId) ?? []),
    [accessoriesBySite, siteId]
  );

  const accessoriesFiltered = useMemo(
    () => applyAccessoryFilters(siteAccessories, accessoryFilters),
    [siteAccessories, accessoryFilters]
  );
  const accessoriesSorted = useMemo(
    () => sortAccessories(accessoriesFiltered, accessorySort, desc),
    [accessoriesFiltered, accessorySort, desc]
  );

  const showingAccessories = mode === "ACCESSORIES";
  const rowTotal = showingAccessories ? accessoriesSorted.length : sorted.length;
  const accPageCount = Math.max(1, Math.ceil(accessoriesSorted.length / pageSize));
  const accSafePage = Math.min(page, accPageCount);
  const accessorySlice = accessoriesSorted.slice(
    (accSafePage - 1) * pageSize,
    accSafePage * pageSize
  );

  const accessoryCategories = useMemo(
    () => distinct(siteAccessories, (a) => a.categoryName),
    [siteAccessories]
  );

  const onShelf = siteAssets.filter((a) => !a.assignedTo).length;
  // Out over a year — the refresh-check signal. Measured from the real value,
  // not by parsing the display string back apart.
  const overdue = siteAssets.filter((a) => (daysSince(a.lastCheckout) ?? 0) >= 365).length;

  const statusOptions = useMemo(
    () => distinct(siteAssets, (a) => a.statusLabel),
    [siteAssets]
  );
  const categoryOptions = useMemo(
    () => distinct(siteAssets, (a) => a.categoryName),
    [siteAssets]
  );
  const statusCounts = countsExcluding(siteAssets, filters, "status", (a) => a.statusLabel);
  const categoryCounts = countsExcluding(
    siteAssets,
    filters,
    "category",
    (a) => a.categoryName
  );
  const assignBase = applyFilters(siteAssets, filters, "assign");
  const ageBase = applyFilters(siteAssets, filters, "age");

  const activeChips: { kind: string; value: string; clear: () => void }[] = [];
  if (filters.search.trim()) {
    activeChips.push({
      kind: "search",
      value: `“${filters.search.trim()}”`,
      clear: () => patch({ search: "" }),
    });
  }
  if (filters.status !== "ALL") {
    activeChips.push({
      kind: "status",
      value: filters.status,
      clear: () => patch({ status: "ALL" }),
    });
  }
  if (filters.category !== "ALL") {
    activeChips.push({
      kind: "category",
      value: filters.category,
      clear: () => patch({ category: "ALL" }),
    });
  }
  if (filters.assign !== "ALL") {
    activeChips.push({
      kind: "held by",
      value: filters.assign === "SHELF" ? "on the shelf" : "with a person",
      clear: () => patch({ assign: "ALL" }),
    });
  }
  if (filters.age !== "ALL") {
    activeChips.push({
      kind: "checked out",
      value: AGE_OPTIONS.find((o) => o.value === filters.age)?.label ?? "",
      clear: () => patch({ age: "ALL" }),
    });
  }

  if (authLoading) {
    return (
      <Shell subtitle="">
        <p className="text-sm text-info-light italic">Loading…</p>
      </Shell>
    );
  }

  if (stockKeeperLocations.length === 0 && siteId === null) {
    return (
      <Shell
        subtitle={
          isAdmin
            ? "Pick a location to see what's there."
            : ""
        }
      action={
        isAdmin ? (
          <LocationPicker
            locations={allLocations}
            currentId={siteId}
            open={locationsOpen}
            setOpen={setLocationsOpen}
            onPick={(l) => {
              setAdminSite({ id: l.id, name: l.name });
              setSiteId(l.id);
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
          />
        ) : undefined
      }
      >
        <div className="rounded-xl border border-outline bg-surface-container-lowest p-6 space-y-2">
          <p className="text-sm font-semibold text-on-surface">
            {isAdmin
              ? "No location selected"
              : "You aren't assigned as a stock keeper"}
          </p>
          <p className="text-sm text-info-light leading-relaxed">
            {isAdmin
              ? "You can act as stock keeper anywhere, so pick a location above to see its stock. Assign yourself under Settings → Stock Keepers to have this page open on it by default."
              : "If this looks wrong, ask IT to assign you to your location under Settings → Stock Keepers."}
          </p>
          <Link
            to="/requests"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Go to requests
            <span className="material-symbols-outlined !text-[16px]">arrow_forward</span>
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      subtitle={`What's at ${site?.name ?? "your location"}, who's holding it, and what's waiting on you.`}
      action={
        <>
          <LedgerModeSelect mode={mode} setMode={switchMode} />
          {isAdmin && (
            <LocationPicker
              locations={allLocations}
              currentId={siteId}
              open={locationsOpen}
              setOpen={setLocationsOpen}
              onPick={(l) => {
                setAdminSite({ id: l.id, name: l.name });
                setSiteId(l.id);
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
            />
          )}
        </>
      }
    >
      {/* LOCATION BAR — chips with live counts, only when there's a choice. */}
      {stockKeeperLocations.length > 1 && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-outline bg-surface-container-lowest px-3.5 py-3">
          <span className="inline-flex items-center gap-1.5 pr-1 text-xs font-semibold uppercase tracking-wider text-info-light">
            <span className="material-symbols-outlined !text-base">warehouse</span>
            Location
          </span>
          <div className="flex flex-wrap gap-2">
            {stockKeeperLocations.map((l) => {
              const active = l.id === siteId;
              return (
                <button
                  key={l.id}
                  onClick={() => {
                    setSiteId(l.id);
                    setFilters(EMPTY_FILTERS);
                    setPage(1);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm transition-colors hover:cursor-pointer ${
                    active
                      ? "border border-primary bg-primary/10 font-semibold text-primary"
                      : "border border-outline bg-surface-container-lowest text-info-light hover:border-outline"
                  }`}
                >
                  {l.name ?? `Location #${l.id}`}
                  <span className="font-mono text-[11px] opacity-75">
                    {assetsBySite.get(l.id)?.length ?? "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* STAT TILES — the accessory set counts UNITS, because an accessory
          line of 24 docks is one row and twenty-four things to hand out.
          Reusing the asset tiles would report "1 at this site". */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {showingAccessories ? (
          <>
            <Tile
              icon="keyboard"
              iconClass="text-info-light"
              label="Lines at this site"
              value={siteAccessories.length}
              hint="distinct accessories"
            />
            <Tile
              icon="inventory"
              iconClass="text-info-light"
              label="Units held"
              value={siteAccessories.reduce((t, a) => t + a.qty, 0)}
              hint="total recorded here"
            />
            <Tile
              icon="check_circle"
              iconClass="text-status-success"
              label="Available"
              value={siteAccessories.reduce((t, a) => t + a.remaining, 0)}
              hint="ready to hand out"
            />
            <Tile
              icon="production_quantity_limits"
              iconClass="text-status-pending"
              label="Out of stock"
              value={siteAccessories.filter((a) => a.remaining <= 0).length}
              hint="lines with none left"
            />
          </>
        ) : (
          <>
            <Tile
              icon="inventory_2"
              iconClass="text-info-light"
              label="At this site"
              value={siteAssets.length}
              hint="recorded in Snipe-IT"
            />
            <Tile
              icon="check_circle"
              iconClass="text-status-success"
              label="On the shelf"
              value={onShelf}
              hint="available to hand out"
            />
            <Tile
              icon="person"
              iconClass="text-status-assigned"
              label="With people"
              value={siteAssets.length - onShelf}
              hint="checked out to a holder"
            />
            <Tile
              icon="history"
              iconClass="text-status-pending"
              label="Out over a year"
              value={overdue}
              hint="worth a refresh check"
            />
          </>
        )}
      </div>

      {/* QUEUES */}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <QueueCard
          icon="package_2"
          title="Waiting for you to hand over"
          count={handoverQueue.length}
          empty="Nothing waiting — everything at this site has been handed over."
          rows={handoverQueue}
          badge="Mark ready"
          badgeClass="border-status-pending/30 bg-status-pending/10 text-status-pending"
        />
        <QueueCard
          icon="hourglass_top"
          title="Handed over, not yet collected"
          count={awaitingCollection.length}
          empty="Nothing waiting to be picked up."
          rows={awaitingCollection}
          badge="With you"
          badgeClass="border-primary/30 bg-primary/10 text-primary"
        />
      </div>

      {/* LEDGER */}
      <div className="overflow-visible rounded-xl border border-outline bg-surface-container-lowest">
        <div className="flex flex-wrap items-center gap-3 rounded-t-xl border-b border-outline bg-surface-container-low px-4 py-4">
          <div className="mr-auto flex flex-col gap-0.5">
            <span className="flex items-center gap-2 text-[15px] font-semibold text-on-surface">
              <span className="material-symbols-outlined !text-[18px] text-info-light">
                {showingAccessories ? "keyboard" : "inventory"}
              </span>
              {showingAccessories ? "Accessories" : "Assets"} at{" "}
              {site?.name ?? "this location"}
            </span>
            <span className="text-[12.5px] text-info-light">
              Everything Snipe-IT records here, whether or not it came through a
              request.
            </span>
          </div>

          <div className="relative w-full sm:w-[280px]">
            <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 !text-[17px] -translate-y-1/2 text-info-light">
              search
            </span>
            <input
              value={showingAccessories ? accessoryFilters.search : filters.search}
              onChange={(e) => {
                setPage(1);
                if (showingAccessories) {
                  setAccessoryFilters((f) => ({ ...f, search: e.target.value }));
                } else {
                  patch({ search: e.target.value });
                }
              }}
              placeholder={
                showingAccessories
                  ? "Name, model or manufacturer"
                  : "Tag, serial, model or holder"
              }
              className="w-full rounded-full border border-transparent bg-surface-container-lowest py-2 pl-10 pr-3 text-sm text-on-surface shadow-sm outline-none focus:border-primary"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {/* An accessory line has no status, no single holder and no
                checkout date, so those three facets are absent rather than
                present-and-useless. */}
            {showingAccessories ? (
              <FacetMenu
                icon="category"
                label={
                  accessoryFilters.category === "ALL"
                    ? "Category"
                    : accessoryFilters.category
                }
                active={accessoryFilters.category !== "ALL"}
                options={[
                  {
                    value: "ALL",
                    label: "All categories",
                    icon: "list",
                    count: applyAccessoryFilters(siteAccessories, accessoryFilters, "category").length,
                  },
                  ...accessoryCategories.map((c) => ({
                    value: c,
                    label: c,
                    icon: iconForCategory(c),
                    count: applyAccessoryFilters(
                      siteAccessories,
                      accessoryFilters,
                      "category"
                    ).filter((a) => a.categoryName === c).length,
                  })),
                ]}
                current={accessoryFilters.category}
                onPick={(v) => {
                  setAccessoryFilters((f) => ({ ...f, category: v }));
                  setPage(1);
                }}
              />
            ) : (
            <>
            <FacetMenu
              icon="filter_list"
              label={filters.status === "ALL" ? "Status" : filters.status}
              active={filters.status !== "ALL"}
              options={[
                { value: "ALL", label: "All statuses", icon: "list", count: applyFilters(siteAssets, filters, "status").length },
                ...statusOptions.map((v) => ({
                  value: v,
                  label: v,
                  icon: "circle",
                  count: statusCounts.get(v) ?? 0,
                })),
              ]}
              current={filters.status}
              onPick={(v) => patch({ status: v })}
            />
            <FacetMenu
              icon="category"
              label={filters.category === "ALL" ? "Category" : filters.category}
              active={filters.category !== "ALL"}
              options={[
                { value: "ALL", label: "All categories", icon: "list", count: applyFilters(siteAssets, filters, "category").length },
                ...categoryOptions.map((v) => ({
                  value: v,
                  label: v,
                  icon: iconForCategory(v),
                  count: categoryCounts.get(v) ?? 0,
                })),
              ]}
              current={filters.category}
              onPick={(v) => patch({ category: v })}
            />
            <FacetMenu
              icon="person_search"
              label={
                filters.assign === "ALL"
                  ? "Held by"
                  : filters.assign === "SHELF"
                  ? "On the shelf"
                  : "With a person"
              }
              active={filters.assign !== "ALL"}
              options={[
                { value: "ALL", label: "Everything", icon: "list", count: assignBase.length },
                {
                  value: "SHELF",
                  label: "On the shelf",
                  icon: "inventory_2",
                  count: assignBase.filter((a) => !a.assignedTo).length,
                },
                {
                  value: "ASSIGNED",
                  label: "With a person",
                  icon: "person",
                  count: assignBase.filter((a) => !!a.assignedTo).length,
                },
              ]}
              current={filters.assign}
              onPick={(v) => patch({ assign: v as AssignFilter })}
            />
            <FacetMenu
              icon="event"
              label={
                filters.age === "ALL"
                  ? "Checked out"
                  : AGE_OPTIONS.find((o) => o.value === filters.age)?.label ?? "Checked out"
              }
              active={filters.age !== "ALL"}
              options={AGE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                icon: o.icon,
                count:
                  o.value === "ALL"
                    ? ageBase.length
                    : applyFilters(ageBase, { ...EMPTY_FILTERS, age: o.value }).length,
              }))}
              current={filters.age}
              onPick={(v) => patch({ age: v as AgeFilter })}
            />
            </>
            )}
            <RowsPerPage
              pageSize={pageSize}
              setPageSize={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
          </div>
        </div>

        {/* ACTIVE FILTER CHIPS */}
        {!showingAccessories && activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-outline bg-background px-4 py-3">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-info-light">
              Filtering
            </span>
            {activeChips.map((c) => (
              <span
                key={c.kind}
                className="inline-flex items-center gap-2 rounded-full border border-outline bg-surface-container-lowest px-2.5 py-1 text-[12.5px]"
              >
                <span className="text-info-light">{c.kind}</span>
                <span className="font-semibold text-on-surface">{c.value}</span>
                <button
                  onClick={c.clear}
                  className="flex text-info-light hover:cursor-pointer hover:text-modal-error"
                >
                  <span className="material-symbols-outlined !text-[15px]">close</span>
                </button>
              </span>
            ))}
            <button
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
              className="px-0.5 text-[12.5px] font-semibold text-primary hover:cursor-pointer hover:underline"
            >
              Clear all
            </button>
            <span className="ml-auto text-[12.5px] text-info-light">
              {filtered.length} of {siteAssets.length} assets
            </span>
          </div>
        )}

        {assetError && (
          <div className="border-b border-outline bg-error-background px-4 py-2 text-xs text-error">
            {assetError}
          </div>
        )}

        {/* TABLE */}
        {showingAccessories ? (
          accessorySlice.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <span className="material-symbols-outlined !text-[30px] text-info-light opacity-60">
                search_off
              </span>
              <span className="text-sm font-semibold text-on-surface">
                {siteAccessories.length === 0
                  ? "Snipe-IT has no accessories recorded at this location"
                  : "No accessories match these filters"}
              </span>
              {siteAccessories.length > 0 && (
                <button
                  onClick={() => {
                    setAccessoryFilters(EMPTY_ACCESSORY_FILTERS);
                    setPage(1);
                  }}
                  className="text-[13px] font-semibold text-primary hover:cursor-pointer hover:underline"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-outline bg-surface-container-low/40">
                    <AccessorySortHeader label="Accessory" id="name" sort={accessorySort} desc={desc} onSort={setAccessorySort} setDesc={setDesc} />
                    <AccessorySortHeader label="Category" id="categoryName" sort={accessorySort} desc={desc} onSort={setAccessorySort} setDesc={setDesc} />
                    <AccessorySortHeader label="Manufacturer" id="manufacturer" sort={accessorySort} desc={desc} onSort={setAccessorySort} setDesc={setDesc} />
                    <AccessorySortHeader label="Total" id="qty" sort={accessorySort} desc={desc} onSort={setAccessorySort} setDesc={setDesc} />
                    <AccessorySortHeader label="Available" id="remaining" sort={accessorySort} desc={desc} onSort={setAccessorySort} setDesc={setDesc} />
                  </tr>
                </thead>
                <tbody>
                  {accessorySlice.map((a) => (
                    <tr
                      key={a.id}
                      className={`border-b border-outline/50 border-l-[3px] hover:bg-surface-container-low/20 ${
                        a.remaining > 0
                          ? "border-l-status-success/60"
                          : "border-l-status-pending/60"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[13.5px] text-on-surface">{a.name}</span>
                          {a.modelNumber && (
                            <span className="font-mono text-[11.5px] text-info-light">
                              {a.modelNumber}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {a.categoryName ? (
                          <span className="inline-flex items-center gap-1.5 text-[13px] text-info-light">
                            <span className="material-symbols-outlined !text-[14px]">
                              {iconForCategory(a.categoryName)}
                            </span>
                            {a.categoryName}
                          </span>
                        ) : (
                          <span className="text-info-light">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-info-light">
                        {a.manufacturer ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-on-surface">
                        {a.qty}
                      </td>
                      {/* The number that decides whether somebody can be handed
                          one today, so it carries the colour rather than the
                          total sitting beside it. */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[12px] font-semibold ${
                            a.remaining > 0
                              ? "border-status-success/40 bg-status-success/10 text-status-success"
                              : "border-status-pending/40 bg-status-pending/10 text-status-pending"
                          }`}
                        >
                          {a.remaining}
                          {a.remaining <= 0 && " — none left"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : loadingAssets ? (
          <p className="px-4 py-12 text-center text-sm italic text-info-light">
            Loading inventory…
          </p>
        ) : slice.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <span className="material-symbols-outlined !text-[30px] text-info-light opacity-60">
              search_off
            </span>
            <span className="text-sm font-semibold text-on-surface">
              {siteAssets.length === 0
                ? "Snipe-IT has no assets recorded at this location"
                : "No assets match these filters"}
            </span>
            {siteAssets.length > 0 && (
              <button
                onClick={() => {
                  setFilters(EMPTY_FILTERS);
                  setPage(1);
                }}
                className="text-[13px] font-semibold text-primary hover:cursor-pointer hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline bg-surface-container-low/40">
                  <SortHeader label="Asset tag" id="assetTag" sort={sort} desc={desc} onSort={setSort} setDesc={setDesc} />
                  <SortHeader label="Model" id="model" sort={sort} desc={desc} onSort={setSort} setDesc={setDesc} />
                  <SortHeader label="Serial" id="serial" sort={sort} desc={desc} onSort={setSort} setDesc={setDesc} />
                  <SortHeader label="Status" id="statusLabel" sort={sort} desc={desc} onSort={setSort} setDesc={setDesc} />
                  <SortHeader label="Held by" id="assignedTo" sort={sort} desc={desc} onSort={setSort} setDesc={setDesc} />
                  <SortHeader label="Checked out" id="age" sort={sort} desc={desc} onSort={setSort} setDesc={setDesc} />
                </tr>
              </thead>
              <tbody>
                {slice.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-b border-outline/50 border-l-[3px] hover:bg-surface-container-low/20 ${
                      a.available ? "border-l-status-success/60" : "border-l-status-assigned/50"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12.5px] font-medium text-on-surface">
                      {a.assetTag || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13.5px] text-on-surface">
                          {a.model ?? a.name ?? "—"}
                        </span>
                        {a.categoryName && (
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-info-light">
                            <span className="material-symbols-outlined !text-[14px]">
                              {iconForCategory(a.categoryName)}
                            </span>
                            {a.categoryName}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[12.5px] text-info-light">
                      {a.serial ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
                          a.available
                            ? "border-status-success/40 bg-status-success/10 text-status-success"
                            : "border-outline/40 bg-surface-container-lowest text-info-light"
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            a.available ? "bg-status-success" : "bg-info-light"
                          }`}
                        />
                        {a.statusLabel ?? (a.available ? "Available" : "In use")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full text-[10px] font-bold ${
                            a.assignedTo
                              ? "bg-surface-container text-on-surface-variant"
                              : "bg-surface-container-low text-info-light"
                          }`}
                        >
                          {a.assignedTo ? initials(a.assignedTo) : "—"}
                        </span>
                        {/* The question a keeper is actually asked is "whose is
                            that one?", so an unassigned asset says so rather
                            than leaving a blank that reads as missing data. */}
                        <span
                          className={`text-[13.5px] ${
                            a.assignedTo ? "text-on-surface" : "italic text-info-light"
                          }`}
                        >
                          {a.assignedTo ?? "On the shelf"}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-info-light">
                      {sinceLabel(a.lastCheckout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* FOOTER — the requests log's pagination bar, imported rather than
            reproduced, so the two cannot drift apart. */}
        {(showingAccessories ? accessorySlice.length : slice.length) > 0 && (
          <RequestsPagination
            page={showingAccessories ? accSafePage : safePage}
            setPage={setPage}
            count={showingAccessories ? accPageCount : pageCount}
            total={pageSize}
            totalItems={rowTotal}
            noun={showingAccessories ? "accessories" : "assets"}
          />
        )}
      </div>
    </Shell>
  );
}

///  +-----------------------------------------------------------------+
///  |                          PIECES                                 |
///  +-----------------------------------------------------------------+

function Shell({
  children,
  subtitle,
  action,
}: {
  children: React.ReactNode;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-landing-bg text-on-background">
      {/* Same header treatment as the Request Log and the request forms:
          centred, the tab's own nav icon beside the title, subtitle beneath.
          The icon is inventory_2 rather than a page-specific one so the tab
          somebody clicked and the page they land on agree. */}
      <div className="text-center pb-4 pt-28">
        <div className="flex items-center justify-center">
          <span className="material-symbols-outlined mx-5 !text-4xl"> inventory_2 </span>
          <h1 className="text-4xl text-nav-tab-selected font-bold">Stock</h1>
        </div>
        {subtitle && <p className="text-info-light mt-2">{subtitle}</p>}
      </div>

      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 pb-16 sm:px-6">
        {/* The controls keep their own line now the title is centred — hanging
            them off a centred heading would pull the heading off-centre.
            Composed by the caller, because Shell has no business knowing which
            ledger is showing. */}
        {action && (
          <div className="flex flex-wrap items-center justify-end gap-2">{action}</div>
        )}
        {children}
      </div>
    </main>
  );
}

///  +-----------------------------------------------------------------+
///  |                   ADMIN LOCATION PICKER                         |
///  +-----------------------------------------------------------------+
//
//  Admin-only, because it is the UI for a permission only admins have.
//  A keeper switches sites with the chips below, which are their assignments;
//  this is the every-site list, and offering it to somebody who would get a
//  403 from half of it would be a menu of things they cannot do.
///  +-----------------------------------------------------------------+

/**
 * Rows per page, in the ledger header rather than the footer.
 *
 * Mirrors the requests toolbar's own page-size control — same `tune` icon,
 * same popover — because it is the same decision in the same product, and a
 * reader who has learned it once should not have to find it somewhere else
 * here.
 */
function RowsPerPage({
  pageSize,
  setPageSize,
}: {
  pageSize: number;
  setPageSize: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-filter/30 px-3 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:cursor-pointer hover:brightness-90">
          <span className="material-symbols-outlined !text-[15px] text-info-light">
            tune
          </span>
          {pageSize}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-40 bg-surface p-1">
        {PAGE_SIZES.map((n) => (
          <button
            key={n}
            onClick={() => {
              setPageSize(n);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:cursor-pointer hover:brightness-95 dark:hover:brightness-150 ${
              n === pageSize ? "bg-primary/10 font-semibold text-primary" : "text-info-light"
            }`}
          >
            <span className="material-symbols-outlined !text-base">
              {n >= 50 ? "density_small" : "menu"}
            </span>
            {n}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Assets or accessories. A segmented pair rather than a dropdown: there are
 * exactly two, both fit on screen, and which one you are looking at should be
 * readable without opening anything.
 */
function LedgerModeSelect({
  mode,
  setMode,
}: {
  mode: "ASSETS" | "ACCESSORIES";
  setMode: (m: "ASSETS" | "ACCESSORIES") => void;
}) {
  const options: { value: "ASSETS" | "ACCESSORIES"; label: string; icon: string }[] = [
    { value: "ASSETS", label: "Assets", icon: "inventory_2" },
    { value: "ACCESSORIES", label: "Accessories", icon: "keyboard" },
  ];

  return (
    <div className="inline-flex rounded-lg border border-outline bg-surface-container-lowest p-1 shadow-sm">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => setMode(o.value)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors hover:cursor-pointer ${
            mode === o.value
              ? "bg-primary/10 text-primary"
              : "text-info-light hover:brightness-95 dark:hover:brightness-150"
          }`}
        >
          <span className="material-symbols-outlined !text-base">{o.icon}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function LocationPicker({
  locations,
  currentId,
  open,
  setOpen,
  onPick,
}: {
  locations: SnipeNamedRecord[];
  currentId: number | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  onPick: (l: SnipeNamedRecord) => void;
}) {
  const current = locations.find((l) => l.id === currentId) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-3.5 py-2.5 text-[13px] font-medium text-on-surface shadow-sm transition-colors hover:cursor-pointer hover:brightness-95 dark:hover:brightness-150">
          <span className="material-symbols-outlined !text-base text-info-light">
            warehouse
          </span>
          {current ? current.name : "Choose a location"}
          <span className="material-symbols-outlined !text-base opacity-60">
            expand_more
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[320px] w-[260px] overflow-y-auto bg-surface p-1.5">
        <p className="px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-info-light">
          Every location
        </p>
        {locations.length === 0 ? (
          <p className="px-2.5 py-2 text-sm italic text-info-light">
            No locations found in Snipe-IT.
          </p>
        ) : (
          locations.map((l) => (
            <button
              key={l.id}
              onClick={() => {
                onPick(l);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:cursor-pointer hover:brightness-95 dark:hover:brightness-150 ${
                l.id === currentId
                  ? "bg-primary/10 font-semibold text-primary"
                  : "text-info-light"
              }`}
            >
              <span className="material-symbols-outlined !text-base opacity-75">
                warehouse
              </span>
              <span className="flex-1 truncate">{l.name}</span>
            </button>
          ))
        )}
      </PopoverContent>
    </Popover>
  );
}

function Tile({
  icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: string;
  iconClass: string;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-outline bg-surface-container-lowest px-4 py-3.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-info-light">
        <span className={`material-symbols-outlined !text-base ${iconClass}`}>{icon}</span>
        {label}
      </span>
      <span className="text-[27px] font-semibold leading-tight tracking-tight text-on-surface">
        {value}
      </span>
      <span className="text-xs text-info-light">{hint}</span>
    </div>
  );
}

function QueueCard({
  icon,
  title,
  count,
  empty,
  rows,
  badge,
  badgeClass,
}: {
  icon: string;
  title: string;
  count: number;
  empty: string;
  rows: Request[];
  badge: string;
  badgeClass: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-outline bg-surface-container-lowest">
      <div className="flex items-center gap-2.5 border-b border-outline bg-surface-container-low px-4 py-3">
        <span className="material-symbols-outlined !text-[18px] text-info-light">
          {icon}
        </span>
        <span className="text-sm font-semibold text-on-surface">{title}</span>
        <CountBadge count={count} label={title} />
        {rows.length > 0 && (
          <Link
            to="/requests"
            className="ml-auto text-[12.5px] font-semibold text-primary hover:underline"
          >
            Open in requests
          </Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-sm italic text-info-light">{empty}</p>
      ) : (
        <div>
          {rows.map((r) => (
            <Link
              key={r.id}
              to={`/requests?requestId=${r.id}`}
              className="flex items-center gap-3 border-b border-outline/40 px-4 py-3 last:border-b-0 hover:bg-background"
            >
              <span className="flex h-[30px] w-[30px] flex-none items-center justify-center rounded-full bg-surface-container text-[11px] font-bold text-on-surface-variant">
                {initials(r.userName)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13.5px] text-on-surface">
                  {r.userName}
                  <span className="text-info-light"> · {r.categoryName}</span>
                </span>
                <span className="font-mono text-[11.5px] text-info-light">#{r.id}</span>
              </span>
              <span
                className={`ml-auto inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badgeClass}`}
              >
                {badge}
              </span>
              <span className="material-symbols-outlined !text-[18px] text-info-light">
                chevron_right
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FacetMenu({
  icon,
  label,
  active,
  options,
  current,
  onPick,
}: {
  icon: string;
  label: string;
  active: boolean;
  options: { value: string; label: string; icon: string; count: number }[];
  current: string;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:cursor-pointer ${
            active
              ? "border-primary bg-primary/10 text-primary"
              : "border-transparent bg-filter/30 text-on-surface"
          }`}
        >
          <span
            className={`material-symbols-outlined !text-[15px] ${
              active ? "text-primary" : "text-info-light"
            }`}
          >
            {icon}
          </span>
          {label}
          <span className="material-symbols-outlined !text-[15px] opacity-60">
            expand_more
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-[300px] w-[230px] overflow-y-auto bg-surface p-1.5">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => {
              onPick(o.value);
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm hover:cursor-pointer hover:brightness-95 dark:hover:brightness-150 ${
              o.value === current
                ? "bg-primary/10 font-semibold text-primary"
                : "text-info-light"
            }`}
          >
            <span className="material-symbols-outlined !text-base opacity-75">
              {o.icon}
            </span>
            <span className="flex-1 truncate">{o.label}</span>
            <span className="font-mono text-[11px] opacity-60">{o.count}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** Sortable header for the accessory ledger — the asset twin is SortHeader. */
function AccessorySortHeader({
  label,
  id,
  sort,
  desc,
  onSort,
  setDesc,
}: {
  label: string;
  id: AccessorySortKey;
  sort: AccessorySortKey;
  desc: boolean;
  onSort: (k: AccessorySortKey) => void;
  setDesc: (d: boolean) => void;
}) {
  const activeSort = sort === id;
  return (
    <th className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
      <button
        onClick={() => {
          if (activeSort) setDesc(!desc);
          else {
            onSort(id);
            setDesc(true);
          }
        }}
        className="inline-flex items-center gap-1.5 hover:cursor-pointer hover:text-primary"
      >
        {label}
        <span
          className={`material-symbols-outlined !text-[14px] ${
            activeSort ? "opacity-100" : "opacity-0"
          }`}
        >
          {activeSort && !desc ? "arrow_upward" : "arrow_downward"}
        </span>
      </button>
    </th>
  );
}

function SortHeader({
  label,
  id,
  sort,
  desc,
  onSort,
  setDesc,
}: {
  label: string;
  id: SortKey;
  sort: SortKey;
  desc: boolean;
  onSort: (k: SortKey) => void;
  setDesc: (d: boolean) => void;
}) {
  const activeSort = sort === id;
  return (
    <th className="whitespace-nowrap px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
      <button
        onClick={() => {
          if (activeSort) setDesc(!desc);
          else {
            onSort(id);
            setDesc(true);
          }
        }}
        className="inline-flex items-center gap-1.5 hover:cursor-pointer hover:text-primary"
      >
        {label}
        <span
          className={`material-symbols-outlined !text-[14px] ${
            activeSort ? "opacity-100" : "opacity-0"
          }`}
        >
          {activeSort && !desc ? "arrow_upward" : "arrow_downward"}
        </span>
      </button>
    </th>
  );
}

/** Up to two initials, for the avatar circles. */
function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
