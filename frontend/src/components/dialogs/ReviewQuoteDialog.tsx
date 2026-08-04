import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useRef, useState } from "react";
import type { Request } from "@/types/requestType";
import {
  acceptQuote,
  rejectQuote,
  openQuoteDocument,
  formatQuoteAmount,
} from "@/api/quotes";

///  +-----------------------------------------------------------------+
///  |                  ACCEPT OR REJECT A QUOTE                       |
///  +-----------------------------------------------------------------+
//
//  The manager's half — the SECOND of the two commitments a manager makes on
//  a non-standard accessory. The first was the budget acknowledgment at
//  approval, which recorded nothing because reaching this dialog at all is
//  the proof it happened. This one does get recorded: there is a figure, a
//  document, and an outcome.
//
//  This is where the emailed link lands. The email carries the quote as an
//  attachment and a link back into the app; the manager signs in through SSO
//  as normal and acts here. That was a deliberate choice over tokenised
//  one-click links in the email — a quote acceptance commits a department's
//  budget, and a forwarded email should not be able to make that commitment.
//
//  BOTH OUTCOMES ARE FINAL. Accepting releases the request to be ordered;
//  rejecting ends it. So rejection asks for a reason, exactly as every other
//  rejection on this table does, and it flows through the same rejection path
//  so the requester gets the same declined email.
//
//  Admins see this too, standing in for a manager who hasn't answered — the
//  same on-behalf affordance they already have at the first approval — and
//  the copy switches to say whose budget it actually is.
///  +-----------------------------------------------------------------+

type DialogState =
  | { phase: "review" }
  | { phase: "rejecting" }
  | { phase: "submitting" }
  | { phase: "success"; accepted: boolean; message: string }
  | { phase: "error"; message: string };

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** True when an admin is acting for a manager who hasn't answered. */
  onBehalf: boolean;
  onSuccess: () => void;
};

export default function ReviewQuoteDialog({
  request,
  open,
  onOpenChange,
  onBehalf,
  onSuccess,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "review" });
  const [reason, setReason] = useState("");
  const [docError, setDocError] = useState<string | null>(null);
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "review" });
        setReason("");
        setDocError(null);
        successFiredRef.current = false;
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (dialogState.phase === "success" && !successFiredRef.current) {
      successFiredRef.current = true;
      onSuccess();
    }
  }, [dialogState, onSuccess]);

  const quote = request?.quoteDetail ?? null;
  const managerName = request?.manager?.trim() || "the approving manager";
  const whoseBudget = onBehalf ? `${managerName}'s department` : "your department";

  function close() {
    onOpenChange(false);
  }

  async function handleViewDocument() {
    if (!request) return;
    setDocError(null);
    try {
      await openQuoteDocument(request.id);
    } catch (err: any) {
      setDocError(err?.message || "The quote document could not be opened.");
    }
  }

  async function handleAccept() {
    if (!request) return;
    setDialogState({ phase: "submitting" });
    try {
      const result = await acceptQuote(request.id);
      setDialogState({ phase: "success", accepted: true, message: result.message });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err?.message || "The quote could not be accepted.",
      });
    }
  }

  async function handleReject() {
    if (!request) return;

    const trimmed = reason.trim();
    if (!trimmed) return;

    setDialogState({ phase: "submitting" });
    try {
      // Same "REJECTED: x\n REQUEST: y" shape the reject dialog produces, so
      // the requester's declined email parses the reason out of it as usual.
      const original = request.reason ?? "";
      const result = await rejectQuote(
        request.id,
        `REJECTED: ${trimmed}\n REQUEST: ${original}`
      );
      setDialogState({ phase: "success", accepted: false, message: result.message });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err?.message || "The quote could not be rejected.",
      });
    }
  }

  function renderHeader() {
    const config = (() => {
      switch (dialogState.phase) {
        case "review":
          return {
            icon: "request_quote",
            title: "Quote for approval",
            subtitle: `This comes out of ${whoseBudget}'s budget, not IT's. Nothing is ordered unless it's accepted.`,
          };
        case "rejecting":
          return {
            icon: "cancel",
            title: "Reject this quote?",
            subtitle:
              "This ends the request. The requester is told it was declined, along with the reason.",
          };
        case "submitting":
          return { icon: "hourglass_top", title: "Saving...", subtitle: "" };
        case "success":
          return {
            icon: dialogState.accepted ? "check_circle" : "cancel",
            title: dialogState.accepted ? "Quote accepted" : "Request declined",
            subtitle: "",
          };
        case "error":
          return { icon: "error", title: "Something went wrong", subtitle: "" };
      }
    })();

    return (
      <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
          <span className="material-symbols-outlined text-modal-text-accent">
            {config.icon}
          </span>
        </div>
        <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
          {config.title}
        </ResponsiveDialogTitle>
        {config.subtitle && (
          <p className="text-info-light text-sm mt-1 max-w-md mx-auto leading-relaxed">
            {config.subtitle}
          </p>
        )}
      </ResponsiveDialogHeader>
    );
  }

  function renderReviewBody() {
    if (!quote) {
      return (
        <div className="p-8">
          <p className="text-sm text-info-light">
            This request doesn't have a quote yet.
          </p>
        </div>
      );
    }

    return (
      <div className="p-8 space-y-5">
        {/* The figure gets its own treatment. It is the one thing on this
            dialog that must not be skimmed past — everything else is context
            for it. */}
        <div className="rounded-lg bg-modal-surface-accent/60 border border-modal-border-light/20 px-5 py-4 text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-modal-text-accent">
            Quoted amount
          </div>
          <div className="font-headline font-extrabold text-3xl tracking-tight text-modal-text-primary mt-1">
            {formatQuoteAmount(quote.amount)}
          </div>
          <div className="text-xs text-info-light mt-1">
            charged to {whoseBudget}'s budget
          </div>
        </div>

        <div className="bg-modal-surface-elevated/50 border border-modal-border/20 rounded-lg divide-y divide-modal-border/10">
          {[
            { label: "For", value: `${request?.userName}'s ${request?.categoryName}` },
            { label: "Supplier", value: quote.supplier },
            ...(quote.reference ? [{ label: "Reference", value: quote.reference }] : []),
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 px-4 py-3"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary shrink-0">
                {row.label}
              </span>
              <span className="text-sm text-modal-text-primary text-right">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <div>
          <button
            type="button"
            onClick={handleViewDocument}
            className="w-full flex items-center gap-3 rounded-lg border border-modal-border/30 bg-modal-surface-elevated/50 px-4 py-3 text-sm text-modal-text-primary hover:border-modal-brand/40 hover:cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined !text-[20px] shrink-0 text-modal-text-accent">
              description
            </span>
            <span className="truncate text-left flex-1">{quote.documentName}</span>
            <span className="material-symbols-outlined !text-[18px] shrink-0 text-info-light">
              open_in_new
            </span>
          </button>
          {docError && (
            <p className="text-[11px] text-modal-error mt-1 ml-1">{docError}</p>
          )}
        </div>

        {onBehalf && (
          <span className="inline-flex items-start gap-1.5 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-1 text-status-pending text-[12px] font-semibold">
            <span className="material-symbols-outlined !text-[14px] shrink-0">
              info
            </span>
            You're answering for {managerName}. This commits their department's
            budget, not IT's.
          </span>
        )}
      </div>
    );
  }

  function renderRejectBody() {
    return (
      <div className="p-8 space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
            Reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            autoFocus
            placeholder="e.g. Too expensive for this quarter — resubmit next period."
            className="w-full bg-modal-surface-elevated/50 border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20 resize-none"
          />
          <p className="text-[11px] text-info-light mt-1 ml-1">
            Shown to {request?.userName} in the email telling them the request
            was declined.
          </p>
        </div>
      </div>
    );
  }

  function renderBody() {
    switch (dialogState.phase) {
      case "review":
        return renderReviewBody();
      case "rejecting":
        return renderRejectBody();
      case "submitting":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            Saving your decision...
          </div>
        );
      case "success":
        return (
          <div className="p-8 text-center space-y-4">
            <p className="text-sm text-modal-text-primary leading-relaxed max-w-md mx-auto">
              {dialogState.message}
            </p>
          </div>
        );
      case "error":
        return (
          <div className="p-8 space-y-4">
            <div className="bg-modal-error/10 border border-modal-error/30 rounded-lg p-4">
              <p className="text-sm text-modal-error leading-relaxed">
                {dialogState.message}
              </p>
            </div>
          </div>
        );
    }
  }

  const primaryButton =
    "w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
  const dangerButton =
    "w-full sm:w-auto px-8 py-3.5 rounded-lg border border-status-error/40 text-status-error font-bold text-sm hover:bg-status-error/10 hover:cursor-pointer active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
  const secondaryButton =
    "w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors";

  function renderFooter() {
    switch (dialogState.phase) {
      case "submitting":
        return null;
      case "review":
        if (!quote) {
          return (
            <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
              <button onClick={close} className={primaryButton}>
                Close
              </button>
            </ResponsiveDialogFooter>
          );
        }
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button onClick={handleAccept} className={primaryButton}>
              Accept the cost
            </button>
            <button
              onClick={() => setDialogState({ phase: "rejecting" })}
              className={dangerButton}
            >
              Reject
            </button>
            <button onClick={close} className={secondaryButton}>
              Decide later
            </button>
          </ResponsiveDialogFooter>
        );
      case "rejecting":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={handleReject}
              disabled={!reason.trim()}
              className={dangerButton}
            >
              Reject and decline the request
            </button>
            <button
              onClick={() => setDialogState({ phase: "review" })}
              className={secondaryButton}
            >
              Back
            </button>
          </ResponsiveDialogFooter>
        );
      case "success":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button onClick={close} autoFocus className={primaryButton}>
              Done
            </button>
          </ResponsiveDialogFooter>
        );
      case "error":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={() => setDialogState({ phase: "review" })}
              autoFocus
              className={primaryButton}
            >
              Try again
            </button>
            <button onClick={close} className={secondaryButton}>
              Close
            </button>
          </ResponsiveDialogFooter>
        );
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => {
        if (dialogState.phase === "submitting") return;
        onOpenChange(next);
      }}
    >
      <ResponsiveDialogContent
        className="
          p-0
          bg-modal-surface
          border border-modal-border/20
          rounded-xl
          shadow-md
          md:min-w-lg
        "
      >
        {renderHeader()}
        {renderBody()}
        {renderFooter()}
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
