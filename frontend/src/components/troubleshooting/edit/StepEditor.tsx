import { useState } from "react";
import EditableText from "./EditableText";
import RichTextField from "./RichTextField";
import FigureEditor from "./FigureEditor";
import BranchEditor from "./BranchEditor";
import LinkEditor from "./LinkEditor";
import BlockRow, {
  RailLabel,
  BLOCK_STYLES,
  MENU_PANEL,
  MENU_ITEM,
  MENU_ITEM_DANGER,
} from "./BlockRow";
import {
  orderedBlocks,
  moveBlock,
  type BlockKind,
} from "@/lib/troubleshootingBlocks";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Step, SymptomListing } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                      EDITING ONE STEP                           |
///  +-----------------------------------------------------------------+
//
//  Title and body always; note, warn, figure and branch added only when
//  wanted. Empty optional fields are not rendered as empty boxes — five blank
//  inputs under every step would bury the two that are always there, and the
//  schema treats absent and empty as different things anyway.
//
//  LAID OUT AS A GUTTER RAIL. Every row names itself in a fixed left column
//  and, if it is an optional block, carries a coloured spine that matches. The
//  previous version stacked all five fields as identical white boxes, so
//  nothing said which was the warning — see BlockRow for why that matters more
//  than it sounds.
//
//  MOVE AND DELETE SIT ON THE STEP, not in a separate reordering mode. The
//  ordering of these articles is load-bearing — the house rule is cheapest step
//  first — so moving one is ordinary editing, not a special operation.
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
  const clear = (key: BlockKind) => {
    const next = { ...step };
    delete next[key];

    // Dropped from the order as well. `orderedBlocks` tolerates a stale entry,
    // but leaving one behind would mean re-adding the block later silently
    // restored a position somebody had moved it away from.
    if (next.blockOrder) {
      const remaining = next.blockOrder.filter((kind) => kind !== key);
      if (remaining.length > 1) next.blockOrder = remaining;
      else delete next.blockOrder;
    }

    onChange(next);
  };

  /** The blocks it has, in the order it wants them shown. */
  const blocks = orderedBlocks(step);

  /** What this step does not have yet, in the order the Insert row offers it. */
  const available = (["note", "warn", "figure", "branch", "link"] as const).filter(
    (kind) => step[kind] === undefined
  );

  return (
    <section className="scroll-mt-24 rounded-xl border border-outline bg-surface-container-lowest p-5">
      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4">
        <RailLabel>Step {index + 1}</RailLabel>

        <div className="flex items-center gap-2 border-b border-outline/60 pb-1.5">
          <EditableText
            value={step.title}
            onChange={(v) => set("title", v)}
            ariaLabel={`Step ${index + 1} title`}
            className="text-lg font-semibold tracking-tight"
            placeholder="What the reader does"
          />

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Step ${index + 1} actions`}
              className="grid size-7 shrink-0 place-items-center rounded-lg border border-outline text-info-light transition-colors hover:bg-surface-container-low hover:text-on-background data-[state=open]:bg-surface-container-low data-[state=open]:text-on-background hover:cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[16px]">more_horiz</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={`w-48 ${MENU_PANEL}`}>
              <DropdownMenuItem
                disabled={index === 0}
                onSelect={() => onMove(-1)}
                className={MENU_ITEM}
              >
                Move step up
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={index === total - 1}
                onSelect={() => onMove(1)}
                className={MENU_ITEM}
              >
                Move step down
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmingDelete(true)}
                className={MENU_ITEM_DANGER}
              >
                Delete step
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <RailLabel>Body</RailLabel>
        <RichTextField
          value={step.body}
          onChange={(v) => set("body", v)}
          ariaLabel={`Step ${index + 1} body`}
          className="mt-3 text-[14px] leading-relaxed"
          placeholder="The instruction, in full sentences."
        />
      </div>

      {confirmingDelete && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-error/40 bg-error-background p-2 text-[13px]">
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

      {/* Rendered in the step's own order, not a fixed one — the same
          `orderedBlocks` the reader uses, so what an author arranges here is
          exactly what a reader gets. */}
      <div className="mt-3.5 flex flex-col gap-3.5">
        {blocks.map((kind, position) => (
          <BlockRow
            key={kind}
            kind={kind}
            onRemove={() => clear(kind)}
            onMoveUp={() => onChange(moveBlock(step, kind, -1))}
            onMoveDown={() => onChange(moveBlock(step, kind, 1))}
            canMoveUp={position > 0}
            canMoveDown={position < blocks.length - 1}
          >
            {kind === "note" && (
              <RichTextField
                value={step.note ?? ""}
                onChange={(v) => set("note", v)}
                ariaLabel={`Step ${index + 1} note`}
                className="text-[13.5px] leading-relaxed"
                placeholder="Context the reader needs but can skip."
              />
            )}

            {kind === "warn" && (
              <RichTextField
                value={step.warn ?? ""}
                onChange={(v) => set("warn", v)}
                ariaLabel={`Step ${index + 1} warning`}
                className="text-[13.5px] leading-relaxed"
                placeholder="What this could cost them — lost work, a wipe, a replacement."
              />
            )}

            {kind === "figure" && (
              <FigureEditor
                figure={step.figure}
                subjectKey={subjectKey}
                symptomId={symptomId}
                onChange={(figure) => set("figure", figure)}
                onRemove={() => clear("figure")}
                bare
              />
            )}

            {kind === "link" && (
              <LinkEditor
                link={step.link}
                onChange={(link) => set("link", link)}
              />
            )}

            {kind === "branch" && (
              <BranchEditor
                branch={step.branch}
                symptoms={symptoms}
                currentSymptomId={symptomId}
                onChange={(branch) => set("branch", branch)}
                onRemove={() => clear("branch")}
                bare
              />
            )}
          </BlockRow>
        ))}
      </div>

      {available.length > 0 && (
        <div className="mt-3.5 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-4 border-t border-outline/30 pt-3.5">
          <RailLabel>Insert</RailLabel>
          <div className="flex flex-wrap gap-2 pt-1">
            {available.map((kind) => (
              <InsertButton key={kind} kind={kind} onClick={() => add(kind)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );

  /**
   * Added empty, so the field appears waiting rather than the editor guessing
   * at content nobody asked for — but empty in the shape the SCHEMA allows.
   *
   * `images` is `.min(1).optional()`, so a figure starts with no images key at
   * all rather than an empty array, which would be rejected on the first
   * autosave. And a branch starts pointed at a real symptom, because
   * `targetSymptomId` is a slug and "" is not one.
   */
  function add(kind: BlockKind) {
    if (kind === "link") {
      set("link", { label: "", url: "" });
    } else if (kind === "figure") {
      set("figure", { caption: "" });
    } else if (kind === "branch") {
      set("branch", {
        label: "",
        targetSymptomId:
          symptoms.find((s) => s.id !== symptomId)?.id ?? symptomId,
      });
    } else {
      set(kind, "");
    }
  }
}

/**
 * One button per block type a step does not yet have.
 *
 * Dashed and tinted in the type's own colour, so the button and the row it
 * creates are recognisably the same thing before it exists.
 */
function InsertButton({ kind, onClick }: { kind: BlockKind; onClick: () => void }) {
  const style = BLOCK_STYLES[kind];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md border border-dashed bg-surface px-2.5 py-1.5 text-[12.5px] font-semibold whitespace-nowrap transition-colors hover:cursor-pointer ${style.insert}`}
    >
      <span className="material-symbols-outlined !text-[15px]">{style.icon}</span>
      {style.label}
    </button>
  );
}
