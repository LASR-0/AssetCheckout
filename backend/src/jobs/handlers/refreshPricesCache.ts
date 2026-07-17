import { refreshPricesCache } from "../../services/snipeitassets.js";

export async function refreshPricesCacheHandler(): Promise<Record<string, unknown>> {
  const rowCount = await refreshPricesCache();
  return { hardwareRowsCached: rowCount };
}