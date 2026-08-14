import { useEffect, useState } from "react";
import { getSymptomLinks, deleteSymptom } from "@/api/troubleshooting";
import type { SymptomLink } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |        WHAT BREAKS IF THIS GOES                                 |
///  +-----------------------------------------------------------------+
//
//  Nothing in the database ties a branch button to its target — a branch is a
//  string inside a JSON document. So deleting a symptom silently breaks every
//  button aimed at it, inside articles nobody happened to be reading, and the
//  damage surfaces weeks later as "that button does nothing".
//
//  The links are therefore fetched and SHOWN BEFORE the button that deletes is
//  offered, not after it has been pressed. Drafts are included: a branch in
//  unpublished text becomes a broken published article the moment somebody
//  hits publish.
//
//  Deleting anyway is allowed. Sometimes the branch is exactly what should go,
//  and refusing outright would mean nothing could ever be removed without
//  first editing every article that mentions it. But it takes a second,
//  deliberate press with the list on screen.
//
//  NOT A DESTRUCTIVE ACT, quite: the article is archived whole — text, draft,
//  and where it sat — and lands in `backend/content-archive/` at the next
//  export. The wording says so, because "delete" that cannot be undone and
//  "delete" that can are different decisions.
///  +-----------------------------------------------------------------+

type Props = {
  subjectKey: string;
  symptomId: string;
  label: string;
  hasArticle: boolean;
  onDeleted: () => void;
  onCancel: () => void;
};

export default function DeleteSymptomDialog({
  subjectKey,
  symptomId,
  label,
  hasArticle,
  onDeleted,
  onCancel,
}: Props) {
  const [links, setLinks] = useState<SymptomLink[] | null>(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSymptomLinks(subjectKey, symptomId)
      .then((res) => !cancelled && setLinks(res))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [subjectKey, symptomId]);

  const breaking = links && links.length > 0;
  // A second deliberate press, but only when something actually breaks. Making
  // every deletion a two-step ritual trains people to click through it.
  const ready = links !== null && (!breaking || confirmed);

  async function submit() {
    if (!ready || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSymptom(subjectKey, symptomId, {
        force: Boolean(breaking),
        reason: reason.trim() || undefined,
      });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't delete");
      setDeleting(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-error/40 bg-error/5 p-3">
      <p className="mb-1 text-xs font-bold text-error">Delete “{label}”?</p>

      <p className="mb-2 text-[12px] text-info-light">
        {hasArticle
          ? "The article is kept in the archive — its text, any unpublished changes, and where it sat. It can be brought back from there."
          : "This symptom has no article, so there is nothing to archive."}
      </p>

      {links === null && !error && (
        <p className="text-[12px] text-info-light">Checking what links here…</p>
      )}

      {breaking && (
        <div className="mb-2 rounded-md border border-error/30 bg-surface p-2">
          <p className="mb-1 text-[12px] font-semibold text-error">
            {links.length} branch button{links.length === 1 ? "" : "s"} point here and
            will stop working:
          </p>
          <ul className="flex flex-col gap-0.5">
            {links.map((link, i) => (
              <li key={`${link.from}-${link.step}-${i}`} className="text-[12px] text-info-light">
                <code>{link.from}</code> step {link.step} — “{link.label}”
                {link.inDraft && (
                  <span className="ml-1 text-warning">(in unpublished changes)</span>
                )}
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-start gap-2 text-[12px] text-info-light hover:cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 hover:cursor-pointer"
            />
            <span>
              I know. Delete it anyway — I will fix or remove those buttons.
            </span>
          </label>
        </div>
      )}

      {links !== null && !breaking && (
        <p className="mb-2 text-[12px] text-info-light">Nothing links here.</p>
      )}

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        placeholder="Why? (optional — kept with the archive)"
        className="mb-2 w-full rounded-md border border-outline bg-surface px-2 py-1.5 text-[13px] outline-none focus:border-primary"
        aria-label="Reason for deleting"
      />

      {error && <p className="mb-2 text-[12px] text-error">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!ready || deleting}
          onClick={() => void submit()}
          className="rounded-lg bg-error px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 hover:cursor-pointer disabled:hover:cursor-not-allowed"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-outline px-3 py-1.5 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
