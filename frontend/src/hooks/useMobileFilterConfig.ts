import { useEffect, useState } from "react";
import {
  DEFAULT_MOBILE_CONFIG,
  type MobileNumberConfig,
} from "@/lib/mobileNumber";
import { getDevUserName, getDevUserEmail } from "@/hooks/useAuth";

///  +-----------------------------------------------------------------+
///  |                  MOBILE FILTER CONFIG (client)                  |
///  +-----------------------------------------------------------------+
//
//  Client access to the admin-configurable mobile-filter setting
//  (GET/PUT /api/settings/mobile-filter). Module-level cache: the config
//  changes rarely, so many mounts (UserSelect, RequestFormPage) share one
//  fetch per page load. On ANY failure the AU defaults apply — the feature
//  degrades to previous behaviour, it never blocks checkout.
//
//  These fetchers can migrate into @/api/settings if preferred; kept here
//  so this feature lands as one self-contained module.
///  +-----------------------------------------------------------------+

// FIXED: in dev mode the actor's identity travels in x-dev-user-* headers
// (same mechanism as useAuth's /api/auth/role fetch) — without them,
// getActorEmail() on the backend sees "" and requireAdmin rejects the PUT.
// In production the SSO gateway injects identity, so no headers are added.
function actorHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (import.meta.env.VITE_APP_ENV === "development") {
    const name = getDevUserName();
    const email = getDevUserEmail();
    if (name) headers["x-dev-user-name"] = name;
    if (email) headers["x-dev-user-email"] = email;
  }
  return headers;
}

let cached: MobileNumberConfig | null = null;
let inflight: Promise<MobileNumberConfig> | null = null;

function parseConfig(data: unknown): MobileNumberConfig {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    countryCode:
      typeof d.countryCode === "string" && /^\d{1,3}$/.test(d.countryCode)
        ? d.countryCode
        : DEFAULT_MOBILE_CONFIG.countryCode,
    mobileLeadingDigit:
      typeof d.mobileLeadingDigit === "string" && /^\d$/.test(d.mobileLeadingDigit)
        ? d.mobileLeadingDigit
        : DEFAULT_MOBILE_CONFIG.mobileLeadingDigit,
  };
}

export async function fetchMobileFilterConfig(): Promise<MobileNumberConfig> {
  if (cached) return cached;
  if (!inflight) {
    inflight = fetch("/api/settings/mobile-filter", { headers: actorHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch mobile filter config: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        cached = parseConfig(data);
        return cached;
      })
      .catch((err) => {
        console.error("Mobile filter config fetch failed, using defaults", err);
        inflight = null; // allow a retry on the next mount
        return DEFAULT_MOBILE_CONFIG;
      });
  }
  return inflight;
}

/**
 * Persist a new config (admin-only endpoint). On success the module cache
 * is updated so subsequent mounts see the new value without a refetch.
 * Throws on failure so the settings card can surface the error.
 */
export async function saveMobileFilterConfig(
  config: MobileNumberConfig
): Promise<MobileNumberConfig> {
  const res = await fetch("/api/settings/mobile-filter", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...actorHeaders() },
    body: JSON.stringify(config),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "Failed to save mobile filter settings");
  }

  cached = parseConfig(data);
  inflight = Promise.resolve(cached);
  return cached;
}

/**
 * The active config — AU defaults immediately, server value once loaded.
 */
export function useMobileFilterConfig(): MobileNumberConfig {
  const [config, setConfig] = useState<MobileNumberConfig>(
    cached ?? DEFAULT_MOBILE_CONFIG
  );

  useEffect(() => {
    let cancelled = false;
    fetchMobileFilterConfig().then((cfg) => {
      if (!cancelled) setConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}