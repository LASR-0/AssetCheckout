import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { longDate } from "@/lib/format";

type Counts = { inProgress: number; completed: number; rejected: number };

type Props = {
  name: string;
  loading: boolean;
  counts: Counts;
  intro: string;
};

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** The request log, filtered to one outcome and to this person. */
function requestsLink(status: "IN_PROGRESS" | "DONE" | "REJECTED", name: string): string {
  return `/requests?status=${status}${name ? `&q=${encodeURIComponent(name)}` : ""}`;
}

export default function HomeHead({ name, loading, counts, intro }: Props) {
  const now = new Date();
  const first = name.split(" ")[0];
  const tiles = [
    { label: "In progress", n: counts.inProgress, status: "IN_PROGRESS" as const },
    { label: "Completed", n: counts.completed, status: "DONE" as const },
    { label: "Rejected", n: counts.rejected, status: "REJECTED" as const },
  ];

  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4.5">
      <div data-tour="home-greeting" className="min-w-0 flex-[1_1_20rem]">
        <div className="font-title fs-10 font-medium tracking-label text-mut uppercase">{longDate(now)}</div>
        <h1 className="mt-2 font-head fs-19 leading-[1.25] font-medium tracking-[-0.01em] phone:fs-21">
          {greeting(now.getHours())}
          {first ? `, ${first}` : ""}.
        </h1>
        <p className="mt-1 fs-13 leading-normal text-pretty text-tx3">{intro}</p>
      </div>

      <div data-tour="home-stats" className="grid flex-[1_1_100%] grid-cols-3 gap-2 phone:flex-[0_1_26.25rem]">
        {tiles.map((t) => {
          const linked = !loading && t.n > 0;
          const body = (
            <>
              <span className={cn("fs-19 leading-none font-medium tabular-nums", linked ? "text-tx" : "text-mut")}>
                {loading ? "–" : t.n}
              </span>
              <span className="flex items-center justify-between gap-1 fs-11.5 text-tx3">
                {t.label}
                {linked && <Icon name="arrow_outward" size={14} className="text-mut" />}
              </span>
            </>
          );
          const tile = "flex min-w-0 flex-col gap-1.5 rounded-11 border border-line bg-sheet px-3 py-2.5";
          return linked ? (
            <Link
              key={t.label}
              to={requestsLink(t.status, name)}
              title={`Open the request log filtered to ${t.label.toLowerCase()}`}
              className={cn(tile, "transition-colors outline-none hover:border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand")}
            >
              {body}
            </Link>
          ) : (
            <div key={t.label} className={tile}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
