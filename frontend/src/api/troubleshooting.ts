import { apiFetch } from "@/api/client";
import type {
  DeviceCategoriesResponse,
  DevicePickerTile,
  SymptomResponse,
  TroubleshootingConfig,
} from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                    TROUBLESHOOTING API                          |
///  +-----------------------------------------------------------------+
//
//  Read-only. Troubleshooting writes nothing — not to the request workflow,
//  not to Snipe — so there is no mutation here and won't be until the
//  instrumentation in a later increment.
//
//  Symptom search is deliberately absent. The taxonomy for one device is a
//  couple of dozen labels, already in hand once the page loads, so filtering
//  it client-side is instant and costs no round trip. A server search
//  endpoint exists on the repository for when the library outgrows that.
///  +-----------------------------------------------------------------+

export async function getTroubleshootingConfig(): Promise<TroubleshootingConfig> {
  return apiFetch<TroubleshootingConfig>("/api/troubleshooting/config");
}

export async function getTroubleshootingDevices(): Promise<DevicePickerTile[]> {
  const res = await apiFetch<{ devices: DevicePickerTile[] }>(
    "/api/troubleshooting/devices"
  );
  return res.devices;
}

export async function getDeviceCategories(
  deviceKey: string
): Promise<DeviceCategoriesResponse> {
  return apiFetch<DeviceCategoriesResponse>(
    `/api/troubleshooting/devices/${encodeURIComponent(deviceKey)}`
  );
}

export async function getSymptom(
  deviceKey: string,
  symptomId: string
): Promise<SymptomResponse> {
  return apiFetch<SymptomResponse>(
    `/api/troubleshooting/devices/${encodeURIComponent(deviceKey)}` +
      `/symptoms/${encodeURIComponent(symptomId)}`
  );
}

///  +-----------------------------------------------------------------+
///  |                    ANALYTICS (admin)                            |
///  +-----------------------------------------------------------------+
//
//  Recording events is deliberately NOT here — see lib/troubleshootingAnalytics,
//  which posts directly rather than through apiFetch. That path must never
//  throw and never block a page render, which is the opposite of what
//  apiFetch is built to do.

export type ArticleStat = {
  deviceKey: string;
  symptomId: string;
  label: string;
  opens: number;
  escapes: number;
  deepestStep: number | null;
};

export type NoMatchSearch = {
  query: string;
  count: number;
  lastSearchedAt: string;
};

export type AnalyticsSummary = {
  enabled: boolean;
  totals: {
    articlesOpened: number;
    stepsReached: number;
    escapesTaken: number;
    searchesWithNoMatch: number;
    sessionsWithArticle: number;
    sessionsWithEscape: number;
  };
  articles: ArticleStat[];
  noMatchSearches: NoMatchSearch[];
  escapesByControl: { detail: string; count: number }[];
};

export async function getTroubleshootingAnalytics(
  days: number
): Promise<AnalyticsSummary> {
  return apiFetch<AnalyticsSummary>(`/api/troubleshooting/analytics?days=${days}`);
}

export async function setTroubleshootingAnalyticsEnabled(
  enabled: boolean
): Promise<void> {
  await apiFetch("/api/troubleshooting/analytics/enabled", {
    method: "POST",
    body: { enabled },
  });
}
