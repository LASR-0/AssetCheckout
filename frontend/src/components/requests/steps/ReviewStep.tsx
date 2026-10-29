import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { acceptQuote, formatQuoteAmount, openQuoteDocument, rejectQuote } from "@/api/quotes";
import { StepError, StepField, StepFoot } from "./parts";
import { errorText, type StepProps } from "./types";

///  The approver's answer to IT's quote. Accepting commits their
///  department's budget; rejecting ends the request, so it needs a reason
///  (written the way every rejection is, so the requester's email reads it).

export function ReviewStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const q = r.quoteDetail;
  const [rejecting, setRejecting] = useState(false);
  const [why, setWhy] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setPending("Accepting…");
    setError(null);
    try {
      await acceptQuote(r.id);
      onDone(`#${r.id}: quote accepted. IT sources it next.`);
    } catch (err) {
      setError(errorText(err, "The quote couldn't be accepted."));
      setPending(null);
    }
  }

  async function reject() {
    if (!why.trim()) return setError("Give a reason. This ends the request.");
    setPending("Rejecting…");
    setError(null);
    try {
      await rejectQuote(r.id, `REJECTED: Quote rejected: ${why.trim()}\n REQUEST: ${r.reason ?? ""}`);
      onDone(`#${r.id} rejected. The requester is emailed the reason.`);
    } catch (err) {
      setError(errorText(err, "The quote couldn't be rejected."));
      setPending(null);
    }
  }

  async function openDoc() {
    try {
      await openQuoteDocument(r.id);
    } catch (err) {
      setError(errorText(err, "Couldn't open the quote document."));
    }
  }

  if (!q) return <StepError>There's no quote on this request yet.</StepError>;

  return (
    <>
      <StepError>{error}</StepError>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-9 bg-subtle px-3.5 py-3 fs-13 shadow-[inset_0_0_0_1px_var(--line)]">
        <span className="fs-20 font-semibold tracking-head">{formatQuoteAmount(q.amount)}</span>
        <span>
          <span className="text-mut">Supplier </span>
          {q.supplier}
        </span>
        {q.reference && (
          <span>
            <span className="text-mut">Reference </span>
            <span className="font-mono fs-12.5">{q.reference}</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => void openDoc()}
          className="ml-auto inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-sans fs-13 text-brand-tx hover:underline"
        >
          <Icon name="description" size={16} />
          {q.documentName}
          <Icon name="open_in_new" size={14} />
        </button>
      </div>

      {rejecting ? (
        <>
          <StepField label="Why are you rejecting it?">
            <Textarea value={why} onChange={(e) => setWhy(e.target.value)} placeholder="The requester sees this" rows={3} autoFocus />
            <span className="fs-12 text-mut">This ends the request.</span>
          </StepField>
          <StepFoot
            pending={pending}
            cancelLabel="Back"
            onCancel={() => setRejecting(false)}
            primary={{ label: "Reject request", variant: "danger-solid", onClick: () => void reject() }}
          />
        </>
      ) : (
        <StepFoot
          hint="Accepting approves the cost to your department."
          pending={pending}
          onCancel={onCancel}
          extra={
            <Button variant="danger" className="h-9 px-3.5" onClick={() => setRejecting(true)}>
              Reject
            </Button>
          }
          primary={{ label: "Accept quote", onClick: () => void accept() }}
        />
      )}
    </>
  );
}
