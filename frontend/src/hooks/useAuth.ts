import { useQuery } from "@tanstack/react-query";
import { identityQuery } from "@/api/queries";
import { queryClient } from "@/api/queryClient";
import { SIGNED_OUT, type Identity } from "@/api/auth";

///  +-----------------------------------------------------------------+
///  |                     WHO IS SIGNED IN                            |
///  +-----------------------------------------------------------------+
//
//  One cached query, however many components ask. It used to be a hook with
//  its own state, so every caller fired its own /api/auth/role: a dozen per
//  page load. Now the first caller fetches and the rest read the cache.
//
//  Switching the dev user resets the WHOLE cache, not just this query:
//  requests, counts and holdings all belong to whoever was signed in, and
//  keeping them would show one person's queue to another.
///  +-----------------------------------------------------------------+

export type AuthState = Identity & {
  isLoading: boolean;
  refresh: () => void;
};

const STORAGE_KEY = "dev-user-name";
const STORAGE_KEY_EMAIL = "dev-user-email";

export function getDevUserName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function getDevUserEmail(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY_EMAIL) ?? "";
}

function store(key: string, value: string): void {
  if (value) localStorage.setItem(key, value);
  else localStorage.removeItem(key);
}

/** Sign in as someone else (development only). */
export function setDevUser(name: string, email: string): void {
  if (typeof window === "undefined") return;
  store(STORAGE_KEY, name);
  store(STORAGE_KEY_EMAIL, email);
  void queryClient.resetQueries();
}

export function useAuth(): AuthState {
  const { data, isPending, refetch } = useQuery(identityQuery);
  return {
    ...(data ?? SIGNED_OUT),
    isLoading: isPending,
    refresh: () => void refetch(),
  };
}
