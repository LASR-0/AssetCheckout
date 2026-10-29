import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet } from "@/components/ui/tray";
import { Dot, HolderChip } from "@/components/ui/pills";
import { RouteRail } from "@/components/ui/route-rail";
import { holderOf, type Viewer } from "@/lib/route";
import { kindAccent, kindLabel, requestIcon, requestTitle } from "@/lib/requestDisplay";
import type { Row } from "./useHome";
import { ROW, SKELETON } from "./styles";

type Props = {
  rows: Row[];
  /** Whether the person has ever filed anything, for the empty wording. */
  anyRequests: boolean;
  loading: boolean;
  viewer: Viewer;
  onOpen: (row: Row) => void;
};

function ItemIcon({ name }: { name: string }) {
  return (
    <span className="grid size-10 flex-none place-items-center rounded-10 bg-track text-tx2">
      <Icon name={name} size={18.5} weight={300} />
    </span>
  );
}

function Holder({ row, viewer }: { row: Row; viewer: Viewer }) {
  const holder = holderOf(row.r, row.route, viewer);
  if (!holder) return null;
  return (
    <HolderChip icon={holder.icon} mine={holder.label === "With you"}>
      {holder.label}
    </HolderChip>
  );
}

export default function InFlight({ rows, anyRequests, loading, viewer, onOpen }: Props) {
  return (
    <Tray
      label="Where your requests are up to"
      aside={!loading && rows.length > 0 ? `${rows.length} in progress` : undefined}
      data-tour="home-recent-requests"
    >
      <Sheet className="overflow-hidden">
        {loading ? (
          [0, 1].map((k) => (
            <div key={k} className="flex items-center gap-3.5 border-b border-line2 px-3.5 py-4 last:border-b-0">
              <span className="size-10 rounded-10 bg-track" />
              <span className="flex flex-1 flex-col gap-2">
                <span className={cn(SKELETON, "h-3 w-2/5")} />
                <span className={cn(SKELETON, "h-2.5 w-1/4")} />
              </span>
              <span className={cn(SKELETON, "h-2 w-[30%]")} />
            </div>
          ))
        ) : rows.length === 0 ? (
          <p className="m-0 px-4.5 py-5 fs-13 text-tx3">
            {anyRequests
              ? "Nothing in progress. Start a request below whenever you need something."
              : "Nothing yet — start your first request below."}
          </p>
        ) : (
          <ul className="m-0 list-none divide-y divide-line2 p-0">
            {rows.map((row) => {
              const { r, route } = row;
              const title = requestTitle(r);
              return (
                <li key={r.id}>
                  {/* Desktop: one line, the rail in its own column. */}
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    aria-label={`${title}, request ${r.id}`}
                    className={cn(
                      ROW,
                      "hidden min-h-18 grid-cols-[2.5rem_minmax(0,1fr)_minmax(9.375rem,13.75rem)_minmax(0,11.875rem)_1.25rem] items-center gap-x-3.5 py-3 pr-3 pl-3.5 phone:grid"
                    )}
                  >
                    <ItemIcon name={requestIcon(r)} />
                    <span className="flex min-w-0 flex-col gap-0.75">
                      <span className="truncate fs-13 font-medium">{title}</span>
                      <span className="flex items-center gap-1.5 overflow-hidden fs-11 whitespace-nowrap text-mut">
                        <span className="font-mono fs-10.5">#{r.id}</span>
                        <Dot accent={kindAccent(r)} />
                        <span className="truncate">{kindLabel(r)}</span>
                      </span>
                    </span>
                    <RouteRail route={route} />
                    <span className="flex min-w-0">
                      <Holder row={row} viewer={viewer} />
                    </span>
                    <Icon name="chevron_right" size={17.5} className="text-mut" />
                  </button>

                  {/* Phone: a card, the rail and holder under the title. */}
                  <button
                    type="button"
                    onClick={() => onOpen(row)}
                    aria-label={`${title}, request ${r.id}`}
                    className={cn(ROW, "flex flex-col gap-2.5 py-3.5 pr-3 pl-3.5 active:bg-subtle phone:hidden")}
                  >
                    <span className="flex w-full items-start gap-3">
                      <ItemIcon name={requestIcon(r)} />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.75">
                        <span className="fs-13.5 font-medium">{title}</span>
                        <span className="flex items-center gap-1.5 overflow-hidden fs-11 whitespace-nowrap text-mut">
                          <span className="font-mono fs-10.5">#{r.id}</span>
                          <span className="truncate">{kindLabel(r)}</span>
                        </span>
                      </span>
                      <Icon name="chevron_right" size={17.5} className="mt-2 text-mut" />
                    </span>
                    <span className="flex w-full items-center gap-2.5 pl-13">
                      <RouteRail route={route} hideLabel stationWidth="0.875rem" className="flex-none" />
                      <span className="truncate fs-11.5 font-medium text-tx2">
                        {route.stations[route.current]?.label}
                      </span>
                    </span>
                    <span className="flex w-full pl-13">
                      <Holder row={row} viewer={viewer} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>
    </Tray>
  );
}
