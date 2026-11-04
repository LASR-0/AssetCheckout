import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { rejectRequest } from "@/api/requests";
import { StepError, StepField, StepFoot } from "./parts";
import { errorText, type StepProps } from "./types";

/** End the request, with an optional reason the requester is emailed. */
export function RejectStep({ row, onCancel, onDone }: StepProps) {
  const [why, setWhy] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    try {
      await rejectRequest(row.r, why.trim() || "No reason given");
      onDone(`#${row.r.id} rejected. The requester is emailed the reason.`);
    } catch (err) {
      setError(errorText(err, "Couldn't reject it. Please try again."));
      setPending(false);
    }
  }

  return (
    <>
      <StepError>{error}</StepError>
      <StepField label="Reason (optional)">
        <Textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="The requester sees this" rows={3} autoFocus />
      </StepField>
      <StepFoot
        pending={pending ? "Rejecting…" : null}
        onCancel={onCancel}
        primary={{ label: "Reject request", variant: "danger-solid", onClick: () => void go() }}
      />
    </>
  );
}
