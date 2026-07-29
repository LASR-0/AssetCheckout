///  +-----------------------------------------------------------------+
///  |                        APP LINK BUILDER                         |
///  +-----------------------------------------------------------------+
//
//  Single source of truth for absolute URLs that leave the app (emails,
//  webhooks, anything a recipient clicks from outside the SPA).
//
//  Env contract:
//    APP_BASE_URL      Public site URL, e.g. https://checkout.ksb.com.au
//                      REQUIRED whenever NODE_ENV is not "development".
//    APP_DEV_BASE_URL  Optional dev-only override; defaults to the local
//                      Vite dev server. Ignored outside development.
//
//  Selection rule:
//    - NODE_ENV=development  → APP_DEV_BASE_URL, else the Vite default
//    - anything else         → APP_BASE_URL, which must be set and absolute
//
//  There is deliberately NO production fallback. An earlier revision fell
//  back to the dev base with a lazy console.warn on first send, which meant
//  a missing APP_BASE_URL in production shipped localhost links to real
//  recipients and only whispered about it in the job logs. Config that is
//  wrong should stop the server, not quietly degrade the emails — so
//  assertAppLinksConfig() runs at startup (see server.ts) and throws.
///  +-----------------------------------------------------------------+

const IS_DEV = process.env.NODE_ENV === "development";

/** Local Vite dev server — development only, never a production fallback. */
const DEV_DEFAULT = "http://localhost:5173";

/** Strip any trailing slashes so joining with a path never doubles up. */
function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Hostnames that are never reachable by an email recipient. */
function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Validate the link configuration for the current environment.
 *
 * Call once at startup, before the server accepts traffic. Throws when a
 * non-development environment cannot produce working links, so the failure
 * lands in the deploy logs rather than in somebody's inbox.
 *
 * Development is not validated — it falls back to the local dev server by
 * design, which is exactly what a developer wants.
 */
export function assertAppLinksConfig(): void {
  if (IS_DEV) return;

  const raw = process.env.APP_BASE_URL?.trim();

  if (!raw) {
    throw new Error(
      "APP_BASE_URL is not set. It is required whenever NODE_ENV is not " +
        '"development", because every link in a notification email is built ' +
        "from it. Set it to the public URL users reach the app on, with no " +
        "trailing slash (e.g. https://checkout.ksb.com.au). See .env.example."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(
      `APP_BASE_URL is not a valid absolute URL (got "${raw}"). It needs a ` +
        "scheme and host, e.g. https://checkout.ksb.com.au — not a bare " +
        "hostname or a path."
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `APP_BASE_URL must use http or https (got "${parsed.protocol}" in ` +
        `"${raw}").`
    );
  }

  // Not fatal: running the production build locally is a legitimate thing to
  // do, and refusing to boot would block it. Loud enough not to be missed.
  if (isLoopback(parsed.hostname)) {
    console.warn(
      `[appLinks] APP_BASE_URL points at "${parsed.hostname}" while NODE_ENV ` +
        `is "${process.env.NODE_ENV}". Email recipients will not be able to ` +
        "open these links. Fine for a local production build; wrong on a " +
        "deployed server."
    );
  }
}

/** True when links point at the local dev server rather than the real site. */
export function usingDevLinks(): boolean {
  return IS_DEV;
}

/** The base URL for the current environment, no trailing slash. */
export function appBaseUrl(): string {
  if (IS_DEV) {
    return normalizeBase(process.env.APP_DEV_BASE_URL?.trim() || DEV_DEFAULT);
  }

  const raw = process.env.APP_BASE_URL?.trim();
  if (!raw) {
    // Unreachable when assertAppLinksConfig() ran at startup. Kept so a stray
    // caller in a context that skipped the assert still fails loudly rather
    // than emitting a relative or localhost link.
    throw new Error(
      "APP_BASE_URL is not set — cannot build an absolute app link. " +
        "assertAppLinksConfig() should have caught this at startup."
    );
  }
  return normalizeBase(raw);
}

/** Build an absolute URL into the app, e.g. appLink("/requests") →
 *  "https://checkout.ksb.com.au/requests" in production. */
export function appLink(path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${appBaseUrl()}${p}`;
}
