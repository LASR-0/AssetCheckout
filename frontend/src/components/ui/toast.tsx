import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ToastContext, type ToastAction, type ToastOptions } from "@/components/ui/toast-context";

///  +-----------------------------------------------------------------+
///  |                  TOASTS                                         |
///  +-----------------------------------------------------------------+
//
//  The acknowledgement after a routine action ("#1042 marked collected."),
//  optionally with one follow-up action ("Leave feedback"). One at a time:
//  a new toast replaces the current one rather than stacking, as in the
//  designs. Ink pill under the nav, announced politely.
///  +-----------------------------------------------------------------+

type ToastState = { id: number; message: ReactNode; action?: ToastAction; duration: number };

const DEFAULT_DURATION = 3600;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const nextId = useRef(0);

  const show = useCallback((message: ReactNode, options: ToastOptions = {}) => {
    nextId.current += 1;
    setToast({
      id: nextId.current,
      message,
      action: options.action,
      duration: options.duration ?? DEFAULT_DURATION,
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.duration);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div role="status" aria-live="polite" className="contents">
        {toast && (
          <div
            key={toast.id}
            className="fixed top-18 left-1/2 z-95 flex max-w-[calc(100vw-1.6rem)] -translate-x-1/2 animate-toast-in items-center gap-3 rounded-10 bg-ink px-3.5 py-2.5 font-sans fs-12 text-on-ink shadow-pop motion-reduce:animate-none"
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  setToast(null);
                }}
                className="cursor-pointer p-0 font-sans fs-12 font-semibold text-inherit underline underline-offset-3 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-ink"
              >
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

