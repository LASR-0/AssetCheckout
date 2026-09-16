import { apiFetch } from "./client";
import type { LocationAccessory, LocationAsset } from "@/types/snipeTypes";

///  +-----------------------------------------------------------------+
///  |                  THE STOCK KEEPER'S INVENTORY                   |
///  +-----------------------------------------------------------------+
//
//  What Snipe says is physically at one site. Permission is checked server
//  side against the caller's own assignments — a 403 here means the actor
//  asked about a location they don't keep, which the UI should not have
//  offered in the first place.
///  +-----------------------------------------------------------------+

export async function getAssetsAtLocation(
  locationId: number
): Promise<LocationAsset[]> {
  const data = await apiFetch<{ assets: LocationAsset[] }>(
    `/api/stock/assets?locationId=${encodeURIComponent(locationId)}`
  );
  return data.assets ?? [];
}

/**
 * Accessory lines at one site. Same permission rule as the assets call —
 * a 403 means the caller asked about a location they don't keep.
 */
export async function getAccessoriesAtLocation(
  locationId: number
): Promise<LocationAccessory[]> {
  const data = await apiFetch<{ accessories: LocationAccessory[] }>(
    `/api/stock/accessories?locationId=${encodeURIComponent(locationId)}`
  );
  return data.accessories ?? [];
}
