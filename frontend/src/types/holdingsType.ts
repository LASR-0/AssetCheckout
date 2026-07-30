///  +-----------------------------------------------------------------+
///  |                       HOLDINGS TYPES                            |
///  +-----------------------------------------------------------------+
//
//  Frontend mirror of the backend's holdings shapes. No serial on either:
//  most users never interact with serials, so on the home page they'd be
//  noise. Serial capture belongs to the unlogged-item correction flow.
///  +-----------------------------------------------------------------+

export type AssetHolding = {
  id: number;
  assetTag: string;
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
