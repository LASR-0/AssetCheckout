import { useState } from "react";
import { Input } from "@/components/ui/input";
import { markShipped } from "@/api/requests";
import { FieldGrid, StepError, StepField, StepFoot } from "./parts";
import { errorText, type StepProps } from "./types";

/** Mark shipped, with the courier's tracking if there is any. */
export function ShipStep({ row, onCancel, onDone }: StepProps) {
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setPending(true);
    setError(null);
    try {
      await markShipped(row.r.id, code.trim(), url.trim());
      onDone(`#${row.r.id} marked shipped.`);
    } catch (err) {
      setError(errorText(err, "Couldn't mark it shipped. Please try again."));
      setPending(false);
    }
  }

  return (
    <>
      <StepError>{error}</StepError>
      <FieldGrid>
        <StepField label="Tracking code">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AP1234567890" className="font-mono" />
        </StepField>
        <StepField label="Tracking URL">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://auspost.com.au/mypost/track/…" />
        </StepField>
      </FieldGrid>
      <StepFoot
        hint={`Both optional. They go in the email to ${row.r.userName}.`}
        pending={pending ? "Marking shipped…" : null}
        onCancel={onCancel}
        primary={{ label: "Mark shipped", onClick: () => void go() }}
      />
    </>
  );
}
