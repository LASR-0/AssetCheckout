import type { ContentIssue } from "@/types/troubleshootingType";
import type { SaveState } from "@/hooks/useArticleEditor";

///  +-----------------------------------------------------------------+
///  |                    THE EDITING BAR                              |
///  +-----------------------------------------------------------------+
//
//  Sticky, so the state of the work and the way out are always reachable
//  from the middle of a long article.
//
//  IT SAYS WHETHER READERS CAN SEE THIS YET, in words, every time. That is
//  the one thing an editor has to keep straight and the one thing a draft
//  system makes easy to lose track of — "did I publish that?" an hour later
//  is exactly the failure the health endpoint ends up reporting.
//
//  PUBLISH REFUSALS RENDER HERE, itemised. The gate's value is naming which
//  branch dead-ends and under which subject; a bar that only said "couldn't
//  publish" would be true and useless.
///  +-----------------------------------------------------------------+

function SaveIndicator({ state }: { state: SaveState }) {
  const text =
    state.kind === "saving"
      ? "Saving…"
      : state.kind === "dirty"
        ? "Unsaved"
        : state.kind === "saved"
          ? "Draft saved"
          : state.kind === "error"
            ? state.message
            : "";

  if (!text) return null;

  return (
    <span
      className={`text-[13px] ${state.kind === "error" ? "text-error" : "text-info-light"}`}
    >
      {text}
    </span>
  );
}

type Props = {
  hasDraft: boolean;
  saveState: SaveState;
  publishing: boolean;
  issues: ContentIssue[];
  warnings: string[];
  /** Every subject listing this article — an edit changes all of them. */
  subjectKeys: string[];
  currentSubjectKey: string;
  onPublish: () => void;
  onDiscard: () => void;
  onDone: () => void;
};

export default function EditModeBar({
  hasDraft,
  saveState,
  publishing,
  issues,
  warnings,
  subjectKeys,
  currentSubjectKey,
  onPublish,
  onDiscard,
  onDone,
}: Props) {
  const alsoUnder = subjectKeys.filter((key) => key !== currentSubjectKey);

  return (
    <div className="sticky top-20 z-30 mb-6 flex flex-col gap-3 rounded-lg border border-primary/40 bg-surface p-4 shadow-lg">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-primary">
          <span className="material-symbols-outlined !text-[18px]">edit_note</span>
          Editing
        </span>

        {/* Said plainly rather than implied by a badge colour. */}
        <span className="text-[13px] text-info-light">
          {hasDraft
            ? "Unpublished changes — readers still see the published version."
            : "No unpublished changes."}
        </span>

        <SaveIndicator state={saveState} />

        <div className="ml-auto flex flex-wrap gap-2">
          {hasDraft && (
            <button
              type="button"
              onClick={onDiscard}
              disabled={publishing}
              className="rounded-lg border border-outline px-3 py-1.5 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer disabled:opacity-50 transition-colors"
            >
              Discard changes
            </button>
          )}
          <button
            type="button"
            onClick={onPublish}
            disabled={!hasDraft || publishing}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary hover:opacity-90 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {publishing ? "Publishing…" : "Publish"}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-outline px-3 py-1.5 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
          >
            Done
          </button>
        </div>
      </div>

      {/* A shared article is the easiest thing to change by accident: you are
          looking at one page and editing what several audiences read. */}
      {alsoUnder.length > 0 && (
        <p className="flex items-start gap-2 text-[13px] text-info-light">
          <span className="material-symbols-outlined !text-[16px]">share</span>
          This article also appears under {alsoUnder.join(", ")}. Editing it here
          changes what those readers see too.
        </p>
      )}

      {issues.length > 0 && (
        <div className="rounded-lg border border-error/40 bg-error-background p-3">
          <p className="mb-1 text-[13px] font-bold text-error">
            This can&apos;t be published yet
          </p>
          <ul className="flex flex-col gap-1">
            {issues.map((issue, i) => (
              <li key={`${issue.path}-${i}`} className="text-[13px] text-error">
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-outline bg-surface-container-low/20 p-3">
          <p className="mb-1 text-[13px] font-bold">Published, with notes</p>
          <ul className="flex flex-col gap-1">
            {warnings.map((warning, i) => (
              <li key={i} className="text-[13px] text-info-light">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
