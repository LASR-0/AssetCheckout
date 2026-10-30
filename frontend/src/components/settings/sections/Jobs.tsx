import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented";
import { Modal, ModalBody, ModalFooter, ModalTitle } from "@/components/ui/modal";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { btn } from "@/components/ui/variants";
import {
  capexLogQuery,
  dryRunStatesQuery,
  jobHistoryQuery,
  jobSchedulesQuery,
  latestJobsQuery,
  maxDeletesQuery,
  sharepointSyncQuery,
  shipReminderQuery,
} from "@/api/queries";
import {
  enqueueJob,
  saveJobSchedule,
  saveReminderThresholds,
  setDryRun,
  setMaxDeletes,
  type BackgroundJob,
  type JobStatus as RunStatus,
  type JobType,
  type ReminderThresholds,
} from "@/api/jobs";
import { setCapexLogEnabled, setSharepointSyncEnabled } from "@/api/sharepoint";
import { HOUR_INTERVALS, MINUTE_INTERVALS, cronFromSchedule, scheduleFromCron, type ScheduleSpec } from "@/lib/schedule";
import { Pill, SaveNote, Section, Sheet, SnipeDown, type Tone } from "../parts";
import { Panel } from "../SettingsPanel";
import { draftChip, useSave } from "../saveStatus";
import {
  JOBS,
  JOBS_LAYOUT_KEY,
  JOB_NAMES,
  nextRun,
  plainSchedule,
  plainSpec,
  runNote,
  runTook,
  runsBetween,
  statusOf,
  whenAgo,
  whenAt,
  whenIn,
  type JobDef,
  type JobStatus,
} from "../jobCatalog";

///  +-----------------------------------------------------------------+
///  |                  JOBS & INTEGRATIONS                            |
///  +-----------------------------------------------------------------+
//
//  The background jobs as an operations view: what's failed or running
//  first, what runs in the next 24 hours, and every job's last run. Two
//  layouts (an ops board, or one timeline row per job), remembered per
//  browser. A job's schedule and its extras (dry run, delete cap, reminder
//  thresholds) open on the right.
//
//  SCHEDULES APPLY ON THE NEXT RESTART: they're registered once at startup,
//  so the panel says so. Thresholds and the dry-run switch apply at once.
//
//  GOING LIVE ASKS YOU TO TYPE LIVE. A live cleanup deletes Snipe-IT models
//  for real, so switching to it (or raising how many one run may delete)
//  is the one save that needs more than a click.
///  +-----------------------------------------------------------------+

const STATUS: Record<JobStatus, { label: string; icon: string; tone: Tone; text: string }> = {
  running: { label: "Running", icon: "progress_activity", tone: "prog", text: "text-prog" },
  failed: { label: "Failed", icon: "error", tone: "stop", text: "text-stop" },
  ok: { label: "Healthy", icon: "check_circle", tone: "ok", text: "text-ok" },
  idle: { label: "Not run yet", icon: "radio_button_unchecked", tone: "neut", text: "text-tx3" },
};
const RANK: Record<JobStatus, number> = { failed: 0, running: 1, ok: 2, idle: 3 };

function StatusMark({ status, small }: { status: JobStatus; small?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.25", s.text)}>
      <Icon name={s.icon} size={16} className={status === "running" ? "animate-spin motion-reduce:animate-none" : undefined} />
      {!small && <span className="fs-10.5 font-medium">{s.label}</span>}
    </span>
  );
}

/** A clock for "in 12 min", ticking once a minute. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

type Row = {
  def: JobDef;
  cron: string | undefined;
  settingKey: string | undefined;
  latest: BackgroundJob | undefined;
  status: JobStatus;
  next: Date | null;
  ticks: Date[];
  live: boolean;
  dry: boolean;
};

export function Jobs() {
  const client = useQueryClient();
  const now = useNow();
  const schedules = useQuery(jobSchedulesQuery);
  const dry = useQuery(dryRunStatesQuery);
  const latest = useQuery({
    ...latestJobsQuery,
    // While anything is queued or running, look again every few seconds.
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "Running" || j.status === "Pending") ? 4000 : false),
  });

  const [layout, setLayout] = useState<"board" | "rows">(() => {
    try {
      return localStorage.getItem(JOBS_LAYOUT_KEY) === "rows" ? "rows" : "board";
    } catch {
      return "board";
    }
  });
  const pickLayout = (l: "board" | "rows") => {
    setLayout(l);
    try {
      localStorage.setItem(JOBS_LAYOUT_KEY, l);
    } catch {
      // Not remembered in a private window; the choice still applies.
    }
  };

  const rows: Row[] = useMemo(
    () =>
      JOBS.map((def) => {
        const sch = schedules.data?.find((s) => s.jobType === def.type);
        const cron = sch?.cron || undefined;
        const last = latest.data?.find((j) => j.type === def.type);
        const deletes = !!def.deletes;
        const isDry = dry.data?.[def.type] ?? true;
        return {
          def,
          cron,
          settingKey: sch?.settingKey,
          latest: last,
          status: statusOf(last),
          next: cron ? nextRun(cron, now) : null,
          ticks: cron ? runsBetween(cron, now, 1440) : [],
          live: deletes && !isDry,
          dry: deletes && isDry,
        };
      }),
    [schedules.data, latest.data, dry.data, now]
  );

  const sorted = [...rows].sort((a, b) => RANK[a.status] - RANK[b.status]);
  const counts = { failed: rows.filter((r) => r.status === "failed").length, running: rows.filter((r) => r.status === "running").length };
  const healthy = rows.length - counts.failed - counts.running;

  // ── Run now ──────────────────────────────────────────────────────────
  const [flash, setFlash] = useState<Partial<Record<JobType, "queued" | "already" | "failed">>>({});
  async function run(type: JobType) {
    try {
      const res = await enqueueJob(type);
      setFlash((f) => ({ ...f, [type]: res.enqueued ? "queued" : "already" }));
      void client.invalidateQueries({ queryKey: ["jobs"] });
    } catch {
      setFlash((f) => ({ ...f, [type]: "failed" }));
    }
    window.setTimeout(() => setFlash((f) => ({ ...f, [type]: undefined })), 2600);
  }

  const [open, setOpen] = useState<JobType | null>(null);
  const openRow = rows.find((r) => r.def.type === open);

  const runButton = (r: Row, wide?: boolean) => {
    if (!r.def.runnable) return <span className="w-26 text-center fs-10.5 text-mut">{r.def.once ? "" : "Scheduled only"}</span>;
    const f = flash[r.def.type];
    const running = r.status === "running";
    const [label, icon, tone]: [string, string, Tone] = f === "queued" ? ["Queued", "check", "ok"] : f === "already" ? ["Already queued", "schedule", "neut"] : f === "failed" ? ["Couldn't queue", "error", "stop"] : running ? ["Running", "progress_activity", "prog"] : ["Run now", "play_arrow", "brand"];
    return (
      <button
        type="button"
        disabled={running || !!f}
        title={running ? "Already running" : "Run this job now"}
        onClick={(e) => {
          e.stopPropagation();
          void run(r.def.type);
        }}
        className={cn(
          "inline-flex h-7.5 min-w-26 flex-none cursor-pointer items-center justify-center gap-1.25 rounded-8 border-0 pr-3 pl-2.25 font-sans fs-11 font-medium whitespace-nowrap transition-colors outline-none focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default max-desk:h-10",
          { prog: "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]", ok: "bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]", stop: "bg-stop-bg text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]", neut: "bg-track text-tx3 shadow-[inset_0_0_0_1px_var(--line)]", brand: "bg-brand-sub text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)] hover:bg-brand-line", tray: "", }[tone],
          wide && "w-full"
        )}
      >
        <Icon name={icon} size={14} className={icon === "progress_activity" ? "animate-spin motion-reduce:animate-none" : undefined} />
        {label}
      </button>
    );
  };

  const lastText = (r: Row) =>
    r.status === "running"
      ? `Started ${whenAgo(r.latest!.startedAt ?? r.latest!.createdAt, now)}`
      : r.latest
        ? `Last run ${whenAgo(r.latest.completedAt ?? r.latest.createdAt, now)} · ${runNote(r.latest)}`
        : "Never run";

  const chips = (r: Row) => (
    <>
      {r.live && (
        <Pill tone="stop" icon="bolt">
          Live
        </Pill>
      )}
      {r.dry && (
        <Pill tone="neut" icon="science">
          Dry run
        </Pill>
      )}
    </>
  );

  return (
    <>
      {(schedules.isError || latest.isError) && (
        <SnipeDown onRetry={() => void Promise.all([schedules.refetch(), latest.refetch()])}>Couldn&rsquo;t load the jobs. Check your connection and try again.</SnipeDown>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 fs-11.5 text-tx3">
          <span className="font-medium text-tx">{rows.length} jobs</span>
          {counts.failed > 0 && <Dot tone="bg-stop">{counts.failed} failed</Dot>}
          {counts.running > 0 && <Dot tone="bg-prog">{counts.running} running</Dot>}
          {healthy > 0 && <Dot tone="bg-ok">{healthy} healthy</Dot>}
        </div>
        <SegmentedControl
          label="Layout"
          value={layout}
          onValueChange={pickLayout}
          options={[
            { value: "board", label: "Ops board" },
            { value: "rows", label: "Timeline rows" },
          ]}
        />
      </div>

      {layout === "board" ? (
        <>
          <Section label="Health" note="Failed and running first">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(14.375rem,1fr))] gap-0.75">
              {sorted.map((r, i) => (
                <button
                  key={r.def.type}
                  type="button"
                  onClick={() => setOpen(r.def.type)}
                  style={rowIn(i)}
                  className={cn(
                    "flex min-w-0 cursor-pointer flex-col gap-1.5 rounded-11 border px-3.5 py-3 text-left font-sans text-tx outline-none focus-visible:outline-2 focus-visible:outline-brand",
                    ROW_IN,
                    open === r.def.type ? "border-brand" : r.status === "failed" ? "border-stop-line" : "border-line",
                    r.status === "failed" ? "bg-stop-bg" : "bg-sheet hover:bg-subtle"
                  )}
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    <StatusMark status={r.status} />
                    <span className="fs-10.5 whitespace-nowrap text-mut">{r.def.once ? "Run by hand" : r.next ? `Next ${whenIn(r.next, now)}` : "No upcoming run"}</span>
                  </span>
                  <span className="fs-11.5 leading-[1.3] font-medium">{r.def.name}</span>
                  <span className={cn("truncate fs-10.5 leading-[1.45]", r.status === "failed" ? "text-stop" : "text-mut")}>{lastText(r)}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section label="Next 24 hours" note={`From now, ${whenAt(now, now).replace("Today ", "")}`}>
            <Sheet className="px-4 pt-3 pb-3.5">
              <div className="hidden desk:block">
                <Lanes rows={rows.filter((r) => !r.def.once)} now={now} onOpen={setOpen} />
              </div>
              <div className="flex flex-col desk:hidden">
                {rows
                  .filter((r) => r.next && r.ticks.length <= 48)
                  .sort((a, b) => a.next!.getTime() - b.next!.getTime())
                  .slice(0, 6)
                  .map((r) => (
                    <div key={r.def.type} className="grid grid-cols-[7.375rem_minmax(0,1fr)] gap-2.5 border-b border-line2 py-2 fs-11.5">
                      <span className="text-tx3">{whenAt(r.next!, now)}</span>
                      <span className="min-w-0">{r.def.name}</span>
                    </div>
                  ))}
                {rows
                  .filter((r) => r.ticks.length > 48)
                  .map((r) => (
                    <div key={r.def.type} className="pt-2 fs-10.5 text-mut">
                      {r.def.name} also runs {plainSchedule(r.cron).toLowerCase()}.
                    </div>
                  ))}
              </div>
            </Sheet>
          </Section>

          <Section label="All jobs" note="Open a job to edit its schedule">
            <Sheet className="overflow-hidden">
              {rows.map((r, i) => (
                <div
                  key={r.def.type}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(r.def.type)}
                  onKeyDown={(e) => e.key === "Enter" && setOpen(r.def.type)}
                  className={cn(
                    "grid cursor-pointer grid-cols-[minmax(0,1fr)_1.25rem] items-center gap-x-3.5 gap-y-2.5 py-3 pr-3.5 pl-4 outline-none hover:bg-subtle focus-visible:bg-subtle desk:grid-cols-[minmax(0,1fr)_auto_1.25rem]",
                    i > 0 && "border-t border-line2",
                    open === r.def.type && "bg-brand-sub hover:bg-brand-sub"
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="fs-11.5 font-medium">{r.def.name}</span>
                      <Pill tone="neut" icon="schedule">
                        {r.def.once ? "Run by hand" : plainSchedule(r.cron)}
                      </Pill>
                      {chips(r)}
                    </div>
                    <div className="fs-11 leading-[1.45] text-pretty text-tx3">{r.def.desc}</div>
                    <div className="flex min-w-0 items-center gap-1.25">
                      <StatusMark status={r.status} small />
                      <span className={cn("truncate fs-10.5 leading-[1.45] max-desk:whitespace-normal", r.status === "failed" ? "text-stop" : "text-mut")}>{lastText(r)}</span>
                    </div>
                    <div className="mt-1.5 desk:hidden">{runButton(r, true)}</div>
                  </div>
                  <div className="hidden desk:block">{runButton(r)}</div>
                  <Icon name="chevron_right" size={17.5} className="text-mut" />
                </div>
              ))}
            </Sheet>
          </Section>
        </>
      ) : (
        <Section label="Jobs · next 24 hours" note="Failed and running first">
          <Sheet className="overflow-x-auto">
            <div className="desk:min-w-245">
              <div className="hidden grid-cols-[7.25rem_minmax(12.5rem,1.1fr)_minmax(18.75rem,2fr)_minmax(9.375rem,0.8fr)_7rem] items-end gap-x-3.5 pt-2.5 pr-3.5 pb-2 pl-4 fs-10.5 text-mut desk:grid">
                <span>Status</span>
                <span>Job</span>
                <Axis now={now} />
                <span>Last run</span>
                <span />
              </div>
              {sorted.map((r, i) => (
                <div
                  key={r.def.type}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpen(r.def.type)}
                  onKeyDown={(e) => e.key === "Enter" && setOpen(r.def.type)}
                  style={rowIn(i)}
                  className={cn(
                    "grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 border-t border-line2 py-2.5 pr-3.5 pl-4 outline-none hover:bg-subtle focus-visible:bg-subtle desk:grid-cols-[7.25rem_minmax(12.5rem,1.1fr)_minmax(18.75rem,2fr)_minmax(9.375rem,0.8fr)_7rem]",
                    ROW_IN,
                    open === r.def.type ? "bg-brand-sub" : r.status === "failed" && "bg-stop-bg"
                  )}
                >
                  <span className="hidden desk:inline-flex">
                    <StatusMark status={r.status} />
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.75">
                    <span className="truncate fs-11.5 font-medium">{r.def.name}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 fs-10.5 text-mut">
                      <span className={cn("desk:hidden", STATUS[r.status].text)}>{STATUS[r.status].label} ·</span>
                      {r.def.once ? "Run by hand" : plainSchedule(r.cron)}
                      {chips(r)}
                    </span>
                    <span className={cn("fs-10.5 desk:hidden", r.status === "failed" ? "text-stop" : "text-mut")}>{lastText(r)}</span>
                  </div>
                  <div className="hidden desk:block">
                    <Lane r={r} now={now} />
                  </div>
                  <span title={lastText(r)} className={cn("hidden truncate fs-10.5 desk:block", r.status === "failed" ? "text-stop" : "text-mut")}>
                    {lastText(r)}
                  </span>
                  {runButton(r)}
                </div>
              ))}
            </div>
          </Sheet>
        </Section>
      )}

      <Integrations />

      <AllRuns />

      {openRow && (
        <JobPanel
          key={openRow.def.type}
          r={openRow}
          now={now}
          lastText={lastText(openRow)}
          runButton={runButton(openRow)}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function Dot({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", tone)} />
      {children}
    </span>
  );
}

///  ── The 24-hour lanes ───────────────────────────────────────────────

/** Gridlines every three hours from now, labelled with the time. */
function axisTicks(now: Date) {
  const out: { at: number; label: string }[] = [];
  const first = new Date(now);
  first.setMinutes(0, 0, 0);
  first.setHours(Math.ceil((now.getHours() + now.getMinutes() / 60 + 0.01) / 3) * 3);
  for (let t = new Date(first); t.getTime() - now.getTime() < 86_400_000; t.setHours(t.getHours() + 3)) {
    const at = (t.getTime() - now.getTime()) / 86_400_000;
    const label = t.getHours() === 0 ? `${whenAt(t, now).split(" ")[0]} 00:00` : `${String(t.getHours()).padStart(2, "0")}:00`;
    out.push({ at, label });
  }
  return out;
}

function Axis({ now }: { now: Date }) {
  return (
    <div className="relative h-4.5">
      {axisTicks(now).map((t) => (
        <span key={t.label} className="absolute top-0 -translate-x-1/2 fs-10 whitespace-nowrap text-mut" style={{ left: `${t.at * 100}%` }}>
          {t.label}
        </span>
      ))}
    </div>
  );
}

function Lane({ r, now }: { r: Row; now: Date }) {
  const dense = r.ticks.length > 48;
  return (
    <div className="relative h-6.5 overflow-hidden rounded-6 bg-subtle shadow-[inset_0_0_0_1px_var(--line2)]">
      {axisTicks(now).map((t) => (
        <span key={t.label} className="absolute inset-y-0 w-px bg-line2" style={{ left: `${t.at * 100}%` }} />
      ))}
      {dense ? (
        <>
          <div className="absolute inset-x-0 top-2 bottom-2 rounded-3 bg-[repeating-linear-gradient(90deg,var(--brand)_0_2px,transparent_2px_6px)] opacity-55" />
          <span className="absolute top-1 right-2 rounded-4 bg-sheet px-1.5 fs-10 leading-4.5 text-tx3">
            {plainSchedule(r.cron)} · {r.ticks.length} runs
          </span>
        </>
      ) : r.ticks.length ? (
        r.ticks.map((t) => (
          <span
            key={t.getTime()}
            title={whenAt(t, now)}
            className={cn("absolute top-1.25 bottom-1.25 w-0.75 rounded-2", r.status === "failed" ? "bg-stop" : "bg-brand")}
            style={{ left: `calc(${((t.getTime() - now.getTime()) / 86_400_000) * 100}% - 1.5px)` }}
          />
        ))
      ) : (
        <span className="absolute top-0 left-2.5 fs-10.5 leading-6.5 text-mut">
          {r.def.once ? "Not scheduled" : r.next ? `Next run ${whenAt(r.next, now)}` : "No upcoming run"}
        </span>
      )}
      <span className="absolute inset-y-0 left-0 w-0.5 bg-tx" />
    </div>
  );
}

function Lanes({ rows, now, onOpen }: { rows: Row[]; now: Date; onOpen: (t: JobType) => void }) {
  return (
    <>
      <div className="grid grid-cols-[13.125rem_minmax(0,1fr)] gap-x-3">
        <span />
        <Axis now={now} />
      </div>
      <div className="mt-1 grid grid-cols-[13.125rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
        {rows.map((r) => (
          <div key={r.def.type} className="contents">
            <button
              type="button"
              onClick={() => onOpen(r.def.type)}
              className="cursor-pointer truncate border-0 bg-transparent p-0 text-left font-sans fs-11.5 text-tx outline-none hover:underline focus-visible:underline"
            >
              {r.def.name}
            </button>
            <Lane r={r} now={now} />
          </div>
        ))}
      </div>
    </>
  );
}

///  ── Integrations ────────────────────────────────────────────────────

function Integrations() {
  const client = useQueryClient();
  const { save } = useSave();
  const sp = useQuery(sharepointSyncQuery);
  const capex = useQuery(capexLogQuery);

  const flip = (key: "sp" | "capex", on: boolean) => {
    const q = key === "sp" ? sharepointSyncQuery : capexLogQuery;
    client.setQueryData(q.queryKey, on);
    void save(key, async () => {
      try {
        const res = key === "sp" ? await setSharepointSyncEnabled(on) : await setCapexLogEnabled(on);
        client.setQueryData(q.queryKey, res.enabled);
      } catch (err) {
        client.setQueryData(q.queryKey, !on);
        throw err;
      }
    });
  };

  const items = [
    {
      key: "sp" as const,
      name: "SharePoint nightly sync",
      on: !!sp.data,
      desc: "Sends new requests to the SharePoint ordering ledger each night, by email and Power Automate.",
      note: "Runs as the SharePoint request sync job. Its schedule is in the job list above.",
      warn: false,
    },
    {
      key: "capex" as const,
      name: "CAPEX purchase log",
      on: !!capex.data,
      desc: "When a manager accepts a quote over the threshold, the purchase is logged to the CAPEX ledger.",
      note: "Needs its own Power Automate flow, so leave it off until that exists. The threshold amount is set by the deployment.",
      warn: true,
    },
  ];

  return (
    <Section label="Integrations" note="Saves as you go">
      <Sheet>
        {items.map((g, i) => (
          <div key={g.key} className={cn("flex flex-wrap items-start justify-between gap-x-6 gap-y-2.5 px-4 py-3.5", i > 0 && "border-t border-line2")}>
            <div className="min-w-0 flex-[1_1_20rem]">
              <div className="flex items-center gap-2">
                <span className="fs-11.5 font-medium">{g.name}</span>
                <Pill tone={g.on ? "ok" : "neut"} icon={g.on ? "check_circle" : "do_not_disturb_on"}>
                  {g.on ? "On" : "Off"}
                </Pill>
              </div>
              <div className="mt-1 fs-11 leading-[1.45] text-pretty text-tx3">{g.desc}</div>
              <div className="mt-1.5 flex gap-1.25 fs-10.5 leading-[1.45] text-mut">
                <Icon name={g.warn ? "warning" : "schedule"} size={13} className={cn("leading-4.5", g.warn && "text-prog")} />
                <span className="text-pretty">{g.note}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Switch aria-label={g.name} checked={g.on} onCheckedChange={(on) => flip(g.key, on)} />
              <SaveNote k={g.key} />
            </div>
          </div>
        ))}
      </Sheet>
    </Section>
  );
}

///  ── All runs ────────────────────────────────────────────────────────

const RUN_STATUS: { value: RunStatus | "all"; label: string }[] = [
  { value: "all", label: "Any status" },
  { value: "Failed", label: "Failed" },
  { value: "Running", label: "Running" },
  { value: "Pending", label: "Pending" },
  { value: "Completed", label: "Completed" },
];

function runTone(s: string): { icon: string; text: string } {
  if (s === "Failed") return { icon: "error", text: "text-stop" };
  if (s === "Completed") return { icon: "check_circle", text: "text-ok" };
  if (s === "Running") return { icon: "progress_activity", text: "text-prog" };
  return { icon: "schedule", text: "text-tx3" };
}

function AllRuns() {
  const [status, setStatus] = useState<RunStatus | "all">("all");
  const [type, setType] = useState<JobType | "all">("all");
  const [page, setPage] = useState(1);
  const params = { page, pageSize: 10, ...(status !== "all" ? { status } : {}), ...(type !== "all" ? { type } : {}) };
  const history = useQuery({ ...jobHistoryQuery(params), placeholderData: keepPreviousData });
  const total = history.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));

  return (
    <Section label="All runs" note={total ? `${total} runs` : undefined}>
      <Sheet className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3">
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as RunStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Status" className="h-8 w-auto min-w-35 fs-11.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUN_STATUS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as JobType | "all");
              setPage(1);
            }}
          >
            <SelectTrigger aria-label="Job" className="h-8 w-auto min-w-50 fs-11.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any job</SelectItem>
              {(Object.keys(JOB_NAMES) as JobType[]).map((t) => (
                <SelectItem key={t} value={t}>
                  {JOB_NAMES[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden grid-cols-[7.5rem_minmax(10rem,1fr)_9rem_9rem_4.5rem_minmax(0,2fr)] gap-x-3 border-y border-line2 bg-subtle px-4 py-2 fs-10.5 text-mut desk:grid">
          <span>Status</span>
          <span>Job</span>
          <span>Created</span>
          <span>Finished</span>
          <span>Attempts</span>
          <span>Detail</span>
        </div>
        <div key={JSON.stringify(params)}>
          {(history.data?.jobs ?? []).map((j, i) => {
            const t = runTone(j.status);
            return (
              <div
                key={j.id}
                style={rowIn(i)}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t border-line2 px-4 py-2.5 fs-11 first:border-t-0 desk:grid-cols-[7.5rem_minmax(10rem,1fr)_9rem_9rem_4.5rem_minmax(0,2fr)] desk:first:border-t-0",
                  ROW_IN
                )}
              >
                <span className={cn("inline-flex items-center gap-1.25 font-medium max-desk:order-2", t.text)}>
                  <Icon name={t.icon} size={14} className={j.status === "Running" ? "animate-spin motion-reduce:animate-none" : undefined} />
                  {j.status}
                </span>
                <span className="font-medium max-desk:order-1">{JOB_NAMES[j.type as JobType] ?? j.type}</span>
                <span className="text-tx3 max-desk:order-3">{whenAt(new Date(j.createdAt))}</span>
                <span className="text-tx3 max-desk:hidden">{j.completedAt ? `${whenAt(new Date(j.completedAt))}${runTook(j) ? ` · ${runTook(j)}` : ""}` : "—"}</span>
                <span className="text-tx3 max-desk:hidden">
                  {j.attempts}/{j.maxAttempts}
                </span>
                <span title={runNote(j)} className={cn("truncate max-desk:order-4 max-desk:col-span-2", j.errorMessage ? "text-stop" : "text-mut")}>
                  {runNote(j)}
                </span>
              </div>
            );
          })}
          {history.isSuccess && !history.data.jobs.length && <p className="m-0 px-4 py-4 fs-11.5 text-mut">No runs match these filters.</p>}
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t border-line2 px-4 py-2.5 fs-11 text-mut">
            <span>
              Page {page} of {pages}
            </span>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={btn({ size: "icon-sm" })} aria-label="Previous page">
              <Icon name="chevron_left" size={16} />
            </button>
            <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={btn({ size: "icon-sm" })} aria-label="Next page">
              <Icon name="chevron_right" size={16} />
            </button>
          </div>
        )}
      </Sheet>
    </Section>
  );
}

///  ── A job's panel ───────────────────────────────────────────────────

const FREQS = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

type Draft = { spec: ScheduleSpec | null; dry: boolean; max: string; th: { d1: string; d2: string; d3: string } };

function JobPanel({ r, now, lastText, runButton, onClose }: { r: Row; now: Date; lastText: string; runButton: React.ReactNode; onClose: () => void }) {
  const client = useQueryClient();
  const dryQ = useQuery(dryRunStatesQuery);
  const maxQ = useQuery({ ...maxDeletesQuery, enabled: !!r.def.deletes });
  const shipQ = useQuery({ ...shipReminderQuery, enabled: !!r.def.thresholds });
  const history = useQuery(jobHistoryQuery({ type: r.def.type, pageSize: 10 }));

  const parsed = r.cron ? scheduleFromCron(r.cron) : null;
  const saved: Draft = {
    spec: parsed,
    dry: dryQ.data?.[r.def.type] ?? true,
    max: String(maxQ.data?.[r.def.type] ?? 5),
    th: { d1: String(shipQ.data?.d1 ?? 7), d2: String(shipQ.data?.d2 ?? 14), d3: String(shipQ.data?.d3 ?? 30) },
  };
  const [draft, setDraft] = useState<Draft | null>(null);
  const cur = draft ?? saved;
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmLive, setConfirmLive] = useState(false);
  const [typed, setTyped] = useState("");

  const edit = (fn: (d: Draft) => Draft) => {
    setState("idle");
    setError(null);
    setDraft(fn(structuredClone(cur)));
  };
  const setSpec = (s: ScheduleSpec) => edit((d) => ({ ...d, spec: s }));

  // Turning live on, or letting a live run delete more, needs LIVE typed.
  const goesLive = !!r.def.deletes && !cur.dry && (saved.dry || Number(cur.max) > Number(saved.max));
  const th = [Number(cur.th.d1), Number(cur.th.d2), Number(cur.th.d3)];
  const thOk = th.every((n) => Number.isInteger(n) && n > 0) && th[0] < th[1] && th[1] < th[2];
  const maxOk = Number.isInteger(Number(cur.max)) && Number(cur.max) >= 1 && Number(cur.max) <= 1000;

  async function commit() {
    if (r.def.thresholds && !thOk) return setError("Reminder days must be whole numbers, each later than the one before.");
    if (r.def.deletes && !maxOk) return setError("Max deletes must be a whole number from 1 to 1000.");
    setState("saving");
    setConfirmLive(false);
    setTyped("");
    try {
      if (cur.spec && r.settingKey && JSON.stringify(cur.spec) !== JSON.stringify(saved.spec)) {
        await saveJobSchedule(r.settingKey, cronFromSchedule(cur.spec));
      }
      if (r.def.deletes && cur.dry !== saved.dry) await setDryRun(r.def.type, cur.dry);
      if (r.def.deletes && cur.max !== saved.max) await setMaxDeletes(r.def.type, Number(cur.max));
      if (r.def.thresholds && JSON.stringify(cur.th) !== JSON.stringify(saved.th)) {
        const out: ReminderThresholds = await saveReminderThresholds({ d1: th[0], d2: th[1], d3: th[2] });
        client.setQueryData(shipReminderQuery.queryKey, out);
      }
      await client.invalidateQueries({ queryKey: ["jobs"] });
      setDraft(null);
      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : null);
      setState("failed");
    }
  }

  const spec = cur.spec;
  const next = spec ? nextRun(cronFromSchedule(spec), now) : null;
  const opts = (n: number, from = 0) => Array.from({ length: n }, (_, i) => i + from);

  return (
    <Panel
      open
      onClose={onClose}
      backLabel="Jobs"
      kicker={r.def.once ? "Background job · run by hand" : "Background job"}
      title={r.def.name}
      chip={draftChip(state, dirty)}
      notices={
        (state === "failed" || error) && (
          <SnipeDown onRetry={() => void commit()}>{error ?? "Couldn't save. Your edits are still here; try Save changes again."}</SnipeDown>
        )
      }
      foot={{
        text: dirty ? (goesLive ? "Unsaved changes · needs LIVE confirmation" : "Unsaved changes") : "No unsaved changes",
        dirty,
        saving: state === "saving",
        onDiscard: () => {
          setDraft(null);
          setState("idle");
          setError(null);
        },
        onSave: () => (goesLive ? setConfirmLive(true) : void commit()),
      }}
    >
      <div className="flex flex-col gap-3 rounded-14 border border-line bg-sheet px-4 py-3.5">
        <div className="fs-11.5 leading-normal text-pretty text-tx3">{r.def.desc}</div>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-[1_1_13.75rem] items-center gap-1.5">
            <StatusMark status={r.status} small />
            <span className={cn("fs-11 leading-[1.45]", r.status === "failed" ? "text-stop" : "text-tx3")}>{lastText}</span>
          </div>
          {runButton}
        </div>
      </div>

      <Section label="Schedule" note="Applies on the next server restart">
        <Sheet className="flex flex-col gap-3.5 px-4 py-3.5">
          {r.def.once ? (
            <div className="fs-11.5 leading-[1.45] text-tx3">Not scheduled. Run it by hand after deploying.</div>
          ) : !spec ? (
            <div className="fs-11.5 leading-[1.45] text-tx3">
              {r.cron ? (
                <>
                  A custom schedule, <code className="font-mono text-tx">{r.cron}</code>, set outside Settings, so it can&rsquo;t be edited here.
                </>
              ) : (
                "This job has no schedule set."
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5">
                <div className="flex flex-col gap-1.5">
                  <span className="fs-11 text-tx3">Execution mode</span>
                  <SegmentedControl
                    label="Execution mode"
                    value={spec.mode}
                    onValueChange={(m) =>
                      setSpec(m === "interval" ? { mode: "interval", unit: "minutes", every: 10 } : { mode: "scheduled", frequency: "daily", hour: 2, minute: 0 })
                    }
                    options={[
                      { value: "scheduled", label: "Scheduled" },
                      { value: "interval", label: "Interval" },
                    ]}
                  />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="fs-11 text-tx3">Cron expression</span>
                  <span className="inline-flex h-7.5 items-center rounded-7 bg-brand-sub px-2.5 font-mono fs-11.5 font-medium whitespace-pre text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]">
                    {cronFromSchedule(spec)}
                  </span>
                </div>
              </div>
              {spec.mode === "interval" ? (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(8.125rem,1fr))] gap-2.5">
                  <Pick
                    label="Every"
                    value={String(spec.every)}
                    options={(spec.unit === "minutes" ? MINUTE_INTERVALS : HOUR_INTERVALS).map((n) => [String(n), String(n)])}
                    onChange={(v) => setSpec({ ...spec, every: Number(v) })}
                  />
                  <Pick
                    label="Unit"
                    value={spec.unit}
                    options={[
                      ["minutes", "minutes"],
                      ["hours", "hours"],
                    ]}
                    onChange={(v) => setSpec({ mode: "interval", unit: v as "minutes" | "hours", every: 1 })}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fit,minmax(6.875rem,1fr))] gap-2.5">
                  <Pick
                    label="Frequency"
                    value={spec.frequency}
                    options={FREQS.map((f) => [f, f[0].toUpperCase() + f.slice(1)])}
                    onChange={(v) => {
                      const f = v as (typeof FREQS)[number];
                      setSpec({
                        mode: "scheduled",
                        frequency: f,
                        hour: spec.hour,
                        minute: spec.minute,
                        ...(f === "weekly" ? { dayOfWeek: spec.dayOfWeek ?? 0 } : f === "daily" ? {} : { dayOfMonth: spec.dayOfMonth ?? 1 }),
                        ...(f === "yearly" ? { month: spec.month ?? 1 } : {}),
                      });
                    }}
                  />
                  {spec.frequency === "weekly" && (
                    <Pick label="Day" value={String(spec.dayOfWeek ?? 0)} options={WEEKDAYS.map((d, i) => [String(i), d])} onChange={(v) => setSpec({ ...spec, dayOfWeek: Number(v) })} />
                  )}
                  {spec.frequency === "yearly" && (
                    <Pick label="Month" value={String(spec.month ?? 1)} options={MONTH_NAMES.map((m, i) => [String(i + 1), m])} onChange={(v) => setSpec({ ...spec, month: Number(v) })} />
                  )}
                  {(spec.frequency === "monthly" || spec.frequency === "quarterly" || spec.frequency === "yearly") && (
                    <Pick label="Day of month" value={String(spec.dayOfMonth ?? 1)} options={opts(28, 1).map((d) => [String(d), String(d)])} onChange={(v) => setSpec({ ...spec, dayOfMonth: Number(v) })} />
                  )}
                  <Pick label="Hour" value={String(spec.hour)} options={opts(24).map((h) => [String(h), String(h).padStart(2, "0")])} onChange={(v) => setSpec({ ...spec, hour: Number(v) })} />
                  <Pick
                    label="Minute"
                    value={String(spec.minute)}
                    options={[...new Set([...opts(12).map((m) => m * 5), spec.minute])].sort((a, b) => a - b).map((m) => [String(m), String(m).padStart(2, "0")])}
                    onChange={(v) => setSpec({ ...spec, minute: Number(v) })}
                  />
                </div>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-1 fs-11 text-mut">
                <span className="text-tx">{plainSpec(spec)}</span>
                {next && <span>Next run {whenAt(next, now)}</span>}
              </div>
            </>
          )}
        </Sheet>
      </Section>

      {r.def.deletes && (
        <Section label="Safety" note="Applies at once">
          <Sheet className="flex flex-col gap-3 px-4 py-3.5">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
              <div className="flex flex-col gap-1.5">
                <span className="fs-11 text-tx3">Mode</span>
                <SegmentedControl
                  label="Mode"
                  value={cur.dry ? "dry" : "live"}
                  onValueChange={(v) => edit((d) => ({ ...d, dry: v === "dry" }))}
                  options={[
                    { value: "dry", label: "Dry run", icon: "science" },
                    { value: "live", label: "Live", icon: "bolt" },
                  ]}
                  className={cn(!cur.dry && "[&_[data-state=on]]:bg-stop-bg [&_[data-state=on]]:text-stop [&_[data-state=on]]:shadow-[0_0_0_1px_var(--stop-line)]")}
                />
              </div>
              <label className="flex w-37.5 flex-col gap-1.25 fs-11 text-tx3">
                Max deletes per run
                <Input
                  value={cur.max}
                  inputMode="numeric"
                  aria-invalid={!maxOk || undefined}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                    edit((d) => ({ ...d, max: v }));
                  }}
                  className="fs-11.5"
                />
              </label>
            </div>
            <div className="fs-11 leading-normal text-pretty text-mut">
              {cur.dry
                ? "Dry run: the job logs what it would delete and changes nothing."
                : `Live: each run deletes up to ${cur.max || 0} records. Saving a switch to live, or a higher limit, asks you to type LIVE.`}
            </div>
          </Sheet>
        </Section>
      )}

      {r.def.thresholds && (
        <Section label="Reminder thresholds" note="Days after shipping · apply immediately">
          <Sheet className="flex flex-col gap-2.5 px-4 py-3.5">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(6.875rem,1fr))] gap-2.5">
              {(
                [
                  ["d1", "First reminder"],
                  ["d2", "Second reminder"],
                  ["d3", "Overdue (alert IT)"],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="flex flex-col gap-1.25 fs-11 text-tx3">
                  {label}
                  <Input
                    value={cur.th[k]}
                    inputMode="numeric"
                    aria-invalid={!thOk || undefined}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                      edit((d) => ({ ...d, th: { ...d.th, [k]: v } }));
                    }}
                    className="fs-11.5"
                  />
                </label>
              ))}
            </div>
            <div className="fs-11 leading-normal text-mut">The user is reminded at the first two thresholds; at the overdue threshold, IT is alerted too.</div>
          </Sheet>
        </Section>
      )}

      <Section label="History" note={history.data ? `Last ${history.data.jobs.length} runs` : undefined}>
        <Sheet className="overflow-hidden">
          {(history.data?.jobs ?? []).map((j, i) => {
            const t = runTone(j.status);
            return (
              <div key={j.id} className={cn("grid grid-cols-[1.125rem_minmax(0,1fr)_auto] items-start gap-x-2.5 px-3.5 py-2.5", i > 0 && "border-t border-line2")}>
                <Icon name={t.icon} size={17} className={cn(t.text, j.status === "Running" && "animate-spin motion-reduce:animate-none")} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="fs-11.5">{whenAt(new Date(j.createdAt), now)}</span>
                  <span className={cn("fs-11 leading-[1.4]", j.errorMessage ? "text-stop" : "text-tx3")}>{runNote(j)}</span>
                </div>
                <span className="fs-10.5 whitespace-nowrap text-mut">{runTook(j)}</span>
              </div>
            );
          })}
          {history.isSuccess && !history.data.jobs.length && <p className="m-0 px-3.5 py-3 fs-11.5 text-mut">It hasn&rsquo;t run yet.</p>}
        </Sheet>
      </Section>

      <Modal open={confirmLive} onOpenChange={(o) => !o && (setConfirmLive(false), setTyped(""))} label="Go live" width={440}>
        <ModalBody className="gap-3.5">
          <div className="flex items-start gap-2.5">
            <span className="grid size-8.5 flex-none place-items-center rounded-9 bg-stop-bg text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]">
              <Icon name="bolt" size={17.5} />
            </span>
            <div className="min-w-0">
              <ModalTitle className="fs-14 leading-[1.35]">Run {r.def.name.toLowerCase()} live?</ModalTitle>
              <p className="m-0 mt-1.5 fs-11.5 leading-normal text-pretty text-tx3">
                Live runs delete records for real. Each run deletes up to {cur.max || 0}, and Checkout can&rsquo;t restore them.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2.5 rounded-9 bg-subtle px-3 py-2.5 fs-11.5 shadow-[inset_0_0_0_1px_var(--line2)]">
            <span className="text-tx3">Max deletes per run</span>
            <span className="font-mono fs-12 font-medium">{cur.max || 0}</span>
          </div>
          <label className="flex flex-col gap-1.5 fs-11 text-tx3">
            Type LIVE to confirm
            <Input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value.toUpperCase())}
              placeholder="LIVE"
              className="h-10.5 font-mono fs-13 font-medium tracking-[0.12em]"
            />
          </label>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={() => (setConfirmLive(false), setTyped(""))} className={btn({ size: "md" })}>
            Cancel
          </button>
          <button type="button" disabled={typed.trim() !== "LIVE"} onClick={() => void commit()} className={btn({ variant: "danger-solid", size: "md" })}>
            Save and go live
          </button>
        </ModalFooter>
      </Modal>
    </Panel>
  );
}

function Pick({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.25 fs-11 text-tx3">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className="w-full min-w-0 fs-11.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, t]) => (
            <SelectItem key={v} value={v}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
