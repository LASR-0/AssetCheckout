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
};
