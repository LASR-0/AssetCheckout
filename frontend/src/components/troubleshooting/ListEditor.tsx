import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ROW_IN, rowIn } from "@/lib/motion";
import { Icon } from "@/components/ui/icon";
import { Tray, Sheet } from "@/components/ui/tray";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalTitle } from "@/components/ui/modal";
import { btn } from "@/components/ui/variants";
import { editableSubjectQuery } from "@/api/queries";
import {
  createArticleDraft,
  createCategory,
  createSymptom,
  deleteCategory,
  deleteSymptom,
  getSymptomLinks,
  moveCategory,
  moveSymptom,
  previewSymptomSlug,
  setCategoryDisabled,
  setCategoryText,
  setSymptomHidden,
  setSymptomLabel,
} from "@/api/troubleshooting";
import { CATEGORY_ICON_CHOICES, iconForGlyph } from "@/lib/categoryIcon";
import { FROM_SYMPTOM_LIST, START_EDITING, troubleshootingArticlePath } from "@/lib/troubleshootingRoutes";
import { useSettledSearch } from "@/hooks/useSettledSearch";
import type { EditableCategory, EditableSymptom } from "@/types/troubleshootingType";


///  +-----------------------------------------------------------------+
///  |            EDITING A SUBJECT'S LIST                             |
///  +-----------------------------------------------------------------+
//
//  The list as an ADMIN sees it: nothing filtered out, because a hidden
//  symptom or a hidden category can't be switched back on if it's invisible
//  here too.
//
//  THESE CHANGES ARE IMMEDIATE, AND THE BAR SAYS SO. Hiding is almost always
//  "get this off the site now", so it doesn't wait behind a publish. Article
//  TEXT is what gets drafted; the list is a set of switches.
//
//  HIDDEN IS UNLISTED, NOT RETRACTED. The article still opens at its own URL,
//  so a link IT already sent keeps working.
//
//  Moves, renames and switches apply to the cached list at once and put it
//  back if the server refuses. Creating waits instead: a new symptom's
//  permanent address is the server's to choose, and rendering a guess at it
//  would show an address it might not end up with.
///  +-----------------------------------------------------------------+

type Status = "pub" | "changes" | "draft" | "unwritten" | "hidden";
type Filter = "all" | Status;
type Tone = "ok" | "brand" | "prog" | "mut";

const STATUS: Record<Status, { label: string; tone: Tone }> = {
  pub: { label: "Published", tone: "ok" },
  changes: { label: "Unpublished changes", tone: "brand" },
  draft: { label: "Draft", tone: "prog" },
  unwritten: { label: "Not written", tone: "mut" },
  hidden: { label: "Hidden", tone: "mut" },
};

const BADGE: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok shadow-[inset_0_0_0_1px_var(--ok-line)]",
  brand: "bg-brand-sub text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]",
  prog: "bg-prog-bg text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]",
  mut: "bg-track text-tx3 shadow-[inset_0_0_0_1px_var(--line)]",
};

const DOT: Record<Tone, string> = { ok: "bg-ok", brand: "bg-brand", prog: "bg-prog", mut: "bg-strong" };

function statusOf(s: EditableSymptom): Status {
  if (s.hidden) return "hidden";
  if (!s.hasArticle) return "unwritten";
  if (!s.published) return "draft";
  return s.hasDraft ? "changes" : "pub";
}

/** A small square icon button; dims rather than disappears at the ends. */
function IconButton({
  icon,
  label,
  onClick,
  disabled,
  danger,
  on,
  size = "md",
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  on?: boolean;
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
        size === "sm" ? "size-5.5" : "size-7.5",
        disabled ? "text-dis" : danger ? "text-stop" : on ? "bg-track text-tx" : "text-tx3"
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

/** Text that saves when you leave it (or press Enter), and only if changed. */
function InlineText({
  value,
  onCommit,
  label,
  className,
}: {
  value: string;
  onCommit: (next: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <input
      // Keyed on the saved value, so a refetch that changes it resets the box.
      key={value}
      defaultValue={value}
      aria-label={label}
      onBlur={(e) => {
        const next = e.target.value.trim();
        if (!next) e.target.value = value;
        else if (next !== value) onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
      className={cn(
        "min-w-0 rounded-7 border border-dashed border-transparent bg-transparent outline-none hover:border-brand-line hover:bg-sheet focus:border-brand focus:bg-sheet",
        className
      )}
    />
  );
}

type Props = {
  subjectKey: string;
  subjectLabel: string;
};

export function ListEditor({ subjectKey, subjectLabel }: Props) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const query = editableSubjectQuery(subjectKey);
  const { data: categories, error: loadError } = useQuery(query);

  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [newCat, setNewCat] = useState(false);
  const [deleting, setDeleting] = useState<{ symptom: EditableSymptom; category: EditableCategory } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  /** Apply to the cached list, call the server, refetch if it refused. */
  async function optimistic(apply: (list: EditableCategory[]) => EditableCategory[], call: () => Promise<unknown>) {
    setError(null);
    client.setQueryData(query.queryKey, (list) => (list ? apply(list) : list));
    try {
      await call();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
      void client.invalidateQueries({ queryKey: query.queryKey });
    }
  }

  const patchCategory = (id: string, change: Partial<EditableCategory>) => (list: EditableCategory[]) =>
    list.map((c) => (c.id === id ? { ...c, ...change } : c));

  const patchSymptom = (categoryId: string, id: string, change: Partial<EditableSymptom>) => (list: EditableCategory[]) =>
    list.map((c) => (c.id === categoryId ? { ...c, symptoms: c.symptoms.map((s) => (s.id === id ? { ...s, ...change } : s)) } : c));

  function openArticle(symptom: EditableSymptom) {
    const go = () =>
      navigate(troubleshootingArticlePath(subjectKey, symptom.id), {
        state: { [FROM_SYMPTOM_LIST]: true, [START_EDITING]: true },
      });
    if (symptom.hasArticle) return go();
    // Nothing written: start the empty draft first, then open it ready to
    // edit. Nobody sees it until it's published.
    setOpening(symptom.id);
    setError(null);
    createArticleDraft(subjectKey, symptom.id)
      .then(go)
      .catch((err: Error) => {
        setError(err.message);
        setOpening(null);
      });
  }

  const all = categories?.flatMap((c) => c.symptoms) ?? [];
  const count = (k: Status) => all.filter((s) => statusOf(s) === k).length;
  const filters: { key: Filter; label: string; n: number; tone?: Tone }[] = [
    { key: "all" as Filter, label: "All", n: all.length },
    ...(Object.keys(STATUS) as Status[]).map((k) => ({ key: k, label: STATUS[k].label, n: count(k), tone: STATUS[k].tone })),
  ].filter((f) => f.key === "all" || f.n > 0 || f.key === filter);

  const shown = (categories ?? [])
    .map((c, index) => ({ c, index, rows: c.symptoms.filter((s) => filter === "all" || statusOf(s) === filter) }))
    .filter(({ rows }) => filter === "all" || rows.length > 0);

  let n = 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 fs-12 text-mut">Show</span>
        {filters.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex h-8 cursor-pointer items-center gap-1.5 rounded-pill border px-3 font-sans fs-12 whitespace-nowrap outline-none focus-visible:outline-2 focus-visible:outline-brand",
                on ? "border-strong bg-sheet font-medium text-tx shadow-card" : "border-line bg-transparent text-tx3 hover:text-tx"
              )}
            >
              {f.tone && <span className={cn("size-1.5 rounded-full", DOT[f.tone])} />}
              {f.label}
              <span className="opacity-70">{f.n}</span>
            </button>
          );
        })}
      </div>

      {(error || loadError) && (
        <p role="alert" className="m-0 flex items-center gap-2 rounded-10 bg-stop-bg px-3.5 py-2.5 fs-12.5 text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]">
          <Icon name="error" size={16} />
          {error ?? (loadError instanceof Error ? loadError.message : "Couldn't load the list.")}
        </p>
      )}

      {!categories && !loadError && <p className="m-0 fs-13 text-mut">Loading the full list…</p>}

      {categories && (
        <div className="grid grid-cols-1 items-start gap-3 desk:grid-cols-[repeat(auto-fill,minmax(21.25rem,1fr))]">
          {shown.map(({ c, index, rows }) => (
            <section
              key={c.id}
              aria-label={c.name}
              className={cn("rounded-14 bg-tray p-0.75 shadow-[inset_0_0_0_1px_var(--brand-line)]", c.disabled && "opacity-70")}
            >
              <div className="flex items-center gap-1.5 py-1.25 pr-1 pl-1.5">
                <Icon name={iconForGlyph(c.glyph)} size={16} className="text-mut" />
                <InlineText
                  value={c.name}
                  label="Category name"
                  onCommit={(name) => void optimistic(patchCategory(c.id, { name }), () => setCategoryText(subjectKey, c.id, { name }))}
                  className="h-7.5 flex-1 px-2 font-title fs-10.5 font-medium tracking-label text-tx2 uppercase"
                />
                <span className="mx-0.5 fs-11 whitespace-nowrap text-mut">{c.symptoms.length}</span>
                <IconButton
                  icon={c.disabled ? "visibility_off" : "visibility"}
                  on={c.disabled}
                  label={c.disabled ? "Hidden, with everything in it. Click to show." : "Hide this whole category. Links to its articles still work."}
                  onClick={() => void optimistic(patchCategory(c.id, { disabled: !c.disabled }), () => setCategoryDisabled(subjectKey, c.id, !c.disabled))}
                />
                <IconButton
                  icon="arrow_upward"
                  label="Move category up"
                  disabled={index === 0}
                  onClick={() => void optimistic((l) => swap(l, index, -1), () => moveCategory(subjectKey, c.id, "up"))}
                />
                <IconButton
                  icon="arrow_downward"
                  label="Move category down"
                  disabled={index === categories.length - 1}
                  onClick={() => void optimistic((l) => swap(l, index, 1), () => moveCategory(subjectKey, c.id, "down"))}
                />
                <IconButton
                  icon="delete"
                  danger
                  disabled={c.symptoms.length > 0}
                  label={c.symptoms.length ? "Only an empty category can be deleted. Hide it to take it off the site." : "Delete this empty category"}
                  onClick={() => {
                    setError(null);
                    deleteCategory(subjectKey, c.id).catch((err: Error) => setError(err.message));
                  }}
                />
              </div>
              <Sheet className="overflow-hidden">
                {rows.map((s) => {
                  const ri = c.symptoms.indexOf(s);
                  const st = STATUS[statusOf(s)];
                  return (
                    <div
                      key={s.id}
                      style={rowIn(n++)}
                      className={cn("flex items-center gap-1.5 border-t border-line2 py-2 pr-1.5 pl-1 first:border-t-0", ROW_IN, s.hidden && "bg-subtle")}
                    >
                      <span className="flex flex-col">
                        <IconButton
                          size="sm"
                          icon="keyboard_arrow_up"
                          label="Move up"
                          disabled={ri === 0}
                          onClick={() => void optimistic((l) => swapSymptom(l, c.id, ri, -1), () => moveSymptom(subjectKey, c.id, s.id, "up"))}
                        />
                        <IconButton
                          size="sm"
                          icon="keyboard_arrow_down"
                          label="Move down"
                          disabled={ri === c.symptoms.length - 1}
                          onClick={() => void optimistic((l) => swapSymptom(l, c.id, ri, 1), () => moveSymptom(subjectKey, c.id, s.id, "down"))}
                        />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.25">
                        <InlineText
                          value={s.label}
                          label="Symptom wording"
                          onCommit={(label) => void optimistic(patchSymptom(c.id, s.id, { label }), () => setSymptomLabel(subjectKey, s.id, label))}
                          className={cn("h-9 w-full px-2.25 font-sans fs-13", s.hidden ? "text-mut line-through" : "text-tx")}
                        />
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-2.25">
                          <span className={cn("inline-flex h-5.5 items-center gap-1.25 rounded-pill px-2 fs-11 font-medium whitespace-nowrap", BADGE[st.tone])}>
                            <span className={cn("size-1.5 rounded-full", DOT[st.tone])} />
                            {st.label}
                          </span>
                          <button
                            type="button"
                            disabled={opening === s.id}
                            onClick={() => openArticle(s)}
                            className="flex cursor-pointer items-center gap-0.75 border-0 bg-transparent p-0 font-sans fs-11.5 font-medium text-brand-tx outline-none hover:underline focus-visible:underline disabled:cursor-progress disabled:text-mut"
                          >
                            {opening === s.id ? "Starting…" : s.hasArticle ? "Edit article" : "Write this article"}
                            <Icon name="arrow_forward" size={14} />
                          </button>
                        </div>
                      </div>
                      <IconButton
                        icon={s.hidden ? "visibility_off" : "visibility"}
                        on={s.hidden}
                        disabled={!s.hasArticle}
                        label={
                          !s.hasArticle
                            ? "Nothing to hide until it's written"
                            : s.hidden
                              ? "Hidden from readers and search. Click to show."
                              : "Hide from readers and search. The link still works."
                        }
                        onClick={() => void optimistic(patchSymptom(c.id, s.id, { hidden: !s.hidden }), () => setSymptomHidden(subjectKey, s.id, !s.hidden))}
                      />
                      <IconButton icon="delete" danger label="Delete symptom" onClick={() => setDeleting({ symptom: s, category: c })} />
                    </div>
                  );
                })}
                {filter === "all" &&
                  (adding === c.id ? (
                    <NewSymptom
                      subjectKey={subjectKey}
                      onCancel={() => setAdding(null)}
                      onCreate={async (label) => {
                        await createSymptom(subjectKey, c.id, label);
                        setAdding(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAdding(c.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-1.5 border-0 bg-transparent px-3.5 py-2.75 text-left font-sans fs-12 font-medium text-brand-tx outline-none hover:bg-subtle focus-visible:bg-subtle",
                        c.symptoms.length > 0 && "border-t border-line2"
                      )}
                    >
                      <Icon name="add" size={16} />
                      Add a symptom
                    </button>
                  ))}
              </Sheet>
            </section>
          ))}

          {filter === "all" &&
            (newCat ? (
              <NewCategory
                onCancel={() => setNewCat(false)}
                onCreate={async (input) => {
                  const made = await createCategory(subjectKey, input);
                  setNewCat(false);
                  setAdding(made.categoryId);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setNewCat(true)}
                className="flex min-h-24 cursor-pointer items-center justify-center gap-1.5 rounded-14 border-[1.5px] border-dashed border-brand-line bg-transparent font-sans fs-12.5 font-medium text-brand-tx outline-none hover:bg-brand-sub focus-visible:outline-2 focus-visible:outline-brand"
              >
                <Icon name="add" size={18} />
                New category
              </button>
            ))}
        </div>
      )}

      {categories && filter !== "all" && shown.length === 0 && (
        <p className="m-0 p-4.5 fs-13 text-tx3">Nothing in {subjectLabel} matches this filter.</p>
      )}

      {deleting && (
        <DeleteSymptom
          subjectKey={subjectKey}
          symptom={deleting.symptom}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

/// ── The sticky bar ───────────────────────────────────────────────────

export function ListEditBar({ subjectLabel, onDone, children }: { subjectLabel: string; onDone: () => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
      <span className="flex h-7 items-center gap-1.5 rounded-pill bg-brand pr-2.75 pl-2 fs-11.5 font-medium text-on-brand">
        <Icon name="edit_note" size={15} />
        Editing the {subjectLabel} list
      </span>
      <span className="min-w-0 flex-[1_1_16.25rem] fs-12 text-pretty text-tx3">
        Changes save as you go, and readers see them straight away. Article text stays a draft until you publish it.
      </span>
      {children}
      <button type="button" onClick={onDone} className={btn({ size: "md", className: "fs-12" })}>
        Done
      </button>
    </div>
  );
}

/// ── Adding ───────────────────────────────────────────────────────────

function NewSymptom({ subjectKey, onCreate, onCancel }: { subjectKey: string; onCreate: (label: string) => Promise<void>; onCancel: () => void }) {
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useSettledSearch(label).trim();

  // The address is permanent once created, so it's shown while the wording
  // is still being typed, and Add waits for the server to say it's free.
  const preview = useQuery({
    queryKey: ["troubleshooting", "admin", "slug", subjectKey, settled],
    queryFn: () => previewSymptomSlug(subjectKey, settled),
    enabled: !!settled,
  });
  const ready = !!settled && settled === label.trim() && !!preview.data?.available && !saving;

  async function submit() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate(label.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 border-t border-line2 bg-subtle px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "Escape") onCancel();
          }}
          aria-label="New symptom wording"
          placeholder="In their words, e.g. My laptop won't wake from sleep"
          className="h-9.5 min-w-0 flex-[1_1_13.75rem] rounded-8 border border-dashed border-brand-line bg-sheet px-2.5 font-sans fs-12.5 text-tx outline-none placeholder:text-placeholder focus:border-brand"
        />
        <button type="button" disabled={!ready} onClick={() => void submit()} className={btn({ variant: "primary", size: "md", className: "h-9.5 rounded-8 fs-12" })}>
          {saving ? "Adding…" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className={btn({ size: "md", className: "h-9.5 rounded-8 border-line fs-12" })}>
          Cancel
        </button>
      </div>
      <p className="m-0 min-h-4.5 fs-11.5">
        {error ? (
          <span className="text-stop">{error}</span>
        ) : preview.data?.available && settled ? (
          <span className="text-mut">
            Address <code className="font-mono text-brand-tx">{preview.data.slug}</code>, permanent once added.
          </span>
        ) : preview.data && settled ? (
          <span className="text-stop">{preview.data.reason}</span>
        ) : null}
      </p>
    </div>
  );
}

function NewCategory({ onCreate, onCancel }: { onCreate: (input: { name: string; glyph: string; blurb: string }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [glyph, setGlyph] = useState("devices");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = !!name.trim() && !!blurb.trim() && !saving;

  async function submit() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      await onCreate({ name: name.trim(), glyph, blurb: blurb.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't save");
      setSaving(false);
    }
  }

  return (
    <Tray label={<span className="text-brand-tx">New category</span>} className="shadow-[inset_0_0_0_1px_var(--brand-line)]">
      <Sheet className="flex flex-col gap-3.5 p-3.5">
        <label className="flex flex-col gap-1.5">
          <span className="fs-12 font-medium text-tx2">Name</span>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Audio" className="h-9.5 border-dashed border-brand-line fs-12.5" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="fs-12 font-medium text-tx2">
            In a line <span className="font-normal text-mut">· what belongs in it</span>
          </span>
          <Input value={blurb} onChange={(e) => setBlurb(e.target.value)} placeholder="e.g. No sound, crackling, the wrong speaker" className="h-9.5 border-dashed border-brand-line fs-12.5" />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="fs-12 font-medium text-tx2">Icon</span>
          <div role="radiogroup" aria-label="Icon" className="flex flex-wrap gap-1">
            {CATEGORY_ICON_CHOICES.map((g) => {
              const on = g === glyph;
              return (
                <button
                  key={g}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  title={g}
                  onClick={() => setGlyph(g)}
                  className={cn(
                    "grid size-9.5 cursor-pointer place-items-center rounded-9 border p-0 outline-none focus-visible:outline-2 focus-visible:outline-brand",
                    on ? "border-brand-line bg-brand-sub text-brand-tx shadow-[0_0_0_1px_var(--brand-line)]" : "border-line bg-sheet text-tx2 hover:bg-hover"
                  )}
                >
                  <Icon name={g} size={17} />
                </button>
              );
            })}
          </div>
        </div>
        {error && <p className="m-0 fs-12 text-stop">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={btn({ size: "md", className: "h-9.5 rounded-8 border-line fs-12" })}>
            Cancel
          </button>
          <button type="button" disabled={!ready} onClick={() => void submit()} className={btn({ variant: "primary", size: "md", className: "h-9.5 rounded-8 fs-12" })}>
            {saving ? "Creating…" : "Create category"}
          </button>
        </div>
      </Sheet>
    </Tray>
  );
}

/// ── Deleting ─────────────────────────────────────────────────────────
//
//  The links are asked for BEFORE offering to delete, so what breaks is on
//  screen while the decision is made. The server checks again on the way
//  through; this is the courtesy, that's the constraint.

function DeleteSymptom({ subjectKey, symptom, onClose }: { subjectKey: string; symptom: EditableSymptom; onClose: () => void }) {
  const links = useQuery({
    queryKey: ["troubleshooting", "admin", "links", subjectKey, symptom.id],
    queryFn: () => getSymptomLinks(subjectKey, symptom.id),
  });
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const breaking = (links.data?.length ?? 0) > 0;
  const ready = links.isSuccess && (!breaking || confirmed) && !busy;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await deleteSymptom(subjectKey, symptom.id, { force: breaking, reason: reason.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't delete");
      setBusy(false);
    }
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} label="Delete symptom" width={500}>
      <ModalBody className="gap-3">
        <ModalTitle className="text-pretty">Delete &ldquo;{symptom.label}&rdquo;?</ModalTitle>
        <p className="m-0 fs-12.5 leading-[1.55] text-pretty text-tx2">
          {symptom.hasArticle
            ? "The article is archived, not destroyed, so it can be brought back. Readers who open an old link see that it's been removed. To take it out of the list without deleting it, hide it instead."
            : "It has no article, so there's nothing to archive. It just leaves the list."}
        </p>
        {links.isPending && <p className="m-0 fs-12 text-mut">Checking what links here…</p>}
        {breaking && (
          <div className="flex flex-col gap-1.5 rounded-9 bg-stop-bg px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--stop-line)]">
            <span className="flex items-center gap-1.75 fs-12 font-semibold text-stop">
              <Icon name="link" size={15} />
              {links.data!.length === 1 ? "1 step links here and will stop working" : `${links.data!.length} steps link here and will stop working`}
            </span>
            {links.data!.map((l, i) => (
              <span key={`${l.from}-${l.step}-${i}`} className="fs-12 leading-[1.45] text-tx">
                Step {l.step} of <code className="font-mono fs-11.5">{l.from}</code>: &ldquo;{l.label}&rdquo;
                {l.inDraft && <span className="text-prog"> (unpublished)</span>}
              </span>
            ))}
            <label className="mt-1 flex cursor-pointer items-start gap-2 fs-12 text-tx2">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 cursor-pointer accent-(--stop)" />
              Delete it anyway. I&rsquo;ll fix or remove those links.
            </label>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="fs-12 font-medium text-tx">
            Why <span className="font-normal text-mut">(optional, kept with the archive)</span>
          </span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} className="fs-12.5" />
        </label>
        {error && <p className="m-0 fs-12 text-stop">{error}</p>}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn({ size: "md" })}>
          Cancel
        </button>
        <button type="button" disabled={!ready} onClick={() => void submit()} className={btn({ variant: "danger-solid", size: "md" })}>
          {busy ? "Deleting…" : "Delete symptom"}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/// ── Reordering the cached list ───────────────────────────────────────

function swap<T>(items: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

function swapSymptom(list: EditableCategory[], categoryId: string, index: number, by: -1 | 1): EditableCategory[] {
  return list.map((c) => (c.id === categoryId ? { ...c, symptoms: swap(c.symptoms, index, by) } : c));
}
