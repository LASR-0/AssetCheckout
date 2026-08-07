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
