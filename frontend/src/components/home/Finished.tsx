import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet } from "@/components/ui/tray";
import { StateChip } from "@/components/ui/pills";
import { stageMeta } from "@/lib/route";
import { shortDate } from "@/lib/format";
import { kindLabel, requestIcon, requestTitle } from "@/lib/requestDisplay";
import type { Row } from "./useHome";
import { ROW } from "./styles";

const SHOWN = 3;
const GRID = "grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-3 phone:grid-cols-[1.75rem_minmax(0,1fr)_6rem_5.75rem_8.25rem] phone:gap-x-3.5";

type Props = {
  rows: Row[];
  name: string;
  onOpen: (row: Row) => void;
};

export default function Finished({ rows, name, onOpen }: Props) {
  if (rows.length === 0) return null;
  return (
    <Tray
      label="Recently finished"
      aside={
        <Link
          to={name ? `/requests?q=${encodeURIComponent(name)}` : "/requests"}
          className="flex items-center gap-0.75 rounded-4 fs-11.5 font-medium text-brand-tx outline-none hover:underline focus-visible:outline-2 focus-visible:outline-brand"
        >
          View all
          <Icon name="arrow_forward" size={14} />
        </Link>
      }
    >
      <Sheet className="overflow-hidden">
        <div className={cn("hidden h-8.5 items-center border-b border-line2 bg-subtle px-3.5 fs-10.5 text-mut phone:grid", GRID)}>
          <span />
          <span>Asset</span>
          <span>Requested</span>
          <span>For</span>
          <span>Status</span>
        </div>
        <ul className="m-0 list-none divide-y divide-line2 p-0">
          {rows.slice(0, SHOWN).map((row, i) => {
            const { r, route } = row;
            const meta = stageMeta(route.stage);
            const filed = shortDate(r.createdAt);
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className={cn(ROW, "grid min-h-14 items-center px-3.5 py-2", GRID)}
                >
                  <Icon name={requestIcon(r)} size={17.5} weight={300} className="text-tx3" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate fs-12.5 font-medium">{requestTitle(r)}</span>
                    <span className="truncate fs-11 text-mut">
                      <span className="font-mono fs-10.5">#{r.id}</span>
                      <span className="phone:hidden"> · {filed} · Yourself</span>
                      <span className="hidden phone:inline"> · {kindLabel(r)}</span>
                    </span>
                  </span>
                  <span className="hidden fs-11.5 text-tx3 phone:block">{filed}</span>
                  <span className="hidden fs-11.5 text-tx3 phone:block">Yourself</span>
                  <span className="flex">
                    {/* The first chip only: the tour explains what a status
                        means, and one example is the explanation. */}
                    <StateChip
                      intent={meta.intent}
                      icon={meta.icon}
                      data-tour={i === 0 ? "home-status-badge" : undefined}
                    >
                      {meta.label}
                    </StateChip>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </Tray>
  );
}
