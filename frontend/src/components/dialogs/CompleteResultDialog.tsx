import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from "@/components/dialogs/ResponsiveDialogWrapper";
import { useEffect, useState, useRef } from "react";
import type { Request } from "@/types/requestType";
import DeploymentSuccess from "@/components/dialogs/DeploymentSuccess";
import DeploymentError from "@/components/dialogs/DeploymentError";

type DialogState =
  | { phase: "submitting" }
  | {
      phase: "success";
      assetTag: string;
      modelName: string;
      userName: string;
    }
  | { phase: "error"; message: string };

type Props = {
  request: Request | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currentUserName: string;
};

export default function CompleteResultDialog({
  request,
  open,
  onOpenChange,
  onSuccess,
  currentUserName,
}: Props) {
  const [dialogState, setDialogState] = useState<DialogState>({ phase: "submitting" });
  const successFiredRef = useRef(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setDialogState({ phase: "submitting" });
        successFiredRef.current = false;
      }, 200);
      return () => clearTimeout(t);
    }

    if (request) {
      runComplete();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  useEffect(() => {
    if (dialogState.phase === "success" && !successFiredRef.current) {
      successFiredRef.current = true;
      onSuccess();
    }
  }, [dialogState, onSuccess]);

  async function runComplete() {
    if (!request) return;
    setDialogState({ phase: "submitting" });

    try {
      const res = await fetch(`/api/approval/${request.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-user-name": currentUserName,
        },
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Checkout failed");
      }

      setDialogState({
        phase: "success",
        assetTag: data?.asset?.tag ?? "—",
        modelName: data?.asset?.modelName ?? "Unknown model",
        userName: data?.userName ?? request.userName,
      });
    } catch (err: any) {
      setDialogState({
        phase: "error",
        message: err.message || "Failed to complete the request.",
      });
    }
  }

  function close() {
    onOpenChange(false);
  }

  function renderBody() {
    switch (dialogState.phase) {
      case "submitting":
        return (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-info-light text-sm">
            <span className="animate-spin h-8 w-8 border-2 border-outline border-t-transparent rounded-full" />
            <div>Checking out asset...</div>
          </div>
        );

      case "success":
        return (
          <DeploymentSuccess
            assetTag={dialogState.assetTag}
            modelName={dialogState.modelName}
            userName={dialogState.userName}
            onDismiss={close}
          />
        );

      case "error":
        return (
          <DeploymentError
            message={dialogState.message}
            contextHint="The request state hasn't changed — the asset is still ready to check out. You can try again, or fix any underlying issue in Snipe-IT first."
            onRetry={runComplete}
            onDismiss={close}
          />
        );
    }
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
        {dialogState.phase !== "success" && (
          <div className="h-1 twilight-gradient w-full" />
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}