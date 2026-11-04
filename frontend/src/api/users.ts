import { apiFetch } from "@/api/client";
import type { User } from "@/types/userType";

export async function fetchUsers(signal?: AbortSignal): Promise<User[]> {
  return apiFetch<User[]>("/api/users", { signal });
}
