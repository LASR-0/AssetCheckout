import EditableText from "./EditableText";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SELECT_TRIGGER, SELECT_CONTENT, SELECT_ITEM } from "./BlockRow";
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

  // An article never links to itself, so it is never an option.
  const options = symptoms.filter((s) => s.id !== currentSymptomId);

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

      {/* The same label grid the figure block uses — they are siblings in the
          rail now, and the prototype lays both out this way. */}
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2.5">
        <span className="text-[12px] text-info-light">Reads as</span>
        <EditableText
          value={branch.label}
          onChange={(label) => onChange({ ...branch, label })}
          ariaLabel="Link label"
          className="text-[13px]"
          placeholder="The reader's situation — “It charges from some cables but not others”"
        />

        <span className="text-[12px] text-info-light">Goes to</span>
        {crossSubject ? (
          <p className="text-[13px] text-info-light">
            Points at{" "}
            <code className="rounded bg-surface-container-low/40 px-1">
              {branch.targetSubjectKey}/{branch.targetSymptomId}
            </code>{" "}
            in another subject. Remove and re-add the link to change it.
          </p>
        ) : options.length === 0 ? (
          // A Select with nothing in it is a control that opens onto nothing.
          // Says why instead.
          <p className="text-[13px] text-info-light">
            There is nothing else in this subject to link to yet.
          </p>
        ) : (
          <Select
            value={branch.targetSymptomId}
            onValueChange={(targetSymptomId) => onChange({ ...branch, targetSymptomId })}
          >
            <SelectTrigger
              aria-label="Goes to"
              className={`h-8 w-full text-[12.5px] ${SELECT_TRIGGER}`}
            >
              <SelectValue placeholder="Pick a symptom" />
            </SelectTrigger>
            <SelectContent className={SELECT_CONTENT}>
              {options.map((symptom) => (
                <SelectItem key={symptom.id} className={SELECT_ITEM} value={symptom.id}>
                  {symptom.label}
                  {symptom.hasArticle ? "" : " (not written yet)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

    </div>
  );
}
