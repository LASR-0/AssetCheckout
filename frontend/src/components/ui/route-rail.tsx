import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { shortDate } from "@/lib/format";
import type { Route, Station } from "@/lib/route";

///  +-----------------------------------------------------------------+
///  |                  THE ROUTE RAIL, AT THREE SIZES                 |
///  +-----------------------------------------------------------------+
//
//    RouteRail   inline: a thin horizontal line with only the current
//                station labelled (table rows, Home's in-flight list)
//    RouteChain  full: the vertical chain of custody with names, dates and
//                who holds it now (inspectors)
//    RouteDots   micro: a dot sequence for the tightest spaces (mobile
//                cards, the form's submit bar)
//
//  All three draw one Route (lib/route.ts). Finished stations are filled,
//  the current one is the amber ringed dot, future ones are hollow. A
//  rejection cuts the line in red where it happened; a courier leg into the
//  current station is dashed; a failed write to Snipe-IT turns the current
//  station red. Colour is never the only signal: the inline rail's label and
//  the chain's text say the same thing in words, and the rail is labelled
//  for screen readers.
///  +-----------------------------------------------------------------+

type Phase = "done" | "current" | "future" | "cut";

function phaseOf(station: Station, route: Route): Phase {
  if (station.state === "current" && route.blocked) return "cut";
  return station.state;
}

/** One sentence a screen reader can say for the whole rail. */
function describe(route: Route): string {
  const cur = route.stations[route.current];
  if (route.finished) return `Finished: ${route.stations.at(-1)?.label ?? ""}`;
  if (route.rejected) return `Rejected at ${route.stations[route.current - 1]?.label ?? "the start"}`;
  return `Step ${route.current + 1} of ${route.stations.length}: ${cur?.label ?? ""}`;
}

const DOT: Record<Phase, string> = {
  done: "size-1.75 bg-tx2",
  current: "size-2.5 bg-prog shadow-[0_0_0_3px_var(--prog-bg)]",
  cut: "size-2.5 bg-stop shadow-[0_0_0_3px_var(--stop-bg)]",
  future: "size-1.75 border-[1.5px] border-strong bg-sheet",
};

/** The leg leading INTO station `i`. */
function segmentStyle(route: Route, i: number): CSSProperties {
  const station = route.stations[i];
  const reached = i <= route.current;
  const afterCut = !!route.rejected && i > route.current;
  const transit = station.transit && station.state === "current";
  return {
    borderTopWidth: "1.5px",
    borderTopStyle: transit ? "dashed" : "solid",
    borderTopColor: transit ? "var(--prog)" : reached && !afterCut ? "var(--tx2)" : "var(--strong)",
    opacity: afterCut ? 0.45 : 1,
  };
}

type RouteRailProps = {
  route: Route;
  /** Hide the current station's label (when the row says it elsewhere). */
  hideLabel?: boolean;
  className?: string;
};

export function RouteRail({ route, hideLabel, className }: RouteRailProps) {
  const n = route.stations.length;
  const cur = Math.min(route.current, n - 1);
  const showLabel = !hideLabel && !route.finished;
  return (
    <div
      role="img"
      aria-label={describe(route)}
      className={cn("grid min-w-0 items-center gap-y-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gridTemplateRows: "0.75rem auto" }}
    >
      {route.stations.map((s, i) => {
        const phase = phaseOf(s, route);
        const faded = !!route.rejected && i > route.current;
        return (
          <span key={s.key + i} className="flex h-3 min-w-0 items-center">
            <span
              className={cn("h-0 min-w-0.5 flex-1", i === 0 && "invisible")}
              style={i === 0 ? undefined : segmentStyle(route, i)}
            />
            <span className={cn("shrink-0 rounded-full", DOT[phase], faded && "opacity-45")} />
            <span
              className={cn("h-0 min-w-0.5 flex-1", i === n - 1 && "invisible")}
              style={i === n - 1 ? undefined : segmentStyle(route, i + 1)}
            />
          </span>
        );
      })}
      {showLabel && (
        <span
          className={cn(
            "row-start-2 truncate fs-11 font-medium whitespace-nowrap",
            route.rejected || route.blocked ? "text-stop" : "text-tx2",
            cur === 0 ? "justify-self-start" : cur === n - 1 ? "justify-self-end" : "justify-self-center"
          )}
          style={{ gridColumn: String(cur + 1) }}
        >
          {route.stations[cur]?.label}
        </span>
      )}
    </div>
  );
}

type RouteChainProps = {
  route: Route;
  /** Under the current station: who holds it, e.g. "With you". */
  holder?: string;
  /** Under a future station: who will hold it, e.g. "Perth stock keeper". */
  futureSub?: (station: Station) => string | null;
  className?: string;
};

export function RouteChain({ route, holder, futureSub, className }: RouteChainProps) {
  // A rejected route stops at the cut: the stations after it never happen.
  const shown = route.rejected ? route.stations.slice(0, route.current + 1) : route.stations;
  const last = shown.length - 1;

  return (
    <ol aria-label="Route" className={cn("m-0 list-none p-0", className)}>
      {shown.map((s, i) => {
        const phase = phaseOf(s, route);
        const next = shown[i + 1];
        const nextReached = !!next && next.state !== "future";
        const transitIn = s.transit && s.state === "current";

        let sub: string | null = s.by;
        let date = shortDate(s.at);
        if (phase === "current") {
          sub = holder ?? null;
          date = "now";
        } else if (s.state === "cut" && route.rejected) {
          sub = [route.rejected.reason, route.rejected.by].filter(Boolean).join(" · ") || null;
        } else if (phase === "cut" && route.blocked) {
          sub = route.blocked;
          date = "now";
        } else if (phase === "future") {
          sub = futureSub?.(s) ?? null;
        }

        return (
          <li key={s.key + i} className="grid grid-cols-[1.375rem_minmax(0,1fr)_auto] gap-x-3">
            <div className="flex flex-col items-center" aria-hidden>
              <span
                className={cn("w-0", i === 0 ? "min-h-3" : "min-h-2.5 flex-1 border-l-[1.5px]")}
                style={
                  i === 0
                    ? undefined
                    : {
                        borderLeftStyle: transitIn ? "dashed" : "solid",
                        borderLeftColor: transitIn ? "var(--prog)" : phase === "future" ? "var(--strong)" : "var(--tx2)",
                      }
                }
              />
              {phase === "done" && (
                <Icon name="check_circle" size={15.5} fill className="leading-[1.125rem] text-tx2" />
              )}
              {phase === "current" && (
                <span className="my-px size-4 rounded-full border-[2.5px] border-prog bg-prog-bg" />
              )}
              {phase === "future" && (
                <span className="my-0.5 size-3.5 rounded-full border-2 border-strong bg-sheet" />
              )}
              {phase === "cut" && (
                <Icon
                  name={route.blocked ? "link_off" : "cancel"}
                  size={15.5}
                  fill={!route.blocked}
                  className="leading-[1.125rem] text-stop"
                />
              )}
              <span
                className={cn("w-0", i === last ? "min-h-1.5 flex-1" : "min-h-2.5 flex-1 border-l-[1.5px]")}
                style={i === last ? undefined : { borderLeftColor: nextReached ? "var(--tx2)" : "var(--strong)" }}
              />
            </div>
            <div className="min-w-0 py-3">
              <div
                className={cn(
                  "fs-12.5",
                  phase === "current" || phase === "cut" ? "font-semibold" : "font-medium",
                  phase === "future" ? "text-mut" : phase === "cut" ? "text-stop" : "text-tx"
                )}
              >
                {s.label}
                {phase === "current" && <span className="sr-only"> (current step)</span>}
              </div>
              {sub && <div className="mt-0.5 fs-11.5 text-mut">{sub}</div>}
            </div>
            <div
              className={cn(
                "py-3.25 fs-11 whitespace-nowrap",
                date === "now" ? (phase === "cut" ? "font-medium text-stop" : "font-medium text-prog") : "text-mut"
              )}
            >
              {date}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const MICRO: Record<Phase, string> = {
  done: "bg-tx2",
  current: "bg-prog",
  cut: "bg-stop",
  future: "border-[1.5px] border-strong",
};

export function RouteDots({ route, className }: { route: Route; className?: string }) {
  return (
    <span role="img" aria-label={describe(route)} className={cn("flex shrink-0 items-center gap-1", className)}>
      {route.stations.map((s, i) => (
        <span
          key={s.key + i}
          className={cn(
            "size-1.75 rounded-full",
            MICRO[phaseOf(s, route)],
            !!route.rejected && i > route.current && "opacity-45"
          )}
        />
      ))}
    </span>
  );
}
