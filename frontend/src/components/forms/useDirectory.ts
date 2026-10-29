import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usersQuery } from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import type { User } from "@/components/request-form/UserSelect";

const NO_USERS: User[] = [];

/**
 * The Snipe-IT directory, sorted by name, and the signed-in person's entry
 * in it: matched by Snipe id first, then by email.
 */
export function useDirectory() {
  const auth = useAuth();
  const { data, isPending, isError } = useQuery(usersQuery);
  const users = useMemo(
    () => (data ? [...data].sort((a, b) => a.name.localeCompare(b.name)) : NO_USERS),
    [data]
  );
  const me = useMemo(() => {
    const email = auth.email.toLowerCase();
    return (
      users.find((u) => auth.userId != null && Number(u.id) === auth.userId) ??
      users.find((u) => !!email && u.email?.toLowerCase() === email) ??
      null
    );
  }, [users, auth.userId, auth.email]);
  return { users, me, loading: isPending, failed: isError };
}
