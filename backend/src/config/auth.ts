import { Request } from "express";

const raw = process.env.ADMIN_EMAILS ?? "";

export const ADMIN_EMAILS: string[] = raw
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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
  return (
    (req.headers["x-user-email"] as string | undefined)?.trim() ||
    (req.headers["x-dev-user-email"] as string | undefined)?.trim() ||
    ""
  );
}