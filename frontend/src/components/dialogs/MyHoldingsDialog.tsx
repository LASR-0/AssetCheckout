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
import type { AssetHolding, AccessoryHolding } from "@/types/holdingsType";
import type { AssetCategory } from "@/types/categoriesType";
import type { AccessoryCategory } from "@/types/accessoriesType";

///  +-----------------------------------------------------------------+
///  |                    MY HOLDINGS + CORRECTIONS                    |
///  +-----------------------------------------------------------------+
//
//  What the signed-in user holds, and the way they tell IT the record is
//  wrong. Multi-phase in one dialog — the same shape as CreateModelDialog —
//  rather than several dialogs, because every phase is a step in one task and
//  the user needs to get back to the list without losing their place.
//
//    list          the holdings, each row correctable, plus "Something missing?"
//    choose        what's wrong with the row they picked
//    wrong-model   the model and/or serial are wrong
//    no-longer-held they don't have it any more, and why
//    unlogged      they have something with no record at all
//    done          submitted
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
  | "wrong-model"
  | "no-longer-held"
  | "unlogged"
  | "done";

/** A holding of either kind, flattened so the list can render one row shape. */
type Row = {
  key: string;
  snipeRecordId: number;
  subjectKind: "ASSET" | "ACCESSORY";
  /** Model name for an asset, accessory name for an accessory. */
  title: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Assets carry a tag; accessories carry a manufacturer. */
  detail: string | null;
};

const NO_LONGER_HELD_REASONS: { value: NoLongerHeldReason; label: string }[] = [
  { value: "RETURNED", label: "I returned it to IT" },
  { value: "LOST", label: "It was lost or stolen" },
  { value: "SWAPPED", label: "It was swapped for something else" },
  { value: "GAVE_AWAY", label: "I passed it to someone else" },
  { value: "OTHER", label: "Something else" },
];

function toRows(
  assets: AssetHolding[],
  accessories: AccessoryHolding[]
): Row[] {
  return [
    ...assets.map((a) => ({
      key: `asset-${a.id}`,
      snipeRecordId: a.id,
      subjectKind: "ASSET" as const,
      title: a.model?.trim() || "Unnamed model",
      categoryId: a.categoryId,
      categoryName: a.categoryName,
      detail: a.assetTag ? `Tag ${a.assetTag}` : null,
    })),
    ...accessories.map((c) => ({
      key: `accessory-${c.id}`,
      snipeRecordId: c.id,
      subjectKind: "ACCESSORY" as const,
      title: c.name?.trim() || "Unnamed accessory",
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      detail: c.manufacturer,
    })),
  ];
}

export default function MyHoldingsDialog({
  open,
  onOpenChange,
  /** Which half to lead with — the tile section the user came from. */
  focus = "ASSET",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focus?: "ASSET" | "ACCESSORY";
}) {
  const [phase, setPhase] = useState<Phase>("list");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);

  const [assetCats, setAssetCats] = useState<AssetCategory[]>([]);
  const [accCats, setAccCats] = useState<AccessoryCategory[]>([]);

  // Form state, shared across phases and cleared on reopen.
  const [description, setDescription] = useState("");
  const [serial, setSerial] = useState("");
  const [correctedModel, setCorrectedModel] = useState("");
  const [reason, setReason] = useState<NoLongerHeldReason | "">("");
  const [unloggedSubject, setUnloggedSubject] =
    useState<"ASSET" | "ACCESSORY">(focus);
  const [unloggedCategoryId, setUnloggedCategoryId] = useState<number | "">("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset everything when the dialog opens, so a previous half-finished report
  // never leaks into the next one.
  useEffect(() => {
    if (!open) return;
    setPhase("list");
    setSelected(null);
    setDescription("");
    setSerial("");
    setCorrectedModel("");
    setReason("");
    setUnloggedSubject(focus);
    setUnloggedCategoryId("");
    setError(null);
    setSubmitting(false);

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [holdings, aCats, cCats] = await Promise.all([
          getMyHoldings(),
          // Every category, not just requestable ones: the user is reporting
          // something they already have, which may well not be requestable.
          getAllAssetCategories().catch(() => []),
          getAllAccessoryCategories().catch(() => []),
        ]);
        if (cancelled) return;
        setRows(toRows(holdings.assets ?? [], holdings.accessories ?? []));
        setAssetCats(aCats);
        setAccCats(cCats);
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
  }, [open, focus]);

  // Lead with the half the user came from, but show both — a correction is
  // just as likely to be about the other kind.
  const orderedRows = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.subjectKind === b.subjectKind) return a.title.localeCompare(b.title);
        return a.subjectKind === focus ? -1 : 1;
      }),
    [rows, focus]
  );

  const unloggedCats = unloggedSubject === "ASSET" ? assetCats : accCats;

  function back() {
    setError(null);
    if (phase === "choose") return setPhase("list");
    if (phase === "unlogged") return setPhase("list");
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

  const canSubmitWrongModel =
    !!selected && (correctedModel.trim() !== "" || serial.trim() !== "");
  const canSubmitNoLongerHeld = !!selected && reason !== "";
  const canSubmitUnlogged =
    unloggedCategoryId !== "" && description.trim() !== "";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return; // never yank the dialog mid-submit
        onOpenChange(next);
      }}
    >
      <ResponsiveDialogContent className="p-0 bg-modal-surface border border-modal-border rounded-xl shadow-md md:min-w-2xl">
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">
              {phase === "done" ? "check_circle" : "inventory_2"}
            </span>
          </div>
          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            {phase === "list" && "What you have"}
            {phase === "choose" && "What's wrong with it?"}
            {phase === "wrong-model" && "Correct the details"}
            {phase === "no-longer-held" && "You no longer have this"}
            {phase === "unlogged" && "Report something missing"}
            {phase === "done" && "Thanks — sent to IT"}
          </ResponsiveDialogTitle>
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {phase === "list" &&
              "Everything currently assigned to you in our records. If something looks wrong, you can tell IT here."}
            {phase === "choose" && selected?.title}
            {phase === "wrong-model" &&
              "Tell us what it actually is. Fill in whichever you know."}
            {phase === "no-longer-held" &&
              "We'll ask IT to take it off your record."}
            {phase === "unlogged" &&
              "Something you have that isn't in the list."}
            {phase === "done" &&
              "IT will review it and update the record. Nothing else to do."}
          </p>
        </ResponsiveDialogHeader>

        <div className="px-8 py-6 space-y-4 max-h-[55vh] overflow-y-auto overscroll-contain">
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
                  Loading what you have...
                </p>
              )}

              {!loading && orderedRows.length === 0 && (
                <p className="text-sm text-info-light py-6 text-center">
                  Nothing is assigned to you in our records.
                </p>
              )}

              {!loading &&
                orderedRows.map((row) => (
                  <div
                    key={row.key}
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
                    Tell us about a device or accessory you have that isn't
                    listed above.
                  </span>
                </button>
              )}
            </>
          )}

          {/* ---------------- CHOOSE ---------------- */}
          {phase === "choose" && selected && (
            <div className="space-y-3">
              <ChoiceButton
                icon="edit_note"
                title="The details are wrong"
                body="The model or serial number we have recorded doesn't match the thing you actually have."
                onClick={() => {
                  setError(null);
                  setPhase("wrong-model");
                }}
              />
              <ChoiceButton
                icon="person_remove"
                title="I don't have this any more"
                body="It's recorded against you, but you no longer have it."
                onClick={() => {
                  setError(null);
                  setPhase("no-longer-held");
                }}
              />
            </div>
          )}

          {/* ---------------- WRONG MODEL ---------------- */}
          {phase === "wrong-model" && selected && (
            <div className="space-y-4">
              <Field
                label="What model is it actually?"
                optional
                value={correctedModel}
                onChange={setCorrectedModel}
                placeholder={`We have "${selected.title}"`}
              />
              <Field
                label="Serial number"
                optional
                value={serial}
                onChange={setSerial}
                placeholder="If you can find it"
              />
              <TextArea
                label="Anything else IT should know?"
                optional
                value={description}
                onChange={setDescription}
              />
              <WhereToFind />
            </div>
          )}

          {/* ---------------- NO LONGER HELD ---------------- */}
          {phase === "no-longer-held" && selected && (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-info-light mb-1">
                  What happened to it?
                </legend>
                {NO_LONGER_HELD_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className="flex items-center gap-3 rounded-lg border border-outline px-3 py-2 text-sm text-on-surface-variant hover:cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="no-longer-held-reason"
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="hover:cursor-pointer"
                    />
                    {r.label}
                  </label>
                ))}
              </fieldset>
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
                <span className="block text-xs font-medium text-info-light mb-1">
                  Is it a device or an accessory?
                </span>
                <div className="inline-flex p-1 bg-surface-container rounded-lg">
                  {(["ASSET", "ACCESSORY"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => {
                        setUnloggedSubject(k);
                        setUnloggedCategoryId("");
                      }}
                      className={`px-5 py-1.5 rounded-md text-sm font-medium transition-all hover:cursor-pointer ${
                        unloggedSubject === k
                          ? "bg-surface-container-lowest text-on-background shadow-sm"
                          : "text-on-surface-variant/50"
                      }`}
                    >
                      {k === "ASSET" ? "Device" : "Accessory"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="block">
                <span className="block text-xs font-medium text-info-light mb-1">
                  What kind of thing is it?
                </span>
                <select
                  value={unloggedCategoryId}
                  onChange={(e) =>
                    setUnloggedCategoryId(
                      e.target.value === "" ? "" : Number(e.target.value)
                    )
                  }
                  className="w-full p-3 border border-outline rounded-lg bg-surface-container/40 text-on-surface-variant focus:outline-0 hover:cursor-pointer"
                >
                  <option value="">Choose one...</option>
                  {unloggedCats.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

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
              <WhereToFind />
            </div>
          )}

          {/* ---------------- DONE ---------------- */}
          {phase === "done" && (
            <p className="text-sm text-info-light text-center py-4">
              You can close this now.
            </p>
          )}
        </div>

        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex flex-col sm:flex-row-reverse gap-3 border-t border-modal-border/10">
          {phase === "wrong-model" && (
            <PrimaryButton
              disabled={!canSubmitWrongModel || submitting}
              busy={submitting}
              label="Send to IT"
              onClick={() =>
                submit({
                  categoryId: selected!.categoryId ?? 0,
                  categoryName: selected!.categoryName ?? "Unknown",
                  correctionKind: "WRONG_MODEL",
                  subjectKind: selected!.subjectKind,
                  snipeRecordId: selected!.snipeRecordId,
                  correctedModel: correctedModel.trim() || null,
                  serial: serial.trim() || null,
                  // The backend requires a description; build one when the
                  // user only filled the structured fields.
                  description:
                    description.trim() ||
                    `Recorded as "${selected!.title}"; user reports ${
                      correctedModel.trim()
                        ? `model "${correctedModel.trim()}"`
                        : ""
                    }${correctedModel.trim() && serial.trim() ? " and " : ""}${
                      serial.trim() ? `serial "${serial.trim()}"` : ""
                    }`,
                })
              }
            />
          )}

          {phase === "no-longer-held" && (
            <PrimaryButton
              disabled={!canSubmitNoLongerHeld || submitting}
              busy={submitting}
              label="Send to IT"
              onClick={() =>
                submit({
                  categoryId: selected!.categoryId ?? 0,
                  categoryName: selected!.categoryName ?? "Unknown",
                  correctionKind: "NO_LONGER_HELD",
                  subjectKind: selected!.subjectKind,
                  snipeRecordId: selected!.snipeRecordId,
                  noLongerHeldReason: reason || null,
                  description:
                    description.trim() ||
                    `User no longer has "${selected!.title}"`,
                })
              }
            />
          )}

          {phase === "unlogged" && (
            <PrimaryButton
              disabled={!canSubmitUnlogged || submitting}
              busy={submitting}
              label="Send to IT"
              onClick={() => {
                const cat = unloggedCats.find(
                  (c) => c.id === unloggedCategoryId
                );
                submit({
                  categoryId: Number(unloggedCategoryId),
                  categoryName: cat?.name ?? "Unknown",
                  correctionKind: "UNLOGGED",
                  subjectKind: unloggedSubject,
                  serial: serial.trim() || null,
                  description: description.trim(),
                });
              }}
            />
          )}

          {phase !== "list" && phase !== "done" && (
            <SecondaryButton label="Back" disabled={submitting} onClick={back} />
          )}

          {(phase === "list" || phase === "done") && (
            <SecondaryButton
              label="Close"
              onClick={() => onOpenChange(false)}
            />
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

/** Where to find a serial or model on the common device types. Users are
 *  asked for details they've often never looked for, so this saves an
 *  exchange with IT. */
function WhereToFind() {
  return (
    <details className="rounded-lg border border-outline bg-surface-container-low/30 px-3 py-2">
      <summary className="text-xs font-semibold text-info-light hover:cursor-pointer">
        Where do I find the serial or model?
      </summary>
      <ul className="mt-2 space-y-1.5 text-xs text-info-light leading-relaxed">
        <li>
          <strong className="text-on-surface-variant">Laptops:</strong> on a
          sticker underneath, or press the Windows key and type "About your PC".
        </li>
        <li>
          <strong className="text-on-surface-variant">iPhone / iPad:</strong>{" "}
          Settings → General → About.
        </li>
        <li>
          <strong className="text-on-surface-variant">Android:</strong>{" "}
          Settings → About phone.
        </li>
        <li>
          <strong className="text-on-surface-variant">Monitors, docks:</strong>{" "}
          a label on the back or underside.
        </li>
        <li>
          <strong className="text-on-surface-variant">Accessories:</strong>{" "}
          often none at all — leave it blank and describe it instead.
        </li>
      </ul>
    </details>
  );
}

function ChoiceButton({
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
        {label}{" "}
        {optional && <span className="font-normal">(optional)</span>}
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
        {label}{" "}
        {optional && <span className="font-normal">(optional)</span>}
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

function PrimaryButton({
  label,
  disabled,
  busy,
  onClick,
}: {
  label: string;
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
      {busy ? "Sending..." : label}
    </button>
  );
}

function SecondaryButton({
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
