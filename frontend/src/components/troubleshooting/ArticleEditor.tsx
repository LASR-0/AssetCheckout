import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, TrayLabel, Sheet } from "@/components/ui/tray";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented";
import { Modal, ModalBody, ModalFooter, ModalTitle } from "@/components/ui/modal";
import { btn } from "@/components/ui/variants";
import { uploadTroubleshootingImage } from "@/api/troubleshooting";
import { moveBlock, orderedBlocks, type BlockKind } from "@/lib/troubleshootingBlocks";
import RichTextField from "./edit/RichTextField";
import type { ArticleEditor as Editor, SaveState } from "@/hooks/useArticleEditor";
import type { LibraryRow } from "./useLibrary";
import type { ArticleBody, Branch, ContentIssue, ExternalLink, Figure, Step } from "@/types/troubleshootingType";


///  +-----------------------------------------------------------------+
///  |                  EDITING AN ARTICLE                             |
///  +-----------------------------------------------------------------+
//
//  A real content tool, so laid out as one: a rail of the article's parts
//  on the left (its summary, then each step, marked New or Changed against
//  what readers see), and one part open at a time on the right.
//
//  IT AUTOSAVES TO A DRAFT (hooks/useArticleEditor). Readers never see a
//  draft, so the only deliberate actions are Publish and Discard, and the
//  bar says in words, every time, whether readers can see this yet.
//
//  A STEP CARRIES AT MOST ONE OF EACH BLOCK. The five are named fields on
//  the step, not a list, so "Add to this step" offers only what it doesn't
//  have yet; their ORDER is the author's (lib/troubleshootingBlocks).
///  +-----------------------------------------------------------------+

export type EditState = "draft" | "changes" | "clean" | "notes";
export type Part = "details" | number;

const BAR: Record<EditState, { tone: string; icon: string; title: string; msg: string }> = {
  draft: { tone: "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]", icon: "schedule", title: "Not published yet", msg: "Nobody can see this but you." },
  changes: { tone: "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]", icon: "pending", title: "Unpublished changes", msg: "Readers still see the published version." },
  clean: { tone: "bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]", icon: "check_circle", title: "Published", msg: "Readers see what you see here." },
  notes: { tone: "bg-brand-sub text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]", icon: "sticky_note_2", title: "Published, with notes", msg: "Readers see what you see here." },
};

function saveText(s: SaveState): string | null {
  if (s.kind === "saving") return "Saving…";
  if (s.kind === "dirty") return "Unsaved";
  if (s.kind === "saved") return "Draft saved.";
  if (s.kind === "error") return s.message;
  return null;
}

/// ── The bar ──────────────────────────────────────────────────────────

type BarProps = {
  state: EditState;
  saveState: SaveState;
  /** Other subjects listing this article, by label. */
  alsoUnder: string[];
  preview: boolean;
  onPreview: (on: boolean) => void;
  publishing: boolean;
  issues: ContentIssue[];
  warnings: string[];
  onDiscardChanges: () => void;
  onPublish: () => void;
  onDone: () => void;
};

export function EditBar({ state, saveState, alsoUnder, preview, onPreview, publishing, issues, warnings, onDiscardChanges, onPublish, onDone }: BarProps) {
  const b = BAR[state];
  const canPublish = (state === "draft" || state === "changes") && !publishing;
  const saved = saveText(saveState);
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
        <span className="flex h-7 items-center gap-1.5 rounded-pill bg-brand pr-2.75 pl-2 fs-11.5 font-medium text-on-brand">
          <Icon name="edit" size={15} />
          Editing
        </span>
        <span className={cn("inline-flex h-7 items-center gap-1.25 rounded-pill pr-2.5 pl-2 fs-11.5 font-medium whitespace-nowrap", b.tone)}>
          <Icon name={b.icon} size={15} />
          {b.title}
        </span>
        <span className="min-w-0 flex-[1_1_12.5rem] fs-12 text-pretty text-tx3">
          {b.msg}
          {alsoUnder.length > 0 && ` Also listed under ${alsoUnder.join(", ")}, so readers there see it too.`}
          {saved && <span className={cn("ml-1.5", saveState.kind === "error" ? "text-stop" : "text-mut")}>{saved}</span>}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          <SegmentedControl
            label="Edit or preview"
            value={preview ? "pv" : "edit"}
            onValueChange={(v) => onPreview(v === "pv")}
            options={[
              { value: "edit", label: "Edit", icon: "edit" },
              { value: "pv", label: "Preview", icon: "visibility" },
            ]}
          />
          {state === "changes" && (
            <button type="button" onClick={onDiscardChanges} disabled={publishing} className={btn({ size: "md", className: "border-line fs-12" })}>
              Discard changes
            </button>
          )}
          <button type="button" onClick={onPublish} disabled={!canPublish} className={btn({ variant: "brand", size: "md", className: "fs-12" })}>
            <Icon name="publish" size={16} />
            {publishing ? "Publishing…" : "Publish"}
          </button>
          <button type="button" onClick={onDone} className={btn({ size: "md", className: "fs-12" })}>
            Done
          </button>
        </div>
      </div>
      {warnings.length > 0 && (
        <div className="flex gap-1.75 fs-12 leading-[1.45] text-tx2">
          <Icon name="sticky_note_2" size={15} className="text-brand-tx" />
          <span>{warnings.join(" ")}</span>
        </div>
      )}
      {issues.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-10 bg-stop-bg px-3.5 py-2.5 shadow-[inset_0_0_0_1px_var(--stop-line)]">
          <span className="fs-12 font-semibold text-stop">This can&rsquo;t be published yet</span>
          {issues.map((issue, i) => (
            <span key={`${issue.path}-${i}`} className="fs-12 text-tx">
              {issue.message}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/// ── Confirming ───────────────────────────────────────────────────────

export function Confirm({
  open,
  title,
  children,
  okLabel,
  danger,
  busy,
  onOk,
  onClose,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  okLabel: string;
  danger?: boolean;
  busy?: boolean;
  onOk: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} label="Confirm" width={500}>
      <ModalBody className="gap-3">
        <ModalTitle className="text-pretty">{title}</ModalTitle>
        <div className="fs-12.5 leading-[1.55] text-pretty text-tx2">{children}</div>
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn({ size: "md" })}>
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={onOk} className={btn({ variant: danger ? "danger-solid" : "brand", size: "md" })}>
          {okLabel}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/// ── The editor ───────────────────────────────────────────────────────

type EditorProps = {
  editor: Editor;
  subjectKey: string;
  symptomId: string;
  part: Part;
  onPart: (part: Part) => void;
  /** The whole library, for the branch picker. */
  rows: LibraryRow[];
  /** Symptom ids listed under this subject, so a branch to one needs no subject. */
  here: Set<string>;
  labelOf: (symptomId: string) => string | null;
  /** Offered only for an article that's never been published. */
  onDiscardArticle: (() => void) | null;
};

export function ArticleEditor({ editor, subjectKey, symptomId, part, onPart, rows, here, labelOf, onDiscardArticle }: EditorProps) {
  const d = editor.working!;
  const p = editor.article?.published ?? null;
  const [removing, setRemoving] = useState<number | null>(null);

  const sel = typeof part === "number" ? Math.min(part, d.steps.length - 1) : "details";
  const change = (i: number) => (p ? (!p.steps[i] ? "New" : JSON.stringify(p.steps[i]) !== JSON.stringify(d.steps[i]) ? "Changed" : null) : null);
  const detailsChanged =
    p && (["summary", "timeEstimate", "appliesTo", "before"] as const).some((f) => JSON.stringify(p[f]) !== JSON.stringify(d[f])) ? "Changed" : null;

  const set = (mutate: (body: ArticleBody) => ArticleBody) => editor.update(mutate);
  const setStep = (i: number, next: Step) => set((b) => ({ ...b, steps: b.steps.map((s, j) => (j === i ? next : s)) }));
  const addStep = () => {
    set((b) => ({ ...b, steps: [...b.steps, { title: "", body: "" }] }));
    onPart(d.steps.length);
  };
  const moveStep = (i: number, by: -1 | 1) => {
    const to = i + by;
    if (to < 0 || to >= d.steps.length) return;
    set((b) => {
      const steps = [...b.steps];
      [steps[i], steps[to]] = [steps[to], steps[i]];
      return { ...b, steps };
    });
    onPart(to);
  };
  const removeStep = (i: number) => {
    // The schema needs one step: an article with none is a draft, not an article.
    if (d.steps.length < 2) return;
    set((b) => ({ ...b, steps: b.steps.filter((_, j) => j !== i) }));
    onPart(Math.max(0, i - 1));
    setRemoving(null);
  };

  const railItem = (key: Part, mark: ReactNode, label: string, badge: string | null, square?: boolean) => {
    const on = sel === key;
    return (
      <button
        key={String(key)}
        type="button"
        onClick={() => onPart(key)}
        aria-current={on ? "step" : undefined}
        className={cn(
          "flex max-w-55 flex-none cursor-pointer items-start gap-2.5 rounded-8 border-0 p-2 text-left font-sans fs-12 leading-[1.4] outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand desk:max-w-none",
          on ? "bg-brand-sub font-medium text-brand-tx hover:bg-brand-sub" : "bg-transparent text-tx2"
        )}
      >
        <span
          className={cn(
            "grid size-5 flex-none place-items-center",
            square ? "rounded-6" : "rounded-full",
            on ? "bg-brand text-on-brand" : "bg-sheet text-mut shadow-[inset_0_0_0_1px_var(--line)]"
          )}
        >
          {mark}
        </span>
        <span className="min-w-0 flex-1 text-pretty">{label}</span>
        {badge && <ChangeBadge text={badge} />}
      </button>
    );
  };

  const step = typeof sel === "number" ? d.steps[sel] : null;

  return (
    <div className="grid grid-cols-1 items-start gap-x-9 gap-y-5 desk:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col gap-2 desk:sticky desk:top-24">
        <Tray label="In this article" aside={`${d.steps.length} ${d.steps.length === 1 ? "step" : "steps"}`} className="shadow-[inset_0_0_0_1px_var(--brand-line)]">
          <Sheet className="flex gap-px overflow-x-auto p-1.5 desk:flex-col">
            {railItem("details", <Icon name="notes" size={14} />, "Summary & details", detailsChanged, true)}
            {d.steps.map((s, i) => railItem(i, <span className="font-title fs-10">{i + 1}</span>, s.title || "Untitled step", change(i)))}
          </Sheet>
        </Tray>
        <button
          type="button"
          onClick={addStep}
          className="flex h-10.5 cursor-pointer items-center justify-center gap-1.5 rounded-12 border-[1.5px] border-dashed border-brand-line bg-transparent font-sans fs-12 font-medium text-brand-tx outline-none hover:bg-brand-sub focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Icon name="add" size={17} />
          Add step
        </button>
      </aside>

      <div className="min-w-0 max-w-205">
        {sel === "details" ? (
          <section aria-label="Summary and details" className="flex flex-col rounded-16 border border-line bg-sheet">
            <div className="flex flex-col gap-1 px-4.5 pt-5 desk:px-8">
              <TrayLabel className="text-brand-tx">Summary &amp; details</TrayLabel>
              <span className="fs-12.5 text-tx3">Shown under the title, before step 1.</span>
            </div>
            <div className="flex flex-col gap-5 px-4.5 pt-4.5 pb-6.5 desk:px-8">
              <Field label="Summary" sub="what's happening, in a sentence or two">
                <RichTextField
                  value={d.summary}
                  onChange={(summary) => set((b) => ({ ...b, summary }))}
                  ariaLabel="Summary"
                  className="fs-13.5 leading-[1.6]"
                />
              </Field>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] gap-3.5">
                <Field label="Time estimate">
                  <DashedInput value={d.timeEstimate} onChange={(timeEstimate) => set((b) => ({ ...b, timeEstimate }))} placeholder="About 10 minutes" />
                </Field>
                <Field label="Applies to">
                  <DashedInput value={d.appliesTo} onChange={(appliesTo) => set((b) => ({ ...b, appliesTo }))} placeholder="KSB Lenovo laptops" />
                </Field>
              </div>
              <Field label="Before you start" sub="what they need in hand before step 1. Leave empty if nothing.">
                <div className="flex flex-col gap-2">
                  {d.before.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Icon name="checklist" size={17} className="text-ok" />
                      <DashedInput
                        value={item}
                        onChange={(v) => set((b) => ({ ...b, before: b.before.map((x, j) => (j === i ? v : x)) }))}
                        placeholder="e.g. A cable, a password, ten minutes"
                        label={`Prerequisite ${i + 1}`}
                      />
                      <SmallButton icon="close" label={`Remove prerequisite ${i + 1}`} onClick={() => set((b) => ({ ...b, before: b.before.filter((_, j) => j !== i) }))} />
                    </div>
                  ))}
                  <AddChip onClick={() => set((b) => ({ ...b, before: [...b.before, ""] }))}>Add a prerequisite</AddChip>
                </div>
              </Field>
            </div>
            <CardFoot>
              {onDiscardArticle && (
                <button type="button" onClick={onDiscardArticle} className={btn({ variant: "ghost", size: "md", className: "h-10 px-3 fs-12 text-stop hover:bg-stop-bg hover:text-stop" })}>
                  Discard this article
                </button>
              )}
              <span className="flex-1" />
              <button type="button" onClick={() => onPart(0)} className={btn({ size: "md", className: "h-10 rounded-10 fs-12.5" })}>
                Step 1
                <Icon name="arrow_forward" size={17} />
              </button>
            </CardFoot>
          </section>
        ) : (
          step && (
            <StepCard
              key={sel}
              step={step}
              index={sel as number}
              total={d.steps.length}
              badge={change(sel as number)}
              subjectKey={subjectKey}
              symptomId={symptomId}
              rows={rows}
              here={here}
              labelOf={labelOf}
              onChange={(next) => setStep(sel as number, next)}
              onMove={(by) => moveStep(sel as number, by)}
              onRemove={() => (step.title.trim() || step.body.trim() ? setRemoving(sel as number) : removeStep(sel as number))}
              onPrev={() => onPart(sel === 0 ? "details" : (sel as number) - 1)}
              onNext={() => ((sel as number) === d.steps.length - 1 ? addStep() : onPart((sel as number) + 1))}
            />
          )
        )}
      </div>

      <Confirm
        open={removing !== null}
        title={`Remove step ${(removing ?? 0) + 1}?`}
        okLabel="Remove step"
        danger
        onOk={() => removing !== null && removeStep(removing)}
        onClose={() => setRemoving(null)}
      >
        Its title, body and blocks go with it. Discarding the draft brings it back until you publish.
      </Confirm>
    </div>
  );
}

/// ── One step ─────────────────────────────────────────────────────────

const BLOCK: Record<BlockKind, { label: string; add: string; icon: string; hint: string; frame: string; tone: string; dash: string }> = {
  note: { label: "Note", add: "Note", icon: "info", hint: "Aside, safe to skip", frame: "bg-prog-bg shadow-[inset_0_0_0_1px_var(--prog-line)]", tone: "text-prog", dash: "border-prog-line" },
  warn: { label: "Warning", add: "Warning", icon: "warning", hint: "The cost of getting it wrong", frame: "bg-stop-bg shadow-[inset_0_0_0_1px_var(--stop-line)]", tone: "text-stop", dash: "border-stop-line" },
  figure: { label: "Screenshot", add: "Screenshot", icon: "image", hint: "With its menu path", frame: "bg-subtle shadow-[inset_0_0_0_1px_var(--line)]", tone: "text-tx3", dash: "border-strong" },
  branch: { label: "If this applies", add: "Link to symptom", icon: "alt_route", hint: "Sends them to another symptom", frame: "bg-brand-sub shadow-[inset_0_0_0_1px_var(--brand-line)]", tone: "text-brand-tx", dash: "border-brand-line" },
  link: { label: "External link", add: "External link", icon: "open_in_new", hint: "Leaves Checkout", frame: "bg-sheet shadow-[inset_0_0_0_1px_var(--brand-line)]", tone: "text-brand-tx", dash: "border-brand-line" },
};

const ALL_BLOCKS: BlockKind[] = ["note", "warn", "figure", "branch", "link"];

type StepCardProps = {
  step: Step;
  index: number;
  total: number;
  badge: string | null;
  subjectKey: string;
  symptomId: string;
  rows: LibraryRow[];
  here: Set<string>;
  labelOf: (symptomId: string) => string | null;
  onChange: (step: Step) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  onPrev: () => void;
  onNext: () => void;
};

function StepCard({ step, index, total, badge, subjectKey, symptomId, rows, here, labelOf, onChange, onMove, onRemove, onPrev, onNext }: StepCardProps) {
  // A branch can't be saved without a target (it's a slug, and "" isn't
  // one), so a new one waits here, as a search, until one is picked.
  const [pendingBranch, setPendingBranch] = useState(false);
  const set = <K extends keyof Step>(key: K, value: Step[K]) => onChange({ ...step, [key]: value });

  /** Drop the key, and its place in the order, rather than storing "". */
  const clear = (kind: BlockKind) => {
    if (kind === "branch") setPendingBranch(false);
    const next = { ...step };
    delete next[kind];
    if (next.blockOrder) {
      const left = next.blockOrder.filter((k) => k !== kind);
      if (left.length > 1) next.blockOrder = left;
      else delete next.blockOrder;
    }
    onChange(next);
  };

  const add = (kind: BlockKind) => {
    if (kind === "branch") return setPendingBranch(true);
    if (kind === "link") return set("link", { label: "", url: "" });
    if (kind === "figure") return set("figure", { caption: "" });
    set(kind, "");
  };

  const blocks = orderedBlocks(step);
  const showBranch = !step.branch && pendingBranch;
  const missing = ALL_BLOCKS.filter((k) => step[k] === undefined && !(k === "branch" && pendingBranch));
  const last = index === total - 1;

  const frame = (kind: BlockKind, position: number, body: ReactNode, movable = true) => {
    const b = BLOCK[kind];
    return (
      <div key={kind} className={cn("flex flex-col gap-2.5 rounded-11 pt-2.5 pr-2.5 pb-3 pl-3", b.frame)}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <Icon name={b.icon} size={16} className={b.tone} />
          <TrayLabel className={b.tone}>{b.label}</TrayLabel>
          <span className="fs-11 text-mut">{b.hint}</span>
          <span className="ml-auto flex gap-px">
            {movable && (
              <>
                <SmallButton icon="arrow_upward" label="Move up" disabled={position === 0} onClick={() => onChange(moveBlock(step, kind, -1))} />
                <SmallButton icon="arrow_downward" label="Move down" disabled={position === blocks.length - 1} onClick={() => onChange(moveBlock(step, kind, 1))} />
              </>
            )}
            <SmallButton icon="close" label={`Remove ${b.label.toLowerCase()}`} onClick={() => clear(kind)} />
          </span>
        </div>
        {body}
      </div>
    );
  };

  return (
    <section aria-label={`Step ${index + 1}`} className="flex flex-col rounded-16 border border-line bg-sheet">
      <div className="flex flex-wrap items-center gap-2 px-4.5 pt-4.5 desk:px-8">
        <TrayLabel className="text-brand-tx">
          Step {index + 1} of {total}
        </TrayLabel>
        {badge && <ChangeBadge text={badge} />}
        <span className="ml-auto flex gap-0.5">
          <SmallButton icon="arrow_upward" label="Move earlier" size="md" disabled={index === 0} onClick={() => onMove(-1)} />
          <SmallButton icon="arrow_downward" label="Move later" size="md" disabled={last} onClick={() => onMove(1)} />
          <SmallButton icon="delete" label="Remove step" size="md" danger disabled={total < 2} onClick={onRemove} />
        </span>
      </div>
      <div className="flex flex-col gap-4 px-4.5 pt-3.5 pb-6.5 desk:px-8">
        <input
          value={step.title}
          onChange={(e) => set("title", e.target.value)}
          aria-label={`Step ${index + 1} title`}
          placeholder="What to do, in a few words"
          className="h-12 w-full min-w-0 rounded-10 border border-dashed border-brand-line bg-sheet px-3.5 font-sans fs-17 font-semibold text-tx outline-none placeholder:font-normal placeholder:text-placeholder focus:border-brand"
        />
        <RichTextField
          value={step.body}
          onChange={(v) => set("body", v)}
          ariaLabel={`Step ${index + 1} body`}
          className="fs-14 leading-[1.65]"
          hint="Bold the exact words they'll see on screen"
        />

        {blocks.map((kind, position) => {
          if (kind === "note" || kind === "warn")
            return frame(
              kind,
              position,
              <RichTextField value={step[kind] ?? ""} onChange={(v) => set(kind, v)} ariaLabel={`Step ${index + 1} ${BLOCK[kind].label.toLowerCase()}`} className="fs-13 leading-[1.6]" />
            );
          if (kind === "figure")
            return frame(kind, position, <FigureFields figure={step.figure!} subjectKey={subjectKey} symptomId={symptomId} onChange={(f) => set("figure", f)} />);
          if (kind === "link") return frame(kind, position, <LinkFields link={step.link!} onChange={(l) => set("link", l)} />);
          return frame(
            kind,
            position,
            <BranchFields branch={step.branch!} rows={rows} here={here} symptomId={symptomId} labelOf={labelOf} onChange={(b) => set("branch", b)} />
          );
        })}
        {showBranch &&
          frame(
            "branch",
            blocks.length,
            <BranchFields branch={null} rows={rows} here={here} symptomId={symptomId} labelOf={labelOf} onChange={(b) => onChange({ ...step, branch: b })} />,
            false
          )}

        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 fs-12 text-mut">Add to this step</span>
            {missing.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => add(k)}
                className={cn(
                  "flex h-8 cursor-pointer items-center gap-1.25 rounded-8 border border-dashed bg-sheet pr-2.75 pl-2 font-sans fs-11.5 font-medium outline-none hover:brightness-97 focus-visible:outline-2 focus-visible:outline-brand",
                  BLOCK[k].dash,
                  BLOCK[k].tone
                )}
              >
                <Icon name={BLOCK[k].icon} size={15} />
                {BLOCK[k].add}
              </button>
            ))}
          </div>
        )}
      </div>
      <CardFoot>
        <button type="button" onClick={onPrev} className={btn({ variant: "ghost", size: "md", className: "h-10 rounded-10 px-3 fs-12.5" })}>
          <Icon name="arrow_back" size={17} />
          {index === 0 ? "Summary & details" : `Step ${index}`}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onNext} className={btn({ size: "md", className: "h-10 rounded-10 fs-12.5" })}>
          {last ? `Add step ${index + 2}` : `Step ${index + 2}`}
          <Icon name={last ? "add" : "arrow_forward"} size={17} />
        </button>
      </CardFoot>
    </section>
  );
}

/// ── The block fields ─────────────────────────────────────────────────

/** Strip the data: prefix; the API wants raw base64. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

const SIZES = [
  { value: "flyout", label: "Menu or panel" },
  { value: "window", label: "Window" },
  { value: "full", label: "Whole screen" },
] as const;

/**
 * Screenshots go up in light and dark pairs (one request, so the pair shares
 * a name and can't drift apart). A figure can hold a few, read in order: the
 * menu first, then where it lands.
 */
function FigureFields({ figure, subjectKey, symptomId, onChange }: { figure: Figure; subjectKey: string; symptomId: string; onChange: (f: Figure) => void }) {
  const [light, setLight] = useState<File | null>(null);
  const [dark, setDark] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const images = figure.images ?? [];

  async function upload() {
    if (!light) return;
    setUploading(true);
    setError(null);
    try {
      const up = await uploadTroubleshootingImage(subjectKey, symptomId, {
        name: figure.caption.slice(0, 40) || "Figure",
        light: await readAsBase64(light),
        dark: dark ? await readAsBase64(dark) : undefined,
      });
      onChange({ ...figure, images: [...images, { src: up.src, ...(up.srcDark ? { srcDark: up.srcDark } : {}) }] });
      setLight(null);
      setDark(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange({ ...figure, images: next });
  };

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] items-start gap-3">
      <div className="flex flex-col gap-2">
        {images.map((img, i) => (
          <div key={img.src} className="relative h-30 overflow-hidden rounded-10 border border-line bg-sheet">
            <img src={`/troubleshooting/${img.src}`} alt="" className="size-full object-contain" />
            <span className="absolute right-11 bottom-2 left-2 truncate rounded-5 border border-line bg-sheet px-1.5 py-0.5 font-mono fs-10.5 text-tx3">
              {img.src.split("/").pop()}
              {img.srcDark ? " + dark" : ""}
            </span>
            <span className="absolute top-1.5 right-1.5 flex flex-col gap-1">
              <OverlayButton icon="close" label="Remove image" onClick={() => onChange({ ...figure, images: images.filter((_, j) => j !== i) })} />
              {images.length > 1 && <OverlayButton icon="arrow_upward" label="Show earlier" disabled={i === 0} onClick={() => move(i, i - 1)} />}
              {images.length > 1 && <OverlayButton icon="arrow_downward" label="Show later" disabled={i === images.length - 1} onClick={() => move(i, i + 1)} />}
            </span>
          </div>
        ))}
        {!light ? (
          <label className="flex h-30 cursor-pointer flex-col items-center justify-center gap-1 rounded-10 border-[1.5px] border-dashed border-strong bg-sheet text-center fs-12 text-tx3 hover:border-brand hover:text-brand-tx focus-within:border-brand">
            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => setLight(e.target.files?.[0] ?? null)} />
            <Icon name="upload" size={20} />
            {images.length ? "Add another screenshot" : "Choose a screenshot"}
            <span className="fs-11 text-mut">PNG, JPG or WebP</span>
          </label>
        ) : (
          <div className="flex flex-col gap-2 rounded-10 border border-line bg-sheet p-2.5">
            <span className="truncate font-mono fs-11.5 text-tx2">{light.name}</span>
            <label className="flex flex-col gap-1 fs-11.5 text-mut">
              Dark-theme version, if the screen changes with the theme
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setDark(e.target.files?.[0] ?? null)}
                className="w-full min-w-0 fs-11.5 file:mr-2 file:cursor-pointer file:rounded-7 file:border file:border-line file:bg-sheet file:px-2 file:py-1 file:fs-11.5 file:text-tx"
              />
            </label>
            <div className="flex gap-1.5">
              <button type="button" disabled={uploading} onClick={() => void upload()} className={btn({ variant: "primary", size: "sm" })}>
                {uploading ? "Uploading…" : "Upload"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setLight(null);
                  setDark(null);
                }}
                className={btn({ size: "sm", className: "border-line" })}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && <span className="fs-11.5 text-stop">{error}</span>}
      </div>
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1.25">
          <span className="fs-11.5 text-mut">Menu path · shown as the caption</span>
          <input
            value={figure.caption}
            onChange={(e) => onChange({ ...figure, caption: e.target.value })}
            placeholder="Settings › Display › Multiple displays"
            className="h-9.5 min-w-0 rounded-8 border border-dashed border-strong bg-sheet px-2.5 font-mono fs-12 text-tx outline-none placeholder:text-placeholder focus:border-brand"
          />
        </label>
        <div className="flex flex-col gap-1.25">
          <span className="fs-11.5 text-mut">Size</span>
          <SegmentedControl
            label="Screenshot size"
            value={figure.size ?? "flyout"}
            onValueChange={(v) => {
              const next = { ...figure };
              if (v === "flyout") delete next.size;
              else next.size = v;
              onChange(next);
            }}
            options={SIZES.map((s) => ({ value: s.value, label: s.label }))}
            className="self-start [&>button]:fs-11.5"
          />
        </div>
      </div>
    </div>
  );
}

function BranchFields({
  branch,
  rows,
  here,
  symptomId,
  labelOf,
  onChange,
}: {
  /** Null while a new one waits for its target. */
  branch: Branch | null;
  rows: LibraryRow[];
  here: Set<string>;
  symptomId: string;
  labelOf: (symptomId: string) => string | null;
  onChange: (b: Branch) => void;
}) {
  const [picking, setPicking] = useState(!branch);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const results = rows.filter((r) => r.id !== symptomId && (!needle || r.label.toLowerCase().includes(needle))).slice(0, 5);

  const pick = (r: LibraryRow) => {
    // Cross-subject only when this subject doesn't list it: a branch with no
    // subject opens the target under the reader's own.
    const target: Branch = { label: branch?.label ?? "", targetSymptomId: r.id };
    if (!here.has(r.id)) target.targetSubjectKey = r.subjectKey as Branch["targetSubjectKey"];
    onChange(target);
    setPicking(false);
    setQ("");
  };

  return (
    <>
      {branch && (
        <label className="flex flex-col gap-1.25">
          <span className="fs-11.5 text-mut">Reads as</span>
          <input
            value={branch.label}
            onChange={(e) => onChange({ ...branch, label: e.target.value })}
            placeholder="If it still doesn't …"
            className="h-9.5 min-w-0 rounded-8 border border-dashed border-strong bg-sheet px-2.5 font-sans fs-12.5 text-tx outline-none placeholder:text-placeholder focus:border-brand"
          />
        </label>
      )}
      {branch && !picking ? (
        <div className="flex flex-wrap items-center gap-2 rounded-8 bg-sheet py-2 pr-2 pl-3 shadow-[inset_0_0_0_1px_var(--brand-line)]">
          <Icon name="alt_route" size={16} className="text-brand-tx" />
          <span className="min-w-0 flex-[1_1_12.5rem] fs-12.5">
            <span className="text-mut">Goes to </span>
            <span className="font-medium">{labelOf(branch.targetSymptomId) ?? branch.targetSymptomId}</span>
            {branch.targetSubjectKey && <span className="text-mut"> · {branch.targetSubjectKey}</span>}
          </span>
          <button type="button" onClick={() => setPicking(true)} className={btn({ size: "sm", className: "border-line" })}>
            Change
          </button>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-8 border border-dashed border-strong bg-sheet">
          <div className="flex h-10 items-center gap-2 px-2.5">
            <Icon name="search" size={16} className="text-mut" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && branch && setPicking(false)}
              aria-label="Which symptom should it go to?"
              placeholder="Which symptom should it go to?"
              className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans fs-12.5 text-tx outline-none placeholder:text-placeholder"
            />
          </div>
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => pick(r)}
              className="flex w-full cursor-pointer flex-col gap-px border-0 border-t border-line2 bg-transparent px-3 py-2 text-left font-sans text-tx outline-none hover:bg-subtle focus-visible:bg-subtle"
            >
              <span className="fs-12.5">
                {r.label}
                {!r.hasArticle && <span className="text-mut"> · not written yet</span>}
              </span>
              <span className="fs-11 text-mut">{r.subjects.join(", ")}</span>
            </button>
          ))}
          {results.length === 0 && <span className="border-t border-line2 px-3 py-2 fs-12 text-mut">Nothing matches that.</span>}
        </div>
      )}
    </>
  );
}

function LinkFields({ link, onChange }: { link: ExternalLink; onChange: (l: ExternalLink) => void }) {
  const host = (() => {
    try {
      return /^https?:\/\//i.test(link.url) ? new URL(link.url).hostname : null;
    } catch {
      return null;
    }
  })();
  const bad = link.url.length > 0 && !host;
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(12.5rem,1fr))] gap-2.5">
        <label className="flex flex-col gap-1.25">
          <span className="fs-11.5 text-mut">Reads as</span>
          <input
            value={link.label}
            onChange={(e) => onChange({ ...link, label: e.target.value })}
            placeholder="Lenovo's guide to …"
            className="h-9.5 min-w-0 rounded-8 border border-dashed border-strong bg-sheet px-2.5 font-sans fs-12.5 text-tx outline-none placeholder:text-placeholder focus:border-brand"
          />
        </label>
        <label className="flex flex-col gap-1.25">
          <span className="fs-11.5 text-mut">Address</span>
          <input
            value={link.url}
            onChange={(e) => onChange({ ...link, url: e.target.value })}
            placeholder="https://"
            aria-invalid={bad || undefined}
            className="h-9.5 min-w-0 rounded-8 border border-dashed border-strong bg-sheet px-2.5 font-mono fs-12 text-tx outline-none placeholder:text-placeholder focus:border-brand aria-invalid:border-stop"
          />
        </label>
      </div>
      <span className={cn("fs-11.5", bad ? "text-stop" : "text-mut")}>
        {host ? `Opens ${host} in a new tab` : "Use a full address starting with https://"}
      </span>
    </>
  );
}

/// ── Small parts ──────────────────────────────────────────────────────

function Field({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="fs-12 font-medium text-tx2">
        {label}
        {sub && <span className="font-normal text-mut"> · {sub}</span>}
      </span>
      {children}
    </div>
  );
}

function DashedInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="h-10 border-dashed border-brand-line px-3 fs-13"
    />
  );
}

function SmallButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  size = "sm",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid flex-none cursor-pointer place-items-center rounded-7 border-0 bg-transparent p-0 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent",
        size === "md" ? "size-7.5" : "size-7",
        disabled ? "text-dis" : danger ? "text-stop" : "text-tx3"
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function OverlayButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7.5 cursor-pointer place-items-center rounded-7 border border-line bg-sheet p-0 text-tx3 outline-none hover:text-tx focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-45"
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

function AddChip({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 cursor-pointer items-center gap-1.25 self-start rounded-8 border border-dashed border-brand-line bg-transparent pr-2.75 pl-1.75 font-sans fs-12 font-medium text-brand-tx outline-none hover:bg-brand-sub focus-visible:outline-2 focus-visible:outline-brand"
    >
      <Icon name="add" size={15} />
      {children}
    </button>
  );
}

function ChangeBadge({ text }: { text: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-pill px-1.75 fs-10.5 font-medium whitespace-nowrap",
        text === "New" ? "bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]" : "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]"
      )}
    >
      {text}
    </span>
  );
}

function CardFoot({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 rounded-b-16 border-t border-line2 bg-subtle px-4.5 py-3 desk:px-8">{children}</div>;
}
