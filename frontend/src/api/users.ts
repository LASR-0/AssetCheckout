import type { User } from "@/components/request-form/UserSelect";

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch("/api/users");
  if (!res.ok) {
    throw new Error("Failed to fetch users");
  }
  return res.json();
}