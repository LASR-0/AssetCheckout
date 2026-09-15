export type CategoryStandardModels = {
  primary: number | null;
  backup: number | null;
};
 
export type StandardModelsConfig = Record<string, CategoryStandardModels>;

///  +-----------------------------------------------------------------+
///  |                        STOCK KEEPERS                            |
///  +-----------------------------------------------------------------+
//
//  Mirrors StockKeeperEntry / StockKeepersConfig in the backend settings
//  service. The name and email are a display snapshot taken when the person
//  was assigned — userId is the identity, and is what any permission check
//  compares against.
///  +-----------------------------------------------------------------+

export type StockKeeperEntry = {
  userId: number;
  name: string;
  email: string | null;
};

/**
 * One location's assignment. The location name is a snapshot taken when the
 * assignment was written, so nothing has to resolve it against Snipe — see the
 * backend's LocationStockKeepers for why /api/auth/role can't afford to.
 */
export type LocationStockKeepers = {
  locationName: string | null;
  keepers: StockKeeperEntry[];
};

/** locationId (numeric-string key) → the people keeping stock there. */
export type StockKeepersConfig = Record<string, LocationStockKeepers>;

/**
 * Fallback only. The live cap travels with every stock-keeper response so the
 * UI follows the server rather than a constant that can drift from it; this is
 * what renders before the first response lands.
 */
export const DEFAULT_MAX_STOCK_KEEPERS = 3;
