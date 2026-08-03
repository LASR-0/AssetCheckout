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
  sendQuote,
  fileToBase64,
  formatQuoteAmount,
  MAX_QUOTE_BYTES,
  ACCEPTED_QUOTE_MIMES,
  QUOTE_FILE_ACCEPT,
} from "@/api/quotes";

///  +-----------------------------------------------------------------+
///  |                    SEND A QUOTE TO THE MANAGER                  |
///  +-----------------------------------------------------------------+
//
//  The admin's half of the quote workflow. IT chases a real quote from a
//  supplier, records what it says, and sends it to the manager whose
//  department is paying — which is the whole reason this step exists, since
//  IT buys assets but departments buy non-standard accessories.
//
//  The document is REQUIRED, not optional. A figure typed into a form is not
//  a quote: the manager is being asked to commit their budget, and they get
//  to see the thing they're committing to. Everything else on the form is in
//  service of that — the amount because increment 4's purchase logging needs
//  a number it can threshold on without parsing a PDF, the supplier because
//  the manager should know who they're buying from, the reference because
//  matching an invoice back to a quote later is easier with one.
//
//  ONE QUOTE, ONE SHOT. There is no edit or re-send: once this is submitted
//  the quote is with the manager, and a wrong figure has to be rejected. The
//  confirm step exists because of that, not as generic ceremony.
///  +-----------------------------------------------------------------+

type DialogState =
  | { phase: "form" }
  | { phase: "confirm" }
  | { phase: "sending" }
  | { phase: "success"; message: string }
  | { phase: "error"; message: string };

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export default function SendQuoteDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "form" });
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "form" });
        setAmount("");
        setSupplier("");
        setReference("");
        setFile(null);
        setFileError(null);
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

  function close() {
    onOpenChange(false);
  }

  const parsedAmount = Number(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const canSubmit = amountValid && supplier.trim().length > 0 && !!file;

  /** Validated on pick rather than on submit, so an unusable file is caught
   *  before the admin has filled in the rest of the form. */
  function handleFilePick(picked: File | null) {
    setFileError(null);

    if (!picked) {
      setFile(null);
      return;
    }
    if (!(ACCEPTED_QUOTE_MIMES as readonly string[]).includes(picked.type)) {
      setFile(null);
      setFileError(
        `${picked.name} isn't a supported file type. Attach the quote as a PDF, or a JPG or PNG photo of it.`
      );
      return;
    }
    if (picked.size > MAX_QUOTE_BYTES) {
      setFile(null);
      setFileError(
        `${picked.name} is ${(picked.size / 1024 / 1024).toFixed(1)}MB — the limit is ${
          MAX_QUOTE_BYTES / 1024 / 1024
        }MB.`
      );
      return;
    }

    setFile(picked);
  }

  async function handleSend() {
    if (!request || !file) return;

    setDialogState({ phase: "sending" });

    try {
      const base64 = await fileToBase64(file);
      const result = await sendQuote(request.id, {
        amount: parsedAmount,
        supplier: supplier.trim(),
        reference: reference.trim() || null,
        document: {
          originalName: file.name,
          mime: file.type,
          base64,
        },
      });
      setDialogState({ phase: "success", message: result.message });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err?.message || "The quote could not be sent.",
      });
    }
  }

  const managerName = request?.manager?.trim() || "the approving manager";

  function renderHeader() {
    const config = (() => {
      switch (dialogState.phase) {
        case "form":
          return {
            icon: "request_quote",
            title: "Send a quote",
            subtitle: `Record what the supplier quoted and send it to ${managerName} to approve. Their department is paying for this, so nothing is ordered until they accept.`,
          };
        case "confirm":
          return {
            icon: "outgoing_mail",
            title: "Send this quote?",
            subtitle: `It goes to ${managerName} and can't be changed or re-sent afterwards.`,
          };
        case "sending":
          return {
            icon: "send",
            title: "Sending...",
            subtitle: "Saving the quote and emailing the manager.",
          };
        case "success":
          return { icon: "check_circle", title: "Quote sent", subtitle: "" };
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

  function renderFormBody() {
    return (
      <div className="p-8 space-y-6">
        {/* Read-only context — what this quote is for. */}
        <div className="bg-modal-surface-elevated border border-modal-border/20 rounded-lg p-4 space-y-2">
          <div className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary">
            Quoting for
          </div>
          <div className="text-sm text-modal-text-primary font-medium">
            {request?.userName}'s {request?.categoryName}
          </div>
          {request?.preferredModel && (
            <div className="text-xs text-modal-text-secondary">
              Asked for: {request.preferredModel}
            </div>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Amount
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
            />
            <p className="text-[11px] text-info-light mt-1 ml-1">
              The total the department will be charged.
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
              Supplier
            </label>
            <input
              type="text"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="e.g. Officeworks"
              className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
            />
            <p className="text-[11px] text-info-light mt-1 ml-1">
              Named in the manager's email.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
            Quote reference{" "}
            <span className="font-medium normal-case tracking-normal text-info-light">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="The supplier's own quote number, if it has one"
            className="w-full bg-modal-surface-elevated border border-modal-border/20 rounded-lg py-3 px-4 text-modal-text-secondary text-sm focus:outline-none focus:ring-2 focus:ring-modal-brand/20"
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-widest text-modal-text-secondary mb-2 ml-1">
            The quote itself
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept={QUOTE_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className={`w-full flex items-center gap-3 rounded-lg border border-dashed px-4 py-3.5 text-sm transition-colors hover:cursor-pointer ${
              file
                ? "border-status-success/50 bg-status-success/5 text-modal-text-primary"
                : "border-modal-border/40 bg-modal-surface-elevated text-modal-text-secondary hover:border-modal-brand/40"
            }`}
          >
            <span className="material-symbols-outlined !text-[20px] shrink-0">
              {file ? "description" : "upload_file"}
            </span>
            <span className="truncate text-left flex-1">
              {file ? file.name : "Choose a PDF or a photo of the quote"}
            </span>
            {file && (
              <span className="text-xs text-info-light shrink-0">
                {(file.size / 1024).toFixed(0)} KB
              </span>
            )}
          </button>

          {fileError ? (
            <p className="text-[11px] text-modal-error mt-1 ml-1">{fileError}</p>
          ) : (
            <p className="text-[11px] text-info-light mt-1 ml-1">
              Attached to the manager's email. PDF, JPG or PNG, up to{" "}
              {MAX_QUOTE_BYTES / 1024 / 1024}MB.
            </p>
          )}
        </div>
      </div>
    );
  }

  function renderConfirmBody() {
    return (
      <div className="p-8 space-y-4">
        <div className="bg-modal-surface-elevated border border-modal-border/20 rounded-lg divide-y divide-modal-border/10">
          {[
            { label: "Amount", value: formatQuoteAmount(parsedAmount) },
            { label: "Supplier", value: supplier.trim() },
            ...(reference.trim()
              ? [{ label: "Reference", value: reference.trim() }]
              : []),
            { label: "Attached", value: file?.name ?? "" },
            { label: "Goes to", value: managerName },
          ].map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between gap-4 px-4 py-3"
            >
              <span className="text-xs font-bold uppercase tracking-widest text-modal-text-secondary shrink-0">
                {row.label}
              </span>
              <span className="text-sm text-modal-text-primary text-right truncate">
                {row.value}
              </span>
            </div>
          ))}
        </div>

        <span className="inline-flex items-start gap-1.5 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-1 text-status-pending text-[12px] font-semibold">
          <span className="material-symbols-outlined !text-[14px] shrink-0">
            info
          </span>
          A quote can't be edited or re-sent. If the figure is wrong, the
          manager has to reject it and the request ends.
        </span>
      </div>
    );
  }

  function renderBody() {
    switch (dialogState.phase) {
      case "form":
        return renderFormBody();
      case "confirm":
        return renderConfirmBody();
      case "sending":
        return (
          <div className="p-8 flex items-center justify-center gap-3 text-info-light text-sm py-12">
            <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
            Sending the quote...
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
  const secondaryButton =
    "w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors";

  function renderFooter() {
    switch (dialogState.phase) {
      case "sending":
        return null;
      case "form":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button
              onClick={() => setDialogState({ phase: "confirm" })}
              disabled={!canSubmit}
              className={primaryButton}
            >
              Review and send
            </button>
            <button onClick={close} className={secondaryButton}>
              Cancel
            </button>
          </ResponsiveDialogFooter>
        );
      case "confirm":
        return (
          <ResponsiveDialogFooter className="px-8 pb-8 pt-2 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
            <button onClick={handleSend} autoFocus className={primaryButton}>
              Send to {managerName}
            </button>
            <button
              onClick={() => setDialogState({ phase: "form" })}
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
              onClick={() => setDialogState({ phase: "form" })}
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
        // Don't let a stray click discard an in-flight send.
        if (dialogState.phase === "sending") return;
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
