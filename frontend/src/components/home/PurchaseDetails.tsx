import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalTitle } from "@/components/ui/modal";
import { btn } from "@/components/ui/variants";
import { submitSelfProcuredDetails } from "@/api/selfProcurement";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                  WHAT DID YOU BUY?                              |
///  +-----------------------------------------------------------------+
//
//  The requester's half of a self-procured purchase: IT told them to go and
//  buy it themselves, and this is them reporting back what they got and
//  what it cost, so IT can review it and finish the request.
///  +-----------------------------------------------------------------+

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export default function PurchaseDetails({ request, open, onOpenChange, onSuccess }: Props) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} label="Your purchase" width={480}>
      {/* Mounted only while open, so the next one starts empty. */}
      {open && request && <Body request={request} onClose={() => onOpenChange(false)} onSuccess={onSuccess} />}
    </Modal>
  );
}

function Body({ request, onClose, onSuccess }: { request: Request; onClose: () => void; onSuccess: () => void }) {
  const [item, setItem] = useState("");
  const [cost, setCost] = useState("");
  const [state, setState] = useState<"form" | "saving" | "done">("form");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const name = item.trim();
    const amount = Number(cost);
    if (!name) return setError("Enter what you bought.");
    if (cost.trim() === "" || !Number.isFinite(amount) || amount < 0) return setError("Enter a cost of zero or more.");
    setError(null);
    setState("saving");
    try {
      await submitSelfProcuredDetails(request.id, { itemName: name, cost: amount });
      setState("done");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't send that. Please try again.");
      setState("form");
    }
  }

  if (state === "done") {
    return (
      <>
        <ModalBody className="items-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-ok-bg text-ok">
            <Icon name="check" size={24} />
          </span>
          <ModalTitle>Thanks</ModalTitle>
          <p className="m-0 fs-13.5 text-tx3">IT will review this and complete your request.</p>
        </ModalBody>
        <ModalFooter>
          <button type="button" onClick={onClose} className={btn({ variant: "primary", size: "md" })}>
            Done
          </button>
        </ModalFooter>
      </>
    );
  }

  return (
    <>
      <ModalBody>
        <div className="flex flex-col gap-1.5">
          <ModalTitle>What did you buy?</ModalTitle>
          <p className="m-0 fs-13 leading-normal text-pretty text-tx3">
            IT approved this as something you can buy yourself. Enter what you got and what it cost, and IT will review it to finish off your
            request.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-10 bg-subtle px-3.5 py-2.5 fs-13 shadow-[inset_0_0_0_1px_var(--line2)]">
          <span className="text-mut">For</span>
          <span className="font-medium text-tx">
            {request.categoryName} <span className="font-mono fs-12 text-mut">#{request.id}</span>
          </span>
        </div>
        <label className="flex flex-col gap-1.5 fs-13 font-medium text-tx">
          What you bought
          <Input value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Spigen phone case" autoFocus />
        </label>
        <label className="flex flex-col gap-1.5 fs-13 font-medium text-tx">
          What it cost
          <span className="relative flex items-center">
            <span className="pointer-events-none absolute left-2.5 fs-13.5 text-mut">$</span>
            <Input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="24.99"
              className="pl-6"
            />
          </span>
        </label>
        {error && (
          <p role="alert" className="m-0 flex items-center gap-2 rounded-9 bg-stop-bg px-3 py-2.5 fs-13 text-stop shadow-[inset_0_0_0_1px_var(--stop-line)]">
            <Icon name="error" size={16} />
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button type="button" onClick={onClose} className={btn({ size: "md" })}>
          Cancel
        </button>
        <button type="button" disabled={state === "saving"} onClick={() => void submit()} className={btn({ variant: "primary", size: "md" })}>
          {state === "saving" ? "Sending…" : "Send to IT"}
        </button>
      </ModalFooter>
    </>
  );
}
