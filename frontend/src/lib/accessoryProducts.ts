import type {
  AccessorySummary,
  AccessoryProductOption,
} from "@/types/accessoriesType";

///  +-----------------------------------------------------------------+
///  |               ACCESSORY PRODUCT-IDENTITY GROUPING               |
///  +-----------------------------------------------------------------+
//
//  Snipe accessories are per-location records, so the same product appears
//  as several rows (one per site). The admin picker must show ONE entry per
//  product with stock summed across locations — the dedup the requester-
//  facing option list also relies on. The identity key here mirrors the
//  backend's productIdentityKey (manufacturer + normalised name +
//  model_number when present) so both sides group a catalog identically.
///  +-----------------------------------------------------------------+

/** manufacturer + normalised name + model_number (when present). */
export function productIdentityKey(a: AccessorySummary): string {
  const manufacturer = (a.manufacturer ?? "").trim().toLowerCase();
  const name = a.name.trim().toLowerCase().replace(/\s+/g, " ");
  const modelNumber = (a.modelNumber ?? "").trim().toLowerCase();
  return `${manufacturer}|${name}|${modelNumber}`;
}

/**
 * Group a category's accessory rows into deduplicated product options, stock
 * summed across location-siblings. The representative id is the lowest member
 * id (stable across reloads regardless of catalog order). memberIds lets a
 * saved id — which may be any sibling — resolve back to its group.
 *
 * The display label carries manufacturer when present ("Apple · AirPods Pro")
 * so two same-named products from different manufacturers stay distinct.
 * Sorted by label for a stable, scannable picker.
 */
export function groupAccessoryProducts(
  rows: AccessorySummary[]
): AccessoryProductOption[] {
  const groups = new Map<string, AccessorySummary[]>();
  for (const row of rows) {
    const key = productIdentityKey(row);
    const existing = groups.get(key);
    if (existing) existing.push(row);
    else groups.set(key, [row]);
  }

  const options: AccessoryProductOption[] = [];
  for (const [key, members] of groups.entries()) {
    const memberIds = members.map((m) => m.id).sort((a, b) => a - b);
    const first = members[0];
    const manufacturer = first.manufacturer;
    const baseName = first.name.trim();
    const label = manufacturer ? `${manufacturer} · ${baseName}` : baseName;

    options.push({
      key,
      representativeId: memberIds[0],
      memberIds,
      label,
      manufacturer,
      aggregateRemaining: members.reduce((sum, m) => sum + m.remaining, 0),
      aggregateQty: members.reduce((sum, m) => sum + m.qty, 0),
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Resolve a saved accessory id back to the product option it belongs to —
 * the saved id may be any location-sibling, so we match against memberIds.
 * Returns null when the id no longer exists in the catalog (accessory
 * deleted in Snipe), which the picker renders as a missing-state entry.
 */
export function findProductBySavedId(
  options: AccessoryProductOption[],
  savedId: number
): AccessoryProductOption | null {
  return options.find((o) => o.memberIds.includes(savedId)) ?? null;
}

/** The picker's display string for a product option, including stock. */
export function productPickerLabel(o: AccessoryProductOption): string {
  return `${o.label} — ${o.aggregateRemaining} in stock`;
}