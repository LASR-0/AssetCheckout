import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { StateChip } from "@/components/ui/pills";
import { stageMeta } from "@/lib/route";
import { kindAccent, kindLabel, requestTitle } from "@/lib/requestDisplay";
import { shortDate } from "@/lib/format";
import type { LogRow } from "./useRequestLog";

///  +-----------------------------------------------------------------+
///  |                  THE LIST                                       |
///  +-----------------------------------------------------------------+
//
//  A table on desktop, cards on a phone: what it is, who it's for, its
//  stage, whose move it is, and when it was filed. Two lines per cell at
//  most; everything else is one click away in the docket.
//
//  The row's left edge is the kind's colour. A purple dot before it means
//  new to you and waiting on you (the nav badge's rule). Where the move is
//  yours, the row offers it as a button that opens the step in the docket.
//
//  ONE CONTINUOUS LIST, rendered a page at a time as it scrolls, so "All"
//  on a long-running install stays quick without a pager.
///  +-----------------------------------------------------------------+

const PAGE = 80;

const EDGE = { id1: "bg-id1", id2: "bg-id2", id3: "bg-id3", id4: "bg-id4" } as const;

/** The desktop columns: marker, request, requester, stage, whose move, filed. */
export const COLS = "grid-cols-[0.5rem_minmax(0,1fr)_7.25rem_8.25rem_11.5rem_2.75rem]";

type Props = {
  rows: LogRow[];
  /** Changes when what's listed changes (view, filters, sort): the rows
   *  remount and cascade in again. */
  contentKey: string;
  selected: number | null;
  /** Briefly tinted green after an action lands. */
  flash: number | null;
  loading: boolean;
  onOpen: (row: LogRow) => void;
  onAct: (row: LogRow) => void;
  empty: { title: string; text: string; onShowAll: (() => void) | null };
};

function KindDot({ row, className }: { row: LogRow; className?: string }) {
  return <span aria-hidden className={cn("size-1.75 shrink-0 rounded-2", EDGE[kindAccent(row.r)], className)} />;
}

function UnseenDot({ on }: { on: boolean }) {
  return (
    <span
      aria-label={on ? "New, waiting on you" : undefined}
      className={cn("relative size-1.75 rounded-full", on ? "bg-brand" : "bg-transparent")}
    />
  );
}

function Stage({ row }: { row: LogRow }) {
  const m = stageMeta(row.route.stage);
  return (
    <StateChip intent={m.intent} icon={m.icon} className="h-5.5 max-w-full overflow-hidden rounded-6 fs-12">
      <span className="truncate">{m.label}</span>
    </StateChip>
  );
}

/** Whose move: the viewer's action, who else has it, or how it ended. */
function Move({ row, onAct, phone }: { row: LogRow; onAct: (e: MouseEvent) => void; phone?: boolean }) {
  if (row.mine && row.action) {
    return (
      <button
        type="button"
        onClick={onAct}
        data-tour={row.action === "Approve" ? "requests-approve" : "requests-row-actions"}
        className={cn(
          "inline-flex cursor-pointer items-center gap-1.5 rounded-8 border border-brand-line bg-brand-sub font-sans font-medium whitespace-nowrap text-brand-tx transition-colors outline-none hover:border-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
          phone ? "h-11 w-full justify-center rounded-10 fs-14" : "h-7.5 pr-2.5 pl-2 fs-12.5"
        )}
      >
        <Icon name="front_hand" size={phone ? 18 : 16} />
        {row.action}
      </button>
    );
  }
  if (row.holder) {
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1.25 overflow-hidden rounded-pill bg-track pr-2.5 whitespace-nowrap text-tx2",
          phone ? "h-6.5 self-start pl-2 fs-12.5" : "h-6 pl-1.75 fs-12"
        )}
      >
        <Icon name={row.holder.icon} size={15} weight={300} />
        <span className="truncate">
          {row.holder.label}
          <span className="text-mut">{row.holder.detail}</span>
        </span>
      </span>
    );
  }
  const rejected = row.route.rejected;
  const last = row.route.stations.at(-1);
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.25 fs-12 whitespace-nowrap", rejected ? "text-stop" : "text-ok")}>
      <Icon name={rejected ? "cancel" : "check_circle"} size={16} fill />
      <span className="truncate">
        {rejected
          ? `Rejected${rejected.reason ? ` · ${rejected.reason}` : ""}`
          : `${stageMeta(row.route.stage).label} · ${shortDate(last?.at ?? row.r.createdAt)}`}
      </span>
    </span>
  );
}

function FlagNote({ row, className }: { row: LogRow; className?: string }) {
  if (!row.flag) return null;
  return (
    <span
      title={row.flag.text}
      className={cn("inline-flex min-w-0 items-center gap-0.75 overflow-hidden", row.flag.alert ? "text-stop" : "text-tx3", className)}
    >
      <Icon name={row.flag.icon} size={14} weight={300} className="shrink-0" />
      <span className="truncate">{row.flag.text}</span>
    </span>
  );
}

function DeskRow({ row, index, selected, flash, onOpen, onAct }: { row: LogRow; index: number; selected: boolean; flash: boolean } & Pick<Props, "onOpen" | "onAct">) {
  const r = row.r;
  return (
    <div
      role="row"
      aria-selected={selected}
      data-id={r.id}
      onClick={() => onOpen(row)}
      style={rowIn(index)}
      className={cn(
        "relative grid h-14 cursor-pointer items-center gap-x-3 border-b border-line2 pr-3.5 pl-4 transition-colors duration-700 hover:bg-subtle",
        ROW_IN,
        COLS,
        flash ? "bg-ok-bg" : selected && "bg-brand-sub/60 shadow-[inset_0_0_0_1px_var(--brand-line)] hover:bg-brand-sub/60"
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.75", EDGE[kindAccent(r)])} />
      <UnseenDot on={row.unseen} />
      <div role="cell" className="min-w-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(row);
          }}
          className="block max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans fs-13.5 font-medium text-tx outline-none focus-visible:underline"
        >
          {requestTitle(r)}
        </button>
        <div className="mt-0.5 flex items-center gap-1.5 fs-12 whitespace-nowrap text-mut">
          <span className="font-mono fs-11.5">#{r.id}</span>
          <KindDot row={row} />
          <span className="truncate">{kindLabel(r)}</span>
        </div>
      </div>
      <div role="cell" className="min-w-0">
        <div className="truncate fs-13">{r.userName}</div>
        <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden fs-12 whitespace-nowrap text-mut">
          <span className="shrink-0">{r.userLocationName?.trim() || "No site"}</span>
          <FlagNote row={row} />
        </div>
      </div>
      <div role="cell" className="flex min-w-0">
        <Stage row={row} />
      </div>
      <div role="cell" className="flex min-w-0 items-center">
        <Move
          row={row}
          onAct={(e) => {
            e.stopPropagation();
            onAct(row);
          }}
        />
      </div>
      <span role="cell" className="fs-12 whitespace-nowrap text-mut">
        {shortDate(r.createdAt)}
      </span>
    </div>
  );
}

function PhoneCard({ row, index, onOpen, onAct }: { row: LogRow; index: number } & Pick<Props, "onOpen" | "onAct">) {
  const r = row.r;
  return (
    <div
      role="listitem"
      onClick={() => onOpen(row)}
      style={rowIn(index)}
      className={cn("relative flex cursor-pointer flex-col gap-2.5 overflow-hidden rounded-12 border border-line bg-sheet py-3 pr-3 pl-4 active:bg-subtle", ROW_IN)}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.75", EDGE[kindAccent(r)])} />
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 fs-15 font-medium">
            <UnseenDot on={row.unseen} />
            <span className="truncate">{requestTitle(r)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 overflow-hidden fs-12.5 whitespace-nowrap text-mut">
            <span className="font-mono fs-12">#{r.id}</span>
            <KindDot row={row} />
            <span className="truncate">{kindLabel(r)}</span>
          </div>
        </div>
        <Stage row={row} />
      </div>
      <div className="flex items-center gap-1.5 overflow-hidden fs-13 whitespace-nowrap text-tx2">
        {r.userName}
        <span className="text-mut">· {r.userLocationName?.trim() || "No site"}</span>
        <FlagNote row={row} className="fs-12" />
      </div>
      <Move
        row={row}
        phone
        onAct={(e) => {
          e.stopPropagation();
          onAct(row);
        }}
      />
    </div>
  );
}

function Skeleton({ phone }: { phone: boolean }) {
  return (
    <div aria-hidden className={phone ? "flex flex-col gap-2" : undefined}>
      {Array.from({ length: phone ? 4 : 8 }, (_, i) =>
        phone ? (
          <div key={i} className="h-30 animate-pulse rounded-12 border border-line bg-sheet" />
        ) : (
          <div key={i} className={cn("grid h-14 items-center gap-x-3 border-b border-line2 pr-3.5 pl-4", COLS)}>
            <span />
            <span className="flex flex-col gap-1.5">
              <span className="h-3 w-2/5 animate-pulse rounded-4 bg-track" />
              <span className="h-2.5 w-1/4 animate-pulse rounded-4 bg-track" />
            </span>
            <span className="h-3 w-3/4 animate-pulse rounded-4 bg-track" />
            <span className="h-5 w-4/5 animate-pulse rounded-6 bg-track" />
            <span className="h-6 w-3/5 animate-pulse rounded-pill bg-track" />
            <span className="h-3 animate-pulse rounded-4 bg-track" />
          </div>
        )
      )}
    </div>
  );
}

export function RequestList({ rows, contentKey, selected, flash, loading, onOpen, onAct, empty, phone }: Props & { phone: boolean }) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  // A new filter starts from the top page again.
  const [lastRows, setLastRows] = useState(rows);
  if (rows !== lastRows) {
    setLastRows(rows);
    if (rows.length < lastRows.length || rows[0] !== lastRows[0]) setLimit(PAGE);
  }

  // Keep the selected row rendered, wherever j/k took it.
  const selIndex = selected == null ? -1 : rows.findIndex((x) => x.r.id === selected);
  const shown = Math.max(limit, selIndex + 1);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((n) => n + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rows.length]);

  if (loading) return <Skeleton phone={phone} />;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 px-6 py-14 text-center">
        <div className="fs-14 font-medium">{empty.title}</div>
        <div className="fs-13 text-mut">{empty.text}</div>
        {empty.onShowAll && (
          <Button variant="secondary" size="sm" className="mt-2.5 h-8 px-3 fs-13" onClick={empty.onShowAll}>
            Show all requests
          </Button>
        )}
      </div>
    );
  }

  const visible = rows.slice(0, shown);
  return (
    <>
      {phone ? (
        <div key={contentKey} role="list" className="flex flex-col gap-2 pt-0.5 pb-4">
          {visible.map((row, i) => (
            // Each page of rows cascades from its own start as it's added.
            <PhoneCard key={row.r.id} row={row} index={i % PAGE} onOpen={onOpen} onAct={onAct} />
          ))}
        </div>
      ) : (
        <div key={contentKey} role="rowgroup">
          {visible.map((row, i) => (
            <DeskRow
              key={row.r.id}
              row={row}
              index={i % PAGE}
              selected={row.r.id === selected}
              flash={row.r.id === flash}
              onOpen={onOpen}
              onAct={onAct}
            />
          ))}
        </div>
      )}
      {shown < rows.length && <div ref={sentinel} className="h-px" />}
    </>
  );
}

/** Column headings for the desktop table. */
export function ListHead({ newestFirst, onSort }: { newestFirst: boolean; onSort: () => void }) {
  const H = "flex items-center gap-1.25";
  return (
    <div role="row" className={cn("grid h-8.5 flex-none items-center gap-x-3 border-b border-line2 bg-subtle pr-3.5 pl-4 fs-12 text-mut", COLS)}>
      <span />
      <span role="columnheader" className={H}>
        <Icon name="inventory_2" size={15} />
        Request
      </span>
      <span role="columnheader" className={H}>
        <Icon name="person" size={15} />
        Requester
      </span>
      <span role="columnheader" className={H}>
        <Icon name="route" size={15} />
        Stage
      </span>
      <span role="columnheader" data-tour="requests-actions-header" className={H}>
        <Icon name="front_hand" size={15} />
        Whose move
      </span>
      <button
        type="button"
        role="columnheader"
        aria-sort={newestFirst ? "descending" : "ascending"}
        onClick={onSort}
        title={newestFirst ? "Newest first" : "Oldest first"}
        className="flex cursor-pointer items-center gap-0.5 border-0 bg-transparent p-0 font-sans fs-12 text-mut hover:text-tx"
      >
        Filed
        <Icon name={newestFirst ? "arrow_downward" : "arrow_upward"} size={14} />
      </button>
    </div>
  );
}

/** The kind legend and the count, under the list. */
export function ListFoot({ shown, total, desk }: { shown: number; total: number; desk: boolean }) {
  const KINDS = [
    ["bg-id1", "Standard"],
    ["bg-id2", "Non-standard"],
    ["bg-id3", "Correction"],
    ["bg-id4", "Loan"],
  ] as const;
  return (
    <div className="flex min-h-10 flex-none flex-wrap items-center justify-between gap-x-3.5 gap-y-1.5 border-t border-line2 px-3.5 py-2 fs-12 text-mut">
      <span className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        {KINDS.map(([bg, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span aria-hidden className={cn("h-3.5 w-0.75 rounded-2", bg)} />
            {label}
          </span>
        ))}
      </span>
      <span className="flex items-center gap-3.5">
        {desk && (
          <span>
            <kbd className="font-mono">j</kbd> <kbd className="font-mono">k</kbd> move
          </span>
        )}
        <span>
          {shown} of {total}
        </span>
      </span>
    </div>
  );
}
