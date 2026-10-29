import type { AssetHolding, AccessoryHolding, UserHoldings } from "@/types/holdingsType";

/** One thing recorded against the person, asset or accessory alike. */
export type HeldItem = {
  subject: "ASSET" | "ACCESSORY";
  snipeRecordId: number;
  title: string;
  categoryId: number | null;
  categoryName: string | null;
  /** Assets only: Snipe stocks accessories by quantity, with no unit serial. */
  serial: string | null;
  /** An accessory's maker, which is what tells two headsets apart. */
  maker: string | null;
};

export function heldAssets(h: UserHoldings | undefined): HeldItem[] {
  return (h?.assets ?? []).map((a: AssetHolding) => ({
    subject: "ASSET",
    snipeRecordId: a.id,
    title: a.model?.trim() || "Unnamed model",
    categoryId: a.categoryId,
    categoryName: a.categoryName,
    serial: a.serial?.trim() || null,
    maker: a.manufacturer,
  }));
}

export function heldAccessories(h: UserHoldings | undefined): HeldItem[] {
  return (h?.accessories ?? []).map((c: AccessoryHolding) => ({
    subject: "ACCESSORY",
    snipeRecordId: c.id,
    title: c.name?.trim() || "Unnamed accessory",
    categoryId: c.categoryId,
    categoryName: c.categoryName,
    serial: null,
    maker: c.manufacturer,
  }));
}

/** The second line under an item: its category and how to tell it apart. */
export function heldDetail(item: HeldItem): { category: string; id: string | null; mono: boolean } {
  const category = item.categoryName ?? (item.subject === "ASSET" ? "Device" : "Accessory");
  if (item.subject === "ASSET") {
    return item.serial ? { category, id: item.serial, mono: true } : { category, id: "No serial recorded", mono: false };
  }
  return { category, id: item.maker, mono: false };
}
