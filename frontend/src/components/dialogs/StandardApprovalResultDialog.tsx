import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import PrepSuccess from "@/components/dialogs/PrepSuccess";
import DeploymentError from "@/components/dialogs/DeploymentError";

type Result =
  | {
      type: "success";
      stage: "SHIPPED" | "READY_FOR_COLLECTION";
      userName: string;
      categoryName: string;
    }
  | { type: "error"; message: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: Result | null;
};

export default function StandardApprovalResultDialog({
  open,
  onOpenChange,
  result,
}: Props) {
  function close() {
    onOpenChange(false);
  }

  function renderBody() {
    if (!result) return null;

    if (result.type === "success") {
      return (
        <PrepSuccess
          stage={result.stage}
          userName={result.userName}
          categoryName={result.categoryName}
          onDismiss={close}
        />
      );
    }

    return (
      <DeploymentError
        message={result.message}
        contextHint="The request remains unchanged — try the action again, or check Snipe-IT for any underlying issue."
        onDismiss={close}
      />
    );
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent
        className="
          p-0
          bg-modal-surface
          border border-modal-border/20
          rounded-xl
          shadow-md
          max-w-xl
        "
      >
        {renderBody()}
        {result?.type !== "success" && (
          <div className="h-1 twilight-gradient w-full" />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}