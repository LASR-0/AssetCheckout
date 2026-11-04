import { useState } from "react";
import { Input } from "@/components/ui/input";
import { submitSelfProcuredDetails } from "@/api/selfProcurement";
import { FieldGrid, StepError, StepField, StepFoot } from "./parts";
import { errorText, type StepProps } from "./types";

///  IT handed this to the requester to buy. Once they have it, they say what
///  they bought and what it cost, and IT reviews it.

export function PurchaseStep({ row, onCancel, onDone }: StepProps) {
  const [item, setItem] = useState("");
  const [cost, setCost] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    const n = Number(cost.replace(/^\$/, "").replace(/,/g, ""));
    if (!item.trim()) return setError("Say what you bought.");
    if (cost.trim() === "" || !Number.isFinite(n) || n < 0) return setError("Enter the cost as a number, 0 or more.");
    setError(null);
    setPending(true);
    try {
      await submitSelfProcuredDetails(row.r.id, { itemName: item.trim(), cost: n });
      onDone(`#${row.r.id}: details sent. IT reviews the purchase next.`);
    } catch (err) {
      setError(errorText(err, "Couldn't send the details."));
      setPending(false);
    }
  }

  return (
    <>
      <StepError>{error}</StepError>
      <FieldGrid>
        <StepField label="What did you buy?">
          <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Spigen phone case" autoFocus />
        </StepField>
        <StepField label="What it cost (AUD)">
          <Input value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" inputMode="decimal" />
        </StepField>
      </FieldGrid>
      <StepFoot pending={pending ? "Sending…" : null} onCancel={onCancel} primary={{ label: "Send details", onClick: () => void go() }} />
    </>
  );
}
