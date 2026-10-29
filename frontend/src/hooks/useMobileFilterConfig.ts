import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/api/client";
import { queryClient } from "@/api/queryClient";
import { SESSION } from "@/api/queries";
import {
  DEFAULT_MOBILE_CONFIG,
  type MobileNumberConfig,
} from "@/lib/mobileNumber";

///  +-----------------------------------------------------------------+
///  |                  MOBILE FILTER CONFIG (client)                  |
///  +-----------------------------------------------------------------+
//
//  Client access to the admin-configurable mobile-filter setting
//  (GET/PUT /api/settings/mobile-filter). One cached query, so many mounts
//  (UserSelect, RequestFormPage) share one fetch per session. On ANY
//  failure the AU defaults apply — the feature degrades to previous
//  behaviour, it never blocks checkout.
///  +-----------------------------------------------------------------+

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

const mobileFilterQuery = queryOptions({
  queryKey: ["settings", "mobile-filter"],
  queryFn: async () => parseConfig(await apiFetch("/api/settings/mobile-filter")),
  staleTime: SESSION,
});

export async function fetchMobileFilterConfig(): Promise<MobileNumberConfig> {
  try {
    return await queryClient.fetchQuery(mobileFilterQuery);
  } catch (err) {
    console.error("Mobile filter config fetch failed, using defaults", err);
    return DEFAULT_MOBILE_CONFIG;
  }
}

/**
 * Persist a new config (admin-only endpoint). On success the cache is
 * updated so every mount sees the new value without a refetch. Throws on
 * failure so the settings card can surface the error.
 */
export async function saveMobileFilterConfig(
  config: MobileNumberConfig
): Promise<MobileNumberConfig> {
  const saved = parseConfig(
    await apiFetch("/api/settings/mobile-filter", { method: "PUT", body: config })
  );
  queryClient.setQueryData(mobileFilterQuery.queryKey, saved);
  return saved;
}

/**
 * The active config — AU defaults immediately, server value once loaded.
 */
export function useMobileFilterConfig(): MobileNumberConfig {
  const { data } = useQuery(mobileFilterQuery);
  return data ?? DEFAULT_MOBILE_CONFIG;
}
