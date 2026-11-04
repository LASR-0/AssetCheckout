export type AssetCategory = {
  id: number;
  name: string;
};

export type CategoryModel = {
  id: number;
  name: string;
  /** Assets ready to hand out. Absent when the hardware list couldn't load. */
  available?: number;
  /** Of those, how many carry a Tier value — what a standard needs. */
  availableWithTier?: number;
};