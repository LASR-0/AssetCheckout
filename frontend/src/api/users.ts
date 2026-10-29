import { apiFetch } from "@/api/client";
import type { User } from "@/components/request-form/UserSelect";

export async function fetchUsers(signal?: AbortSignal): Promise<User[]> {
  return apiFetch<User[]>("/api/users", { signal });
}
