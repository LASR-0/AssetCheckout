import { useState } from "react";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/api/client";
import { FieldGrid, RadioList, RadioRow, StepError, StepField, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  Non-standard asset, after IT sign-off: find the Snipe-IT model or make
///  it. Linking one with stock reserves an asset; linking one without, or
///  creating one, leaves a skeleton asset to fill in at the next step. A
///  search that finds nothing creates the model straight away, as it always
///  has: there is nothing to choose between.

type Match = {
  id: number;
  name: string;
  manufacturer?: { id: number; name: string };
  model_number?: string;
  hasAvailable?: boolean;
};

type Phase = { k: "form" } | { k: "searching" } | { k: "matches"; matches: Match[] } | { k: "working"; text: string };

export function ModelStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const mr = r.modelRequest;
  const [mfr, setMfr] = useState(mr?.manufacturer ?? "");
  const [name, setName] = useState(mr?.modelName ?? r.preferredModel ?? "");
  const [num, setNum] = useState(mr?.modelNumber ?? "");
  const [phase, setPhase] = useState<Phase>({ k: "form" });
  const [pick, setPick] = useState<number | "new">("new");
  const [error, setError] = useState<string | null>(null);

  async function createNew() {
    setPhase({ k: "working", text: "Creating model and skeleton asset…" });
    try {
      await apiFetch(`/api/approval/${r.id}/create-model`, {
        method: "POST",
        body: { manufacturer: mfr.trim(), modelName: name.trim(), modelNumber: num.trim() },
      });
      onDone(`#${r.id}: model created. Fill in the asset details next.`);
    } catch (err) {
      setError(errorText(err, "Couldn't create the model."));
      setPhase({ k: "form" });
    }
  }

  async function search() {
    if (!mfr.trim() || !name.trim() || !num.trim()) {
      setError("Manufacturer, model name and model number are all needed to search.");
      return;
    }
    setError(null);
    setPhase({ k: "searching" });
    try {
      const params = new URLSearchParams({ manufacturer: mfr.trim(), modelName: name.trim() });
      const data = await apiFetch<{ matches?: Match[] }>(`/api/approval/${r.id}/search-models?${params}`);
      const matches = data.matches ?? [];
      if (matches.length === 0) return createNew();
      setPick(matches[0].id);
      setPhase({ k: "matches", matches });
    } catch (err) {
      setError(errorText(err, "Couldn't search Snipe-IT."));
      setPhase({ k: "form" });
    }
  }

  async function link(m: Match) {
    setPhase({ k: "working", text: m.hasAvailable ? "Linking and reserving…" : "Linking model…" });
    try {
      const data = await apiFetch<{ message?: string } | undefined>(`/api/approval/${r.id}/use-existing-model`, {
        method: "POST",
        body: { snipeModelId: m.id },
      });
      onDone(data?.message ?? `#${r.id}: model linked.`);
    } catch (err) {
      setError(errorText(err, "Couldn't link that model."));
      setPhase({ k: "matches", matches: phase.k === "matches" ? phase.matches : [m] });
    }
  }

  const matches = phase.k === "matches" ? phase.matches : null;
  const chosen = matches?.find((m) => m.id === pick) ?? null;
  const locked = phase.k !== "form";

  return (
    <>
      <StepError>{error}</StepError>
      <FieldGrid>
        <StepField label="Manufacturer">
          <Input value={mfr} onChange={(e) => setMfr(e.target.value)} placeholder="e.g. Google" disabled={locked} />
        </StepField>
        <StepField label="Model name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pixel 9" disabled={locked} />
        </StepField>
        <StepField label="Model number">
          <Input value={num} onChange={(e) => setNum(e.target.value)} placeholder="e.g. GA05843" className="font-mono" disabled={locked} />
        </StepField>
      </FieldGrid>

      {phase.k === "searching" && (
        <div role="status" className="flex items-center gap-2.5 fs-13 text-tx3">
          <span className="size-3.5 animate-spin rounded-full border-2 border-line border-t-brand" />
          Searching Snipe-IT…
        </div>
      )}

      {matches && (
        <div className="flex flex-col gap-1.5">
          <StepNote>Existing model matches found</StepNote>
          <RadioList label="Model">
            {matches.map((m) => (
              <RadioRow
                key={m.id}
                selected={pick === m.id}
                onClick={() => setPick(m.id)}
                title={[m.manufacturer?.name, m.name, m.model_number && `· ${m.model_number}`].filter(Boolean).join(" ")}
                sub={m.hasAvailable ? "Stock available · reserves an asset" : "No stock · link anyway, for example if it is on order"}
              />
            ))}
            <RadioRow
              selected={pick === "new"}
              onClick={() => setPick("new")}
              title="Create a new model"
              sub="Also creates a skeleton asset to fill in next"
            />
          </RadioList>
        </div>
      )}

      {phase.k === "form" || phase.k === "searching" ? (
        <StepFoot
          hint="All three are required. Category standards are hidden from this search."
          pending={phase.k === "searching" ? "Searching…" : null}
          onCancel={onCancel}
          primary={{ label: "Search Snipe-IT", onClick: () => void search() }}
        />
      ) : (
        <StepFoot
          pending={phase.k === "working" ? phase.text : null}
          cancelLabel="Back"
          onCancel={() => setPhase({ k: "form" })}
          primary={{
            label: pick === "new" ? "Create model" : chosen?.hasAvailable ? "Link and reserve" : "Link with no stock",
            onClick: () => void (pick === "new" ? createNew() : chosen && link(chosen)),
          }}
        />
      )}
    </>
  );
}
