import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState } from "react";
import {
  getLoanOptions,
  assignLoan,
  type LoanOption,
  type LoanClash,
} from "@/api/loans";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                     ASSIGNING A LOAN                            |
///  +-----------------------------------------------------------------+
//
//  IT's whole sign-off, in one dialog: pick the unit, check it out, done.
//
//  A LIST, NOT A SEARCH. The pool is the loan whitelist — a handful of
//  records. A search box there asks the admin to guess a name before showing
//  them the only answers there are.
//
//  THE REQUESTED DEVICE COMES FIRST AND IS PRESELECTED when it has a unit
//  free. The requester picked a KVM; handing them a hotspot is possible (IT
//  may know better) but it should take a deliberate click, not a default.
//
//  OUT-OF-STOCK ROWS ARE SHOWN, disabled, with their location. "It is out" is
//  the single most useful thing this dialog can say; filtering the row out
//  turns it into "there is nothing to lend", which is a different and wrong
//  answer, and leaves the admin wondering whether loans are misconfigured.
//
//  CLASHES ARE SHOWN ABOVE THE LIST, not swallowed — but only for records
//  with every unit promised over the window (see listLoanOptions). This
//  cannot refuse the assignment (IT may well know the first borrower is
//  bringing it back early) but it must not let somebody double-book without
//  seeing it.
///  +-----------------------------------------------------------------+

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful assignment so the table can reload. */
  onSuccess: () => void;
};

const dayFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
};

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", dayFormat);
}

export default function AssignLoanDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [options, setOptions] = useState<LoanOption[]>([]);
  const [clashes, setClashes] = useState<LoanClash[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loan = request?.loan ?? null;
  const requesterSite = request?.userLocationName ?? null;

  useEffect(() => {
    if (!open || !request) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getLoanOptions(request.id)
      .then(({ options, clashes }) => {
        if (cancelled) return;
        setOptions(options);
        setClashes(clashes);
        // Preselect what was asked for, if it can be checked out. Otherwise
        // the first in-stock unit at the requester's own site, else the first
        // in-stock one anywhere — never something that cannot actually be
        // checked out.
        const available = options.filter((o) => o.remaining > 0);
        const requested = available.find((o) => o.requested);
        const local = available.find(
          (o) => o.locationId === (request.userLocationId ?? null)
        );
        setSelectedId((requested ?? local ?? available[0])?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Couldn't load the loanable devices.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, request]);

  // Reset after the exit animation, so the reset is not visible mid-close.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setOptions([]);
      setClashes([]);
      setSelectedId(null);
      setError(null);
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const selected = options.find((o) => o.id === selectedId) ?? null;
  const offSite =
    selected !== null &&
    (request?.userLocationId ?? null) !== null &&
    selected.locationId !== (request?.userLocationId ?? null);

  async function handleAssign() {
    if (!request || selectedId === null) return;
    setAssigning(true);
    setError(null);
    try {
      await assignLoan(request.id, selectedId);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message ?? "Couldn't assign that device.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={assigning ? () => {} : onOpenChange}>
      <ResponsiveDialogContent className="p-0 bg-modal-surface border border-modal-border/20 rounded-xl shadow-md md:min-w-lg">
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">devices</span>
          </div>
          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            Assign {request?.categoryName ?? "a device"}
          </ResponsiveDialogTitle>
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {loan ? (
              <>
                {request?.userName} needs one from{" "}
                <strong className="text-modal-text-primary font-semibold">
                  {formatDay(loan.startDate)}
                </strong>{" "}
                to{" "}
                <strong className="text-modal-text-primary font-semibold">
                  {formatDay(loan.endDate)}
                </strong>
                . Checking one out here completes the request.
              </>
            ) : (
              "Checking one out here completes the request."
            )}
          </p>
        </ResponsiveDialogHeader>

        <div className="p-8 space-y-4 max-h-[55vh] overflow-y-auto">
          {/* Already promised over these dates. Above the list on purpose —
              it changes which unit you pick, so it cannot sit below it. */}
          {clashes.length > 0 && (
            <div className="rounded-lg border border-status-pending/30 bg-status-pending/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold text-status-pending">
                <span className="material-symbols-outlined !text-[18px]">event_busy</span>
                Already booked over these dates
              </div>
              <ul className="mt-2 space-y-1 text-modal-text-secondary">
                {clashes.map((c) => (
                  <li key={c.requestId}>
                    <strong className="font-semibold">{c.accessoryName ?? "A device"}</strong>{" "}
                    is with {c.userName} until {formatDay(c.endDate)}
                    {c.collected ? "" : " (assigned, not collected yet)"}.
                  </li>
                ))}
              </ul>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-info-light">
              <span className="animate-spin h-4 w-4 border-2 border-outline border-t-transparent rounded-full" />
              Loading devices…
            </div>
          )}

          {!loading && options.length === 0 && !error && (
            <p className="py-8 text-center text-sm text-info-light">
              None of the loanable devices exist in Snipe-IT any more. An admin
              can update the list in Settings → Loans.
            </p>
          )}

          {!loading &&
            options.map((option) => {
              const out = option.remaining <= 0;
              const isSelected = option.id === selectedId;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={out}
                  onClick={() => setSelectedId(option.id)}
                  className={`w-full text-left rounded-lg border p-4 transition-colors ${
                    out
                      ? "border-modal-border/20 opacity-50 cursor-not-allowed"
                      : isSelected
                      ? "border-modal-brand bg-modal-surface-accent/40 cursor-pointer"
                      : "border-modal-border/20 hover:border-modal-brand/50 cursor-pointer"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-modal-text-primary truncate">
                          {option.displayName}
                        </span>
                        {option.requested && (
                          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
                            Requested
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-modal-text-secondary mt-0.5 truncate">
                        {option.name}
                      </div>
                      <div className="text-xs text-info-light mt-0.5 truncate">
                        {[option.manufacturer, option.modelNumber]
                          .filter(Boolean)
                          .join(" · ") || "No model details"}
                      </div>
                      <div className="text-xs text-info-light mt-1 flex items-center gap-1">
                        <span className="material-symbols-outlined !text-[14px]">place</span>
                        {option.locationName ?? "No location recorded"}
                      </div>
                      {option.bookedOverWindow > 0 && (
                        <div className="text-xs text-status-pending mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined !text-[14px]">event_busy</span>
                          {option.bookedOverWindow} already booked over these dates
                        </div>
                      )}
                    </div>
                    <span
                      className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-full border ${
                        out
                          ? "border-intent-stop/40 text-intent-stop bg-intent-stop/10"
                          : "border-intent-done/40 text-intent-done bg-intent-done/10"
                      }`}
                    >
                      {out ? "All out" : `${option.remaining} of ${option.qty} free`}
                    </span>
                  </div>
                </button>
              );
            })}

          {/* Loans are collected, never posted — so a unit at another site
              is a real problem for the requester, not a shipping decision the
              app can make for them. Said plainly rather than refused: IT may
              be about to drive it over, and only they know that. */}
          {offSite && (
            <div className="rounded-lg border border-status-pending/30 bg-status-pending/10 p-3 text-sm text-modal-text-secondary">
              <div className="flex items-center gap-2 font-semibold text-status-pending mb-1">
                <span className="material-symbols-outlined !text-[18px]">move_location</span>
                Different site
              </div>
              This one is at{" "}
              <strong className="font-semibold">{selected?.locationName}</strong> but{" "}
              {request?.userName} is at{" "}
              <strong className="font-semibold">{requesterSite ?? "an unrecorded site"}</strong>.
              Loans are collected in person, so it will need to get there first.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-error bg-error-background rounded-lg p-3">
              <span className="material-symbols-outlined !text-[18px] shrink-0">info</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={handleAssign}
            disabled={selectedId === null || assigning || loading}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-brand hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
          >
            {assigning ? "Checking out…" : "Assign & check out"}
          </button>
          <button
            onClick={() => onOpenChange(false)}
            disabled={assigning}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </ResponsiveDialogFooter>
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
