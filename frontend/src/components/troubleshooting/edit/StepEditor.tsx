import { useState } from "react";
import EditableText from "./EditableText";
import FigureEditor from "./FigureEditor";
import BranchEditor from "./BranchEditor";
import type { Step, SymptomListing } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                      EDITING ONE STEP                           |
///  +-----------------------------------------------------------------+
//
//  Title and body always; note, warn, figure and branch added only when
//  wanted. Empty optional fields are not rendered as empty boxes — five
//  blank inputs under every step would bury the two that are always there,
//  and the schema treats absent and empty as different things anyway.
//
//  MOVE AND DELETE SIT ON THE STEP, not in a separate reordering mode. The
//  ordering of these articles is load-bearing — the house rule is cheapest
//  step first — so moving one is ordinary editing, not a special operation.
//
//  DELETE ASKS FIRST. Everything else here is recoverable by retyping or by
//  discarding the draft; deleting the step you have just written a paragraph
//  into is the one action worth a click of friction.
///  +-----------------------------------------------------------------+

type Props = {
  step: Step;
  index: number;
  total: number;
  subjectKey: string;
  symptomId: string;
  /** Every symptom in this subject, for the branch picker. */
  symptoms: SymptomListing[];
  onChange: (step: Step) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
};

export default function StepEditor({
  step,
  index,
  total,
  subjectKey,
  symptomId,
  symptoms,
  onChange,
  onMove,
  onRemove,
}: Props) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = <K extends keyof Step>(key: K, value: Step[K]) =>
    onChange({ ...step, [key]: value });

  /** Drop the key entirely rather than storing "" — the schema requires a
   *  non-empty string when the field is present at all. */
  const clear = (key: "note" | "warn" | "figure" | "branch") => {
    const next = { ...step };
    delete next[key];
    onChange(next);
  };

  return (
    <section className="grid scroll-mt-24 grid-cols-[2rem_minmax(0,1fr)] gap-4 border-b border-outline/40 py-6 last:border-b-0">
      <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {index + 1}
      </span>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-start gap-2">
          <EditableText
            value={step.title}
            onChange={(v) => set("title", v)}
            ariaLabel={`Step ${index + 1} title`}
            className="text-base font-bold"
            placeholder="What the reader does"
          />
          <div className="flex shrink-0 gap-1 pt-1">
            <IconButton
              label="Move up"
              icon="arrow_upward"
              onClick={() => onMove(-1)}
              disabled={index === 0}
            />
            <IconButton
              label="Move down"
              icon="arrow_downward"
              onClick={() => onMove(1)}
              disabled={index === total - 1}
            />
            <IconButton
              label="Delete step"
              icon="delete"
              onClick={() => setConfirmingDelete(true)}
              danger
            />
          </div>
        </div>

        {confirmingDelete && (
          <div className="flex items-center gap-2 rounded-lg border border-error/40 bg-error-background p-2 text-[13px]">
            <span className="text-error">Delete this step?</span>
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md bg-error px-2 py-1 text-xs font-semibold text-white hover:opacity-90 hover:cursor-pointer"
            >
              Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-md border border-outline px-2 py-1 text-xs font-semibold hover:cursor-pointer"
            >
              Keep
            </button>
          </div>
        )}

        <EditableText
          value={step.body}
          onChange={(v) => set("body", v)}
          ariaLabel={`Step ${index + 1} body`}
          className="max-w-[68ch] text-[15px] leading-relaxed"
          placeholder="The instruction, in full sentences."
          rows={3}
        />

        {step.note !== undefined && (
          <Callout
            kind="note"
            value={step.note}
            onChange={(v) => set("note", v)}
            onRemove={() => clear("note")}
            index={index}
          />
        )}

        {step.warn !== undefined && (
          <Callout
            kind="warn"
            value={step.warn}
            onChange={(v) => set("warn", v)}
            onRemove={() => clear("warn")}
            index={index}
          />
        )}

        <FigureEditor
          figure={step.figure}
          subjectKey={subjectKey}
          symptomId={symptomId}
          onChange={(figure) => set("figure", figure)}
          onRemove={() => clear("figure")}
        />

        <BranchEditor
          branch={step.branch}
          symptoms={symptoms}
          currentSymptomId={symptomId}
          onChange={(branch) => set("branch", branch)}
          onRemove={() => clear("branch")}
        />

        <div className="flex flex-wrap gap-2 pt-1">
          {step.note === undefined && (
            <AddButton label="Add note" onClick={() => set("note", "")} />
          )}
          {step.warn === undefined && (
            <AddButton label="Add warning" onClick={() => set("warn", "")} />
          )}
        </div>
      </div>
    </section>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`grid size-7 place-items-center rounded-md border border-outline transition-colors hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed ${
        danger
          ? "text-error hover:bg-error-background"
          : "text-info-light hover:bg-surface-container-low/30"
      }`}
    >
      <span className="material-symbols-outlined !text-[16px]">{icon}</span>
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-dashed border-outline px-2.5 py-1 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
    >
      + {label}
    </button>
  );
}

/**
 * A note or a warning.
 *
 * The two are not interchangeable and the placeholders say so: `note` is
 * "read this before you click", `warn` is for something with consequences —
 * lost work, a forced shutdown, a replacement handset. Getting that wrong
 * makes every warning worth less.
 */
function Callout({
  kind,
  value,
  onChange,
  onRemove,
  index,
}: {
  kind: "note" | "warn";
  value: string;
  onChange: (v: string) => void;
  onRemove: () => void;
  index: number;
}) {
  const isWarn = kind === "warn";

  return (
    <div
      className={`flex items-start gap-2 rounded-lg border-l-4 p-2 ${
        isWarn ? "border-error bg-error-background" : "border-warning bg-warning/10"
      }`}
    >
      <span
        className={`material-symbols-outlined !text-[18px] pt-1 ${
          isWarn ? "text-error" : "text-warning"
        }`}
      >
        {isWarn ? "warning" : "info"}
      </span>
      <EditableText
        value={value}
        onChange={onChange}
        ariaLabel={`Step ${index + 1} ${isWarn ? "warning" : "note"}`}
        className="text-sm"
        rows={2}
        placeholder={
          isWarn
            ? "What this could cost them — lost work, a wipe, a replacement."
            : "Something to know before doing it."
        }
      />
      <IconButton label={`Remove ${kind}`} icon="close" onClick={onRemove} />
    </div>
  );
}
