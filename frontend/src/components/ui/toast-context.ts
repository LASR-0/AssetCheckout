import { createContext, useContext, type ReactNode } from "react";

export type ToastAction = { label: string; onClick: () => void };
export type ToastOptions = { action?: ToastAction; duration?: number };

export const ToastContext = createContext<
  ((message: ReactNode, options?: ToastOptions) => void) | null
>(null);

/** `const toast = useToast(); toast("#1042 marked collected.")` */
export function useToast() {
  const show = useContext(ToastContext);
  if (!show) throw new Error("useToast must be used inside <ToastProvider>");
  return show;
}
