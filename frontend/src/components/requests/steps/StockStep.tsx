import { useState } from "react";
import { Input } from "@/components/ui/input";
import { addAccessoryStock } from "@/api/accessories";
import { FieldGrid, StepError, StepField, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  The selected accessory has no stock (or has some and nothing triggered
///  the checkout). The number is how many MORE arrived, added to the
///  record. With stock already there it's optional: an empty box checks out
///  what's there, for stock that arrived by a route this app never saw.

export function StockStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const have = r.accessoryRemaining ?? 0;
  const name = r.accessoryLinkedLabel || r.modelRequest?.modelName || r.categoryName;
  const at = r.accessoryLocationName ?? "its site";
  const [qty, setQty] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stillNone, setStillNone] = useState(false);

  async function go() {
    const typed = qty.trim();
    const n = typed ? Number(typed) : 0;
    if ((!typed && have <= 0) || !Number.isInteger(n) || n < 0 || (have <= 0 && n <= 0)) {
      return setError("Enter how many units arrived (a whole number, 1 or more).");
    }
    setError(null);
    setStillNone(false);
    setPending(true);
    try {
      const data = await addAccessoryStock(r.id, { arrivedQty: n });
      if (data?.modelRequest?.assetReady) {
        onDone(n ? `#${r.id}: ${n} added to stock and checked out.` : `#${r.id} checked out.`);
        return;
      }
      setStillNone(true);
    } catch (err) {
      setError(errorText(err, "Couldn't add the stock."));
    }
    setPending(false);
  }

  return (
    <>
      <StepError>{error}</StepError>
      {stillNone && (
        <div role="status" className="rounded-9 bg-prog-bg px-3 py-2.5 fs-13 leading-normal text-prog shadow-[inset_0_0_0_1px_var(--prog-line)]">
          Saved, but Snipe-IT still shows no stock for {name}. Add more once it arrives.
        </div>
      )}
      <div className="flex items-center justify-between gap-3 rounded-9 bg-subtle px-3 py-2.5 fs-13 shadow-[inset_0_0_0_1px_var(--line)]">
        <span className="font-medium">{name}</span>
        <span className={have > 0 ? "text-ok" : "text-prog"}>{have > 0 ? `${have} in stock at ${at}` : `No stock at ${at}`}</span>
      </div>
      <FieldGrid>
        <StepField label="Quantity arrived">
          <Input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder={have > 0 ? "Optional" : "e.g. 1"} />
          <StepNote className="fs-12">{have > 0 ? "Optional, there is stock already" : "Needed, there is no stock yet"}</StepNote>
        </StepField>
      </FieldGrid>
      <StepFoot
        pending={pending ? "Checking out…" : null}
        onCancel={onCancel}
        primary={{ label: have > 0 ? "Check out" : "Add stock and check out", onClick: () => void go() }}
      />
    </>
  );
}
