import { apiFetch, getDevHeaders } from "@/api/client";
import type { QuoteDetail } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |                        QUOTE API WRAPPERS                       |
///  +-----------------------------------------------------------------+
//
//  IT purchases assets; departments purchase non-standard accessories. That
//  is why only one combination of request ever has a quote, and why the
//  manager approves the price as well as the request.
//
//  The document goes up base64-encoded inside the JSON body rather than as
//  multipart — the backend takes it that way so the API keeps a single body
//  parser. Large-ish payloads, so the upload route has its own raised limit;
//  the 10MB ceiling is enforced server-side and mirrored here so the user
//  finds out before waiting on an upload rather than after.
///  +-----------------------------------------------------------------+

/** Mirrors MAX_QUOTE_BYTES in the backend's quoteStorage. */
export const MAX_QUOTE_BYTES = 10 * 1024 * 1024;

/** Mirrors ACCEPTED_MIME in the backend's quoteStorage. */
export const ACCEPTED_QUOTE_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

/** For the file input's `accept`, so the picker filters to what we take. */
export const QUOTE_FILE_ACCEPT = ".pdf,.jpg,.jpeg,.png";

type QuoteResponse = {
  success: boolean;
  quote: QuoteDetail;
  message: string;
};

/**
 * Read a File as base64, without the `data:...;base64,` prefix.
 *
 * FileReader rather than arrayBuffer + manual encoding: the latter builds a
 * megabyte-scale intermediate string via String.fromCharCode and blows the
 * argument limit on real files.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma === -1 ? result : result.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

/** Attach a quote to a request and email it to the approving manager. */
export async function sendQuote(
  requestId: number,
  input: {
    amount: number;
    supplier: string;
    reference?: string | null;
    document: { originalName: string; mime: string; base64: string };
  }
): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/api/approval/${requestId}/quote`, {
    method: "POST",
    body: input,
  });
}

/** The manager accepts the quoted price — or an admin accepts in their place. */
export async function acceptQuote(requestId: number): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/api/approval/${requestId}/quote/accept`, {
    method: "POST",
  });
}

/** The manager rejects the quoted price. Terminal for the request. */
export async function rejectQuote(
  requestId: number,
  reason: string
): Promise<QuoteResponse> {
  return apiFetch<QuoteResponse>(`/api/approval/${requestId}/quote/reject`, {
    method: "POST",
    body: { reason },
  });
}

/**
 * Open the stored quote document in a new tab.
 *
 * Fetched into a blob rather than linked directly. A plain <a target="_blank">
 * would work in production, where the proxy injects the identity headers on
 * every request — but not in development, where identity comes from the
 * x-dev-user-* headers that only apiFetch adds, so the tab would 401. Going
 * through getDevHeaders keeps the two environments behaving the same.
 */
export async function openQuoteDocument(requestId: number): Promise<void> {
  const res = await fetch(`/api/approval/${requestId}/quote/document`, {
    headers: getDevHeaders(),
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = body?.error || body?.message || message;
    } catch {
      /* non-JSON error body — keep the status line */
    }
    throw new Error(message);
  }

  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  // The tab has its own reference by now; releasing ours lets the blob be
  // collected when that tab closes rather than leaking for the session.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** "$1,234.56". The figure a department is committing to, always to the cent. */
export function formatQuoteAmount(amount: number): string {
  return amount.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  });
}
