import { useEffect, useState } from "react";
import type { Role } from "@/types/authType";


export interface AuthState {
  name: string;
  role: Role;
  isLoading: boolean;
  refresh: () => void;
}

const STORAGE_KEY = "dev-user-name";
const CHANGE_EVENT = "dev-user-changed";

export function getDevUserName(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

export function setDevUserName(name: string): void {
  if (typeof window === "undefined") return;
  if (name) {
    localStorage.setItem(STORAGE_KEY, name);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
  // Notify all useAuth() consumers in the app to re-fetch
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAuth(): AuthState {
  const [name, setName] = useState<string>("");
  const [role, setRole] = useState<Role>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [tick, setTick] = useState(0);

  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    function onChange() {
      refresh();
    }
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      try {
        setIsLoading(true);
        const devName = getDevUserName();

        if (!devName) {
          if (!cancelled) {
            setName("");
            setRole(null);
            setIsLoading(false);
          }
          return;
        }

        const res = await fetch("/api/auth/role", {
          headers: { "x-dev-user-name": devName },
        });

        if (!res.ok) throw new Error(`Failed to fetch role: ${res.status}`);
        const data = await res.json();

        if (!cancelled) {
          setName(data.name ?? devName);
          setRole(data.role);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("useAuth failed", err);
        if (!cancelled) {
          setRole(null);
          setIsLoading(false);
        }
      }
    }

    loadRole();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { name, role, isLoading, refresh };
}