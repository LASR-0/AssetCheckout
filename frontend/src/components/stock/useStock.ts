import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { locationsQuery, siteColoursQuery, stockKeepersQuery } from "@/api/queries";
import { canActAsStockKeeper } from "@/lib/permissions";
import { deriveFulfilment, isReturnable } from "@/lib/stage";
import { useRequestLog, type LogRow } from "@/components/requests/useRequestLog";

///  +-----------------------------------------------------------------+
///  |                  EVERYTHING STOCK KNOWS                         |
///  +-----------------------------------------------------------------+
//
//  The keeper's sites, the one being looked at, and its three queues. The
//  queues are cut from the request log's own rows (the shared, cached
//  requests list), so a request reads the same here, in its docket, and on
//  Requests.
//
//  THE SITE IN EFFECT IS DERIVED, NOT SYNCED: what the reader picked, else
//  their first assignment. Writing a default into state from an effect left
//  the first paint with no site and flashed "nothing here" on every visit.
//
//  ADMINS CAN OPEN ANY SITE, to cover for an absent keeper. The full
//  location list and who keeps where are fetched only for them.
///  +-----------------------------------------------------------------+

export type Site = { id: number; name: string };

export type Queues = {
  /** Assigned here and not yet handed over: get it ready, or confirm it arrived. */
  hand: LogRow[];
  /** Marked ready, waiting for the requester to collect it. */
  ready: LogRow[];
  /** Loans out from here, on or past their due date. */
  loans: LogRow[];
};

/** Waiting on the keeper to hand it over. A legacy shipment closes itself. */
function isHandover(row: LogRow): boolean {
  const r = row.r;
  if (r.legacyShipment) return false;
  const f = deriveFulfilment(r);
  return f.isCollectAwaitingPrep || f.isShipped;
}

function isAwaitingCollection(row: LogRow): boolean {
  return deriveFulfilment(row.r).isReadyToCollect;
}

/** Collected, not returned, and returnable now. Matches the return button. */
function isLoanDue(row: LogRow): boolean {
  const r = row.r;
  return r.requestKind === "LOAN" && !!r.loan && !r.loan.returnedAt && !!r.receivedAt && isReturnable(r.loan);
}

/** When it became the keeper's to deal with: shipped, or checked out to them. */
export function handSince(row: LogRow): string | null {
  const r = row.r;
  return (r.needsShipping ? r.shippedAt : null) ?? r.fulfilledAt ?? r.adminApprovedAt ?? r.createdAt;
}

export function useStock() {
  const log = useRequestLog();
  const { viewer } = log;
  const admin = viewer.role === "ADMIN";
  const assigned = viewer.stockKeeperLocations;

  const locations = useQuery({ ...locationsQuery, enabled: admin });
  const keepers = useQuery({ ...stockKeepersQuery, enabled: admin });
  const { data: siteColours } = useQuery(siteColoursQuery);

  const [picked, setPicked] = useState<number | null>(null);

  // Assigned sites first (in their own order), then, for an admin, the rest.
  const sites = useMemo((): Site[] => {
    const mine = assigned.map((l) => ({ id: l.id, name: l.name ?? `Site ${l.id}` }));
    if (!admin) return mine;
    const rest = (locations.data ?? [])
      .filter((l) => !mine.some((m) => m.id === l.id))
      .map((l) => ({ id: l.id, name: l.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...mine, ...rest];
  }, [assigned, admin, locations.data]);

  const siteId = picked ?? assigned[0]?.id ?? null;
  const site = sites.find((s) => s.id === siteId) ?? (siteId != null ? { id: siteId, name: `Site ${siteId}` } : null);

  const queuesAt = useMemo(() => {
    const at = (id: number) => log.rows.filter((x) => x.r.userLocationId === id);
    return (id: number): Queues => {
      const here = at(id);
      const since = (x: LogRow) => handSince(x) ?? "";
      return {
        hand: here.filter(isHandover).sort((a, b) => since(a).localeCompare(since(b))),
        ready: here.filter(isAwaitingCollection).sort((a, b) => (a.r.collectionReadyAt ?? "").localeCompare(b.r.collectionReadyAt ?? "")),
        loans: here.filter(isLoanDue).sort((a, b) => a.r.loan!.endDate.localeCompare(b.r.loan!.endDate)),
      };
    };
  }, [log.rows]);

  /** How many are waiting to be handed over at a site (the picker's counts). */
  const waitingAt = (id: number) => log.rows.filter((x) => x.r.userLocationId === id && isHandover(x)).length;

  /** Who keeps a site, for an admin covering it. Null when nobody does. */
  const keeperOf = (id: number): string | null => {
    const list = keepers.data?.[String(id)]?.keepers ?? [];
    return list.length ? list.map((k) => k.name).join(", ") : null;
  };

  return {
    viewer,
    admin,
    /** Keeps stock somewhere, or is an admin: the page is theirs to use. */
    canUse: admin || assigned.length > 0,
    keeps: (id: number) => assigned.some((l) => l.id === id),
    canAct: site != null && canActAsStockKeeper(viewer.role, assigned, site.id),
    sites,
    site,
    pickSite: setPicked,
    queues: site ? queuesAt(site.id) : { hand: [], ready: [], loans: [] },
    waitingAt,
    keeperOf,
    keepersKnown: keepers.isSuccess,
    colourOf: (id: number) => siteColours?.[String(id)] ?? null,
    loading: log.loading,
    authLoading: log.auth.isLoading,
  };
}
