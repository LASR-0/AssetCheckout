export type SnipeNamedRecord = {
  id: number;
  name: string;
};
/**
 * An asset Snipe places at one site — the stock keeper's inventory row.
 * Mirrors LocationAsset in the backend's snipeTypes.
 */
export type LocationAsset = {
  id: number;
  assetTag: string;
  name: string | null;
  serial: string | null;
  model: string | null;
  manufacturer: string | null;
  categoryName: string | null;
  statusLabel: string | null;
  /** Snipe considers it available to issue. */
  available: boolean;
  /** Who currently holds it, when it is checked out to a person. */
  assignedTo: string | null;
  /** When it was last checked out, or null if it never has been. */
  lastCheckout: string | null;
};

/**
 * An accessory line at a site — the accessory half of the stock ledger.
 *
 * NOT shaped like LocationAsset, deliberately. Accessories are stock with a
 * quantity rather than serialised units, so there is no tag, no serial and no
 * single holder; `qty` and `remaining` are the whole story.
 */
export type LocationAccessory = {
  id: number;
  name: string;
  modelNumber: string | null;
  manufacturer: string | null;
  categoryId: number | null;
  categoryName: string | null;
  qty: number;
  remaining: number;
  locationId: number | null;
  locationName: string | null;
};
