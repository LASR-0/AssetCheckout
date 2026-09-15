import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getAssetsAtLocation } from "@/api/stock";
import { getRequests } from "@/api/requests";
import { deriveFulfilment } from "@/components/ui/statusbadge";
import { canActAsStockKeeper } from "@/lib/permissions";
import type { LocationAsset } from "@/types/snipeTypes";
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
//    2. THE INVENTORY — every asset Snipe places at the site, whether or not
//       a request in this app ever touched it. That is different data with a
//       different shape and no request row behind it, and it answers the
//       question a keeper is actually asked: "whose is that one?"
//
//  SCOPED TO ASSIGNMENTS, NOT TO ROLE. An admin with no assignment can act as
//  a keeper anywhere but has no home site, so there is nothing for this page
//  to open on — they get the requests log, which already shows them
//  everything. A keeper of two sites gets a switcher.
///  +-----------------------------------------------------------------+

export default function StockPage() {
  const { role, stockKeeperLocations, isLoading: authLoading } = useAuth();

  const [siteId, setSiteId] = useState<number | null>(null);
  const [assets, setAssets] = useState<LocationAsset[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

  // Default to the first site once auth settles. Kept in state rather than
  // derived, so a keeper of two can switch without it snapping back.
  useEffect(() => {
    if (siteId === null && stockKeeperLocations.length > 0) {
      setSiteId(stockKeeperLocations[0].id);
    }
  }, [stockKeeperLocations, siteId]);

  const site = stockKeeperLocations.find((l) => l.id === siteId) ?? null;

  useEffect(() => {
    if (siteId === null) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingAssets(true);
        setAssetError(null);
        const rows = await getAssetsAtLocation(siteId);
        if (!cancelled) setAssets(rows);
      } catch (err) {
        if (!cancelled) {
          // Snipe being unreachable must not take the handover queue with it —
          // that half comes from our own database and is the actionable one.
          setAssetError(
            err instanceof Error ? err.message : "Couldn't load the inventory"
          );
          setAssets([]);
        }
      } finally {
        if (!cancelled) setLoadingAssets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getRequests({});
        if (!cancelled) setRequests(data.requests);
      } catch (err) {
        console.error("Failed to load requests", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Requests at this site waiting on the reader: fulfilled, not yet handed
   * over, and theirs to hand over.
   *
   * A legacy shipment is excluded — its requester closes it themselves, and
   * putting it in somebody's queue would invite two people to race for the
   * same row.
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

  if (authLoading) {
    return <Shell><p className="text-sm text-info-light italic">Loading…</p></Shell>;
  }

  if (stockKeeperLocations.length === 0) {
    return (
      <Shell>
        <div className="rounded-lg border border-outline bg-surface-container-low p-6 space-y-2">
          <p className="text-sm font-semibold text-on-surface">
            You aren't assigned as a stock keeper
          </p>
          <p className="text-sm text-info-light leading-relaxed">
            {role === "ADMIN"
              ? "Admins can act as stock keeper at any location, but this page opens on a site you're assigned to. Assign yourself under Settings → Stock Keepers, or use the requests log, which already shows you everything."
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
    <Shell>
      {/* SITE SWITCHER — only when there's more than one to switch between. */}
      {stockKeeperLocations.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {stockKeeperLocations.map((l) => (
            <button
              key={l.id}
              onClick={() => setSiteId(l.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors hover:cursor-pointer ${
                l.id === siteId
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-outline/40 text-info-light hover:border-outline"
              }`}
            >
              {l.name ?? `Location #${l.id}`}
            </button>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <SectionHeading
          icon="package_2"
          title="Waiting for you to hand over"
          count={handoverQueue.length}
          blurb="Fulfilled and at your site, but the requester hasn't been told it's ready. Mark these ready to collect from the requests log."
        />
        {handoverQueue.length === 0 ? (
          <Empty>Nothing waiting — everything at this site has been handed over.</Empty>
        ) : (
          <div className="divide-y divide-outline/15 rounded-lg border border-outline overflow-hidden">
            {handoverQueue.map((r) => (
              <QueueRow key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading
          icon="hourglass_top"
          title="Handed over, not yet collected"
          count={awaitingCollection.length}
          blurb="You've marked these ready. They're waiting on the requester to come and get them."
        />
        {awaitingCollection.length === 0 ? (
          <Empty>Nothing waiting to be picked up.</Empty>
        ) : (
          <div className="divide-y divide-outline/15 rounded-lg border border-outline overflow-hidden">
            {awaitingCollection.map((r) => (
              <QueueRow key={r.id} request={r} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <SectionHeading
          icon="inventory"
          title={`Assets at ${site?.name ?? "this location"}`}
          count={assets.length}
          blurb="Everything Snipe-IT records at this site, whether or not it came through a request."
        />
        {assetError ? (
          <div className="text-xs text-error bg-error-background rounded-md p-2">
            {assetError}
          </div>
        ) : loadingAssets ? (
          <Empty>Loading inventory…</Empty>
        ) : assets.length === 0 ? (
          <Empty>Snipe-IT has no assets recorded at this location.</Empty>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-outline">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-info-light">
                <tr>
                  <Th>Asset tag</Th>
                  <Th>Model</Th>
                  <Th>Serial</Th>
                  <Th>Status</Th>
                  <Th>Held by</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline/15">
                {assets.map((a) => (
                  <tr key={a.id} className="hover:bg-surface-container-low/50">
                    <Td className="font-mono text-xs">{a.assetTag || "—"}</Td>
                    <Td>
                      {a.model ?? a.name ?? "—"}
                      {a.categoryName && (
                        <span className="block text-xs text-info-light">
                          {a.categoryName}
                        </span>
                      )}
                    </Td>
                    <Td className="font-mono text-xs">{a.serial ?? "—"}</Td>
                    <Td>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] border ${
                          a.available
                            ? "border-status-success/40 text-status-success bg-status-success/10"
                            : "border-outline/30 text-info-light bg-surface"
                        }`}
                      >
                        {a.statusLabel ?? (a.available ? "Available" : "In use")}
                      </span>
                    </Td>
                    {/* The question a keeper is actually asked is "whose is
                        that one?", so an unassigned asset says so rather than
                        showing an empty cell that reads as missing data. */}
                    <Td className={a.assignedTo ? "" : "text-info-light italic"}>
                      {a.assignedTo ?? "On the shelf"}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-on-background">Stock</h1>
        <p className="text-sm text-info-light mt-1">
          What's at your location, and what's waiting on you.
        </p>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  count,
  blurb,
}: {
  icon: string;
  title: string;
  count: number;
  blurb: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="flex items-center gap-2 text-base font-semibold text-on-surface">
        <span className="material-symbols-outlined !text-[18px] text-info-light">
          {icon}
        </span>
        {title}
        <span className="text-xs font-normal text-info-light">({count})</span>
      </h2>
      <p className="text-sm text-info-light leading-relaxed">{blurb}</p>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-info-light italic rounded-lg border border-dashed border-outline/40 p-4">
      {children}
    </p>
  );
}

/** One request in a queue — links into the log, pinned to that row. */
function QueueRow({ request }: { request: Request }) {
  return (
    <Link
      to={`/requests?requestId=${request.id}`}
      className="flex items-center justify-between gap-3 px-3 py-2.5 bg-surface hover:brightness-95 dark:hover:brightness-150"
    >
      <div className="min-w-0">
        <p className="text-sm text-on-surface truncate">
          {request.userName}
          <span className="text-info-light"> · {request.categoryName}</span>
        </p>
        <p className="text-xs text-info-light font-mono">#{request.id}</p>
      </div>
      <span className="material-symbols-outlined !text-[18px] text-info-light shrink-0">
        arrow_forward
      </span>
    </Link>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left font-medium px-3 py-2 whitespace-nowrap">{children}</th>
  );
}

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}
