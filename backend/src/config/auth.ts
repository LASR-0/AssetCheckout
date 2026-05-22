const raw = process.env.ADMIN_NAMES ?? "";

export const ADMIN_NAMES: string[] = raw
  .split(",")
  .map((n) => n.trim().toLowerCase())
  .filter(Boolean);

export function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

export function isAdminName(name: string): boolean {
  return ADMIN_NAMES.includes(normalizeName(name));
}