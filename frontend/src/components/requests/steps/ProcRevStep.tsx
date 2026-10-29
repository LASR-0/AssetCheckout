import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { locationsQuery } from "@/api/queries";
import { reviewSelfProcured } from "@/api/selfProcurement";
import { money } from "../copy";
import { RadioList, RadioRow, StepError, StepField, StepFoot } from "./parts";
import { errorText, type StepProps } from "./types";

///  The requester bought it themselves. IT records it in Snipe-IT (as an
///  accessory at a site) or keeps it as a Checkout-only record, and the
///  request completes either way.

export function ProcRevStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const sp = r.selfProcured;
  const { data: locations = [] } = useQuery(locationsQuery);
  const [snipe, setSnipe] = useState(true);
  const [loc, setLoc] = useState<number | null>(r.userLocationId ?? null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (snipe && loc == null) return setError("Choose the site to record it at.");
    setError(null);
    setPending(true);
    try {
      await reviewSelfProcured(r.id, { recordInSnipe: snipe, locationId: snipe ? loc! : undefined });
      onDone(snipe ? `#${r.id} recorded in Snipe-IT and completed.` : `#${r.id} completed as a Checkout-only record.`);
    } catch (err) {
      setError(errorText(err, "Couldn't complete the review."));
      setPending(false);
    }
  }

  return (
    <>
      <StepError>{error}</StepError>
      <div className="flex items-center justify-between gap-3 rounded-9 bg-subtle px-3 py-2.5 fs-13 shadow-[inset_0_0_0_1px_var(--line)]">
        <span className="font-medium">{sp?.itemName ?? "Not given"}</span>
        <span className="text-tx2">{sp?.cost != null ? money(sp.cost) : "No cost given"}</span>
      </div>
      <RadioList label="Record">
        <RadioRow selected={snipe} onClick={() => setSnipe(true)} title="Record in Snipe-IT" sub="Creates the accessory record at a location" />
        <RadioRow selected={!snipe} onClick={() => setSnipe(false)} title="Checkout-only record" sub="Kept in Checkout Central only" />
      </RadioList>
      {snipe && (
        <StepField label="Location" className="max-w-60">
          <Select value={loc == null ? "" : String(loc)} onValueChange={(v) => setLoc(Number(v))}>
            <SelectTrigger aria-label="Location">
              <SelectValue placeholder="Choose a site" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </StepField>
      )}
      <StepFoot pending={pending ? "Completing…" : null} onCancel={onCancel} primary={{ label: "Complete", onClick: () => void go() }} />
    </>
  );
}
