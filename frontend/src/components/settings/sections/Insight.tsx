import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { btn } from "@/components/ui/variants";
import { feedbackEnabledQuery, feedbackListQuery, troubleshootingAnalyticsQuery } from "@/api/queries";
import { setTroubleshootingAnalyticsEnabled } from "@/api/troubleshooting";
import { setFeedbackEnabled, type FeedbackResponse, type FeedbackRow } from "@/api/feedback";
import { apiResponse } from "@/api/client";
import { Pill, Row, SaveNote, Section, Sheet, SnipeDown, type Tone } from "../parts";
import { useSave } from "../saveStatus";

///  +-----------------------------------------------------------------+
///  |                  TROUBLESHOOTING & FEEDBACK                     |
///  +-----------------------------------------------------------------+
//
//  Two questions, one page. Is the troubleshooting library stopping calls
//  to IT, and what does staff think of Checkout? Each tab starts with its
//  own on/off switch (recording is anonymous either way), then the numbers
//  for the chosen period: 7, 30 or 90 days.
//
//  THE NET SCORE is % improved minus % worse, per day for a week and per
//  week otherwise, for each of the feedback form's two questions. Teal, not
//  the design's blue, for "IT overall": in dark mode the blue and the brand
//  purple are too close for colour-blind readers, and the line is dashed
//  and labelled too, so colour is never the only cue.
///  +-----------------------------------------------------------------+

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

const ASKED = [
  { key: "nothing_worked", label: "Nothing here worked", icon: "help", swatch: "bg-brand" },
  { key: "called", label: "Called IT support", icon: "call", swatch: "bg-id1" },
  { key: "messaged", label: "Messaged IT on Teams", icon: "chat", swatch: "bg-id3" },
] as const;

const fmt = (n: number) => Math.round(n).toLocaleString();
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export function Insight() {
  const [tab, setTab] = useState<"ts" | "fb">("ts");
  const [period, setPeriod] = useState<Period>(30);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
        <SegmentedControl
          label="Show"
          value={tab}
          onValueChange={setTab}
          options={[
            { value: "ts", label: "Troubleshooting" },
            { value: "fb", label: "Feedback" },
          ]}
        />
        <SegmentedControl
          label="Period"
          value={String(period) as `${Period}`}
          onValueChange={(v) => setPeriod(Number(v) as Period)}
          options={PERIODS.map((p) => ({ value: String(p) as `${Period}`, label: `${p} days` }))}
        />
      </div>
      {tab === "ts" ? <Troubleshooting days={period} /> : <Feedback days={period} />}
    </>
  );
}

function Collection({ title, desc, on, onChange, k, off }: { title: string; desc: string; on: boolean | undefined; onChange: (on: boolean) => void; k: string; off: string }) {
  return (
    <Section label="Collection" note="Saves as you go">
      <Sheet>
        <Row title={title} desc={desc}>
          <Switch aria-label={title} checked={!!on} disabled={on === undefined} onCheckedChange={onChange} />
          <SaveNote k={k} />
        </Row>
        {on === false && <div className="border-t border-line2 bg-subtle px-4 py-2.75 fs-11 text-tx3">{off}</div>}
      </Sheet>
    </Section>
  );
}

///  ── Troubleshooting ─────────────────────────────────────────────────

function Troubleshooting({ days }: { days: number }) {
  const client = useQueryClient();
  const { save } = useSave();
  const q = useQuery(troubleshootingAnalyticsQuery(days));
  const a = q.data;

  const toggle = (on: boolean) => {
    const key = troubleshootingAnalyticsQuery(days).queryKey;
    client.setQueryData(key, (d: typeof a) => (d ? { ...d, enabled: on } : d));
    void save("analytics", async () => {
      try {
        await setTroubleshootingAnalyticsEnabled(on);
        await client.invalidateQueries({ queryKey: ["troubleshooting", "analytics"] });
      } catch (err) {
        client.setQueryData(key, (d: typeof a) => (d ? { ...d, enabled: !on } : d));
        throw err;
      }
    });
  };

  const byControl = Object.fromEntries((a?.escapesByControl ?? []).map((e) => [e.detail, e.count]));
  const asked = ASKED.map((x) => ({ ...x, n: byControl[x.key] ?? 0 }));
  const askedTotal = asked.reduce((n, x) => n + x.n, 0);
  const t = a?.totals;
  const stillAsked = t && t.sessionsWithArticle ? (t.sessionsWithEscape / t.sessionsWithArticle) * 100 : 0;

  return (
    <>
      <Collection
        title="Record how the library is used"
        desc="Anonymous: which articles are opened, how far people get, and searches that find nothing."
        on={a?.enabled}
        onChange={toggle}
        k="analytics"
        off="Recording is off. Nothing new is recorded; the figures below are from before it was switched off."
      />
      {q.isError && <SnipeDown onRetry={() => void q.refetch()}>Couldn&rsquo;t load the library&rsquo;s figures.</SnipeDown>}
      {t && (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] gap-0.75 rounded-14 bg-tray p-0.75">
            <Stat label="Article opens" value={fmt(t.articlesOpened)} sub={`Across ${a.articles.length} articles`} />
            <Stat label="Still asked IT" value={`${Math.round(stillAsked)}%`} sub={`${fmt(t.sessionsWithEscape)} of ${fmt(t.sessionsWithArticle)} visits`} />
            <Stat label="Searches with no match" value={fmt(t.searchesWithNoMatch)} sub="Topics with no article yet" />
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,22.5rem),1fr))] items-start gap-4">
            <Section label="How people asked IT" note="After opening an article">
              <Sheet className="flex flex-col gap-3 px-4 py-3.5">
                {askedTotal ? (
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-5" aria-hidden>
                    {asked.map((x) => x.n > 0 && <span key={x.key} className={x.swatch} style={{ width: `${(x.n / askedTotal) * 100}%` }} />)}
                  </div>
                ) : (
                  <div className="h-2.5 rounded-5 bg-track" aria-hidden />
                )}
                <div className="flex flex-col">
                  {asked.map((x) => (
                    <div key={x.key} className="grid grid-cols-[0.625rem_minmax(0,1fr)_auto_2.75rem] items-center gap-2.5 border-t border-line2 py-2 fs-11.5">
                      <span className={cn("size-2.5 rounded-3", x.swatch)} />
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon name={x.icon} size={14} className="text-tx3" />
                        {x.label}
                      </span>
                      <span className="text-tx3">{fmt(x.n)}</span>
                      <span className="text-right font-medium">{askedTotal ? `${Math.round((x.n / askedTotal) * 100)}%` : "–"}</span>
                    </div>
                  ))}
                </div>
              </Sheet>
            </Section>

            <Section label="Searches with no match" note="Possible new articles">
              <Sheet className="overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_4rem_5.625rem] gap-2.5 px-4 py-2.25 fs-10.5 text-mut">
                  <span>Search</span>
                  <span className="text-right">Times</span>
                  <span className="text-right">Last</span>
                </div>
                {a.noMatchSearches.slice(0, 12).map((s, i) => (
                  <div key={s.query} style={rowIn(i)} className={cn("grid grid-cols-[minmax(0,1fr)_4rem_5.625rem] items-center gap-2.5 border-t border-line2 px-4 py-2.25 fs-11.5", ROW_IN)}>
                    <span className="truncate font-mono fs-11">&ldquo;{s.query}&rdquo;</span>
                    <span className="text-right">{fmt(s.count)}</span>
                    <span className="text-right fs-11 text-mut">{day(s.lastSearchedAt)}</span>
                  </div>
                ))}
                {!a.noMatchSearches.length && <p className="m-0 border-t border-line2 px-4 py-3 fs-11.5 text-mut">Every search found something.</p>}
              </Sheet>
            </Section>
          </div>

          <Section label="Articles opened" note="Most opened first">
            <Sheet className="overflow-hidden">
              <div className="hidden grid-cols-[minmax(13.75rem,1.6fr)_4.375rem_minmax(10rem,1fr)_4.75rem_minmax(11.875rem,1fr)] items-center gap-x-4 px-4 py-2.25 fs-10.5 text-mut desk:grid">
                <span>Article</span>
                <span className="text-right">Opens</span>
                <span>Avg step reached</span>
                <span className="text-right">Asked IT</span>
                <span>How they asked</span>
              </div>
              {a.articles.map((r, i) => {
                const esc = r.opens ? r.escapes / r.opens : 0;
                const fill = r.deepestStep != null && r.stepCount ? Math.min(1, r.deepestStep / r.stepCount) : 0;
                return (
                  <div
                    key={`${r.subjectKey}/${r.symptomId}`}
                    style={rowIn(i)}
                    className={cn(
                      "grid grid-cols-1 gap-y-1.75 border-t border-line2 px-3.5 py-3 desk:grid-cols-[minmax(13.75rem,1.6fr)_4.375rem_minmax(10rem,1fr)_4.75rem_minmax(11.875rem,1fr)] desk:items-center desk:gap-x-4 desk:px-4 desk:py-2.75",
                      ROW_IN
                    )}
                  >
                    <span className="flex min-w-0 justify-between gap-2.5 fs-11.5 font-medium">
                      {r.label}
                      <span className="font-normal whitespace-nowrap text-tx3 desk:hidden">{fmt(r.opens)} opens</span>
                    </span>
                    <span className="hidden text-right fs-11.5 desk:block">{fmt(r.opens)}</span>
                    <span className="flex items-center gap-2.5">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-3 bg-track">
                        <span className="block h-full rounded-3 bg-brand" style={{ width: `${fill * 100}%` }} />
                      </span>
                      <span className="fs-11 whitespace-nowrap text-tx3">
                        {r.deepestStep == null ? "–" : `${r.deepestStep.toFixed(1)}${r.stepCount ? ` of ${r.stepCount}` : ""}`}
                      </span>
                    </span>
                    <span className={cn("fs-11.5 desk:text-right", esc >= 0.4 ? "font-medium text-stop" : "text-tx")}>
                      {Math.round(esc * 100)}%<span className="text-tx3 desk:hidden"> asked IT</span>
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 fs-11 text-tx3">
                      {ASKED.map((x) => (
                        <span key={x.key} title={x.label} className="inline-flex items-center gap-1">
                          <span className={cn("size-2 rounded-2", x.swatch)} />
                          {x.key === "nothing_worked" ? "Help" : x.key === "called" ? "Call" : "Msg"} {fmt(r.escapesByControl?.[x.key] ?? 0)}
                        </span>
                      ))}
                    </span>
                  </div>
                );
              })}
              {!a.articles.length && <p className="m-0 border-t border-line2 px-4 py-3 fs-11.5 text-mut desk:border-t-0">No articles opened in this period.</p>}
            </Sheet>
          </Section>
        </>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-11 border border-line bg-sheet px-4 py-3.5">
      <span className="fs-11 text-tx3">{label}</span>
      <span className="font-head fs-21 font-medium tracking-[-0.03em]">{value}</span>
      <span className="fs-10.5 text-mut">{sub}</span>
    </div>
  );
}

///  ── Feedback ────────────────────────────────────────────────────────

const ANSWER: Record<FeedbackResponse, { text: string; tone: Tone; icon: string }> = {
  improved: { text: "Improved", tone: "ok", icon: "trending_up" },
  no_change: { text: "The same", tone: "neut", icon: "trending_flat" },
  worse: { text: "Is worse now", tone: "stop", icon: "trending_down" },
};

type Bucket = { label: string; r: number | null; i: number | null };

/** Net score per bucket for both questions: % improved minus % worse. */
function buckets(rows: FeedbackRow[], days: number, now: Date): Bucket[] {
  const step = days === 7 ? 1 : 7;
  const n = Math.ceil(days / step);
  const out: Bucket[] = [];
  for (let b = n - 1; b >= 0; b--) {
    const end = new Date(now.getTime() - b * step * 86_400_000);
    const start = new Date(end.getTime() - step * 86_400_000);
    const inB = rows.filter((x) => {
      const t = new Date(x.createdAt);
      return t > start && t <= end;
    });
    const score = (pick: (x: FeedbackRow) => FeedbackResponse) =>
      inB.length ? Math.round(((inB.filter((x) => pick(x) === "improved").length - inB.filter((x) => pick(x) === "worse").length) / inB.length) * 100) : null;
    out.push({ label: day(end.toISOString()), r: score((x) => x.improvedRequesting), i: score((x) => x.improvesItOverall) });
  }
  return out;
}

function Feedback({ days }: { days: number }) {
  const client = useQueryClient();
  const { save } = useSave();
  const enabled = useQuery(feedbackEnabledQuery);
  const list = useQuery(feedbackListQuery);
  const [req, setReq] = useState<FeedbackResponse | "all">("all");
  const [it, setIt] = useState<FeedbackResponse | "all">("all");
  const [comments, setComments] = useState<"all" | "with" | "without">("all");
  const [exporting, setExporting] = useState(false);

  const toggle = (on: boolean) => {
    client.setQueryData(feedbackEnabledQuery.queryKey, on);
    void save("feedback", async () => {
      try {
        client.setQueryData(feedbackEnabledQuery.queryKey, (await setFeedbackEnabled(on)).enabled);
      } catch (err) {
        client.setQueryData(feedbackEnabledQuery.queryKey, !on);
        throw err;
      }
    });
  };

  // The period is measured from when the page opened.
  const [now] = useState(() => Date.now());
  const since = now - days * 86_400_000;
  const inPeriod = useMemo(() => (list.data ?? []).filter((x) => new Date(x.createdAt).getTime() >= since), [list.data, since]);
  const shown = inPeriod.filter(
    (x) =>
      (req === "all" || x.improvedRequesting === req) &&
      (it === "all" || x.improvesItOverall === it) &&
      (comments === "all" || (comments === "with" ? !!x.comments?.trim() : !x.comments?.trim()))
  );
  const series = useMemo(() => buckets(inPeriod, days, new Date(now)), [inPeriod, days, now]);

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await apiResponse("/api/feedback/export");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `feedback-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  const answerFilter = (label: string, value: FeedbackResponse | "all", set: (v: FeedbackResponse | "all") => void) => (
    <Select value={value} onValueChange={(v) => set(v as FeedbackResponse | "all")}>
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-37.5 fs-11.5">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}: any</SelectItem>
        {(Object.keys(ANSWER) as FeedbackResponse[]).map((k) => (
          <SelectItem key={k} value={k}>
            {label}: {ANSWER[k].text.toLowerCase()}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <Collection
        title="Collect feedback"
        desc="Turns on the feedback page, the nudge after a collection, and the call to action on Home."
        on={enabled.data}
        onChange={toggle}
        k="feedback"
        off="Feedback is turned off. Nobody is asked; earlier responses are still below."
      />
      {list.isError && <SnipeDown onRetry={() => void list.refetch()}>Couldn&rsquo;t load feedback.</SnipeDown>}

      <Section label="Net score" note={`${days === 7 ? "Daily" : "Weekly"} · % improved minus % worse`}>
        <Sheet className="px-4 pt-3.5 pb-3">
          <NetScore series={series} />
        </Sheet>
      </Section>

      <Section
        label="Responses"
        note={
          <>
            {`${shown.length} response${shown.length === 1 ? "" : "s"}`}
            <button type="button" disabled={exporting} onClick={() => void exportCsv()} className={btn({ variant: "ghost", size: "sm", className: "-my-1 h-7 pr-2.25 pl-1.5 fs-11 text-tx2" })}>
              <Icon name="download" size={15} />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </>
        }
      >
        <Sheet className="overflow-hidden">
          <div className="flex flex-wrap gap-2 px-4 py-3">
            {answerFilter("Requesting", req, setReq)}
            {answerFilter("IT overall", it, setIt)}
            <Select value={comments} onValueChange={(v) => setComments(v as typeof comments)}>
              <SelectTrigger aria-label="Comments" className="h-8 w-auto min-w-35 fs-11.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All comments</SelectItem>
                <SelectItem value="with">With comments</SelectItem>
                <SelectItem value="without">Without comments</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="hidden grid-cols-[9.375rem_9.375rem_minmax(0,1fr)_6.875rem] items-center gap-x-4 border-y border-line2 bg-subtle px-4 py-2.25 fs-10.5 text-mut desk:grid">
            <span>Requesting</span>
            <span>IT overall</span>
            <span>Comments</span>
            <span className="text-right">Date</span>
          </div>
          <div key={`${days}|${req}|${it}|${comments}`}>
            {shown.map((x, i) => (
              <div
                key={x.id}
                style={rowIn(i)}
                className={cn(
                  "grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 border-t border-line2 px-3.5 py-3 first:border-t-0 desk:grid-cols-[9.375rem_9.375rem_minmax(0,1fr)_6.875rem] desk:gap-x-4 desk:px-4 desk:py-2.75",
                  ROW_IN
                )}
              >
                <Answer v={x.improvedRequesting} />
                <Answer v={x.improvesItOverall} />
                <span className="text-right fs-11 whitespace-nowrap text-mut desk:order-last">{day(x.createdAt)}</span>
                <span className={cn("col-span-3 fs-11.5 leading-[1.45] text-pretty desk:col-span-1", x.comments?.trim() ? "text-tx" : "text-mut")}>
                  {x.comments?.trim() || "No comment"}
                </span>
              </div>
            ))}
          </div>
          {list.isSuccess && !list.data.length && <Empty>No feedback submitted yet.</Empty>}
          {list.isSuccess && list.data.length > 0 && !shown.length && <Empty>No feedback matches these filters.</Empty>}
        </Sheet>
      </Section>
    </>
  );
}

function Answer({ v }: { v: FeedbackResponse }) {
  const a = ANSWER[v];
  return (
    <span>
      <Pill tone={a.tone} icon={a.icon}>
        {a.text}
      </Pill>
    </span>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="m-0 px-4 py-4 fs-11.5 text-mut">{children}</p>;
}

///  ── The net score chart ─────────────────────────────────────────────

const Y = (v: number) => 100 - ((v + 100) / 200) * 100;

function NetScore({ series }: { series: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  const X = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const path = (k: "r" | "i") => {
    let d = "";
    let pen = false;
    series.forEach((b, i) => {
      const v = b[k];
      if (v == null) return void (pen = false);
      d += `${pen ? "L" : "M"}${X(i).toFixed(2)} ${Y(v).toFixed(2)} `;
      pen = true;
    });
    return d.trim();
  };
  const last = (k: "r" | "i") => [...series].reverse().find((b) => b[k] != null)?.[k] ?? null;
  const first = (k: "r" | "i") => series.find((b) => b[k] != null)?.[k] ?? null;
  const sgn = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v}`);
  const delta = (k: "r" | "i") => {
    const a = first(k);
    const b = last(k);
    return a == null || b == null ? "–" : sgn(b - a);
  };
  const h = hover != null ? series[hover] : null;
  const LINES = [
    { k: "r" as const, label: "Requesting", stroke: "var(--brand)", dash: undefined, swatch: "bg-brand", width: 2.5 },
    { k: "i" as const, label: "IT overall", stroke: "var(--id3)", dash: "5 4", swatch: "bg-id3", width: 2 },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap gap-x-7 gap-y-2.5">
        {LINES.map((l) => (
          <div key={l.k} className="flex items-baseline gap-2">
            <span className={cn("h-0.75 w-3.5 self-center rounded-2", l.swatch)} />
            <span className="fs-11.5 text-tx3">{l.label}</span>
            <span className="font-head fs-17.5 font-medium">{sgn(last(l.k))}</span>
            <span className="fs-10.5 text-mut">{delta(l.k)} over period</span>
          </div>
        ))}
      </div>
      <div
        className="relative ml-10 h-45"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setHover(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) / r.width) * (n - 1)))));
        }}
        role="img"
        aria-label={`Net score, ${LINES.map((l) => `${l.label} ${sgn(last(l.k))}`).join(", ")}`}
      >
        {[100, 50, 0, -50, -100].map((v) => (
          <div key={v} className={cn("absolute inset-x-0 border-t", v === 0 ? "border-strong" : "border-dashed border-line")} style={{ top: `${Y(v)}%` }}>
            <span className="absolute -top-2 -left-10 w-8 text-right fs-10 text-mut">{sgn(v)}</span>
          </div>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          {LINES.map((l) => (
            <path key={l.k} d={path(l.k)} fill="none" stroke={l.stroke} strokeWidth={l.width} strokeDasharray={l.dash} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
          ))}
        </svg>
        {h && hover != null && (
          <>
            <span className="pointer-events-none absolute inset-y-0 w-px bg-strong" style={{ left: `${X(hover)}%` }} />
            {LINES.map(
              (l) =>
                h[l.k] != null && (
                  <span
                    key={l.k}
                    className={cn("pointer-events-none absolute size-2.5 -translate-1/2 rounded-full ring-2 ring-sheet", l.swatch)}
                    style={{ left: `${X(hover)}%`, top: `${Y(h[l.k]!)}%` }}
                  />
                )
            )}
            <div
              className="pointer-events-none absolute top-0 z-1 flex min-w-34 flex-col gap-1 rounded-9 border border-line bg-sheet px-2.5 py-2 fs-11 shadow-pop"
              style={hover > n / 2 ? { right: `${100 - X(hover)}%`, marginRight: "0.5rem" } : { left: `${X(hover)}%`, marginLeft: "0.5rem" }}
            >
              <span className="font-medium text-tx">
                {n === 7 ? h.label : `Week to ${h.label}`}
              </span>
              {LINES.map((l) => (
                <span key={l.k} className="flex items-center gap-1.5 text-tx3">
                  <span className={cn("h-0.75 w-2.5 rounded-2", l.swatch)} />
                  {l.label}
                  <span className="ml-auto pl-3 font-medium text-tx">{h[l.k] == null ? "No responses" : sgn(h[l.k])}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="ml-10 flex justify-between fs-10 text-mut">
        {series
          .filter((_, i) => n <= 7 || i % Math.ceil(n / 6) === 0 || i === n - 1)
          .map((b) => (
            <span key={b.label}>{b.label}</span>
          ))}
      </div>
    </div>
  );
}
