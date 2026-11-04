///  +-----------------------------------------------------------------+
///  |                   THE ONE DOOR TO THE API                       |
///  +-----------------------------------------------------------------+
//
//  Every call goes through here, so identity, errors and cancellation are
//  handled once:
//
//    - In development the dev user's identity rides in x-dev-user-* headers
//      (production's forward auth injects the real ones).
//    - A non-2xx throws ApiError, carrying the status and the parsed body, so
//      a page can tell "Snipe-IT is down" (502/503/504) from a validation
//      failure without string-matching messages.
//    - `signal` passes straight through, which is how TanStack Query cancels
//      a request whose answer nobody is waiting for any more.
//
//  apiResponse returns the checked Response for the few callers that want
//  bytes rather than JSON (CSV export, the quote document).
///  +-----------------------------------------------------------------+

const IS_DEV = import.meta.env.VITE_APP_ENV === "development";

export function getDevHeaders(): Record<string, string> {
  if (!IS_DEV) return {};

  const headers: Record<string, string> = {};
  const name = localStorage.getItem("dev-user-name");
  const email = localStorage.getItem("dev-user-email");

  if (name) headers["x-dev-user-name"] = name;
  if (email) headers["x-dev-user-email"] = email;

  return headers;
}

export class ApiError extends Error {
  readonly status: number;
  /** The parsed error body, when the server sent JSON. */
  readonly body: Record<string, unknown> | null;

  constructor(message: string, status: number, body: Record<string, unknown> | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** Our server answered, but something it depends on (Snipe-IT) did not. */
  get upstreamDown(): boolean {
    return this.status === 502 || this.status === 503 || this.status === 504;
  }
}

export type ApiFetchOptions = Omit<RequestInit, "body" | "headers"> & {
  /** Auto-serialised to JSON. Use `rawBody` for non-JSON payloads. */
  body?: unknown;
  /** Bypass JSON serialisation. Use for FormData, blob uploads, etc. */
  rawBody?: BodyInit;
  /** Extra headers to merge over the defaults. */
  headers?: Record<string, string>;
};

/** Make an API call and return the Response. Throws ApiError on non-2xx. */
export async function apiResponse(path: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { body, rawBody, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...getDevHeaders(),
    ...extraHeaders,
  };

  const init: RequestInit = { ...rest, headers };

  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(path, init);
  if (res.ok) return res;

  let errBody: Record<string, unknown> | null = null;
  try {
    errBody = await res.json();
  } catch {
    // Non-JSON error body: keep the status line.
  }
  const message =
    (typeof errBody?.error === "string" && errBody.error) ||
    (typeof errBody?.message === "string" && errBody.message) ||
    `${res.status} ${res.statusText}`;
  throw new ApiError(message, res.status, errBody);
}

/**
 * Make an API call and return the parsed JSON body. Throws ApiError on
 * non-2xx, with the server-supplied message when there is one.
 *
 * For endpoints that return 204 No Content, pass `void` as the generic and
 * ignore the return value.
 */
export async function apiFetch<T = unknown>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const res = await apiResponse(path, options);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
