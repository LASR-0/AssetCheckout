import {
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  message: string;
  contextHint?: string;
  onRetry?: () => void;
  onDismiss: () => void;
};

export default function DeploymentError({
  message,
  contextHint,
  onRetry,
  onDismiss,
}: Props) {
  return (
    <>
      <DialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
          <span className="material-symbols-outlined text-modal-text-accent">
            error
          </span>
        </div>
        <DialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
          Checkout failed
        </DialogTitle>
      </DialogHeader>

      <div className="p-8 space-y-4">
        <div className="bg-modal-error/10 border border-modal-error/30 rounded-lg p-4">
          <p className="text-sm text-modal-error leading-relaxed">
            {message}
          </p>
        </div>
        {contextHint && (
          <p className="text-xs text-info-light leading-relaxed">
            {contextHint}
          </p>
        )}
      </div>

      <div className="px-8 pb-8 pt-2 flex border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            autoFocus
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
          >
            Try again
          </button>
        )}
        <button
          onClick={onDismiss}
          className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors"
        >
          Close
        </button>
      </div>
    </>
  );
}