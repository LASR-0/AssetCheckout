import { useEffect, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import InfoHint from "@/components/ui/infohint";
import type { Request } from "@/types/requestType";
import {
  approveCorrection,
  searchCorrectionModels,
  searchCorrectionAssets,
  checkSerialInUse,
  type CorrectionResolution,
  type CorrectionModelMatch,
  type CorrectionAssetMatch,
} from "@/api/corrections";
import { searchAccessoriesForRequest, type AccessorySearchMatch } from "@/api/accessories";

///  +-----------------------------------------------------------------+
///  |                     MANAGE A RECORD CORRECTION                  |
///  +-----------------------------------------------------------------+
//
//  The row action is "Manage", not Approve/Reject, because reviewing a
//  correction is a read before it is a decision — the admin needs to see what
//  the requester actually reported before either verb makes sense. Both verbs
//  therefore live INSIDE this dialog rather than on the row.
//
//  It also replaces the interim badge-only branch that kept corrections away
//  from the provisioning actions. That exclusion has NOT been relaxed: a
//  correction still never reaches "Mark ready", "Mark shipped" or any other
//  fulfilment action, it just now has something of its own to offer instead.
//
//  APPROVING CAN LEAVE THE ROW WHERE IT IS. If the correction can't be written
//  to Snipe — no stock, no target picked, nothing patchable — the server
//  returns applied:false and the request stays APPROVED with a reason. The
//  dialog reports that as a blocked result rather than a success, because a
//  green tick over an unapplied correction is exactly the kind of wrong record
//  this feature exists to fix.
//
//  Chrome follows ConfirmApprovalDialog so the confirm-a-decision
//  dialogs on this table read as a family.
///  +-----------------------------------------------------------------+

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Refetch the table. */
  onSuccess: () => void;
  /** Rejection is routed back through the page's existing reject flow, which
   *  already composes the "REJECTED: … REQUEST: …" reason format. */
  onReject: (request: Request, reason: string) => Promise<void>;
};

const KIND_LABEL: Record<string, string> = {
  UNLOGGED: "Item not in Snipe",
  NO_LONGER_HELD: "No longer held",
  WRONG_MODEL: "Recorded details are wrong",
};

const HELD_REASON_LABEL: Record<string, string> = {
  RETURNED: "Returned it",
  LOST: "Lost or stolen",
  SWAPPED: "Swapped for another",
  GAVE_AWAY: "Gave it to someone else",
  OTHER: "Other",
};

const WRONG_FIELD_LABEL: Record<string, string> = {
  SERIAL: "Serial number",
  MODEL: "Model",
  OTHER: "Something else",
};

/** Error copy an admin can read, without widening the catch to `any`. */
function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Live "is this serial already taken?" state, shown as a badge beside the
 *  field. Advisory: the write-time check is what actually refuses. */
type SerialCheck =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "clear" }
  | { state: "clash"; matches: CorrectionAssetMatch[] }
  /** The lookup itself failed. Says so rather than implying the serial is
   *  clear, which would be the dangerous way to be wrong. */
  | { state: "failed" };

type Phase =
  | { phase: "review" }
  | { phase: "working" }
  | { phase: "applied"; message: string }
  | { phase: "blocked"; message: string; serialClashes?: CorrectionAssetMatch[] }
  | { phase: "error"; message: string };

export default function ManageCorrectionDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
  onReject,
}: Props) {
  const [state, setState] = useState<Phase>({ phase: "review" });
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Admin-supplied targets. Only the ones the correction actually needs are
  // rendered — see needsAccessoryTarget / needsModel / needsAssetTarget.
  const [manualResolve, setManualResolve] = useState(false);
  const [accessoryQuery, setAccessoryQuery] = useState("");
  const [accessoryMatches, setAccessoryMatches] = useState<AccessorySearchMatch[] | null>(null);
  const [accessoryId, setAccessoryId] = useState<number | null>(null);
  const [searching, setSearching] = useState(false);

  // Asset resolution is a two-step search: name the MODEL, then find the
  // asset by serial within it. Both steps replace what used to be a bare
  // "type the Snipe id" box, which had no way to tell a right id from a
  // plausible wrong one.
  const [modelQuery, setModelQuery] = useState("");
  const [modelMatches, setModelMatches] = useState<CorrectionModelMatch[] | null>(null);
  const [pickedModel, setPickedModel] = useState<CorrectionModelMatch | null>(null);
  const [searchAllCategories, setSearchAllCategories] = useState(false);
  const [searchingModels, setSearchingModels] = useState(false);

  const [serialQuery, setSerialQuery] = useState("");
  const [assetMatches, setAssetMatches] = useState<CorrectionAssetMatch[] | null>(null);
  const [pickedAsset, setPickedAsset] = useState<CorrectionAssetMatch | null>(null);
  const [searchingAssets, setSearchingAssets] = useState(false);

  // The serial that will actually be written. Seeded from what the requester
  // reported and editable, because they were reading characters off a small
  // label — O/0 and I/1 are the routine slips — and this value goes into Snipe.
  const [serialEdit, setSerialEdit] = useState("");
  const [serialCheck, setSerialCheck] = useState<SerialCheck>({ state: "idle" });

  const detail = request?.correctionDetail ?? null;

  // Reset on close. Delayed so the fields don't visibly clear during the
  // close animation, matching CreateAccessoryDialog.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setState({ phase: "review" });
      setRejecting(false);
      setRejectReason("");
      setManualResolve(false);
      setAccessoryQuery("");
      setAccessoryMatches(null);
      setAccessoryId(null);
      setSearching(false);
      setModelQuery("");
      setModelMatches(null);
      setPickedModel(null);
      setSearchAllCategories(false);
      setSearchingModels(false);
      setSerialQuery("");
      setAssetMatches(null);
      setPickedAsset(null);
      setSearchingAssets(false);
      setSerialEdit("");
      setSerialCheck({ state: "idle" });
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  // Seed the editable serial from the report each time the dialog opens, so
  // reopening a row the admin abandoned starts from the requester's value
  // again rather than a half-finished edit.
  useEffect(() => {
    if (open) setSerialEdit(detail?.serial ?? "");
  }, [open, detail?.serial]);

  // Live duplicate check, debounced.
  //
  // Every keystroke would otherwise be a round trip to Snipe via our API, and
  // a serial is a dozen characters — so wait for a pause in typing. The
  // in-flight request is aborted when the value moves on, which also stops a
  // slow earlier response from landing on top of a newer one and telling the
  // admin the wrong thing about the serial now in the box.
  const serialToCheck = open && detail?.wrongField === "SERIAL" ? serialEdit.trim() : "";

  useEffect(() => {
    if (!request || !serialToCheck) {
      setSerialCheck({ state: "idle" });
      return;
    }

    const controller = new AbortController();
    setSerialCheck({ state: "checking" });

    const timer = setTimeout(() => {
      checkSerialInUse(request.id, serialToCheck, controller.signal)
        .then((matches) =>
          setSerialCheck(
            matches.length ? { state: "clash", matches } : { state: "clear" }
          )
        )
        .catch((err) => {
          if (controller.signal.aborted) return;
          console.error("Serial check failed", err);
          setSerialCheck({ state: "failed" });
        });
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request?.id, serialToCheck]);

  if (!request || !detail) return null;

  const isAsset = detail.subjectKind === "ASSET";
  const busy = state.phase === "working";

  // Which target this correction needs before it can be written. Mirrors the
  // server's own branching in services/correction.ts — the server is still the
  // one that refuses, this just avoids offering an approve that will bounce.
  const needsAccessoryTarget = detail.correctionKind === "UNLOGGED" && !isAsset;
  const needsAssetTarget = detail.correctionKind === "UNLOGGED" && isAsset;
  const needsModel =
    detail.correctionKind === "WRONG_MODEL" && isAsset && detail.wrongField === "MODEL";
  // Not a "target" like the others — the record is already known — but it IS a
  // value the admin has to stand behind before it's written to Snipe.
  const needsSerial =
    detail.correctionKind === "WRONG_MODEL" && isAsset && detail.wrongField === "SERIAL";
  const needsSomething = needsAccessoryTarget || needsAssetTarget || needsModel;

  // Nothing this dialog can express as a field write — the server will block
  // these, so the manual escape hatch is the only route to done.
  const manualOnly =
    (detail.correctionKind === "WRONG_MODEL" && !isAsset) ||
    (detail.correctionKind === "WRONG_MODEL" && detail.wrongField === "OTHER");

  const resolution: CorrectionResolution = manualResolve
    ? { resolvedManually: true }
    : {
        modelId: needsModel ? pickedModel?.id ?? null : null,
        serial: needsSerial ? serialEdit.trim() || null : null,
        snipeRecordId: needsAccessoryTarget
          ? accessoryId
          : needsAssetTarget
          ? pickedAsset?.id ?? null
          : null,
      };

  // A picked asset that can't be checked out doesn't enable Approve. The
  // server refuses it anyway, but making the admin round-trip to be told so
  // wastes their time when the reason is already on screen.
  const canApprove =
    manualResolve ||
    // Emptying the serial field can't be a way to skip the check.
    (needsSerial
      ? serialEdit.trim() !== ""
      : !needsSomething ||
        (needsAccessoryTarget && accessoryId !== null) ||
        (needsAssetTarget && pickedAsset !== null && pickedAsset.checkoutable) ||
        (needsModel && pickedModel !== null));

  async function handleSearchAccessories() {
    if (!request || !accessoryQuery.trim()) return;
    setSearching(true);
    try {
      const matches = await searchAccessoriesForRequest(request.id, {
        name: accessoryQuery.trim(),
      });
      setAccessoryMatches(matches);
    } catch (err) {
      setState({ phase: "error", message: messageOf(err, "Accessory search failed.") });
    } finally {
      setSearching(false);
    }
  }

  async function handleSearchModels() {
    if (!request || !modelQuery.trim()) return;
    setSearchingModels(true);
    try {
      const matches = await searchCorrectionModels(
        request.id,
        modelQuery.trim(),
        searchAllCategories
      );
      setModelMatches(matches);
    } catch (err) {
      setState({ phase: "error", message: messageOf(err, "Model search failed.") });
    } finally {
      setSearchingModels(false);
    }
  }

  async function handleSearchAssets() {
    if (!request || !pickedModel || !serialQuery.trim()) return;
    setSearchingAssets(true);
    try {
      const matches = await searchCorrectionAssets(
        request.id,
        pickedModel.id,
        serialQuery.trim()
      );
      setAssetMatches(matches);
    } catch (err) {
      setState({ phase: "error", message: messageOf(err, "Serial search failed.") });
    } finally {
      setSearchingAssets(false);
    }
  }

  /** Changing the model invalidates everything found under the old one. */
  function pickModel(m: CorrectionModelMatch) {
    setPickedModel(m);
    setAssetMatches(null);
    setPickedAsset(null);
  }

  async function handleApprove() {
    if (!request) return;
    setState({ phase: "working" });
    try {
      const result = await approveCorrection(request.id, resolution);
      // applied:false is a 200. Reading only the status here would report a
      // correction as done while Snipe still disagrees.
      setState(
        result.applied
          ? { phase: "applied", message: result.message }
          : {
              phase: "blocked",
              message: result.message,
              serialClashes: result.serialClashes,
            }
      );
      onSuccess();
    } catch (err) {
      setState({
        phase: "error",
        message: messageOf(err, "Could not apply this correction."),
      });
    }
  }

  async function handleConfirmReject() {
    if (!request || !rejectReason.trim()) return;
    setState({ phase: "working" });
    try {
      await onReject(request, rejectReason.trim());
      onOpenChange(false);
    } catch (err) {
      setState({
        phase: "error",
        message: messageOf(err, "Could not reject this correction."),
      });
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <ResponsiveDialogContent
        className="
          p-0
          bg-modal-surface
          border border-modal-border
          rounded-xl
          shadow-md
          md:min-w-2xl
        "
      >
        {/* HEADER */}
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-status-correction/15 rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-status-correction">
              fact_check
            </span>
          </div>

          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            Record correction
          </ResponsiveDialogTitle>

          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            <strong className="text-modal-text-primary">{request.userName}</strong>{" "}
            reported a problem with their {request.categoryName} record. Approving
            updates Snipe; rejecting closes it with a reason they'll see.
          </p>
        </ResponsiveDialogHeader>

        {/* CONTENT */}
        <div className="px-8 py-6 space-y-5 max-h-[60vh] overflow-y-auto">
          {/* WHAT THEY REPORTED */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-status-correction/10 text-status-correction border border-status-correction/30">
                {KIND_LABEL[detail.correctionKind] ?? detail.correctionKind}
              </span>
              <span className="text-xs text-info-light">
                {isAsset ? "Asset" : "Accessory"}
                {detail.snipeRecordId !== null && ` · Snipe #${detail.snipeRecordId}`}
              </span>
            </div>

            {/* What they wrote, given its own card. It's prose of unknown
                length and it's the thing the admin is actually judging, so it
                gets the width — unlike the facts below, which are short values
                that read better as a table. Previously both were the same flat
                stack of label-over-value, which made the whole block one
                undifferentiated column with nothing leading the eye. */}
            <div className="rounded-lg bg-modal-surface-elevated/50 border border-modal-border/20 px-4 py-3">
              <FieldLabel>What they said</FieldLabel>
              <p className="mt-1.5 text-sm text-modal-text-primary whitespace-pre-wrap break-words leading-relaxed">
                {detail.description}
              </p>
            </div>

            {/* The short facts, as label/value rows — the same divided card
                ReviewQuoteDialog uses for a quote's supplier and reference, so
                the two dialogs on this table present their read-only detail
                identically. Rendered only when there is something to show;
                NO_LONGER_HELD accessory reports carry none of these. */}
            {(() => {
              const facts = [
                ...(detail.serial ? [{ label: "Serial", value: detail.serial }] : []),
                ...(detail.correctedModel
                  ? [{ label: "Says it's actually", value: detail.correctedModel }]
                  : []),
                ...(detail.wrongField
                  ? [
                      {
                        label: "Wrong field",
                        value: WRONG_FIELD_LABEL[detail.wrongField] ?? detail.wrongField,
                      },
                    ]
                  : []),
                ...(detail.noLongerHeldReason
                  ? [
                      {
                        label: "Why",
                        value:
                          HELD_REASON_LABEL[detail.noLongerHeldReason] ??
                          detail.noLongerHeldReason,
                      },
                    ]
                  : []),
              ];
              if (!facts.length) return null;
              return (
                <div className="rounded-lg bg-modal-surface-elevated/50 border border-modal-border/20 divide-y divide-modal-border/10">
                  {facts.map((f) => (
                    <div
                      key={f.label}
                      className="flex items-baseline justify-between gap-4 px-4 py-2.5"
                    >
                      <span className="text-xs font-bold uppercase tracking-wide text-info-light shrink-0">
                        {f.label}
                      </span>
                      <span className="text-sm text-modal-text-primary text-right break-words">
                        {f.value}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </section>

          {/* PREVIOUSLY BLOCKED — carried on the record, so it survives a
              reload rather than living only in this dialog's state. */}
          {detail.applyError && state.phase === "review" && (
            <Notice tone="pending" icon="pending_actions" title="Waiting to be applied">
              {detail.applyError}
            </Notice>
          )}

          {/* RESOLUTION — only for the corrections that need a target.
              Stays visible while BLOCKED, not just on first review: the footer
              offers "Try again", and being blocked is precisely when the admin
              needs to change what they picked or typed. Hiding the fields left
              that button with nothing to act on. */}
          {(state.phase === "review" || state.phase === "blocked") && !rejecting && (
            <section className="space-y-3">
              {manualOnly && !manualResolve && (
                <Notice tone="pending" icon="info" title="No automatic update for this one">
                  {!isAsset
                    ? "Accessory records have no model or serial field to patch."
                    : "This describes a change with no single field to write."}{" "}
                  Make the change in Snipe, then tick the box below.
                </Notice>
              )}

              {needsAccessoryTarget && !manualResolve && (
                <div className="space-y-2">
                  <FieldLabel>
                    Which accessory is it?
                    <InfoHint>
                      The requester described this in their own words, which
                      doesn't identify a Snipe record. Pick the matching one so
                      it can be checked out to them.
                    </InfoHint>
                  </FieldLabel>
                  <div className="flex gap-2">
                    <input
                      value={accessoryQuery}
                      onChange={(e) => setAccessoryQuery(e.target.value)}
                      placeholder="Search by name…"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={handleSearchAccessories}
                      disabled={searching || !accessoryQuery.trim()}
                      className={SECONDARY_BTN}
                    >
                      {searching ? "Searching…" : "Search"}
                    </button>
                  </div>

                  {accessoryMatches?.length === 0 && (
                    <p className="text-xs text-info-light">
                      No match in this category. Create it in Snipe first, then
                      search again.
                    </p>
                  )}

                  {!!accessoryMatches?.length && (
                    <ul className="space-y-1.5">
                      {accessoryMatches.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => setAccessoryId(m.id)}
                            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors hover:cursor-pointer ${
                              accessoryId === m.id
                                ? "border-status-correction bg-status-correction/10"
                                : "border-modal-border hover:bg-modal-surface-accent/40"
                            }`}
                          >
                            <span className="font-semibold">{m.name}</span>
                            <span className="text-xs text-info-light ml-2">
                              {m.locationName ?? "No location"} ·{" "}
                              {m.hasAvailable ? "in stock" : "no stock"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* SERIAL — editable, not just displayed. This value goes
                  straight into Snipe, and it was typed by someone squinting at
                  a label, so the admin gets to correct it before it lands.
                  Note the asymmetry this closes: the MODEL branch never
                  trusted the requester's words either. */}
              {needsSerial && !manualResolve && (
                <div className="space-y-2">
                  <FieldLabel>
                    Serial to write
                    <InfoHint>
                      Pre-filled with what {request.userName} reported. Check it
                      against the device or the paperwork and correct it if
                      needed — this is written to Snipe exactly as it stands.
                    </InfoHint>
                  </FieldLabel>
                  <input
                    value={serialEdit}
                    onChange={(e) => setSerialEdit(e.target.value)}
                    placeholder="Serial number"
                    className={`${INPUT} font-mono`}
                  />
                  <SerialCheckBadge check={serialCheck} />

                  {detail.serial && serialEdit.trim() !== detail.serial.trim() && (
                    <p className="text-xs text-status-pending">
                      Changed from what they reported ({detail.serial}).
                    </p>
                  )}
                </div>
              )}

              {/* MODEL SEARCH — shared by both asset branches. UNLOGGED needs
                  it to narrow the serial search; WRONG_MODEL needs the model
                  itself as the answer. */}
              {(needsAssetTarget || needsModel) && !manualResolve && (
                <div className="space-y-2">
                  <FieldLabel>
                    {needsModel ? "Which model should it be?" : "Which model is it?"}
                    <InfoHint>
                      {needsModel
                        ? `"${detail.correctedModel ?? "their description"}" is the requester's wording, not a Snipe model. Find the real one.`
                        : "Find the model first — the serial search below is scoped to it, which is what makes a loose serial match safe."}
                    </InfoHint>
                  </FieldLabel>

                  <div className="flex gap-2">
                    <input
                      value={modelQuery}
                      onChange={(e) => setModelQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchModels()}
                      placeholder="Model name or model number…"
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={handleSearchModels}
                      disabled={searchingModels || !modelQuery.trim()}
                      className={SECONDARY_BTN}
                    >
                      {searchingModels ? "Searching…" : "Search"}
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-info-light hover:cursor-pointer">
                    <input
                      type="checkbox"
                      checked={searchAllCategories}
                      onChange={(e) => {
                        setSearchAllCategories(e.target.checked);
                        setModelMatches(null);
                      }}
                      className="accent-status-correction hover:cursor-pointer"
                    />
                    Search every category, not just {request.categoryName}
                  </label>

                  {modelMatches?.length === 0 && (
                    <p className="text-xs text-info-light">
                      No model matches that.{" "}
                      {searchAllCategories
                        ? "Check the spelling, or create the model in Snipe first."
                        : "Try ticking the box above to search outside this category."}
                    </p>
                  )}

                  {!!modelMatches?.length && (
                    <ul className="space-y-1.5">
                      {modelMatches.map((m) => (
                        <li key={m.id}>
                          <button
                            type="button"
                            onClick={() => pickModel(m)}
                            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors hover:cursor-pointer ${
                              pickedModel?.id === m.id
                                ? "border-status-correction bg-status-correction/10"
                                : "border-modal-border hover:bg-modal-surface-accent/40"
                            }`}
                          >
                            <span className="font-semibold">{m.name}</span>
                            <span className="block text-xs text-info-light">
                              {[m.manufacturer, m.modelNumber, m.categoryName]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* SERIAL SEARCH — UNLOGGED only, and only once a model is
                  chosen. The serial is the one identifier the requester could
                  actually read off the device. */}
              {needsAssetTarget && !manualResolve && pickedModel && (
                <div className="space-y-2">
                  <FieldLabel>
                    Find it by serial
                    <InfoHint>
                      Searching within {pickedModel.name} only. This checks out an
                      existing record — it doesn't create one, so make the asset in
                      Snipe first if it isn't there.
                    </InfoHint>
                  </FieldLabel>

                  {detail.serial && (
                    <p className="text-xs text-info-light">
                      They reported serial{" "}
                      <span className="font-semibold text-modal-text-primary">
                        {detail.serial}
                      </span>
                      .
                    </p>
                  )}

                  <div className="flex gap-2">
                    <input
                      value={serialQuery}
                      onChange={(e) => setSerialQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearchAssets()}
                      placeholder={detail.serial ?? "Serial number…"}
                      className={INPUT}
                    />
                    <button
                      type="button"
                      onClick={handleSearchAssets}
                      disabled={searchingAssets || !serialQuery.trim()}
                      className={SECONDARY_BTN}
                    >
                      {searchingAssets ? "Searching…" : "Search"}
                    </button>
                  </div>

                  {assetMatches?.length === 0 && (
                    <p className="text-xs text-info-light">
                      No asset under {pickedModel.name} has a serial like that.
                    </p>
                  )}

                  {!!assetMatches?.length && (
                    <ul className="space-y-1.5">
                      {assetMatches.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => setPickedAsset(a)}
                            className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors hover:cursor-pointer ${
                              pickedAsset?.id === a.id
                                ? "border-status-correction bg-status-correction/10"
                                : "border-modal-border hover:bg-modal-surface-accent/40"
                            }`}
                          >
                            <span className="font-semibold">
                              {a.serial ?? "No serial"}
                            </span>
                            <span className="text-xs text-info-light ml-2">
                              {a.assetTag || `#${a.id}`}
                            </span>
                            {/* Unavailable assets are LISTED, not hidden. The
                                admin needs to see that the record exists and
                                why it can't be used — hiding it just sends
                                them hunting for something that's right there. */}
                            <span
                              className={`block text-xs ${
                                a.checkoutable ? "text-status-success" : "text-status-pending"
                              }`}
                            >
                              {a.checkoutable
                                ? "Ready to deploy · unassigned"
                                : a.assignedToName
                                ? `Already checked out to ${a.assignedToName}`
                                : `Status is "${a.statusName ?? "unknown"}", not Ready to Deploy`}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {pickedAsset && !pickedAsset.checkoutable && (
                    <Notice tone="pending" icon="build" title="Fix this in Snipe first">
                      {pickedAsset.assignedToName
                        ? `Snipe has this checked out to ${pickedAsset.assignedToName}, so it can't also go to ${request.userName}. Check it in first if that's wrong.`
                        : `Snipe won't deploy an asset whose status is "${pickedAsset.statusName ?? "unknown"}". Set it to Ready to Deploy, then come back.`}
                    </Notice>
                  )}
                </div>
              )}

              <label className="flex items-start gap-2 text-sm text-modal-text-secondary hover:cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualResolve}
                  onChange={(e) => setManualResolve(e.target.checked)}
                  className="mt-0.5 accent-status-correction hover:cursor-pointer"
                />
                <span>
                  I've already fixed this in Snipe myself
                  <span className="block text-xs text-info-light">
                    Closes the correction without writing anything.
                  </span>
                </span>
              </label>
            </section>
          )}

          {/* REJECT REASON */}
          {rejecting && state.phase !== "applied" && (
            <div className="space-y-2">
              <FieldLabel>
                Why are you rejecting this?
                <InfoHint>
                  The requester sees this on their request. Without one they're
                  likely to just report the same thing again.
                </InfoHint>
              </FieldLabel>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
                placeholder="e.g. Snipe already shows this checked in."
                className={`${INPUT} resize-y`}
              />
            </div>
          )}

          {/* OUTCOMES */}
          {state.phase === "applied" && (
            <Notice tone="success" icon="check_circle" title="Applied to Snipe">
              {state.message}
            </Notice>
          )}
          {state.phase === "blocked" && (
            <>
              <Notice tone="pending" icon="pending_actions" title="Not applied yet">
                {state.message} The correction stays in the queue so you can try
                again once that's sorted.
              </Notice>

              {/* The clashing records, not just the fact of a clash. The admin
                  has to open Snipe and work out which of the two is the real
                  device, so they need something to search on — a tag, a model,
                  and who it's currently against. */}
              {!!state.serialClashes?.length && (
                <div className="space-y-2">
                  <FieldLabel>
                    Already using this serial
                    <InfoHint>
                      Look these up in Snipe. One of them has the wrong serial —
                      fix that record first, then apply this correction.
                    </InfoHint>
                  </FieldLabel>
                  <ul className="space-y-1.5">
                    {state.serialClashes.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-lg border border-status-pending/40 bg-status-pending/5 px-3 py-2 text-sm"
                      >
                        <span className="font-semibold text-modal-text-primary">
                          {a.assetTag || `Asset #${a.id}`}
                        </span>
                        <span className="font-mono text-xs text-info-light ml-2">
                          {a.serial}
                        </span>
                        <span className="block text-xs text-info-light">
                          {[
                            a.modelName,
                            a.statusName,
                            a.assignedToName
                              ? `held by ${a.assignedToName}`
                              : "unassigned",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="block text-[11px] text-info-light/70 mt-0.5">
                          Snipe asset id {a.id}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
          {state.phase === "error" && (
            <Notice tone="error" icon="error" title="Something went wrong">
              {state.message}
            </Notice>
          )}
        </div>

        {/* FOOTER */}
        {/* mx-auto, like every other dialog on this table. Without it the
            buttons sit hard right and this one modal reads as belonging to a
            different app. */}
        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          {state.phase === "applied" ? (
            <button type="button" onClick={() => onOpenChange(false)} className={PRIMARY_BTN}>
              Done
            </button>
          ) : rejecting ? (
            <>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={busy || !rejectReason.trim()}
                className={DANGER_BTN}
              >
                {busy ? "Rejecting…" : "Confirm rejection"}
              </button>
              <button
                type="button"
                onClick={() => setRejecting(false)}
                disabled={busy}
                className={GHOST_BTN}
              >
                Back
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleApprove}
                disabled={busy || !canApprove}
                className={PRIMARY_BTN}
                title={
                  canApprove ? undefined : "Pick what this correction should update first"
                }
              >
                {busy && (
                  <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                )}
                {busy
                  ? "Applying…"
                  : manualResolve
                  ? "Close as corrected"
                  : state.phase === "blocked"
                  ? "Try again"
                  : "Approve & apply"}
              </button>
              <button
                type="button"
                onClick={() => setRejecting(true)}
                disabled={busy}
                className={GHOST_BTN}
              >
                Reject
              </button>
            </>
          )}
        </ResponsiveDialogFooter>

        {/* BOTTOM RIBBON */}
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ── Local presentational bits ──────────────────────────────────────────

const INPUT =
  "w-full rounded-lg border border-modal-border bg-modal-surface px-3 py-2 text-sm text-modal-text-primary placeholder:text-info-light/60 focus:outline-none focus:border-status-correction";

const PRIMARY_BTN =
  "w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center gap-2";

// Outline red with a soft fill on hover — the same destructive treatment
// ReviewQuoteDialog uses, and now the single one across the request table.
//
// This replaced a solid bg-modal-error fill under white text. The solid fill
// had to reach for the modal-scoped token because status-error goes pastel on
// the dark theme (rose-400, tuned for small badge text on a tinted pill) and
// washed out into unreadable pink as a background. Outlining sidesteps that
// entirely: status-error is being used here as text and border, which is what
// it was tuned for, so it reads correctly in both themes without a special
// token — and a destructive action reads as destructive by its colour rather
// than by shouting.
const DANGER_BTN =
  "w-full sm:w-auto px-8 py-3.5 rounded-lg border border-status-error/40 text-status-error font-bold text-sm hover:bg-status-error/10 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center gap-2";

const GHOST_BTN =
  "w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

const SECONDARY_BTN =
  "shrink-0 rounded-lg border border-modal-border px-4 py-2 text-sm font-semibold text-modal-text-secondary hover:bg-modal-surface-accent/40 hover:cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * Live duplicate-serial indicator.
 *
 * A "failed" lookup reads as failed, never as clear. Showing a green tick
 * because the request errored would be the one wrong answer with a real cost —
 * it would tell the admin the serial is free when nobody actually checked.
 */
function SerialCheckBadge({ check }: { check: SerialCheck }) {
  if (check.state === "idle") return null;

  if (check.state === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-info-light">
        <span className="animate-spin h-3 w-3 border-2 border-info-light/40 border-t-info-light rounded-full" />
        Checking Snipe for this serial…
      </span>
    );
  }

  if (check.state === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-info-light">
        <span className="material-symbols-outlined !text-[14px]">cloud_off</span>
        Couldn't check for duplicates — it's still verified when you apply.
      </span>
    );
  }

  if (check.state === "clear") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-status-success bg-status-success/10 px-2 py-1 text-[12px] font-semibold text-status-success">
        <span className="material-symbols-outlined !text-[14px]">check_circle</span>
        No other asset has this serial
      </span>
    );
  }

  return (
    <div className="space-y-1.5">
      <span className="inline-flex items-start gap-1.5 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-1 text-[12px] font-semibold text-status-pending">
        <span className="material-symbols-outlined !text-[14px] shrink-0">warning</span>
        {check.matches.length === 1
          ? "Another asset already has this serial"
          : `${check.matches.length} other assets already have this serial`}
      </span>
      {/* Named right here, so the admin can go and look before submitting
          rather than finding out from the block afterwards. */}
      <ul className="space-y-1">
        {check.matches.map((a) => (
          <li key={a.id} className="text-xs text-info-light">
            <span className="font-semibold text-modal-text-primary">
              {a.assetTag || `#${a.id}`}
            </span>
            {" · "}
            {[a.modelName, a.assignedToName ? `held by ${a.assignedToName}` : "unassigned"]
              .filter(Boolean)
              .join(" · ")}
            <span className="text-info-light/70"> · id {a.id}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-info-light">
      {children}
    </span>
  );
}

/** Matches the home page's dashed indicator, the app's established way of
 *  saying "read this before you click". */
function Notice({
  tone,
  icon,
  title,
  children,
}: {
  tone: "success" | "pending" | "error";
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-status-success bg-status-success/10 text-status-success"
      : tone === "error"
      ? "border-status-error bg-status-error/10 text-status-error"
      : "border-status-pending bg-status-pending/10 text-status-pending";

  return (
    <div
      className={`flex items-start gap-2 rounded-md border border-dashed px-3 py-2 text-[12px] font-semibold leading-relaxed ${toneClass}`}
    >
      <span className="material-symbols-outlined !text-[14px] shrink-0 mt-0.5">
        {icon}
      </span>
      <span>
        <span className="block font-bold">{title}</span>
        {children}
      </span>
    </div>
  );
}
