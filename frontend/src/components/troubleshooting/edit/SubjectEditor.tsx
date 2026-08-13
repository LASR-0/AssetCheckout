import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getEditableSubject,
  setCategoryDisabled,
  setSymptomHidden,
  setSymptomLabel,
} from "@/api/troubleshooting";
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
///  +-----------------------------------------------------------------+

type Props = { subjectKey: string; onClose: () => void };

export default function SubjectEditor({ subjectKey, onClose }: Props) {
  const [categories, setCategories] = useState<EditableCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);

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

      {categories.map((category) => (
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

            <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-info-light hover:cursor-pointer">
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
            {category.symptoms.map((symptom) => (
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
                {!symptom.hasArticle && (
                  <span className="shrink-0 text-[11px] text-info-light">Not written</span>
                )}

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
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-[13px] text-info-light">
        “Unlist” takes a symptom out of this list and out of search. Anyone who
        already has the link can still open it — nothing is deleted.
      </p>
    </div>
  );
}
