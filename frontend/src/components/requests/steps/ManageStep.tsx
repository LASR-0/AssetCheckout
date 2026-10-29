import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { invalidateWorkflow } from "@/api/queries";
import { rejectRequest } from "@/api/requests";
import {
  approveCorrection,
  checkSerialInUse,
  searchCorrectionAssets,
  searchCorrectionModels,
  type CorrectionAssetMatch,
  type CorrectionModelMatch,
} from "@/api/corrections";
import { searchAccessoriesForRequest, type AccessorySearchMatch } from "@/api/accessories";
import { RadioList, RadioRow, StepError, StepField, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  +-----------------------------------------------------------------+
///  |                  MANAGE A CORRECTION                            |
///  +-----------------------------------------------------------------+
//
//  Someone reported their records are wrong. IT names the Snipe-IT record
//  the report is about (only what this kind of correction needs), then
//  applies it, closes it as corrected by hand, or rejects it.
//
//    unrecorded asset        find the model, then the asset by serial
//    unrecorded accessory    find the accessory record
//    wrong model             find the model it really is
//    wrong serial            confirm the serial (checked live for clashes)
//    no longer held          nothing to name: apply checks it in
//    anything else           fix it in Snipe-IT by hand, then close it
//
//  APPLIED:FALSE IS NOT SUCCESS. Snipe-IT can refuse the write (a duplicate
//  serial, say); the request stays in the queue as Blocked and the reason is
//  shown here, with the clashing records so IT can go and look.
///  +-----------------------------------------------------------------+

type SerialCheck = { k: "idle" } | { k: "checking" } | { k: "clear" } | { k: "clash"; matches: CorrectionAssetMatch[] } | { k: "failed" };

function SearchBox({ value, onChange, onSearch, placeholder, busy }: { value: string; onChange: (v: string) => void; onSearch: () => void; placeholder: string; busy: boolean }) {
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch();
      }}
    >
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <Button type="submit" variant="secondary" className="h-9 px-3.5" disabled={busy || !value.trim()}>
        {busy ? "Searching…" : "Search"}
      </Button>
    </form>
  );
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <StepNote>{title}</StepNote>
      {children}
    </div>
  );
}

function assetSub(a: CorrectionAssetMatch): string {
  const state = a.checkoutable ? "Ready to deploy, unassigned" : a.assignedToName ? `Checked out to ${a.assignedToName}` : a.statusName ?? "Not deployable";
  return [a.serial && `Serial ${a.serial}`, state].filter(Boolean).join(" · ");
}

export function ManageStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const d = r.correctionDetail;
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(d?.applyError ? `Snipe-IT refused the update last time: ${d.applyError}` : null);
  const [clashes, setClashes] = useState<CorrectionAssetMatch[] | null>(null);
  const [searching, setSearching] = useState<string | null>(null);

  const [accQ, setAccQ] = useState("");
  const [accs, setAccs] = useState<AccessorySearchMatch[] | null>(null);
  const [accId, setAccId] = useState<number | null>(null);

  const [modelQ, setModelQ] = useState(d?.correctedModel ?? "");
  const [everyCategory, setEveryCategory] = useState(false);
  const [models, setModels] = useState<CorrectionModelMatch[] | null>(null);
  const [model, setModel] = useState<CorrectionModelMatch | null>(null);
  const [serialQ, setSerialQ] = useState(d?.serial ?? "");
  const [assets, setAssets] = useState<CorrectionAssetMatch[] | null>(null);
  const [asset, setAsset] = useState<CorrectionAssetMatch | null>(null);

  const [serial, setSerial] = useState(d?.serial ?? "");
  const [check, setCheck] = useState<SerialCheck>({ k: "idle" });

  const isAsset = d?.subjectKind === "ASSET";
  const needsAccessory = d?.correctionKind === "UNLOGGED" && !isAsset;
  const needsAsset = d?.correctionKind === "UNLOGGED" && isAsset;
  const needsModel = d?.correctionKind === "WRONG_MODEL" && isAsset && d.wrongField === "MODEL";
  const needsSerial = d?.correctionKind === "WRONG_MODEL" && isAsset && d.wrongField === "SERIAL";
  const manualOnly = d?.correctionKind === "WRONG_MODEL" && (!isAsset || d.wrongField === "OTHER");

  // Live duplicate check on the serial about to be written, after a pause in
  // typing. The in-flight check is aborted when the value moves on.
  const toCheck = needsSerial ? serial.trim() : "";
  useEffect(() => {
    if (!toCheck) return;
    const ctl = new AbortController();
    const t = window.setTimeout(() => {
      setCheck({ k: "checking" });
      checkSerialInUse(r.id, toCheck, ctl.signal)
        .then((m) => setCheck(m.length ? { k: "clash", matches: m } : { k: "clear" }))
        .catch(() => !ctl.signal.aborted && setCheck({ k: "failed" }));
    }, 500);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [r.id, toCheck]);

  async function run<T>(label: string, fn: () => Promise<T>, fail: string): Promise<T | null> {
    setSearching(label);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(errorText(err, fail));
      return null;
    } finally {
      setSearching(null);
    }
  }

  const canApply = needsSerial
    ? serial.trim() !== ""
    : needsAccessory
      ? accId != null
      : needsAsset
        ? !!asset?.checkoutable
        : needsModel
          ? model != null
          : !manualOnly;

  async function apply(byHand: boolean) {
    setPending(byHand ? "Closing…" : "Applying in Snipe-IT…");
    setError(null);
    setClashes(null);
    try {
      const res = await approveCorrection(
        r.id,
        byHand
          ? { resolvedManually: true }
          : {
              modelId: needsModel ? model?.id ?? null : null,
              serial: needsSerial ? serial.trim() || null : null,
              snipeRecordId: needsAccessory ? accId : needsAsset ? asset?.id ?? null : null,
            }
      );
      if (res.applied) {
        onDone(byHand ? `#${r.id} closed as corrected by hand.` : `#${r.id} applied in Snipe-IT.`);
        return;
      }
      await invalidateWorkflow();
      setError(`Snipe-IT refused the update: ${res.message} Nothing was changed. Close it as corrected if you fixed it by hand.`);
      setClashes(res.serialClashes ?? null);
    } catch (err) {
      setError(errorText(err, "Couldn't apply this correction."));
    }
    setPending(null);
  }

  async function reject() {
    if (!why.trim()) return setError("Give a reason. The requester is told why.");
    setPending("Rejecting…");
    setError(null);
    try {
      await rejectRequest(r, why.trim());
      onDone(`#${r.id} rejected. The requester is emailed the reason.`);
    } catch (err) {
      setError(errorText(err, "Couldn't reject this correction."));
      setPending(null);
    }
  }

  if (!d) return <StepError>This request has no correction details.</StepError>;

  if (rejecting) {
    return (
      <>
        <StepError>{error}</StepError>
        <StepField label="Why are you rejecting it?">
          <Textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="The requester sees this" rows={3} autoFocus />
        </StepField>
        <StepFoot
          pending={pending}
          cancelLabel="Back"
          onCancel={() => setRejecting(false)}
          primary={{ label: "Confirm rejection", variant: "danger-solid", onClick: () => void reject() }}
        />
      </>
    );
  }

  return (
    <>
      <StepError>{error}</StepError>
      {clashes && clashes.length > 0 && (
        <Part title="Already carrying that serial">
          <ul className="m-0 flex list-none flex-col gap-1 p-0 fs-13">
            {clashes.map((c) => (
              <li key={c.id} className="rounded-8 bg-subtle px-3 py-2 shadow-[inset_0_0_0_1px_var(--line)]">
                <span className="font-mono">{c.assetTag}</span> · {c.modelName ?? "Unknown model"}
                {c.assignedToName && <span className="text-mut"> · {c.assignedToName}</span>}
              </li>
            ))}
          </ul>
        </Part>
      )}

      {needsAccessory && (
        <Part title="Which accessory record?">
          <SearchBox
            value={accQ}
            onChange={setAccQ}
            placeholder="Search accessories by name"
            busy={searching === "acc"}
            onSearch={() =>
              void run("acc", () => searchAccessoriesForRequest(r.id, { name: accQ.trim() }), "Accessory search failed.").then((m) => {
                if (m) setAccs(m);
              })
            }
          />
          {accs && (accs.length === 0 ? (
            <StepNote>No accessories match.</StepNote>
          ) : (
            <RadioList label="Accessory">
              {accs.map((a) => (
                <RadioRow key={a.id} selected={accId === a.id} onClick={() => setAccId(a.id)} title={a.name} sub={[a.manufacturer, a.locationName].filter(Boolean).join(" · ")} />
              ))}
            </RadioList>
          ))}
        </Part>
      )}

      {(needsAsset || needsModel) && (
        <Part title={needsModel ? "Which model is it really?" : "Which model is it?"}>
          <SearchBox
            value={modelQ}
            onChange={setModelQ}
            placeholder="Model name or number"
            busy={searching === "model"}
            onSearch={() =>
              void run("model", () => searchCorrectionModels(r.id, modelQ.trim(), everyCategory), "Model search failed.").then((m) => {
                if (m) setModels(m);
              })
            }
          />
          <label className="flex items-center gap-2 fs-12.5 text-tx3">
            <input type="checkbox" checked={everyCategory} onChange={(e) => setEveryCategory(e.target.checked)} className="accent-brand" />
            Search outside this category
          </label>
          {models && (models.length === 0 ? (
            <StepNote>No models match.</StepNote>
          ) : (
            <RadioList label="Model">
              {models.map((m) => (
                <RadioRow
                  key={m.id}
                  selected={model?.id === m.id}
                  onClick={() => {
                    setModel(m);
                    setAssets(null);
                    setAsset(null);
                  }}
                  title={[m.manufacturer, m.name].filter(Boolean).join(" ")}
                  sub={[m.modelNumber, m.categoryName].filter(Boolean).join(" · ")}
                />
              ))}
            </RadioList>
          ))}
        </Part>
      )}

      {needsAsset && model && (
        <Part title={`Which ${model.name}? Search by serial`}>
          <SearchBox
            value={serialQ}
            onChange={setSerialQ}
            placeholder="Serial"
            busy={searching === "asset"}
            onSearch={() =>
              void run("asset", () => searchCorrectionAssets(r.id, model.id, serialQ.trim()), "Serial search failed.").then((m) => {
                if (m) setAssets(m);
              })
            }
          />
          {assets && (assets.length === 0 ? (
            <StepNote>No {model.name} has that serial.</StepNote>
          ) : (
            <RadioList label="Asset">
              {assets.map((a) => (
                <RadioRow key={a.id} selected={asset?.id === a.id} onClick={() => setAsset(a)} title={`${a.assetTag}${a.modelName ? ` · ${a.modelName}` : ""}`} sub={assetSub(a)} />
              ))}
            </RadioList>
          ))}
          {asset && !asset.checkoutable && (
            <StepNote className="text-prog">That asset can't be checked out to them: it must be Ready to deploy and unassigned.</StepNote>
          )}
        </Part>
      )}

      {needsSerial && (
        <StepField label="Serial to write">
          <Input value={serial} onChange={(e) => setSerial(e.target.value)} className="font-mono" />
          <span className="flex items-center gap-1 fs-12">
            {check.k === "checking" && <span className="text-mut">Checking Snipe-IT…</span>}
            {check.k === "clear" && toCheck && (
              <span className="flex items-center gap-1 text-ok">
                <Icon name="check_circle" size={14} />
                No other asset has this serial
              </span>
            )}
            {check.k === "clash" && toCheck && (
              <span className="flex items-center gap-1 text-stop">
                <Icon name="error" size={14} />
                Already on {check.matches.map((m) => m.assetTag).join(", ")}
              </span>
            )}
            {check.k === "failed" && toCheck && <span className="text-mut">Couldn't check the serial; it's checked again when applied.</span>}
            {!toCheck && <span className="text-mut">What they reported, as you'll write it. Fix any misread characters first.</span>}
          </span>
        </StepField>
      )}

      {manualOnly && (
        <StepNote>This can't be written automatically. Fix it in Snipe-IT, then close it as corrected.</StepNote>
      )}
      {d.correctionKind === "NO_LONGER_HELD" && (
        <StepNote>Applying checks the record back in and takes it off their list.</StepNote>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!pending && (
          <>
            <Button variant="danger" className="h-9 px-3.5" onClick={() => setRejecting(true)}>
              Reject
            </Button>
            <Button variant="secondary" className="h-9 px-3.5" onClick={() => void apply(true)}>
              Close as corrected
            </Button>
          </>
        )}
        <span className="flex-1" />
        <StepFoot
          pending={pending}
          onCancel={onCancel}
          primary={manualOnly ? undefined : { label: "Approve & apply", onClick: () => void apply(false), disabled: !canApply }}
        />
      </div>
    </>
  );
}
