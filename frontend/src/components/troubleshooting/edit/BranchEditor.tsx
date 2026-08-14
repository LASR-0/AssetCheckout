import EditableText from "./EditableText";
import type { Branch, SymptomListing } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                    EDITING A BRANCH LINK                        |
///  +-----------------------------------------------------------------+
//
//  A PICKER, NOT A TEXT FIELD. The target is chosen from the symptoms that
//  actually exist, so a dangling branch cannot be created in the first place.
//  The publish gate still checks — it has to, because a symptom can be
//  renamed after a draft was written — but it should be a backstop rather
//  than the thing that catches a typo.
//
//  It offers this subject's symptoms only. Cross-subject branches exist in
//  the corpus and are legitimate, but they are rare, they need a second
//  picker to be safe, and a list of every symptom in the library is not a
//  list anybody can choose from. An existing cross-subject target is shown
//  and preserved; creating a new one is left to a later pass rather than
//  half-built here.
//
//  THE LABEL IS THE READER'S SITUATION, not the destination — "It charges
//  from some cables but not others", never "See the charging article". The
//  placeholder says so, because it is the single most common thing to get
//  wrong about a branch.
///  +-----------------------------------------------------------------+

type Props = {
  branch?: Branch;
  symptoms: SymptomListing[];
  currentSymptomId: string;
  onChange: (branch: Branch) => void;
  onRemove: () => void;
  /**
   * Rendered inside a BlockRow, which already carries the type label, the
   * colour and the remove action.
   *
   * So this drops its own header and border and renders only the fields —
   * otherwise the row's label and the panel's label say the same thing twice,
   * with two different remove buttons under them.
   */
  bare?: boolean;
};

export default function BranchEditor({
  branch,
  symptoms,
  currentSymptomId,
  onChange,
  onRemove,
  bare = false,
}: Props) {
  if (!branch) {
    return (
      <button
        type="button"
        onClick={() =>
          onChange({
            label: "",
            targetSymptomId:
              symptoms.find((s) => s.id !== currentSymptomId)?.id ?? currentSymptomId,
          })
        }
        className="self-start rounded-lg border border-dashed border-outline px-2.5 py-1 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
      >
        + Add link to another article
      </button>
    );
  }

  // A target from another subject can't be represented in this picker, so it
  // is shown as-is and left alone rather than being silently rewritten to
  // something in this list.
  const crossSubject = Boolean(branch.targetSubjectKey);

  return (
    <div
      className={
        bare
          ? "flex flex-col gap-2"
          : "flex flex-col gap-2 rounded-lg border border-outline bg-surface-container-low/10 p-3"
      }
    >
      <div className={bare ? "hidden" : "flex items-center gap-2"}>
        <span className="material-symbols-outlined !text-[16px] text-info-light">
          alt_route
        </span>
        <span className="text-xs font-semibold text-info-light">
          Link to another article
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove link"
          className="ml-auto grid size-7 place-items-center rounded-md border border-outline text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
        >
          <span className="material-symbols-outlined !text-[16px]">close</span>
        </button>
      </div>

      <EditableText
        value={branch.label}
        onChange={(label) => onChange({ ...branch, label })}
        ariaLabel="Link label"
        className="text-sm"
        placeholder="The reader's situation — “It charges from some cables but not others”"
      />

      {crossSubject ? (
        <p className="text-[13px] text-info-light">
          Points at{" "}
          <code className="rounded bg-surface-container-low/40 px-1">
            {branch.targetSubjectKey}/{branch.targetSymptomId}
          </code>{" "}
          in another subject. Remove and re-add the link to change it.
        </p>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-info-light">Goes to</span>
          <select
            value={branch.targetSymptomId}
            onChange={(e) => onChange({ ...branch, targetSymptomId: e.target.value })}
            className="rounded-lg border border-outline bg-surface px-2 py-1.5 text-sm hover:cursor-pointer"
          >
            {symptoms
              .filter((s) => s.id !== currentSymptomId)
              .map((symptom) => (
                <option key={symptom.id} value={symptom.id}>
                  {symptom.label}
                  {symptom.hasArticle ? "" : " (not written yet)"}
                </option>
              ))}
          </select>
        </label>
      )}
    </div>
  );
}
