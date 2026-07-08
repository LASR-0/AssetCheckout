import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useNavigate } from "react-router-dom";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function FeedbackNudgeDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="p-0 bg-modal-surface border border-modal-border/20 rounded-xl shadow-md max-w-md">
        <ResponsiveDialogHeader className="px-8 pt-8 pb-4 text-center border-b border-modal-border-light/10">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-modal-surface-accent rounded-full mb-4 mx-auto">
            <span className="material-symbols-outlined text-modal-text-accent">forum</span>
          </div>
          <ResponsiveDialogTitle className="font-headline font-extrabold text-2xl tracking-tight text-modal-text-primary">
            Got a moment?
          </ResponsiveDialogTitle>
          <p className="text-info-light text-sm mt-1 max-w-sm mx-auto leading-relaxed">
            Thanks for confirming receipt! Would you like to share some quick,
            anonymous feedback about how Checkout is working for you?
          </p>
        </ResponsiveDialogHeader>

        <ResponsiveDialogFooter className="px-8 pb-8 pt-4 flex mx-auto border-modal-border/20 flex-col sm:flex-row-reverse gap-3">
          <button
            onClick={() => navigate("/feedback")}
            autoFocus
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-white font-bold text-sm twilight-gradient shadow-[0_4px_12px_rgba(80,37,186,0.3)] hover:opacity-90 hover:cursor-pointer active:scale-95 transition-all"
          >
            Sure, let's go
          </button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto px-8 py-3.5 rounded-lg text-modal-text-secondary font-bold text-sm hover:bg-modal-error/10 hover:cursor-pointer hover:text-modal-error transition-colors"
          >
            Not now
          </button>
        </ResponsiveDialogFooter>
        <div className="h-1 twilight-gradient w-full" />
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}