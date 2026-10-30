import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import Calendar from "@/components/ui/calendar";
import { setRequestStartDate } from "@/api/requests";
import { toDateString } from "@/lib/format";
import { formatStartLong, startDateToLocal } from "@/lib/startDate";
import { StepError, StepFoot, StepNote } from "./parts";
import { errorText, type StepProps } from "./types";

///  A new starter's first day moved and HRT hasn't caught up. The same
///  change HRT's own update makes: logged in the request's history, and
///  nobody is emailed (the requester may not have a mailbox yet). Today and
///  later only; clearing is its own button.

export function StartStep({ row, onCancel, onDone }: StepProps) {
  const r = row.r;
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const [day, setDay] = useState<Date | undefined>(r.startDate ? startDateToLocal(r.startDate) : undefined);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(value: Date | null) {
    setPending(value ? "Saving…" : "Clearing…");
    setError(null);
    try {
      await setRequestStartDate(r.id, value ? toDateString(value) : null);
      onDone(value ? `#${r.id}: start date set to ${formatStartLong(toDateString(value))}.` : `#${r.id}: start date cleared.`);
    } catch (err) {
      setError(errorText(err, "Couldn't save the start date."));
      setPending(null);
    }
  }

  return (
    <>
      <StepError>{error}</StepError>
      {/* The calendar's days share its width, so it needs one of its own. */}
      <div className="w-full max-w-78 rounded-11 border border-line bg-sheet">
        <Calendar
          className="p-3"
          mode="single"
          selected={day}
          onSelect={setDay}
          disabled={{ before: today }}
          startMonth={today}
          defaultMonth={day ?? today}
        />
      </div>
      <StepNote>{day ? `Reminders hold until ${formatStartLong(toDateString(day))}.` : "No start date: reminders run as normal."}</StepNote>
      <StepFoot
        pending={pending}
        onCancel={onCancel}
        extra={
          r.startDate ? (
            <Button variant="secondary" className="h-9 px-3.5" onClick={() => void save(null)}>
              Clear date
            </Button>
          ) : null
        }
        primary={{ label: "Save", onClick: () => void save(day ?? null), disabled: !day }}
      />
    </>
  );
}
