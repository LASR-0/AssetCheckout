import { useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACCEPTED_QUOTE_MIMES,
  fileToBase64,
  formatQuoteAmount,
  MAX_QUOTE_BYTES,
  QUOTE_FILE_ACCEPT,
  sendQuote,
  skipQuote,
} from "@/api/quotes";
import { FieldGrid, StepError, StepField, StepFoot } from "./parts";
import { errorText, type StepProps } from "./types";

///  Non-standard accessory, after IT sign-off: the department pays, so the
///  approver sees a supplier's quote before anything is ordered. A sent
///  quote can't be changed, so it asks once more. Too cheap to be worth a
///  quote? Skip it, and it goes straight to selecting the accessory.

type Phase = "form" | "confirm" | "skip";

/** The "are you sure" panel a money step shows before it commits. */
function Check({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-9 bg-subtle px-3 py-2.5 fs-13 leading-normal text-tx2 shadow-[inset_0_0_0_1px_var(--line)]">
      <div className="font-semibold text-tx">{title}</div>
      <div>{children}</div>
    </div>
  );
}

export function QuoteStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const value = Number(amount.replace(/^\$/, "").replace(/,/g, ""));
  const approver = r.manager?.trim() || "The approver";

  function pick(f: File | null) {
    setError(null);
    if (!f) return setFile(null);
    if (!(ACCEPTED_QUOTE_MIMES as readonly string[]).includes(f.type)) {
      setFile(null);
      return setError(`${f.name} isn't a supported file type. Attach the quote as a PDF, or a JPG or PNG photo of it.`);
    }
    if (f.size > MAX_QUOTE_BYTES) {
      setFile(null);
      return setError(`${f.name} is ${(f.size / 1024 / 1024).toFixed(1)}MB; the limit is ${MAX_QUOTE_BYTES / 1024 / 1024}MB.`);
    }
    setFile(f);
  }

  function review() {
    if (!(Number.isFinite(value) && value > 0) || !supplier.trim()) return setError("Amount and supplier are required.");
    if (!file) return setError("Attach the quote as a PDF or photo.");
    setError(null);
    setPhase("confirm");
  }

  async function send() {
    if (!file) return;
    setPending("Sending quote…");
    setError(null);
    try {
      const base64 = await fileToBase64(file);
      await sendQuote(r.id, {
        amount: value,
        supplier: supplier.trim(),
        reference: reference.trim() || null,
        document: { originalName: file.name, mime: file.type, base64 },
      });
      onDone(`#${r.id}: quote sent to ${approver}.`);
    } catch (err) {
      setError(errorText(err, "The quote couldn't be sent."));
      setPending(null);
    }
  }

  async function skip() {
    setPending("Skipping…");
    setError(null);
    try {
      await skipQuote(r.id);
      onDone(`#${r.id}: quote skipped. Select the accessory next.`);
    } catch (err) {
      setError(errorText(err, "Couldn't skip the quote."));
      setPending(null);
    }
  }

  if (phase === "confirm") {
    return (
      <>
        <StepError>{error}</StepError>
        <Check title="Send this quote?">
          {`${approver} is emailed ${formatQuoteAmount(value)} from ${supplier.trim()}, with the attachment. A sent quote can't be edited or replaced.`}
        </Check>
        <StepFoot pending={pending} cancelLabel="Edit" onCancel={() => setPhase("form")} primary={{ label: "Send quote", onClick: () => void send() }} />
      </>
    );
  }

  if (phase === "skip") {
    return (
      <>
        <StepError>{error}</StepError>
        <Check title="Skip the quote?">
          Too cheap to be worth a supplier quote. It goes straight to selecting the accessory, and the manager isn't asked again.
        </Check>
        <StepFoot pending={pending} cancelLabel="Back" onCancel={() => setPhase("form")} primary={{ label: "Skip quote", onClick: () => void skip() }} />
      </>
    );
  }

  return (
    <>
      <StepError>{error}</StepError>
      <FieldGrid>
        <StepField label="Amount (AUD)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
        </StepField>
        <StepField label="Supplier">
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Officeworks" />
        </StepField>
        <StepField label="Reference (optional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </StepField>
      </FieldGrid>

      <input
        ref={picker}
        type="file"
        accept={QUOTE_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex items-center gap-2 rounded-9 border border-line bg-subtle py-1.5 pr-1.5 pl-3 fs-13">
          <Icon name="description" size={17} className="text-tx3" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <button
            type="button"
            aria-label="Remove the attachment"
            onClick={() => setFile(null)}
            className="grid size-7 cursor-pointer place-items-center rounded-7 text-mut hover:bg-hover hover:text-tx"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-9 border border-dashed border-strong bg-sheet font-sans fs-13 text-tx3 hover:border-brand hover:text-brand-tx"
        >
          <Icon name="attach_file" size={17} />
          Attach the quote · PDF or photo
        </button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" className="h-9 px-3" onClick={() => setPhase("skip")}>
          Skip quote
        </Button>
        <span className="flex-1" />
        <StepFoot onCancel={onCancel} primary={{ label: "Send quote", onClick: review }} />
      </div>
    </>
  );
}
