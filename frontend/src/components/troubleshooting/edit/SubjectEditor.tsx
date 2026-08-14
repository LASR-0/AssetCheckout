import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getEditableSubject,
  setCategoryDisabled,
  setSymptomHidden,
  setSymptomLabel,
  createSymptom,
  createCategory,
  createArticleDraft,
  moveCategory,
  moveSymptom,
  deleteCategory,
} from "@/api/troubleshooting";
import NewSymptomForm from "./NewSymptomForm";
import NewCategoryForm from "./NewCategoryForm";
import DeleteSymptomDialog from "./DeleteSymptomDialog";
import { FROM_SYMPTOM_LIST, troubleshootingArticlePath } from "@/lib/troubleshootingRoutes";
import type { EditableCategory } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |            EDITING A SUBJECT'S SYMPTOM LIST                     |
///  +-----------------------------------------------------------------+
//
//  The list as an ADMIN sees it: nothing filtered out, because a hidden
//  symptom and a disabled category cannot be switched back on if they are
//  invisible here too.
//
//  THESE CHANGES ARE IMMEDIATE, AND IT SAYS SO. Hiding is almost always
//  "this is wrong, get it off the site now", so making it wait behind a
//  publish would be backwards. Article TEXT is the thing that gets drafted;
//  visibility is a switch.
//
//  HIDDEN IS UNLISTED, NOT RETRACTED. The article still opens at its own URL
//  — a link IT already sent somebody keeps working — and the wording here
//  says that rather than leaving somebody to assume it is gone.
//
//  Everything is optimistic with a rollback: these are two-field writes to a
//  local database, and waiting on a spinner to see a checkbox move would be
//  worse than the rare case of putting it back.
//
//  CREATING IS NOT OPTIMISTIC, and that is the one exception. A new symptom
//  gets a permanent address the server derives, and a new category gets an id
//  the same way — inventing either locally and reconciling afterwards would
//  mean rendering an address that might not be the one it ends up with. These
//  wait, then refetch.
///  +-----------------------------------------------------------------+

type Props = { subjectKey: string; onClose: () => void };

export default function SubjectEditor({ subjectKey, onClose }: Props) {
  const [categories, setCategories] = useState<EditableCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  /** Which category is showing its "add symptom" form, if any. */
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  /** Which symptom is showing its delete confirmation, if any. */
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = () =>
    getEditableSubject(subjectKey)
      .then(setCategories)
      .catch((err: Error) => setError(err.message));

  useEffect(() => {
    let cancelled = false;
    getEditableSubject(subjectKey)
      .then((res) => !cancelled && setCategories(res))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [subjectKey]);

  /** Apply locally, call the server, put it back if the server refused. */
  async function optimistic(apply: () => void, revert: () => void, call: () => Promise<unknown>) {
    setError(null);
    apply();
    try {
      await call();
    } catch (err) {
      revert();
      setError(err instanceof Error ? err.message : "That didn't save");
    }
  }

  const patchCategory = (id: string, change: Partial<EditableCategory>) =>
    setCategories((current) =>
      current?.map((c) => (c.id === id ? { ...c, ...change } : c)) ?? current
    );

  const patchSymptom = (
    categoryId: string,
    symptomId: string,
    change: Partial<EditableCategory["symptoms"][number]>
  ) =>
    setCategories((current) =>
      current?.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              symptoms: c.symptoms.map((s) =>
                s.id === symptomId ? { ...s, ...change } : s
              ),
            }
          : c
      ) ?? current
    );

  /**
   * Up/down arrows.
   *
   * Disabled at the ends rather than hidden: a control that appears and
   * disappears as things move makes the row jump under the pointer, and the
   * server treats an end-of-list move as a no-op anyway.
   */
  function Reorder({
    onMove,
    first,
    last,
    what,
  }: {
    onMove: (direction: "up" | "down") => void;
    first: boolean;
    last: boolean;
    what: string;
  }) {
    return (
      <span className="flex shrink-0 items-center">
        <button
          type="button"
          disabled={first}
          onClick={() => onMove("up")}
          aria-label={`Move ${what} up`}
          className="grid size-6 place-items-center rounded text-info-light hover:bg-surface-container-low/40 disabled:opacity-25 hover:cursor-pointer disabled:hover:cursor-default"
        >
          <span className="material-symbols-outlined !text-[16px]">arrow_upward</span>
        </button>
        <button
          type="button"
          disabled={last}
          onClick={() => onMove("down")}
          aria-label={`Move ${what} down`}
          className="grid size-6 place-items-center rounded text-info-light hover:bg-surface-container-low/40 disabled:opacity-25 hover:cursor-pointer disabled:hover:cursor-default"
        >
          <span className="material-symbols-outlined !text-[16px]">arrow_downward</span>
        </button>
      </span>
    );
  }

  if (error && !categories) {
    return <p className="py-6 text-sm text-error">{error}</p>;
  }

  if (!categories) {
    return <p className="py-6 text-sm text-info-light">Loading the full list…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-20 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-primary/40 bg-surface p-4 shadow-lg">
        <span className="flex items-center gap-2 text-sm font-bold text-primary">
          <span className="material-symbols-outlined !text-[18px]">edit_note</span>
          Editing this list
        </span>
        <span className="text-[13px] text-info-light">
          Changes here take effect immediately — there is nothing to publish.
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg border border-outline px-3 py-1.5 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
        >
          Done
        </button>
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      {categories.map((category, categoryIndex) => (
        <section
          key={category.id}
          className={`rounded-lg border p-4 transition-opacity ${
            category.disabled ? "border-outline/40 opacity-60" : "border-outline"
          }`}
        >
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm text-primary">
              {category.glyph}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{category.name}</p>
              <p className="text-[13px] text-info-light">{category.blurb}</p>
            </div>

            <span className="ml-auto">
              <Reorder
                what={category.name}
                first={categoryIndex === 0}
                last={categoryIndex === categories.length - 1}
                onMove={(direction) => {
                  void optimistic(
                    () => reorderLocally(categories, category.id, direction, setCategories),
                    () => void refresh(),
                    () => moveCategory(subjectKey, category.id, direction)
                  );
                }}
              />
            </span>

            {/* Only when empty, and that is the design rather than a caveat.
                Deleting a populated category would have to either destroy the
                articles inside it or orphan them; disabling already takes it
                off the site, so this exists purely to tidy up something
                created by mistake. */}
            {category.symptoms.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  deleteCategory(subjectKey, category.id)
                    .then(refresh)
                    .catch((err: Error) => setError(err.message));
                }}
                title="Delete this empty category"
                className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-semibold text-info-light hover:bg-error/10 hover:text-error hover:cursor-pointer"
              >
                <span className="material-symbols-outlined !text-[16px]">delete</span>
                Delete
              </button>
            )}

            <label className="flex items-center gap-2 text-xs font-semibold text-info-light hover:cursor-pointer">
              <input
                type="checkbox"
                checked={category.disabled}
                onChange={(e) => {
                  const disabled = e.target.checked;
                  void optimistic(
                    () => patchCategory(category.id, { disabled }),
                    () => patchCategory(category.id, { disabled: !disabled }),
                    () => setCategoryDisabled(subjectKey, category.id, disabled)
                  );
                }}
                className="hover:cursor-pointer"
              />
              Hide this whole category
            </label>
          </div>

          <ul className="flex flex-col divide-y divide-outline/30">
            {category.symptoms.map((symptom, symptomIndex) => (
              <li
                key={symptom.id}
                className="flex flex-wrap items-center gap-3 py-2"
              >
                {editingLabel === `${category.id}/${symptom.id}` ? (
                  <input
                    autoFocus
                    defaultValue={symptom.label}
                    onBlur={(e) => {
                      const label = e.target.value.trim();
                      setEditingLabel(null);
                      if (!label || label === symptom.label) return;
                      const previous = symptom.label;
                      void optimistic(
                        () => patchSymptom(category.id, symptom.id, { label }),
                        () => patchSymptom(category.id, symptom.id, { label: previous }),
                        () => setSymptomLabel(subjectKey, symptom.id, label)
                      );
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setEditingLabel(null);
                    }}
                    className="min-w-0 flex-1 rounded-md border border-primary bg-primary/5 px-2 py-1 text-sm outline-none"
                    aria-label="Symptom wording"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingLabel(`${category.id}/${symptom.id}`)}
                    title="Click to reword"
                    className={`min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-sm hover:bg-surface-container-low/30 hover:cursor-pointer ${
                      symptom.hidden ? "text-info-light line-through" : ""
                    }`}
                  >
                    {symptom.label}
                  </button>
                )}

                {symptom.hasDraft && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    Unpublished changes
                  </span>
                )}
                {symptom.hasArticle && !symptom.published && (
                  <span
                    className="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-semibold text-warning"
                    title="Readers still see this as a gap. It appears when you publish it."
                  >
                    Not published yet
                  </span>
                )}

                {!symptom.hasArticle && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      createArticleDraft(subjectKey, symptom.id)
                        .then(refresh)
                        .catch((err: Error) => setError(err.message));
                    }}
                    className="shrink-0 text-[11px] font-semibold text-primary hover:underline hover:cursor-pointer"
                    title="Creates an empty article. Nobody sees it until you publish."
                  >
                    Write this one →
                  </button>
                )}

                <Reorder
                  what={symptom.label}
                  first={symptomIndex === 0}
                  last={symptomIndex === category.symptoms.length - 1}
                  onMove={(direction) => {
                    void optimistic(
                      () =>
                        setCategories(
                          (current) =>
                            current?.map((c) =>
                              c.id === category.id
                                ? { ...c, symptoms: moved(c.symptoms, symptom.id, direction) }
                                : c
                            ) ?? current
                        ),
                      () => void refresh(),
                      () => moveSymptom(subjectKey, category.id, symptom.id, direction)
                    );
                  }}
                />

                <button
                  type="button"
                  onClick={() =>
                    setDeleting(
                      deleting === `${category.id}/${symptom.id}`
                        ? null
                        : `${category.id}/${symptom.id}`
                    )
                  }
                  aria-label={`Delete ${symptom.label}`}
                  title="Delete this symptom. The article is archived, not destroyed."
                  className="grid size-6 shrink-0 place-items-center rounded text-info-light hover:bg-error/10 hover:text-error hover:cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[16px]">delete</span>
                </button>

                {symptom.hasArticle && (
                  <>
                    <label
                      className="flex shrink-0 items-center gap-2 text-xs text-info-light hover:cursor-pointer"
                      title="Removes it from this list and from search. The link still works."
                    >
                      <input
                        type="checkbox"
                        checked={symptom.hidden}
                        onChange={(e) => {
                          const hidden = e.target.checked;
                          void optimistic(
                            () => patchSymptom(category.id, symptom.id, { hidden }),
                            () => patchSymptom(category.id, symptom.id, { hidden: !hidden }),
                            () => setSymptomHidden(subjectKey, symptom.id, hidden)
                          );
                        }}
                        className="hover:cursor-pointer"
                      />
                      Unlist
                    </label>

                    <Link
                      to={troubleshootingArticlePath(subjectKey, symptom.id)}
                      state={{ [FROM_SYMPTOM_LIST]: true }}
                      className="shrink-0 text-xs font-semibold text-primary hover:underline"
                    >
                      Edit article →
                    </Link>
                  </>
                )}

                {deleting === `${category.id}/${symptom.id}` && (
                  <div className="w-full">
                    <DeleteSymptomDialog
                      subjectKey={subjectKey}
                      symptomId={symptom.id}
                      label={symptom.label}
                      hasArticle={symptom.hasArticle}
                      onCancel={() => setDeleting(null)}
                      onDeleted={() => {
                        setDeleting(null);
                        void refresh();
                      }}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          {addingTo === category.id ? (
            <NewSymptomForm
              subjectKey={subjectKey}
              categoryName={category.name}
              onCancel={() => setAddingTo(null)}
              onCreate={async (label) => {
                await createSymptom(subjectKey, category.id, label);
                setAddingTo(null);
                await refresh();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAddingTo(category.id)}
              className="mt-2 text-xs font-semibold text-primary hover:underline hover:cursor-pointer"
            >
              + Add a symptom to {category.name}
            </button>
          )}
        </section>
      ))}

      {addingCategory ? (
        <NewCategoryForm
          onCancel={() => setAddingCategory(false)}
          onCreate={async (input) => {
            await createCategory(subjectKey, input);
            setAddingCategory(false);
            await refresh();
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAddingCategory(true)}
          className="self-start rounded-lg border border-outline px-3 py-1.5 text-xs font-semibold text-primary hover:bg-surface-container-low/30 hover:cursor-pointer"
        >
          + Add a category
        </button>
      )}

      <div className="flex flex-col gap-1 text-[13px] text-info-light">
        <p>
          “Unlist” takes a symptom out of this list and out of search. Anyone who
          already has the link can still open it — nothing is deleted.
        </p>
        <p>
          A symptom with no article shows readers a “not written yet” page, which
          is how a gap stays visible. “Not published yet” means somebody has
          started writing one and readers still see that same page.
        </p>
        <p>
          A category can only be deleted once it is empty — hide it instead if
          you want it off the site with its symptoms intact.
        </p>
        <p>
          Deleting a symptom archives its article rather than destroying it —
          text, unpublished changes and all. If anything links to it you will
          be told what breaks before it goes.
        </p>
        <p>
          Wording and order can be changed whenever. A symptom’s web address is
          set from its wording when it is created and cannot be changed
          afterwards, because links and buttons elsewhere point at it.
        </p>
      </div>
    </div>
  );
}

/// ── Local reordering ─────────────────────────────────────────────────────
//
//  Applied locally so the row moves under the pointer immediately, then
//  reconciled: the server returns the order it actually stored, and a failure
//  refetches rather than trying to invert the move. Swapping back would be
//  wrong if the failure was a stale list rather than a rejected write.

/** A list with one item swapped with its neighbour. */
function moved<T extends { id: string }>(
  items: T[],
  id: string,
  direction: "up" | "down"
): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= items.length) return items;

  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function reorderLocally(
  categories: EditableCategory[],
  id: string,
  direction: "up" | "down",
  set: (value: EditableCategory[]) => void
): void {
  set(moved(categories, id, direction));
}
