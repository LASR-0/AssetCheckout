import type { Viewer } from "@/lib/route";
import type { LogRow } from "../useRequestLog";

/** What every step in the docket is handed. */
export type StepProps = {
  row: LogRow;
  viewer: Viewer;
  /** Back to the idle tray, nothing changed. */
  onCancel: () => void;
  /** It landed: the docket refreshes the list, toasts `message` and shows
   *  what happens next. */
  onDone: (message: string) => void;
};

/** An API failure as one readable sentence. */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}
