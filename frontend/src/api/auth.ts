import { apiFetch, getDevHeaders } from "@/api/client";
import type { Role, StockKeeperLocation } from "@/types/authType";

/** Who is signed in, as /api/auth/role describes them. */
export type Identity = {
  name: string;
  email: string;
  /**
   * The actor's Snipe-IT user id, which is what requests are keyed on.
   * Null when Snipe has no account for this email, or could not be reached.
   * Prefer it over `name` for any "is this mine?" comparison: the display
   * name comes from a different directory and the two do not always agree.
   */
  userId: number | null;
  role: Role;
  /**
   * Snipe locations this actor is assigned to keep stock for. Empty for most
   * people, and empty for an admin who has not been explicitly assigned —
   * admins can act as stock keeper anywhere regardless, which is why the
   * permission check takes `role` as well as this list.
   */
  stockKeeperLocations: StockKeeperLocation[];
};

export const SIGNED_OUT: Identity = {
  name: "",
  email: "",
  userId: null,
  role: null,
  stockKeeperLocations: [],
};

/** "Smith, Jane" → "Jane Smith"; anything else is just trimmed. */
function normalizeDisplayName(raw: string): string {
  const trimmed = raw.trim();
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx !== -1) {
    const last = trimmed.slice(0, commaIdx).trim();
    const first = trimmed.slice(commaIdx + 1).trim();
    if (first && last) return `${first} ${last}`;
  }
  return trimmed;
}

export async function getIdentity(signal?: AbortSignal): Promise<Identity> {
  // In development nobody is signed in until the switcher picks someone, and
  // asking the server without a name would only return an anonymous answer.
  const dev = getDevHeaders();
  if (import.meta.env.VITE_APP_ENV === "development" && !dev["x-dev-user-name"]) {
    return SIGNED_OUT;
  }

  const data = await apiFetch<Partial<Identity> & { name?: string; email?: string }>("/api/auth/role", {
    signal,
  });

  return {
    name: normalizeDisplayName(data.name ?? dev["x-dev-user-name"] ?? ""),
    email: data.email ?? dev["x-dev-user-email"] ?? "",
    userId: typeof data.userId === "number" ? data.userId : null,
    role: data.role ?? null,
    // Shape-checked rather than trusted: an older backend returns no such
    // field at all, and "not a stock keeper" is the safe reading.
    stockKeeperLocations: Array.isArray(data.stockKeeperLocations)
      ? data.stockKeeperLocations.filter(
          (l: unknown): l is StockKeeperLocation =>
            typeof l === "object" && l !== null && typeof (l as StockKeeperLocation).id === "number"
        )
      : [],
  };
}
