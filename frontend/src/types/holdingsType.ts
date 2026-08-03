///  +-----------------------------------------------------------------+
///  |                       HOLDINGS TYPES                            |
///  +-----------------------------------------------------------------+
//
//  Frontend mirror of the backend's holdings shapes.
//
//  Assets carry a serial; accessories don't, and won't. Snipe records a
//  serial per asset but accessories are stocked by quantity with no per-unit
//  identity, so there is nothing to show — which is also why the corrections
//  flow no longer offers "the serial is wrong" for an accessory.
///  +-----------------------------------------------------------------+

export type AssetHolding = {
  id: number;
  assetTag: string;
  /** As printed on the device — what a user can actually check. Often null. */
  serial: string | null;
  /** Model name — the display field. Snipe's asset `name` is often empty. */
  model: string | null;
  categoryId: number | null;
  categoryName: string | null;
  /** Sorted newest-first by the backend; not rendered. */
  lastCheckout: string | null;
};

export type AccessoryHolding = {
  id: number;
  /** The accessory's own name, which is the model-equivalent here. */
  name: string;
  manufacturer: string | null;
  categoryId: number | null;
  categoryName: string | null;
};

export type UserHoldings = {
  assets: AssetHolding[];
  accessories: AccessoryHolding[];
};
