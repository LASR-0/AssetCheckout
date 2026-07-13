import { useEffect, useState } from "react";
import type { Role } from "@/types/authType";

export interface AuthState {
  name: string;
  email: string;
  role: Role;
  isLoading: boolean;
  refresh: () => void;
}

const STORAGE_KEY = "dev-user-name";
const STORAGE_KEY_EMAIL = "dev-user-email";
const CHANGE_EVENT = "dev-user-changed";


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
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getDevUserEmail(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(STORAGE_KEY_EMAIL) ?? "";
}

export function setDevUserEmail(email: string): void {
  if (typeof window === "undefined") return;
  if (email) {
    localStorage.setItem(STORAGE_KEY_EMAIL, email);
  } else {
    localStorage.removeItem(STORAGE_KEY_EMAIL);
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAuth(): AuthState {
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
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
        const isDev = import.meta.env.VITE_APP_ENV === "development";
        const devName = isDev ? getDevUserName() : "";

        if (isDev && !devName) {
          if (!cancelled) {
            setName("");
            setEmail("");
            setRole(null);
            setIsLoading(false);
          }
          return;
        }

        const devEmail = isDev ? getDevUserEmail() : "";
        const headers: Record<string, string> = {};
        if (devName) headers["x-dev-user-name"] = devName;
        if (devEmail) headers["x-dev-user-email"] = devEmail;

        const res = await fetch("/api/auth/role", { headers });

        if (!res.ok) throw new Error(`Failed to fetch role: ${res.status}`);
        const data = await res.json();

        if (!cancelled) {
          setName(normalizeDisplayName(data.name ?? devName));
          setEmail(data.email ?? devEmail);
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

  return { name, email, role, isLoading, refresh };
}