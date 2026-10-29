import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon";
import { assignLoan, getLoanOptions } from "@/api/loans";
import { RadioList, RadioRow, StepError, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  A loan's IT sign-off: pick the device from the loan list and check it
///  out. The one the requester asked for is pre-selected. A record is only
///  flagged when every unit of it is already promised over these dates,
///  because that's the one case worth stopping for.

export function AssignStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const opts = useQuery({ queryKey: ["loan-options", r.id], queryFn: () => getLoanOptions(r.id), staleTime: 0 });
  const [chosen, setChosen] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = opts.data?.options ?? [];
  const pick = chosen ?? options.find((o) => o.requested)?.id ?? options[0]?.id ?? null;

  async function go() {
    if (pick == null) return setError("Pick a device to assign.");
    setError(null);
    setPending(true);
    try {
      await assignLoan(r.id, pick);
      const name = options.find((o) => o.id === pick)?.displayName ?? "The device";
      onDone(`#${r.id}: ${name} assigned and checked out.`);
    } catch (err) {
      setError(errorText(err, "Couldn't assign the device."));
      setPending(false);
    }
  }

  return (
    <>
      <StepError>{error ?? (opts.isError ? errorText(opts.error, "Couldn't load the loan list.") : null)}</StepError>
      {opts.isPending ? (
        <StepNote role="status">Loading the loan list…</StepNote>
      ) : options.length === 0 ? (
        <StepNote>Nothing is on the loan list for this device. Check the loans settings.</StepNote>
      ) : (
        <RadioList label="Device">
          {options.map((o) => {
            const full = o.qty > 0 && o.bookedOverWindow >= o.qty;
            return (
              <RadioRow
                key={o.id}
                selected={pick === o.id}
                onClick={() => setChosen(o.id)}
                title={
                  <span className="flex items-center gap-2">
                    {o.displayName || o.name}
                    {o.requested && (
                      <span className="inline-flex h-4.5 items-center rounded-5 bg-track px-1.5 fs-11 font-medium text-tx3">Requested</span>
                    )}
                  </span>
                }
                sub={
                  <span className="flex flex-col gap-0.5">
                    <span>
                      {[o.manufacturer, o.modelNumber].filter(Boolean).join(" ") || o.name} · {o.locationName ?? "No location recorded"} · {o.remaining} of {o.qty} free now
                    </span>
                    {full && (
                      <span className="flex items-center gap-1 text-prog">
                        <Icon name="warning" size={14} />
                        All units of this record are booked over these dates
                      </span>
                    )}
                  </span>
                }
              />
            );
          })}
        </RadioList>
      )}
      <StepFoot
        pending={pending ? "Assigning and checking out…" : null}
        onCancel={onCancel}
        primary={{ label: "Assign & check out", onClick: () => void go(), disabled: pick == null }}
      />
    </>
  );
}
