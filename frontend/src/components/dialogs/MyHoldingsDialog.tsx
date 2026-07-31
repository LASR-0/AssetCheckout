import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { getMyHoldings } from "@/api/holdings";
import { submitCorrection, type NoLongerHeldReason } from "@/api/corrections";
import { getAllAssetCategories } from "@/api/categories";
import { getAllAccessoryCategories } from "@/api/accessories";
import { iconForCategory } from "@/lib/categoryIcon";
import { whereToFind } from "@/lib/whereToFind";
import type { AssetHolding, AccessoryHolding } from "@/types/holdingsType";

///  +-----------------------------------------------------------------+
///  |                    MY HOLDINGS + CORRECTIONS                    |
///  +-----------------------------------------------------------------+
//
//  What the signed-in user holds, and how they tell IT the record is wrong.
//
//  SUBJECT-SCOPED. One instance shows devices OR accessories, never both —
//  it opens from a specific section, so showing the other kind alongside
//  makes the user filter a list they didn't ask for.
//
//  Multi-phase in one dialog, the same shape as CreateModelDialog, because
//  every phase is a step in one task and the user has to get back to the list
//  without losing their place:
//
//    list        the holdings, each correctable, plus "Something missing?"
//    choose      what's wrong with the row they picked
//    wrong-what  WHICH detail is wrong — serial, model, or something else
//    wrong-edit  just the field(s) that answer implies
//    gone        they don't have it any more, and why
//    unlogged    something with no record at all
//    done
//
//  Built on ResponsiveDialog, so it's a dialog on desktop and a drawer on
//  mobile without this component knowing which.
//
//  SELF-ONLY. The server derives the requester from the signed-in actor, so
//  nothing here sends an identity.
///  +-----------------------------------------------------------------+

type Phase =
  | "list"
  | "choose"
  | "wrong-what"
  | "wrong-edit"
  | "gone"
  | "unlogged"
  | "done";

type WrongField = "SERIAL" | "MODEL" | "OTHER";

type Row = {
  snipeRecordId: number;
  title: string;
  categoryId: number | null;
  categoryName: string | null;
  detail: string | null;
};

const GONE_REASONS: { value: NoLongerHeldReason; label: string; icon: string }[] =
  [
    { value: "RETURNED", label: "I returned it to IT", icon: "assignment_return" },
    { value: "LOST", label: "It was lost or stolen", icon: "search_off" },
    { value: "SWAPPED", label: "It was swapped for something else", icon: "swap_horiz" },
    { value: "GAVE_AWAY", label: "I passed it to someone else", icon: "group" },
    { value: "OTHER", label: "Something else", icon: "more_horiz" },
  ];

const WRONG_FIELDS: {
  value: WrongField;
  label: string;
  body: string;
  icon: string;
}[] = [
  {
    value: "MODEL",
    label: "The model name is wrong",
    body: "We've recorded it as something it isn't.",
    icon: "devices",
  },
  {
    value: "SERIAL",
    label: "The serial number is wrong",
    body: "The serial we have doesn't match the one on the device.",
    icon: "tag",
  },
  {
    value: "OTHER",
    label: "Something else is wrong",
    body: "Tell us in your own words.",
    icon: "edit_note",
  },
];

export default function MyHoldingsDialog({
  open,
  onOpenChange,
  subject,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which kind this instance covers. Strict — the other kind is not shown. */
  subject: "ASSET" | "ACCESSORY";
}) {
  const isAsset = subject === "ASSET";
  const noun = isAsset ? "device" : "accessory";
  const nounPlural = isAsset ? "devices" : "accessories";

  const [phase, setPhase] = useState<Phase>("list");
  const [rows, setRows] = useState<Row[]>([]);
  const [cats, setCats] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);

  const [wrongField, setWrongField] = useState<WrongField | null>(null);
  const [description, setDescription] = useState("");
  const [serial, setSerial] = useState("");
  const [correctedModel, setCorrectedModel] = useState("");
  const [reason, setReason] = useState<NoLongerHeldReason | "">("");
  const [unloggedCategoryId, setUnloggedCategoryId] = useState<number | null>(
    null
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhase("list");
    setSelected(null);
    setWrongField(null);
    setDescription("");
    setSerial("");
    setCorrectedModel("");
    setReason("");
    setUnloggedCategoryId(null);
    setError(null);
    setSubmitting(false);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [holdings, categories] = await Promise.all([
          getMyHoldings(),
          // Every category, not just requestable ones: the user is reporting
          // something they already have, which may well not be requestable.
          isAsset
            ? getAllAssetCategories().catch(() => [])
            : getAllAccessoryCategories().catch(() => []),
        ]);
        if (cancelled) return;

        setRows(
          isAsset
            ? (holdings.assets ?? []).map((a: AssetHolding) => ({
                snipeRecordId: a.id,
                title: a.model?.trim() || "Unnamed model",
                categoryId: a.categoryId,
                categoryName: a.categoryName,
                detail: a.assetTag ? `Tag ${a.assetTag}` : null,
              }))
            : (holdings.accessories ?? []).map((c: AccessoryHolding) => ({
                snipeRecordId: c.id,
                title: c.name?.trim() || "Unnamed accessory",
                categoryId: c.categoryId,
                categoryName: c.categoryName,
                detail: c.manufacturer,
              }))
        );
        setCats(categories);
      } catch (err) {
        console.error("Failed to load holdings", err);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, isAsset]);

  // Guidance follows what the user picked, so it describes their thing rather
  // than listing every device type.
  const guide = useMemo(() => {
    const categoryName =
      phase === "unlogged"
        ? cats.find((c) => c.id === unloggedCategoryId)?.name ?? null
        : selected?.categoryName ?? null;
    return whereToFind(categoryName, subject);
  }, [phase, cats, unloggedCategoryId, selected, subject]);

  function back() {
    setError(null);
    if (phase === "choose" || phase === "unlogged") return setPhase("list");
    if (phase === "wrong-what") return setPhase("choose");
    if (phase === "wrong-edit") return setPhase("wrong-what");
    return setPhase("choose");
  }

  async function submit(payload: Parameters<typeof submitCorrection>[0]) {
    setSubmitting(true);
    setError(null);
    try {
      await submitCorrection(payload);
      setPhase("done");
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't submit that. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Each answer requires only the field it implies.
  const canSubmitWrong =
    !!selected &&
    ((wrongField === "MODEL" && correctedModel.trim() !== "") ||
      (wrongField === "SERIAL" && serial.trim() !== "") ||
      (wrongField === "OTHER" && description.trim() !== ""));

  const title = () => {
    if (phase === "list") return `Your ${nounPlural}`;
    if (phase === "choose") return "What's wrong with it?";
    if (phase === "wrong-what") return "Which detail is wrong?";
    if (phase === "wrong-edit") return "Tell us what it should be";
    if (phase === "gone") return `You no longer have this ${noun}`;
    if (phase === "unlogged") return `Report a missing ${noun}`;
    return "Thanks — sent to IT";
  };

  const subtitle = () => {
    if (phase === "list")
      return `Every ${noun} currently assigned to you in our records. If something looks wrong, tell IT here.`;
    if (phase === "choose" || phase === "wrong-what") return selected?.title;
    if (phase === "wrong-edit") return `We have it recorded as “${selected?.title}”.`;
    if (phase === "gone") return "We'll ask IT to take it off your record.";
    if (phase === "unlogged")
      return `A ${noun} you have that isn't in the list.`;
    return "IT will review it and update the record. Nothing else to do.";
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return; // never yank the dialog mid-submit
        onOpenChange(next);
      }}
    >
      <ResponsiveDialogContent className="p-0 bg-modal-surface border border-modal-border rounded-xl shadow-md md:min-w-2xl">
        <ResponsiveDialogHeader className="px-6 md:px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">
              {phase === "done" ? "check_circle" : isAsset ? "devices" : "cable"}
            </span>
          </div>
          <ResponsiveDialogTitle className="font-headline font-extrabold text-xl md:text-2xl tracking-tight text-modal-text-primary">
            {title()}
          </ResponsiveDialogTitle>
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {subtitle()}
          </p>
        </ResponsiveDialogHeader>

        <div className="px-6 md:px-8 py-6 space-y-4 max-h-[55vh] overflow-y-auto overscroll-contain">
          {error && (
            <p className="text-sm text-error bg-error-background rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* ---------------- LIST ---------------- */}
          {phase === "list" && (
            <>
              {loading && (
                <p className="text-sm text-info-light italic py-6 text-center">
                  Loading your {nounPlural}...
                </p>
              )}

              {!loading && rows.length === 0 && (
                <p className="text-sm text-info-light py-6 text-center">
                  No {nounPlural} are assigned to you in our records.
                </p>
              )}

              {!loading &&
                rows.map((row) => (
                  <div
                    key={row.snipeRecordId}
                    className="flex items-center gap-3 rounded-lg border border-outline bg-surface px-3 py-2.5"
                  >
                    <span className="material-symbols-outlined !text-[20px] shrink-0 text-info-light">
                      {iconForCategory(row.categoryName ?? row.title)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-sm font-semibold text-on-surface-variant">
                        {row.title}
                      </span>
                      <span className="block truncate text-xs text-info-light">
                        {[row.categoryName, row.detail]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(row);
                        setError(null);
                        setPhase("choose");
                      }}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-outline px-2 py-1 text-xs font-semibold text-info-light hover:text-on-background hover:cursor-pointer transition-colors"
                    >
                      <span className="material-symbols-outlined !text-[14px]">
                        edit
                      </span>
                      Not right?
                    </button>
                  </div>
                ))}

              {!loading && (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setPhase("unlogged");
                  }}
                  className="w-full rounded-lg border border-dashed border-status-pending bg-status-pending/10 px-3 py-2.5 text-left hover:brightness-105 hover:cursor-pointer transition-all"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-status-pending">
                    <span className="material-symbols-outlined !text-[18px]">
                      add_circle
                    </span>
                    Something missing?
                  </span>
                  <span className="block mt-0.5 text-xs text-info-light">
                    Tell us about a {noun} you have that isn't listed above.
                  </span>
                </button>
              )}
            </>
          )}

          {/* ---------------- CHOOSE ---------------- */}
          {phase === "choose" && selected && (
            <div className="space-y-3">
              <Choice
                icon="edit_note"
                title="The details are wrong"
                body="The model or serial we have doesn't match what you actually have."
                onClick={() => {
                  setError(null);
                  setPhase("wrong-what");
                }}
              />
              <Choice
                icon="person_remove"
                title="I don't have this any more"
                body={`It's recorded against you, but you no longer have this ${noun}.`}
                onClick={() => {
                  setError(null);
                  setPhase("gone");
                }}
              />
            </div>
          )}

          {/* ---------------- WHICH DETAIL ---------------- */}
          {phase === "wrong-what" && selected && (
            <div className="space-y-3">
              {WRONG_FIELDS.map((f) => (
                <Choice
                  key={f.value}
                  icon={f.icon}
                  title={f.label}
                  body={f.body}
                  onClick={() => {
                    setWrongField(f.value);
                    setError(null);
                    setPhase("wrong-edit");
                  }}
                />
              ))}
            </div>
          )}

          {/* ---------------- EDIT THE DETAIL ---------------- */}
          {phase === "wrong-edit" && selected && (
            <div className="space-y-4">
              {wrongField === "MODEL" && (
                <>
                  <Field
                    label="What model is it actually?"
                    value={correctedModel}
                    onChange={setCorrectedModel}
                    placeholder="e.g. ThinkPad T16 Gen 1"
                  />
                  <FindGuideCard guide={guide} />
                </>
              )}

              {wrongField === "SERIAL" && (
                <>
                  <Field
                    label="What's the serial number?"
                    value={serial}
                    onChange={setSerial}
                    placeholder="As printed on the device"
                  />
                  <FindGuideCard guide={guide} />
                </>
              )}

              {wrongField === "OTHER" && (
                <TextArea
                  label="What's wrong with it?"
                  value={description}
                  onChange={setDescription}
                  placeholder="Describe what doesn't match — anything that helps IT find the right record."
                />
              )}

              {wrongField !== "OTHER" && (
                <TextArea
                  label="Anything else IT should know?"
                  optional
                  value={description}
                  onChange={setDescription}
                />
              )}
            </div>
          )}

          {/* ---------------- NO LONGER HELD ---------------- */}
          {phase === "gone" && selected && (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="block text-xs font-medium text-info-light">
                  What happened to it?
                </span>
                {GONE_REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReason(r.value)}
                    className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm text-left hover:cursor-pointer transition-all ${
                      reason === r.value
                        ? "border-purple-500 bg-surface-container-low/40 text-on-background"
                        : "border-outline text-on-surface-variant hover:border-purple-500/50"
                    }`}
                  >
                    <span className="material-symbols-outlined !text-[18px] text-info-light">
                      {r.icon}
                    </span>
                    {r.label}
                  </button>
                ))}
              </div>
              <TextArea
                label="Anything else IT should know?"
                optional
                value={description}
                onChange={setDescription}
              />
            </div>
          )}

          {/* ---------------- UNLOGGED ---------------- */}
          {phase === "unlogged" && (
            <div className="space-y-4">
              <div>
                <span className="block text-xs font-medium text-info-light mb-2">
                  What kind of {noun} is it?
                </span>
                {cats.length === 0 ? (
                  <p className="text-sm text-info-light italic">
                    Couldn't load the categories — please try again later.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {cats.map((c) => {
                      const active = unloggedCategoryId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setUnloggedCategoryId(c.id)}
                          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center hover:cursor-pointer transition-all ${
                            active
                              ? "border-purple-500 bg-surface-container-low/40"
                              : "border-outline hover:border-purple-500/50"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined !text-[22px] ${
                              active ? "text-on-background" : "text-info-light"
                            }`}
                          >
                            {iconForCategory(c.name)}
                          </span>
                          <span
                            className={`text-[11px] font-semibold leading-tight ${
                              active
                                ? "text-on-background"
                                : "text-on-surface-variant"
                            }`}
                          >
                            {c.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {unloggedCategoryId !== null && (
                <>
                  <Field
                    label="Serial number"
                    optional
                    value={serial}
                    onChange={setSerial}
                    placeholder="If it has one you can find"
                  />
                  <TextArea
                    label="Describe it"
                    value={description}
                    onChange={setDescription}
                    placeholder="What is it, and where did you get it? Any detail helps IT find the right record."
                  />
                  <FindGuideCard guide={guide} />
                </>
              )}
            </div>
          )}

          {/* ---------------- DONE ---------------- */}
          {phase === "done" && (
            <p className="text-sm text-info-light text-center py-4">
              You can close this now.
            </p>
          )}
        </div>

        <ResponsiveDialogFooter className="px-6 md:px-8 pb-8 pt-2 flex flex-col sm:flex-row-reverse gap-3 border-t border-modal-border/10">
          {phase === "wrong-edit" && (
            <Primary
              disabled={!canSubmitWrong || submitting}
              busy={submitting}
              onClick={() =>
                submit({
                  categoryId: selected!.categoryId ?? 0,
                  categoryName: selected!.categoryName ?? "Unknown",
                  correctionKind: "WRONG_MODEL",
                  subjectKind: subject,
                  snipeRecordId: selected!.snipeRecordId,
                  wrongField,
                  correctedModel: correctedModel.trim() || null,
                  serial: serial.trim() || null,
                  // The backend requires a description; build one when the
                  // user answered with the structured field only.
                  description:
                    description.trim() ||
                    (wrongField === "MODEL"
                      ? `Recorded as “${selected!.title}”; user says the model is “${correctedModel.trim()}”`
                      : `Recorded serial is wrong; user reports “${serial.trim()}”`),
                })
              }
            />
          )}

          {phase === "gone" && (
            <Primary
              disabled={reason === "" || submitting}
              busy={submitting}
              onClick={() =>
                submit({
                  categoryId: selected!.categoryId ?? 0,
                  categoryName: selected!.categoryName ?? "Unknown",
                  correctionKind: "NO_LONGER_HELD",
                  subjectKind: subject,
                  snipeRecordId: selected!.snipeRecordId,
                  noLongerHeldReason: reason || null,
                  description:
                    description.trim() ||
                    `User no longer has “${selected!.title}”`,
                })
              }
            />
          )}

          {phase === "unlogged" && (
            <Primary
              disabled={
                unloggedCategoryId === null ||
                description.trim() === "" ||
                submitting
              }
              busy={submitting}
              onClick={() =>
                submit({
                  categoryId: unloggedCategoryId!,
                  categoryName:
                    cats.find((c) => c.id === unloggedCategoryId)?.name ??
                    "Unknown",
                  correctionKind: "UNLOGGED",
                  subjectKind: subject,
                  serial: serial.trim() || null,
                  description: description.trim(),
                })
              }
            />
          )}

          {phase !== "list" && phase !== "done" && (
            <Secondary label="Back" disabled={submitting} onClick={back} />
          )}

          {(phase === "list" || phase === "done") && (
            <Secondary label="Close" onClick={() => onOpenChange(false)} />
          )}
        </ResponsiveDialogFooter>

        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

///  +-----------------------------------------------------------------+
///  |                          SUB-PARTS                              |
///  +-----------------------------------------------------------------+

/** Guidance for the specific thing the user picked, shown inline at the
 *  moment they're asked for the value rather than hidden behind a toggle. */
function FindGuideCard({
  guide,
}: {
  guide: ReturnType<typeof whereToFind>;
}) {
  return (
    <div className="rounded-lg border border-outline bg-surface-container-low/30 p-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-on-surface-variant">
        <span className="material-symbols-outlined !text-[18px] text-info-light">
          {guide.icon}
        </span>
        {guide.title}
      </p>
      <ul className="mt-2 space-y-1.5">
        {guide.steps.map((step, i) => (
          <li
            key={i}
            className="flex gap-2 text-xs text-info-light leading-relaxed"
          >
            <span className="mt-[3px] size-1 shrink-0 rounded-full bg-info-light/60" />
            {step}
          </li>
        ))}
      </ul>
      {guide.oftenAbsent && (
        <p className="mt-2 text-[11px] font-semibold text-status-pending">
          No serial is normal here — leave it blank.
        </p>
      )}
    </div>
  );
}

function Choice({
  icon,
  title,
  body,
  onClick,
}: {
  icon: string;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-lg border border-outline bg-surface px-4 py-3 hover:border-purple-500 hover:cursor-pointer transition-all"
    >
      <span className="flex items-center gap-2 text-sm font-semibold text-on-surface-variant">
        <span className="material-symbols-outlined !text-[18px] text-info-light">
          {icon}
        </span>
        {title}
      </span>
      <span className="block mt-0.5 text-xs text-info-light leading-relaxed">
        {body}
      </span>
    </button>
  );
}

function Field({
  label,
  optional,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  optional?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-info-light mb-1">
        {label} {optional && <span className="font-normal">(optional)</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full p-3 border border-outline rounded-lg bg-surface-container/40 text-on-surface-variant focus:outline-0 transition-all"
      />
    </label>
  );
}

function TextArea({
  label,
  optional,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  optional?: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-info-light mb-1">
        {label} {optional && <span className="font-normal">(optional)</span>}
      </span>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full p-3 border border-outline rounded-lg bg-surface-container/40 text-on-surface-variant focus:outline-0 transition-all"
      />
    </label>
  );
}

function Primary({
  disabled,
  busy,
  onClick,
}: {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center gap-2"
    >
      {busy && (
        <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
      )}
      {busy ? "Sending..." : "Send to IT"}
    </button>
  );
}

function Secondary({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  );
}
