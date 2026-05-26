export async function fetchUsers() {
  const res = await fetch("/api/users");

  if (!res.ok) {
    throw new Error("Failed to fetch users");
  }

  const data = await res.json();

  return data;
}