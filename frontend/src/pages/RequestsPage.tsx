import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Inspector } from "@/components/ui/inspector";
import { useTourReady } from "@/components/tour/TourProvider";
import { queryClient } from "@/api/queryClient";
import { requestsQuery } from "@/api/queries";
import { markRequestSeen } from "@/api/requests";
import { notifySeenCleared } from "@/hooks/useActionCounts";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { needsMyAction } from "@/lib/permissions";
import { STAGE_META } from "@/lib/route";
import { LogToolbar } from "@/components/requests/LogToolbar";
import { ListFoot, ListHead, RequestList } from "@/components/requests/RequestList";
import { Docket, type Intent } from "@/components/requests/Docket";
import {
  ANY,
  inView,
  isException,
  matchesQuery,
  scopeLine,
  useRequestLog,
  VIEWS,
  type LogRow,
  type View,
} from "@/components/requests/useRequestLog";

///  +-----------------------------------------------------------------+
///  |                  REQUESTS                                       |
///  +-----------------------------------------------------------------+
//
//  The request log, where every role works the queue: admins all day,
//  managers from an email, requesters to see where their thing is up to.
//
//  DESKTOP (1100 design px up): the list on the left, the selected
//  request's docket docked on the right, j and k to move between rows.
//  Below that, cards, and the docket slides over them.
//
//  THE URL carries the view, stage, site and search, so a link (or Back)
//  lands where it was. ?status= is the older form, still honoured: Home's
//  count tiles and saved links use it. ?requestId= pins the list to one
//  request and opens it, which is what every notification email links to.
///  +-----------------------------------------------------------------+

const VIEW_KEYS = new Set<string>(VIEWS.map((v) => v.key));

/** An older ?status= link, as a view and a stage. */
function fromStatus(status: string | null): { view: View; stage: string } | null {
  if (!status) return null;
  if (status === "NEEDS_ME") return { view: "needs", stage: ANY };
  if (status === "IN_PROGRESS") return { view: "flight", stage: ANY };
  if (status === "DONE" || status === "COMPLETED") return { view: "done", stage: ANY };
  if (status === "REJECTED") return { view: "rejected", stage: ANY };
  if (status === "ALL") return { view: "all", stage: ANY };
  if (status in STAGE_META) return { view: "all", stage: status };
  return null;
}

export default function RequestsPage() {
  const log = useRequestLog();
  const { viewer } = log;
  const desk = useMediaQuery("(min-width: 55rem)");
  useTourReady(!log.loading);

  const [params, setParams] = useSearchParams();
  const seeded = fromStatus(params.get("status"));
  const [viewChoice, setViewChoice] = useState<View | null>(() => {
    const v = params.get("view");
    if (v && VIEW_KEYS.has(v)) return v as View;
    return seeded?.view ?? null;
  });
  const [stage, setStage] = useState(() => {
    const s = params.get("stage");
    return s && s in STAGE_META ? s : seeded?.stage ?? ANY;
  });
  const [site, setSite] = useState(() => params.get("site") ?? ANY);
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [pin, setPin] = useState<number | null>(() => {
    const n = Number(params.get("requestId"));
    return Number.isInteger(n) && n > 0 ? n : null;
  });
  const [newestFirst, setNewestFirst] = useState(true);

  const [sel, setSel] = useState<number | null>(pin);
  const [intent, setIntent] = useState<Intent>("look");
  // A fresh docket each time a row's action is pressed, even on the same row.
  const [nonce, setNonce] = useState(0);
  const [flash, setFlash] = useState<number | null>(null);
  // Rows acted on from "Needs you" stay put until the view changes, so the
  // row someone just worked doesn't vanish from under them.
  const [keep, setKeep] = useState<number[]>([]);

  const needs = useMemo(() => log.rows.filter((x) => x.mine), [log.rows]);

  // Role-aware landing: "Needs you" when something does, else everything.
  if (viewChoice === null && !log.loading) setViewChoice(needs.length > 0 ? "needs" : "all");
  const view = viewChoice ?? "needs";

  // Keep the URL in step, replacing rather than pushing: filters aren't pages.
  useEffect(() => {
    const next = new URLSearchParams();
    if (viewChoice) next.set("view", viewChoice);
    if (stage !== ANY) next.set("stage", stage);
    if (site !== ANY) next.set("site", site);
    if (q) next.set("q", q);
    if (pin != null) next.set("requestId", String(pin));
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [viewChoice, stage, site, q, pin, params, setParams]);

  const list = useMemo(() => {
    const words = q.trim();
    const out = log.rows.filter(
      (x) =>
        (pin == null || x.r.id === pin) &&
        (pin != null || inView(x, view) || (view === "needs" && keep.includes(x.r.id))) &&
        (stage === ANY || x.route.stage === stage) &&
        (site === ANY || String(x.r.userLocationId ?? "") === site) &&
        matchesQuery(x, words)
    );
    out.sort((a, b) => (newestFirst ? b.r.createdAt.localeCompare(a.r.createdAt) : a.r.createdAt.localeCompare(b.r.createdAt)));
    return out;
  }, [log.rows, pin, view, keep, stage, site, q, newestFirst]);

  // On a desk the docket is never empty while there's a list to show.
  const shownId = sel ?? (desk ? list[0]?.r.id ?? null : null);
  const selected = shownId == null ? null : log.rows.find((x) => x.r.id === shownId) ?? null;

  function markSeen(row: LogRow) {
    const r = row.r;
    if (r.seenByMe) return;
    const counted = needsMyAction(r, viewer.role, viewer.userId, viewer.name);
    queryClient.setQueryData(requestsQuery.queryKey, (prev) =>
      prev?.map((x) => (x.id === r.id ? { ...x, seenByMe: true } : x))
    );
    void markRequestSeen(r.id);
    if (counted) notifySeenCleared();
  }

  function open(row: LogRow, how: Intent = "look") {
    setSel(row.r.id);
    setIntent(how);
    setNonce((n) => n + 1);
    markSeen(row);
  }

  // The pinned request opens once it's loaded.
  const pinOpened = useRef(false);
  useEffect(() => {
    if (pin == null || pinOpened.current) return;
    const row = log.rows.find((x) => x.r.id === pin);
    if (!row) return;
    pinOpened.current = true;
    markSeen(row);
    // markSeen only touches the cache and the server; it needs the row once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, log.rows]);

  // j / k move through the list, as in the designs.
  useEffect(() => {
    if (!desk) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "j" && e.key !== "k") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]")) return;
      const rows = list;
      if (!rows.length) return;
      const i = rows.findIndex((x) => x.r.id === shownId);
      const n = e.key === "j" ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
      const row = rows[n < 0 ? 0 : n];
      open(row);
      document.querySelector(`[data-id="${row.r.id}"]`)?.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // open() reads only stable setters and the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk, shownId, list]);

  function landed(id: number) {
    setKeep((k) => (k.includes(id) ? k : [...k, id]));
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  }

  function changeView(v: View) {
    setViewChoice(v);
    setKeep([]);
  }

  function showAll() {
    setViewChoice("all");
    setStage(ANY);
    setSite(ANY);
    setQ("");
    setPin(null);
  }

  const exceptions = viewer.role === "ADMIN" ? log.rows.filter(isException).length : 0;
  const filtered = q.trim() !== "" || stage !== ANY || site !== ANY;
  const empty =
    view === "needs" && !filtered && pin == null
      ? { title: "Nothing needs you", text: "You're all caught up.", onShowAll: showAll }
      : { title: "No requests match", text: "Try another view or clear the search.", onShowAll: showAll };

  // The floating docket keeps its last request while it slides away.
  const [lastSelected, setLastSelected] = useState(selected);
  if (selected && selected !== lastSelected) setLastSelected(selected);
  const docketRow = selected ?? (desk ? null : lastSelected);

  const docket = docketRow && (
    <Docket key={`${docketRow.r.id}:${nonce}`} row={docketRow} viewer={viewer} intent={intent} onLanded={landed} />
  );

  return (
    <div
      data-tour-region="requests"
      className={cn(
        "grid min-w-0",
        desk && "h-full min-h-0 grid-cols-[minmax(44.5625rem,1.44fr)_minmax(0,1fr)] min-[70rem]:grid-cols-[minmax(0,70.0625rem)_minmax(30rem,1fr)]"
      )}
    >
      <div
        className={cn(
          "relative flex min-w-0 flex-col gap-3.5 bg-subtle",
          desk
            ? "z-2 min-h-0 border-r border-line pt-5.5 pr-5 pb-5 pl-6 shadow-[3px_0_8px_var(--shade)] [clip-path:inset(0_-2rem_0_0)]"
            : "px-3 pt-4 pb-6 phone:px-6"
        )}
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="m-0 font-head fs-21 font-medium tracking-head">Requests</h1>
            <p className="m-0 mt-0.75 fs-13 text-mut">{scopeLine(viewer)}</p>
          </div>
          {exceptions > 0 && (
            <span className="flex items-center gap-1.5 pb-0.5 fs-13 text-tx3" title="Blocked, location missing, check-in failed or overdue">
              <Icon name="error" size={17} weight={300} className="text-stop" />
              {exceptions} {exceptions === 1 ? "exception" : "exceptions"}
            </span>
          )}
        </div>

        <LogToolbar
          view={view}
          onView={changeView}
          needsCount={needs.length}
          site={site}
          onSite={setSite}
          sites={log.sites}
          stage={stage}
          onStage={setStage}
          q={q}
          onQ={setQ}
        />

        {pin != null && (
          <div className="flex items-center gap-2 rounded-9 bg-brand-sub px-3 py-2 fs-13 text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]">
            <Icon name="push_pin" size={16} />
            <span className="flex-1">Showing request #{pin} only.</span>
            <Button variant="link" size="sm" className="fs-13" onClick={() => setPin(null)}>
              Show all requests
            </Button>
          </div>
        )}

        {log.error ? (
          <div role="alert" className="flex flex-col items-center gap-2 rounded-12 border border-line bg-sheet px-6 py-12 text-center">
            <div className="fs-14 font-medium">Couldn't load requests</div>
            <div className="fs-13 text-mut">Check your connection and try again.</div>
            <Button variant="secondary" size="sm" className="mt-2 h-8 px-3 fs-13" onClick={log.retry}>
              Try again
            </Button>
          </div>
        ) : (
          <div
            data-tour="requests-table"
            className={cn(
              "flex flex-col",
              desk && "min-h-0 flex-1 overflow-hidden rounded-12 border border-line bg-sheet"
            )}
          >
            {desk && <ListHead newestFirst={newestFirst} onSort={() => setNewestFirst((v) => !v)} />}
            <div role={desk ? "table" : undefined} aria-label="Requests" className={cn(desk && "min-h-0 flex-1 overflow-auto")}>
              <RequestList
                rows={list}
                contentKey={[view, stage, site, q.trim(), pin, newestFirst].join("|")}
                selected={desk ? shownId : null}
                flash={flash}
                loading={log.loading}
                phone={!desk}
                onOpen={(row) => open(row)}
                onAct={(row) => open(row, "act")}
                empty={empty}
              />
            </div>
            {desk && <ListFoot shown={list.length} total={log.rows.length} desk />}
          </div>
        )}
      </div>

      {desk ? (
        <div className="min-h-0 min-w-0 overflow-auto bg-canvas bg-[radial-gradient(var(--dot)_0.0625rem,transparent_0.0625rem)] bg-size-[1rem_1rem] px-6 pt-5 pb-6 [zoom:1.2]">
          {docket ?? (
            <div className="grid h-full place-items-center fs-13 text-mut">
              {log.loading ? "" : "Pick a request to see its docket."}
            </div>
          )}
        </div>
      ) : (
        <Inspector
          open={sel != null && !!selected}
          onClose={() => setSel(null)}
          label={docketRow ? `Request #${docketRow.r.id}` : "Request"}
          backLabel="Requests"
          className="bg-canvas"
        >
          {docket}
        </Inspector>
      )}
    </div>
  );
}
