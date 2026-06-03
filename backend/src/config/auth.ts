import { Request } from "express";

const raw = process.env.ADMIN_EMAILS ?? "";

export const ADMIN_EMAILS: string[] = raw
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const DEV_AUTH_ENABLED = process.env.NODE_ENV === "development";

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

/*
 * Returns an empty string when no email is available — callers that
 * require an email (e.g. for `updatedBy` in settings) should treat empty
 * as "unknown actor" rather than throwing.
 */
export function getActorEmail(req: Request): string {
  const sso = (req.headers["x-user-email"] as string | undefined)?.trim();
  if (sso) return sso;

  if (DEV_AUTH_ENABLED) {
    const dev = (req.headers["x-dev-user-email"] as string | undefined)?.trim();
    if (dev) return dev;
  }

  return "";
}

/*
 * The actor's display name, used for role resolution (manager/requester are
 * matched by name appearing in requests). Same gating as getActorEmail:
 * production honours only the SSO header (x-user-name); dev allows the
 * x-dev-user-name fallback for DevAuthToggle impersonation.
 */

export function getActorName(req: Request): string {
  const sso = (req.headers["x-user-name"] as string | undefined)?.trim();
  if (sso) return sso;

  if (DEV_AUTH_ENABLED) {
    const dev = (req.headers["x-dev-user-name"] as string | undefined)?.trim();
    if (dev) return dev;
  }

  return "";
}