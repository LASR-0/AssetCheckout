import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { RouteRail } from "@/components/ui/route-rail";
import { kindAccent, requestTitle } from "@/lib/requestDisplay";
import { dayDate } from "@/lib/format";
import { formatStartShort, isStartPending } from "@/lib/startDate";
import { deriveLoanStage } from "@/lib/stage";
import { daysSince } from "@/components/requests/copy";
import type { LogRow } from "@/components/requests/useRequestLog";
import { handSince, type Queues as QueueSet } from "./useStock";

///  +-----------------------------------------------------------------+
///  |                  THE THREE QUEUES                               |
///  +-----------------------------------------------------------------+
//
//  What's waiting at this site, in the order a keeper works it: hand it
//  over, wait for them to collect it, chase the loans that are due back.
//  Shared across assets and accessories, and they never switch.
//
//  Each row carries a micro rail, where it's up to, and how long it has
//  been waiting: quietly more urgent with age. An overdue loan is the one
//  loud thing on the page.
///  +-----------------------------------------------------------------+

const EDGE = { id1: "bg-id1", id2: "bg-id2", id3: "bg-id3", id4: "bg-id4" } as const;

const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);

type Kind = "hand" | "ready" | "loans";

type Props = {
  queues: QueueSet;
  /** Rows the viewer may act on (their site, or an admin anywhere). */
  canAct: boolean;
  /** In flight: the row's button becomes its progress. */
  pending: Record<number, string>;
  flash: number | null;
  selected: number | null;
  phone: boolean;
  onOpen: (row: LogRow) => void;
  onAct: (row: LogRow, kind: Kind) => void;
};

function Chip({ tone, icon, fill, children }: { tone: "brand" | "stop" | "neutral"; icon: string; fill?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-6 pr-1.75 pl-1.25 fs-11.5",
        tone === "brand" && "bg-brand-sub font-medium text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]",
        tone === "stop" && "bg-stop-bg font-semibold text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]",
        tone === "neutral" && "rounded-pill bg-track pr-2 pl-1.5 text-tx2"
      )}
    >
      <Icon name={icon} size={13} fill={fill} weight={fill ? 400 : 300} />
      {children}
    </span>
  );
}

function Row({ row, kind, canAct, pending, flash, selected, phone, onOpen, onAct }: { row: LogRow; kind: Kind } & Omit<Props, "queues" | "flash" | "selected"> & { flash: boolean; selected: boolean }) {
  const r = row.r;
  const shipping = kind === "hand" && !!r.needsShipping;
  const overdue = kind === "loans" && r.loan ? daysSince(r.loan.endDate) : 0;
  const isOver = kind === "loans" && !!r.loan && deriveLoanStage(r.loan) === "OVERDUE";

  let station: string;
  let age: string;
  let tone = "text-mut";
  let action: { label: string; icon: string } | null = null;
  if (kind === "hand") {
    station = shipping ? "On its way to you" : "Getting it ready";
    const d = daysSince(handSince(row));
    age = d === 0 ? "Since today" : `Waiting ${days(d)}`;
    tone = d >= 5 ? "font-medium text-prog" : d >= 2 ? "text-tx2" : "text-mut";
    action = { label: "Mark ready", icon: shipping ? "inventory" : "storefront" };
  } else if (kind === "ready") {
    station = "Waiting for collection";
    const d = daysSince(r.collectionReadyAt ?? null);
    age = d === 0 ? "Ready today" : `Ready ${days(d)} ago`;
  } else {
    const due = dayDate(r.loan?.endDate);
    station = `Due back ${due}`;
    age = isOver ? `Due ${due}` : "Due today";
    action = { label: "Mark returned", icon: "assignment_return" };
  }

  const busy = pending[r.id];
  const act = (e: MouseEvent) => {
    e.stopPropagation();
    onAct(row, kind);
  };
  const start = kind !== "loans" && r.startDate && isStartPending(r.startDate) ? formatStartShort(r.startDate) : null;
  const track = shipping ? r.trackingCode : null;
  const showMeta = !!start || !!track || isOver || kind === "ready";

  const button =
    action && canAct ? (
      busy ? (
        <span
          role="status"
          className={cn(
            "inline-flex cursor-progress items-center justify-center gap-1.5 rounded-8 bg-track font-medium whitespace-nowrap text-tx3",
            phone ? "h-11 w-full fs-14" : "h-7.5 pr-2.5 pl-2 fs-12.5"
          )}
        >
          <Icon name="hourglass_top" size={16} />
          {busy}
        </span>
      ) : (
        <button
          type="button"
          onClick={act}
          className={cn(
            "inline-flex cursor-pointer items-center justify-center gap-1.5 border border-brand-line bg-brand-sub font-sans font-medium whitespace-nowrap text-brand-tx transition-colors outline-none hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
            phone ? "h-11 w-full rounded-10 fs-14" : "h-7.5 rounded-8 pr-2.5 pl-2 fs-12.5"
          )}
        >
          <Icon name={action.icon} size={phone ? 18 : 16} />
          {action.label}
        </button>
      )
    ) : null;

  return (
    <div
      role="listitem"
      data-id={r.id}
      onClick={() => onOpen(row)}
      className={cn(
        "relative flex cursor-pointer flex-col gap-2.5 border-b border-line2 py-3 pr-3.5 pl-4 transition-colors duration-700 last:border-b-0 hover:bg-subtle",
        flash ? "bg-ok-bg" : selected && "bg-brand-sub shadow-[inset_0_0_0_1px_var(--brand-line)] hover:bg-brand-sub"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.75", EDGE[kindAccent(r)])} />
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.25">
          <div className="flex min-w-0 items-baseline gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(row);
              }}
              className="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans fs-13.5 font-medium text-tx outline-none focus-visible:underline"
            >
              {requestTitle(r)}
            </button>
            <span className="flex-none font-mono fs-11.5 text-mut">#{r.id}</span>
          </div>
          <div className="flex min-w-0 items-center gap-2 fs-12.5 whitespace-nowrap text-tx3">
            <span className="flex-none">{r.userName}</span>
            <RouteRail route={row.route} hideLabel stationWidth="0.8125rem" className="flex-none" />
            <span className={cn("min-w-0 truncate fs-12 font-medium", isOver ? "text-stop" : "text-tx2")}>{station}</span>
          </div>
          {showMeta && (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 fs-12 text-mut">
              {start && (
                <Chip tone="brand" icon="event">
                  Starts {start}
                </Chip>
              )}
              {track && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="local_shipping" size={14} weight={300} />
                  <span className="font-mono fs-11.5 text-tx3">{track}</span>
                </span>
              )}
              {isOver && (
                <Chip tone="stop" icon="error" fill>
                  Overdue {days(overdue)}
                </Chip>
              )}
              {kind === "ready" && (
                <Chip tone="neutral" icon="person">
                  With {r.userName} · to collect
                </Chip>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-none flex-col items-end gap-1.75">
          <span className={cn("fs-12 whitespace-nowrap", isOver ? "text-mut" : tone)}>{age}</span>
          {!phone && button}
        </div>
      </div>
      {phone && button}
    </div>
  );
}

const QUEUES: { kind: Kind; title: string; icon: string; empty: string }[] = [
  { kind: "hand", title: "Waiting for you to hand over", icon: "front_hand", empty: "Nothing waiting — everything at this site has been handed over." },
  { kind: "ready", title: "Handed over, not yet collected", icon: "hourglass_top", empty: "Nothing waiting to be picked up." },
  { kind: "loans", title: "Loans due back", icon: "event_repeat", empty: "No loans are due back." },
];

export function Queues(props: Props) {
  const { queues } = props;
  const overdue = queues.loans.filter((x) => x.r.loan && deriveLoanStage(x.r.loan) === "OVERDUE").length;
  return (
    <>
      {QUEUES.map((q) => {
        const rows = queues[q.kind];
        return (
          <section key={q.kind} aria-label={q.title} data-tour={`stock-${q.kind}`} className="flex-none rounded-14 bg-tray p-0.75">
            <div className="flex items-center gap-2 px-2.5 pt-1.75 pb-1.5">
              <Icon name={q.icon} size={15} weight={300} className="text-mut" />
              <h2 className="m-0 flex-1 font-title fs-10.5 font-medium tracking-label text-tx3 uppercase">{q.title}</h2>
              {q.kind === "loans" && overdue > 0 && (
                <span className="inline-flex items-center gap-0.75 fs-12 font-semibold text-stop">
                  <Icon name="error" size={15} fill />
                  {overdue} overdue
                </span>
              )}
              {rows.length > 0 && <span className="fs-12 text-mut">{rows.length}</span>}
            </div>
            <div role="list" className="overflow-hidden rounded-11 border border-line bg-sheet">
              {rows.length === 0 ? (
                <p className="m-0 px-3.5 py-4 fs-13 leading-normal text-pretty text-mut">{q.empty}</p>
              ) : (
                rows.map((row) => (
                  <Row
                    key={row.r.id}
                    row={row}
                    kind={q.kind}
                    canAct={props.canAct}
                    pending={props.pending}
                    flash={props.flash === row.r.id}
                    selected={props.selected === row.r.id}
                    phone={props.phone}
                    onOpen={props.onOpen}
                    onAct={props.onAct}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
      <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 px-1 fs-12 text-mut">
        {(
          [
            ["bg-id1", "Standard"],
            ["bg-id2", "Non-standard"],
            ["bg-id4", "Loan"],
          ] as const
        ).map(([bg, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-3.5 w-0.75 rounded-2", bg)} />
            {label}
          </span>
        ))}
      </div>
    </>
  );
}

export type { Kind as QueueKind };
