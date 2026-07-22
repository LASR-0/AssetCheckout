import { useEffect, useState } from "react";
import cronstrue from "cronstrue";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cronFromSchedule,
  scheduleFromCron,
  MINUTE_INTERVALS,
  HOUR_INTERVALS,
  type ScheduleSpec,
} from "@/lib/schedule";
import type { JobType } from "@/api/jobs";
import { Badge } from "@/components/ui/statusbadge";

///  +-----------------------------------------------------------------+
///  |                     SCHEDULED JOB ROW                           |
///  +-----------------------------------------------------------------+
//
//  Collapsed: label, schedule badge, dry-run/live badge, "Run now", chevron.
//  Expanded: a control-panel schedule editor — a header zone (Execution Mode
//  toggle · Safety toggle · live cron expression) above a single even row of
//  fields, then a Save action.
//
//  Collapsed-row badges render through the shared <Badge> primitive
//  (StatusBadge.tsx, compact size) with the theme-aware status tokens:
//  schedule → approved (blue), dry-run → success, live → error.
//
//  The builder edits a DRAFT ScheduleSpec; nothing persists until Save. The
//  collapsed badge reflects the SAVED cron (from the parent). If the saved
//  cron is outside the builder's vocabulary, the editor shows it read-only.
//
//  Jobs with a tiered reminder structure (reminderConfig present) also render
//  a threshold editor inside the same panel. The single "Save Changes" button
//  saves BOTH the schedule and the thresholds; it disables while the
//  thresholds are invalid so the whole panel saves as one unit.
///  +-----------------------------------------------------------------+

const SELECT_TRIGGER =
  "h-10 w-full text-on-surface-variant bg-surface-container-low border border-outline text-sm rounded-lg";
const SELECT_CONTENT =
  "bg-surface-container-low border border-outline text-on-surface-variant";
const SELECT_ITEM = "text-sm focus:bg-shadcn-background focus:text-shadcn-text";

const DAYS_OF_WEEK = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type ScheduleSpecScheduled = Extract<ScheduleSpec, { mode: "scheduled" }>;

const FREQUENCIES: { value: ScheduleSpecScheduled["frequency"]; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

const DEFAULT_DRAFT: ScheduleSpec = {
  mode: "scheduled",
  frequency: "daily",
  minute: 0,
  hour: 9,
};

export type ReminderThresholds = { d1: number; d2: number; d3: number };

// Guarantee every field the active frequency needs has a value, so the
// generated cron can never contain `undefined` (the "0 9 * * undefined" bug).
function normalizeDraft(s: ScheduleSpec): ScheduleSpec {
  if (s.mode === "interval") return s;
  const base = { ...s };
  if (base.frequency === "weekly") base.dayOfWeek = base.dayOfWeek ?? 1;
  if (["monthly", "quarterly", "yearly"].includes(base.frequency))
    base.dayOfMonth = base.dayOfMonth ?? 1;
  if (base.frequency === "yearly") base.month = base.month ?? 1;
  return base;
}

export type ScheduledJobRowProps = {
  type: JobType;
  label: string;
  description: string;
  settingKey?: string;
  savedCron?: string;
  dryRun?: boolean;
  running: boolean;
  savingSchedule: boolean;
  savingDryRun: boolean;
  onTrigger: () => void;
  onSaveSchedule: (settingKey: string, cron: string) => void;
  onToggleDryRun: (next: boolean) => void;
  reminderConfig?: {
    thresholds: ReminderThresholds;
    saving: boolean;
    onSave: (next: ReminderThresholds) => void;
  };
};

export default function ScheduledJobRow({
  label,
  description,
  settingKey,
  savedCron,
  dryRun,
  running,
  savingSchedule,
  savingDryRun,
  onTrigger,
  onSaveSchedule,
  onToggleDryRun,
  reminderConfig,
}: ScheduledJobRowProps) {
  const [open, setOpen] = useState(false);

  const parsed = savedCron ? scheduleFromCron(savedCron) : null;
  const editable = savedCron ? parsed !== null : true;
  const hasSchedule = Boolean(settingKey);
  const hasConfig = hasSchedule || dryRun !== undefined || reminderConfig !== undefined;

  const [draft, setDraft] = useState<ScheduleSpec>(parsed ?? DEFAULT_DRAFT);
  useEffect(() => {
    setDraft(parsed ?? DEFAULT_DRAFT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCron]);

  ///  ---------------------------------------------------------------
  ///  Threshold draft (only meaningful when reminderConfig is present)
  ///  ---------------------------------------------------------------
  //
  //  Lifted up from the editor so the single Save button can persist the
  //  thresholds alongside the schedule, and disable while they're invalid.

  const [td1, setTd1] = useState(String(reminderConfig?.thresholds.d1 ?? ""));
  const [td2, setTd2] = useState(String(reminderConfig?.thresholds.d2 ?? ""));
  const [td3, setTd3] = useState(String(reminderConfig?.thresholds.d3 ?? ""));

  // Re-sync the threshold draft if the saved values change upstream.
  useEffect(() => {
    if (reminderConfig) {
      setTd1(String(reminderConfig.thresholds.d1));
      setTd2(String(reminderConfig.thresholds.d2));
      setTd3(String(reminderConfig.thresholds.d3));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reminderConfig?.thresholds.d1,
    reminderConfig?.thresholds.d2,
    reminderConfig?.thresholds.d3,
  ]);

  const tn1 = Number(td1);
  const tn2 = Number(td2);
  const tn3 = Number(td3);

  // Validation mirrors the server: positive integers, strictly ascending.
  // Jobs without reminderConfig are always "valid" so the Save button isn't
  // gated for them.
  const thresholdsAllInts =
    Number.isInteger(tn1) && Number.isInteger(tn2) && Number.isInteger(tn3);
  const thresholdsAllPositive = tn1 > 0 && tn2 > 0 && tn3 > 0;
  const thresholdsAscending = tn1 < tn2 && tn2 < tn3;
  const thresholdsValid =
    !reminderConfig ||
    (thresholdsAllInts && thresholdsAllPositive && thresholdsAscending);

  const thresholdError =
    reminderConfig && !thresholdsValid
      ? !thresholdsAllInts || !thresholdsAllPositive
        ? "All thresholds must be positive whole numbers."
        : "Each threshold must be larger than the previous (first < second < overdue)."
      : null;

  let scheduleBadge = "Not scheduled";
  if (savedCron) {
    try {
      scheduleBadge = cronstrue.toString(savedCron, { verbose: false });
    } catch {
      scheduleBadge = savedCron;
    }
  }

  const previewCron = cronFromSchedule(normalizeDraft(draft));

  const isSaving = savingSchedule || (reminderConfig?.saving ?? false);

  // Single save for the whole panel: schedule + (if present) thresholds.
  function handleSave() {
    if (settingKey) {
      onSaveSchedule(settingKey, cronFromSchedule(normalizeDraft(draft)));
    }
    if (reminderConfig && thresholdsValid) {
      reminderConfig.onSave({ d1: tn1, d2: tn2, d3: tn3 });
    }
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-outline bg-surface"
    >
      {/* Collapsed summary row */}
      <div className="flex items-center justify-between gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-on-background text-sm">{label}</span>
            <Badge
              size="compact"
              icon="schedule"
              label={scheduleBadge}
              bg="bg-status-approved/15"
              text="text-status-approved"
            />
            {dryRun !== undefined && (
              <Badge
                size="compact"
                icon={dryRun ? "visibility" : "warning"}
                label={dryRun ? "Dry-run" : "Live"}
                bg={dryRun ? "bg-status-success/15" : "bg-status-error/15"}
                text={dryRun ? "text-status-success" : "text-status-error"}
              />
            )}
          </div>
          <p className="text-xs text-info-light mt-0.5 truncate">{description}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={onTrigger}
            disabled={running}
            className="inline-flex items-center text-white font-bold px-3 py-1.5 text-xs rounded-md twilight-gradient shadow-md hover:brightness-90 dark:hover:brightness-150 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {running ? "Queuing…" : "Run now"}
                        <span
              className="material-symbols-outlined ml-1 !text-[16px]"
              style={{ fontVariationSettings: "'wght' 500" }}
            >
              {running ? "progress_activity" : "play_arrow"}
            </span>
          </button>

          {hasConfig && (
            <CollapsibleTrigger asChild>
              <button
                className="inline-flex items-center justify-center p-1.5 rounded-md hover:bg-surface-container-low hover:cursor-pointer transition-all"
                aria-label={open ? "Collapse settings" : "Expand settings"}
              >
                <span
                  className={`material-symbols-outlined !text-[18px] text-info-light transition-transform ${
                    open ? "rotate-180" : ""
                  }`}
                >
                  expand_more
                </span>
              </button>
            </CollapsibleTrigger>
          )}
        </div>
      </div>

      {/* Expanded editor */}
      <CollapsibleContent>
        <div className="border-t border-outline/10 px-4 py-4 space-y-4">
          {hasSchedule && editable && (
            <>
              {/* Header zone: toggles (left) + cron expression (right) */}
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div className="flex items-end gap-6 flex-wrap">
                  <ToggleGroup label="Execution Mode">
                    <PillButton
                      active={draft.mode === "scheduled"}
                      onClick={() =>
                        draft.mode !== "scheduled" && setDraft(DEFAULT_DRAFT)
                      }
                      activeClass="bg-surface-container-lowest text-nav-tab-selected shadow-sm"
                    >
                      Scheduled
                    </PillButton>
                    <PillButton
                      active={draft.mode === "interval"}
                      onClick={() =>
                        draft.mode !== "interval" &&
                        setDraft({ mode: "interval", unit: "minutes", every: 10 })
                      }
                      activeClass="bg-surface-container-lowest text-nav-tab-selected shadow-sm"
                    >
                      Interval
                    </PillButton>
                  </ToggleGroup>

                  {dryRun !== undefined && (
                    <ToggleGroup label="Safety Status">
                      <PillButton
                        active={dryRun}
                        disabled={savingDryRun}
                        onClick={() => onToggleDryRun(true)}
                        activeClass="bg-green-500 text-white shadow-sm"
                      >
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[14px]">
                            check_circle
                          </span>
                          Dry-run
                        </span>
                      </PillButton>
                      <PillButton
                        active={!dryRun}
                        disabled={savingDryRun}
                        onClick={() => onToggleDryRun(false)}
                        activeClass="bg-red-500 text-white shadow-sm"
                      >
                        Live
                      </PillButton>
                    </ToggleGroup>
                  )}
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-xs font-medium tracking-wider uppercase text-info-light mb-1">
                    Cron Expression
                  </span>
                  <code className="px-3 py-1.5 rounded-md bg-blue-500/10 text-blue-400 text-sm font-mono">
                    {previewCron}
                  </code>
                </div>
              </div>

              {/* Fields zone: single even row */}
              <div className="rounded-lg border border-outline p-3">
                <ScheduleFields draft={draft} setDraft={setDraft} />
              </div>

              {/* Reminder thresholds (only for jobs with a tiered structure) */}
              {reminderConfig && (
                <ReminderThresholdFields
                  d1={td1}
                  d2={td2}
                  d3={td3}
                  setD1={setTd1}
                  setD2={setTd2}
                  setD3={setTd3}
                  error={thresholdError}
                />
              )}

              {/* Save — one button for the whole panel (schedule + thresholds) */}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-info-light">
                  {reminderConfig
                    ? "Schedule changes apply on the next server restart; reminder thresholds apply immediately."
                    : "Schedule changes apply on the next server restart."}
                </span>
                <button
                  onClick={handleSave}
                  disabled={isSaving || !thresholdsValid}
                  className="shrink-0 inline-flex items-center gap-1 px-5 py-2 text-sm font-medium rounded-md text-blue-400 bg-blue-500/10 border-1 border-blue-500/0 hover:border-blue-500/50 hover:brightness-70 dark:hover:brightness-150 hover:cursor-pointer disabled:opacity-50 transition-all"
                >
                  {isSaving ? "Saving…" : "Save Changes"}
                  <span
                    className="material-symbols-outlined !text-[18px]"
                    style={{ fontVariationSettings: "'wght' 300" }}
                  > save_as </span>
                </button>
              </div>
            </>
          )}

          {/* Non-conforming schedule: read-only */}
          {hasSchedule && !editable && (
            <p className="text-xs text-info-light">
              Set manually and can&apos;t be edited here. Current:{" "}
              <code className="font-mono text-on-surface-variant">{savedCron}</code>
            </p>
          )}

          {/* Dry-run-only jobs (no schedule) still need the safety toggle */}
          {!hasSchedule && dryRun !== undefined && (
            <ToggleGroup label="Safety Status">
              <PillButton
                active={dryRun}
                disabled={savingDryRun}
                onClick={() => onToggleDryRun(true)}
                activeClass="bg-green-500 text-white shadow-sm"
              >
                Dry-run
              </PillButton>
              <PillButton
                active={!dryRun}
                disabled={savingDryRun}
                onClick={() => onToggleDryRun(false)}
                activeClass="bg-red-500 text-white shadow-sm"
              >
                Live
              </PillButton>
            </ToggleGroup>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

///  +-----------------------------------------------------------------+
///  |                     SCHEDULE FIELDS                             |
///  +-----------------------------------------------------------------+
//
//  A single even row of fields (flex-1 each) — Frequency · conditional ·
//  Hour · Minute for scheduled, or Every · Unit for interval.
///  +-----------------------------------------------------------------+

function ScheduleFields({
  draft,
  setDraft,
}: {
  draft: ScheduleSpec;
  setDraft: (s: ScheduleSpec) => void;
}) {
  if (draft.mode === "interval") {
    return (
      <div className="flex items-end gap-3">
        <Field label="Every">
          <DropSelect
            value={String(draft.every)}
            onChange={(v) => setDraft({ ...draft, every: Number(v) })}
            options={(draft.unit === "minutes" ? MINUTE_INTERVALS : HOUR_INTERVALS).map(
              (n) => ({ value: String(n), label: String(n) })
            )}
          />
        </Field>
        <Field label="Unit">
          <DropSelect
            value={draft.unit}
            onChange={(v) => {
              const unit = v as "minutes" | "hours";
              const list = unit === "minutes" ? MINUTE_INTERVALS : HOUR_INTERVALS;
              const every = list.includes(draft.every) ? draft.every : list[0];
              setDraft({ mode: "interval", unit, every });
            }}
            options={[
              { value: "minutes", label: "minutes" },
              { value: "hours", label: "hours" },
            ]}
          />
        </Field>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-3">
      <Field label="Frequency">
        <DropSelect
          value={draft.frequency}
          onChange={(v) =>
            setDraft({ ...draft, frequency: v as ScheduleSpecScheduled["frequency"] })
          }
          options={FREQUENCIES}
        />
      </Field>

      {draft.frequency === "weekly" && (
        <Field label="Day">
          <DropSelect
            value={String(draft.dayOfWeek ?? 1)}
            onChange={(v) => setDraft({ ...draft, dayOfWeek: Number(v) })}
            options={DAYS_OF_WEEK}
          />
        </Field>
      )}

      {draft.frequency === "yearly" && (
        <Field label="Month">
          <DropSelect
            value={String(draft.month ?? 1)}
            onChange={(v) => setDraft({ ...draft, month: Number(v) })}
            options={MONTHS.map((name, i) => ({ value: String(i + 1), label: name }))}
          />
        </Field>
      )}

      {(draft.frequency === "monthly" ||
        draft.frequency === "quarterly" ||
        draft.frequency === "yearly") && (
        <Field label="Day of month">
          <DropSelect
            value={String(draft.dayOfMonth ?? 1)}
            onChange={(v) => setDraft({ ...draft, dayOfMonth: Number(v) })}
            options={Array.from({ length: 28 }, (_, i) => i + 1).map((d) => ({
              value: String(d),
              label: String(d),
            }))}
          />
        </Field>
      )}

      <Field label="Hour">
        <DropSelect
          value={String(draft.hour)}
          onChange={(v) => setDraft({ ...draft, hour: Number(v) })}
          options={Array.from({ length: 24 }, (_, i) => i).map((h) => ({
            value: String(h),
            label: pad(h),
          }))}
        />
      </Field>

      <Field label="Minute">
        <DropSelect
          value={String(draft.minute)}
          onChange={(v) => setDraft({ ...draft, minute: Number(v) })}
          options={Array.from({ length: 12 }, (_, i) => i * 5).map((m) => ({
            value: String(m),
            label: pad(m),
          }))}
        />
      </Field>
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                       SHARED BITS                               |
///  +-----------------------------------------------------------------+

function ToggleGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-medium tracking-wider uppercase text-info-light mb-1">
        {label}
      </span>
      <div className="inline-flex p-1 bg-surface-container rounded-lg">{children}</div>
    </div>
  );
}

function PillButton({
  active,
  activeClass,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-5 py-1.5 rounded-md text-sm font-medium hover:cursor-pointer transition-all disabled:opacity-50 ${
        active ? activeClass : "text-on-surface-variant/40"
      }`}
    >
      {children}
    </button>
  );
}

// Field grows to fill the row evenly (flex-1).
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1 min-w-0">
      <span className="block text-xs font-medium text-info-light mb-1">{label}</span>
      {children}
    </label>
  );
}

function DropSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={SELECT_TRIGGER}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className={SELECT_CONTENT}>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className={SELECT_ITEM}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

///  +-----------------------------------------------------------------+
///  |              REMINDER THRESHOLD FIELDS (presentational)         |
///  +-----------------------------------------------------------------+
//
//  Pure presentation — the draft state, validation, and save now live in the
//  parent ScheduledJobRow so the single "Save Changes" button can persist the
//  thresholds alongside the schedule. This component only renders the three
//  inputs, the descriptive text, and (when invalid) the error line.
///  +-----------------------------------------------------------------+

function ReminderThresholdFields({
  d1,
  d2,
  d3,
  setD1,
  setD2,
  setD3,
  error,
}: {
  d1: string;
  d2: string;
  d3: string;
  setD1: (v: string) => void;
  setD2: (v: string) => void;
  setD3: (v: string) => void;
  error: string | null;
}) {
  return (
    <div className="rounded-lg border border-outline p-3 space-y-3">
      <div className="flex flex-col">
        <span className="text-xs font-medium tracking-wider uppercase text-info-light mb-1">
          Reminder Thresholds (days after shipping)
        </span>
        <div className="flex items-end gap-3">
          <ThresholdField label="First reminder" value={d1} onChange={setD1} />
          <ThresholdField label="Second reminder" value={d2} onChange={setD2} />
          <ThresholdField label="Overdue (alert IT)" value={d3} onChange={setD3} />
        </div>
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <p className="text-xs text-info-light">
        The user is reminded at the first two thresholds; at the overdue
        threshold, IT is alerted too.
      </p>
    </div>
  );
}

function ThresholdField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block flex-1 min-w-0">
      <span className="block text-xs font-medium text-info-light mb-1">{label}</span>
      <input
        type="number"
        min="1"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full text-on-surface-variant bg-surface-container-low border border-outline/20 text-sm rounded-lg px-3 focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
      />
    </label>
  );
}