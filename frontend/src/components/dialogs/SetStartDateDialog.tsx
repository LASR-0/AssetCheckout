import { useMemo, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import Calendar from "@/components/ui/calendar";
import { toDateString } from "@/components/hotspot-form/LoanWindowSection";
import { setRequestStartDate } from "@/api/requests";
import { formatStartLong, startDateToLocal } from "@/lib/startDate";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                    CHANGE A START DATE                          |
///  +-----------------------------------------------------------------+
//
//  For when a new starter's first day moves and HRT has not caught up. The
//  same change HRT's PATCH makes: logged in the request's edit history, and
//  nobody is emailed — the requester may not have a mailbox yet.
//
//  Today and later only. A date in the past holds nothing, so offering it
//  would only be a way to clear the date while appearing to set one; Clear
//  is its own button for that.
///  +-----------------------------------------------------------------+

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export default function SetStartDateDialog({ request, open, onOpenChange, onSaved }: Props) {
  const [selected, setSelected] = useState<Date | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seeded each time the dialog opens on a request, during render rather
  // than in an effect, so the first frame already shows that request's date.
  const openedFor = open && request ? `${request.id}:${request.startDate ?? ""}` : null;
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (openedFor !== seededFor) {
    setSeededFor(openedFor);
    if (openedFor && request) {
      setSelected(request.startDate ? startDateToLocal(request.startDate) : undefined);
      setError(null);
    }
  }

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  async function save(value: Date | null) {
    if (!request) return;
    setPending(true);
    setError(null);
    try {
      await setRequestStartDate(request.id, value ? toDateString(value) : null);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the start date");
    } finally {
      setPending(false);
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        onOpenChange(next);
      }}
    >
      <ResponsiveDialogContent className="p-0 bg-modal-surface border border-modal-border rounded-xl shadow-md md:min-w-lg">
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">event_upcoming</span>
          </div>
          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            Start date
          </ResponsiveDialogTitle>
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {request?.userName ?? "This person"}'s first day. Reminders about handing over their{" "}
            {request?.categoryName ?? "device"} are held until then. Nobody is emailed about the change.
          </p>
        </ResponsiveDialogHeader>

        <div className="px-8 pt-6 flex flex-col items-center gap-3">
          <div className="rounded-xl border border-outline bg-surface-container-low">
            <Calendar
              mode="single"
              selected={selected}
              onSelect={setSelected}
              disabled={{ before: today }}
              startMonth={today}
              defaultMonth={selected ?? today}
            />
          </div>
          <p className="text-sm text-info-light">
            {selected ? (
              <>
                Holding until{" "}
                <strong className="text-on-surface font-semibold">
                  {formatStartLong(`${toDateString(selected)}T00:00:00.000Z`)}
                </strong>
              </>
            ) : (
              "No start date — reminders run as normal."
            )}
          </p>
          {error && (
            <p className="w-full text-sm text-error bg-error-background rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <ResponsiveDialogFooter className="px-8 pb-8 pt-6 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          <button
            type="button"
            onClick={() => save(selected ?? null)}
            disabled={pending || !selected}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-brand hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100 inline-flex items-center justify-center gap-2"
          >
            {pending && (
              <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
            )}
            {pending ? "Saving…" : "Save start date"}
          </button>
          {request?.startDate && (
            <button
              type="button"
              onClick={() => save(null)}
              disabled={pending}
              className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-surface-container-high hover:cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </ResponsiveDialogFooter>

        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
