import type { BackgroundJob, JobType } from "@/api/jobs";
import { scheduleFromCron, type ScheduleSpec } from "@/lib/schedule";

///  +-----------------------------------------------------------------+
///  |                  THE JOBS, AND WHEN THEY RUN                    |
///  +-----------------------------------------------------------------+
//
//  The scheduled and hand-run jobs the settings board shows, in the order it
//  lists them, and the arithmetic behind "Next in 2h", the 24-hour lanes and
//  "Daily at 03:00". Event-driven jobs (a request notification, the CAPEX
//  log) have no schedule and live in the All runs table only.
///  +-----------------------------------------------------------------+

export type JobDef = {
  type: JobType;
  name: string;
  desc: string;
  /** Runnable from Settings (the server's MANUALLY_TRIGGERABLE). */
  runnable: boolean;
  /** Run by hand once, never scheduled. */
  once?: boolean;
  /** Deletes for real: has a dry-run switch and a per-run cap. */
  deletes?: boolean;
  /** The shipped-request reminder thresholds live with it. */
  thresholds?: boolean;
};

export const JOBS: JobDef[] = [
  { type: "REFRESH_CATEGORIES_CACHE", name: "Refresh categories cache", desc: "Re-fetches the asset category list from Snipe-IT.", runnable: true },
  { type: "REFRESH_PRICES_CACHE", name: "Refresh prices cache", desc: "Re-fetches the hardware list used for tier price averages and model availability.", runnable: true },
  { type: "REFRESH_ACCESSORIES_CACHE", name: "Refresh accessories cache", desc: "Re-fetches the accessory list from Snipe-IT.", runnable: false },
  { type: "CLEANUP_STALE_REQUESTS", name: "Cleanup stale requests", desc: "Auto-rejects non-terminal requests with no activity past the staleness window.", runnable: true },
  {
    type: "CLEANUP_ORPHAN_SNIPE_MODELS",
    name: "Cleanup orphan models",
    desc: "Deletes Snipe-IT models whose skeleton asset was removed, and rejects the stranded request.",
    runnable: true,
    deletes: true,
  },
  { type: "PURGE_OLD_JOB_HISTORY", name: "Purge old job history", desc: "Deletes completed and failed job rows past the retention window.", runnable: true },
  {
    type: "REMIND_SHIPPED_REQUESTS",
    name: "Shipped request reminders",
    desc: "Reminds users to confirm receipt of shipped devices, escalating to IT if overdue.",
    runnable: false,
    thresholds: true,
  },
  {
    type: "REMIND_LOAN_RETURNS",
    name: "Loan due-back reminders",
    desc: "Chases loans as they approach their return date, then escalates to the site's stock keeper and IT once they're overdue. Its days are set on the Loans page.",
    runnable: true,
  },
  { type: "SYNC_REQUEST_TO_SHAREPOINT", name: "SharePoint request sync", desc: "Sends new requests to the SharePoint ordering ledger nightly via Power Automate.", runnable: false },
  {
    type: "BACKFILL_REQUEST_LOCATIONS",
    name: "Backfill request locations",
    desc: "Fills in the requester's location on requests filed before stock keepers existed, so keepers see their site's in-progress work. Run once after deploying; safe to run again.",
    runnable: true,
    once: true,
  },
];

/** Every job type's name, for the All runs table (event-driven ones too). */
export const JOB_NAMES: Record<JobType, string> = {
  SEND_REQUEST_NOTIFICATION: "Request notification",
  LOG_CAPEX_PURCHASE: "CAPEX purchase log",
  ...(Object.fromEntries(JOBS.map((j) => [j.type, j.name])) as Record<Exclude<JobType, "SEND_REQUEST_NOTIFICATION" | "LOG_CAPEX_PURCHASE">, string>),
};

///  ── Cron ─────────────────────────────────────────────────────────────

/** One cron field as the set of values it allows, or null for "any". */
function field(src: string, min: number, max: number): Set<number> | null {
  if (src === "*") return null;
  const out = new Set<number>();
  for (const part of src.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-").map(Number);
      lo = a;
      hi = b ?? (stepRaw ? max : a);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

type Matcher = (d: Date) => boolean;

function matcher(cron: string): Matcher | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    const [mi, h, dom, mon, dow] = [field(parts[0], 0, 59), field(parts[1], 0, 23), field(parts[2], 1, 31), field(parts[3], 1, 12), field(parts[4], 0, 6)];
    return (d) =>
      (!mi || mi.has(d.getMinutes())) &&
      (!h || h.has(d.getHours())) &&
      (!dom || dom.has(d.getDate())) &&
      (!mon || mon.has(d.getMonth() + 1)) &&
      (!dow || dow.has(d.getDay()));
  } catch {
    return null;
  }
}

/** Run times from `from` for `minutes` minutes, up to `limit` of them. */
export function runsBetween(cron: string, from: Date, minutes: number, limit = 2000): Date[] {
  const m = matcher(cron);
  if (!m) return [];
  const out: Date[] = [];
  const t = new Date(from);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  for (let i = 0; i < minutes && out.length < limit; i++) {
    if (m(t)) out.push(new Date(t));
    t.setMinutes(t.getMinutes() + 1);
  }
  return out;
}

/** The next run within eight days, or null. */
export function nextRun(cron: string, from = new Date()): Date | null {
  return runsBetween(cron, from, 8 * 1440, 1)[0] ?? null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Daily at 03:00", "Every 10 minutes" — or the cron itself when it's unusual. */
export function plainSchedule(cron: string | undefined): string {
  if (!cron) return "Not scheduled";
  const s = scheduleFromCron(cron);
  return s ? plainSpec(s) : cron;
}

export function plainSpec(s: ScheduleSpec): string {
  if (s.mode === "interval") return s.every === 1 ? `Every ${s.unit === "hours" ? "hour" : "minute"}` : `Every ${s.every} ${s.unit}`;
  const t = `${pad(s.hour)}:${pad(s.minute)}`;
  switch (s.frequency) {
    case "daily":
      return `Daily at ${t}`;
    case "weekly":
      return `${DAYS[s.dayOfWeek ?? 0]}s at ${t}`;
    case "monthly":
      return `Monthly on the ${s.dayOfMonth} at ${t}`;
    case "quarterly":
      return `Quarterly on the ${s.dayOfMonth} at ${t}`;
    case "yearly":
      return `Yearly on ${s.dayOfMonth} ${MONTHS[(s.month ?? 1) - 1]} at ${t}`;
  }
}

/** "Today 14:20", "Tomorrow 03:00", "Sun 2 Nov 02:00". */
export function whenAt(d: Date, now = new Date()): string {
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `Today ${t}`;
  if (diff === -1) return `Yesterday ${t}`;
  if (diff === 1) return `Tomorrow ${t}`;
  return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()]} ${t}`;
}

/** "in 12 min", "in 3h 20m", or a date. */
export function whenIn(d: Date, now = new Date()): string {
  const m = Math.round((d.getTime() - now.getTime()) / 60_000);
  if (m < 60) return `in ${Math.max(1, m)} min`;
  if (m < 1440) return `in ${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
  return whenAt(d, now);
}

/** "just now", "12 min ago", "3h ago", "2d ago". */
export function whenAgo(iso: string, now = new Date()): string {
  const m = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

///  ── Status ───────────────────────────────────────────────────────────

export type JobStatus = "running" | "failed" | "ok" | "idle";

export function statusOf(latest: BackgroundJob | undefined): JobStatus {
  if (!latest) return "idle";
  if (latest.status === "Running" || latest.status === "Pending") return "running";
  return latest.status === "Failed" ? "failed" : "ok";
}

/** What a run said: its error, or its result summary, made readable. */
export function runNote(job: BackgroundJob): string {
  if (job.errorMessage) return job.errorMessage;
  if (!job.resultSummary) return job.status === "Completed" ? "Completed" : job.status;
  try {
    const parsed = JSON.parse(job.resultSummary) as Record<string, unknown>;
    const parts = Object.entries(parsed)
      .filter(([, v]) => typeof v === "number" || typeof v === "boolean" || (typeof v === "string" && v.length < 40))
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").toLowerCase()}: ${String(v)}`);
    return parts.length ? parts.join(" · ") : "Completed";
  } catch {
    return job.resultSummary;
  }
}

/** How long a run took, "3.2 s", from its start and finish. */
export function runTook(job: BackgroundJob): string {
  if (!job.startedAt || !job.completedAt) return "";
  const s = (new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.round(s / 60)} min`;
}

export const JOBS_LAYOUT_KEY = "settings-jobs-layout";
