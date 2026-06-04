// A schedule the builder can represent. `mode` drives which fields are used.
export type ScheduleSpec =
  | { mode: "interval"; unit: "minutes" | "hours"; every: number }
  | {
      mode: "scheduled";
      frequency: "daily" | "weekly" | "monthly" | "quarterly" | "yearly";
      minute: number;        // 0–59
      hour: number;          // 0–23
      dayOfWeek?: number;    // 0–6, weekly only
      dayOfMonth?: number;   // 1–28, monthly/quarterly/yearly
      month?: number;        // 1–12, yearly only
    };

// The clean divisor lists — the only N values the interval dropdown offers.
export const MINUTE_INTERVALS = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30];
export const HOUR_INTERVALS = [1, 2, 3, 4, 6, 8, 12];

export function cronFromSchedule(s: ScheduleSpec): string {
  if (s.mode === "interval") {
    if (s.unit === "minutes") return `*/${s.every} * * * *`;
    return `0 */${s.every} * * *`; // every N hours, at minute 0
  }

  const { minute: m, hour: h } = s;
  switch (s.frequency) {
    case "daily":
      return `${m} ${h} * * *`;
    case "weekly":
      return `${m} ${h} * * ${s.dayOfWeek}`;
    case "monthly":
      return `${m} ${h} ${s.dayOfMonth} * *`;
    case "quarterly":
      return `${m} ${h} ${s.dayOfMonth} 1,4,7,10 *`;
    case "yearly":
      return `${m} ${h} ${s.dayOfMonth} ${s.month} *`;
  }
}

// Returns a ScheduleSpec the builder can edit, or null if the cron is outside
// the builder's vocabulary (caller shows it raw, read-only).
export function scheduleFromCron(cron: string): ScheduleSpec | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hr, dom, mon, dow] = parts;

  // --- Interval: minute step, everything else wide open ---
  // */N * * * *
  const minStep = /^\*\/(\d+)$/.exec(min);
  if (minStep && hr === "*" && dom === "*" && mon === "*" && dow === "*") {
    const every = Number(minStep[1]);
    if (MINUTE_INTERVALS.includes(every)) return { mode: "interval", unit: "minutes", every };
    return null; // a step we don't offer (e.g. */7) — show raw
  }

  // 0 */N * * *
  const hrStep = /^\*\/(\d+)$/.exec(hr);
  if (min === "0" && hrStep && dom === "*" && mon === "*" && dow === "*") {
    const every = Number(hrStep[1]);
    if (HOUR_INTERVALS.includes(every)) return { mode: "interval", unit: "hours", every };
    return null;
  }

  // --- Scheduled: fixed minute + hour, calendar fields ---
  const m = toInt(min), h = toInt(hr);
  if (m === null || h === null || m > 59 || h > 23) return null;

  const isWild = (x: string) => x === "*";
  const single = (x: string) => (/^\d+$/.test(x) ? Number(x) : null);

  // daily: M H * * *
  if (isWild(dom) && isWild(mon) && isWild(dow))
    return { mode: "scheduled", frequency: "daily", minute: m, hour: h };

  // weekly: M H * * D
  const d = single(dow);
  if (isWild(dom) && isWild(mon) && d !== null && d >= 0 && d <= 6)
    return { mode: "scheduled", frequency: "weekly", minute: m, hour: h, dayOfWeek: d };

  // monthly: M H DOM * *
  const dm = single(dom);
  if (dm !== null && dm >= 1 && dm <= 28 && isWild(mon) && isWild(dow))
    return { mode: "scheduled", frequency: "monthly", minute: m, hour: h, dayOfMonth: dm };

  // quarterly: M H DOM 1,4,7,10 *
  if (dm !== null && dm >= 1 && dm <= 28 && mon === "1,4,7,10" && isWild(dow))
    return { mode: "scheduled", frequency: "quarterly", minute: m, hour: h, dayOfMonth: dm };

  // yearly: M H DOM MON *
  const mo = single(mon);
  if (dm !== null && dm >= 1 && dm <= 28 && mo !== null && mo >= 1 && mo <= 12 && isWild(dow))
    return { mode: "scheduled", frequency: "yearly", minute: m, hour: h, dayOfMonth: dm, month: mo };

  return null; // anything else — multi-day, day-of-month > 28, ranges, lists — show raw
}

function toInt(x: string): number | null {
  return /^\d+$/.test(x) ? Number(x) : null;
}