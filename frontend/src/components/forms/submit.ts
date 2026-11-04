import { ApiError } from "@/api/client";

/** What to say when sending fails, keeping the person's answers in place. */
export function submitErrorText(err: unknown): string {
  if (err instanceof ApiError && err.upstreamDown) {
    return "Couldn't send it. Checkout didn't get an answer from Snipe-IT. Everything you entered is still here, so try again.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't send it. Everything you entered is still here, so try again.";
}
