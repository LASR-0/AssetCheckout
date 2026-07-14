///  +-----------------------------------------------------------------+
///  |                        APP LINK BUILDER                         |
///  +-----------------------------------------------------------------+
//
//  Single source of truth for absolute URLs that leave the app (emails,
//  webhooks, anything a recipient clicks from outside the SPA).
//
//  Env contract:
//    APP_BASE_URL      Production site URL, e.g. https://checkout.ksb.com.au
//    APP_DEV_BASE_URL  Optional dev override; defaults to the local Vite
//                      dev server. Only used when NODE_ENV=development.
//
//  Selection rule (see usingDevLinks):
//    - NODE_ENV=development           → dev base
//    - production + APP_BASE_URL set  → production base
//    - production + APP_BASE_URL missing → dev base as a last resort, with
//      a loud one-time warning, so emails still contain *a* clickable link
//      instead of a bare path while the env gets fixed.
///  +-----------------------------------------------------------------+

const IS_DEV = process.env.NODE_ENV === "development";

/** Strip any trailing slashes so joining with a path never doubles up. */
function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

const PROD_BASE = normalizeBase(process.env.APP_BASE_URL ?? "");
const DEV_BASE = normalizeBase(
  process.env.APP_DEV_BASE_URL ?? "http://localhost:5173"
);

let warnedMissingProdBase = false;

/** True when links should point at the local dev server rather than the
 *  production site. Exported so callers (or tests) can branch on it. */
export function usingDevLinks(): boolean {
  if (IS_DEV) return true;
  if (!PROD_BASE) {
    if (!warnedMissingProdBase) {
      warnedMissingProdBase = true;
      console.warn(
        "[appLinks] APP_BASE_URL is not set in a non-development environment — " +
          "email links will fall back to the dev base URL. Set APP_BASE_URL in .env."
      );
    }
    return true;
  }
  return false;
}

/** The base URL for the current environment, no trailing slash. */
export function appBaseUrl(): string {
  return usingDevLinks() ? DEV_BASE : PROD_BASE;
}

/** Build an absolute URL into the app, e.g. appLink("/requests") →
 *  "https://checkout.ksb.com.au/requests" in production. */
export function appLink(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${appBaseUrl()}${p}`;
}