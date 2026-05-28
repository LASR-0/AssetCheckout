
const IS_DEV = import.meta.env.VITE_APP_ENV === "development";

function getDevHeaders(): Record<string, string> {
  if (!IS_DEV) return {};

  const headers: Record<string, string> = {};
  const name = localStorage.getItem("dev-user-name");
  const email = localStorage.getItem("dev-user-email");

  if (name) headers["x-dev-user-name"] = name;
  if (email) headers["x-dev-user-email"] = email;

  return headers;
}

export type ApiFetchOptions = Omit<RequestInit, "body" | "headers"> & {
  /** Auto-serialised to JSON. Use `rawBody` for non-JSON payloads. */
  body?: unknown;
  /** Bypass JSON serialisation. Use for FormData, blob uploads, etc. */
  rawBody?: BodyInit;
  /** Extra headers to merge over the defaults. */
  headers?: Record<string, string>;
};

/**
 * Make an API call. Throws on non-2xx with an Error containing the
 * server-supplied error message when available.
 *
 * Returns the parsed JSON body. For endpoints that don't return JSON
 * (or return 204 No Content), pass `void` as the generic and ignore
 * the return value.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { body, rawBody, headers: extraHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...getDevHeaders(),
    ...extraHeaders,
  };

  let init: RequestInit = { ...rest, headers };

  if (rawBody !== undefined) {
    init.body = rawBody;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(path, init);

  if (!res.ok) {

    let message = `${res.status} ${res.statusText}`;
    try {
      const errBody = await res.json();
      message = errBody?.error || errBody?.message || message;
    } catch {

    }
    throw new Error(message);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}