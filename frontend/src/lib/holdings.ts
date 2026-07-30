import type { AssetHolding, AccessoryHolding } from "@/types/holdingsType";

///  +-----------------------------------------------------------------+
///  |                    HOLDINGS SUMMARISATION                       |
///  +-----------------------------------------------------------------+
//
//  Quick Start tiles are category-level, so several holdings collapse into
//  one tile. These turn a category's holdings into the single line a tile
//  can show.
//
//  The two kinds are deliberately NOT summarised the same way, because the
//  data behind them isn't the same:
//
//    Assets      — each row is one physical asset, so a count is meaningful
//                  and repeated models can honestly read "x2".
//    Accessories — the Snipe endpoint returns the accessory RECORD, whose
//                  qty/remaining are stock at a location, NOT how many this
//                  user holds, and checkouts_count comes back null. So the
//                  only safe statement is how many DISTINCT accessories came
//                  back: "+N" and never "xN", and no count badge on the tile.
///  +-----------------------------------------------------------------+

/** Group holdings by their Snipe category id. Holdings with no category id
 *  are dropped — without one they can't be matched to a tile. */
export function groupByCategoryId<T extends { categoryId: number | null }>(
  holdings: T[]
): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const h of holdings) {
    if (h.categoryId === null) continue;
    const existing = out.get(h.categoryId);
    if (existing) existing.push(h);
    else out.set(h.categoryId, [h]);
  }
  return out;
}

/**
 * The line shown on an ASSET tile.
 *
 * Backend returns these newest-checkout-first, so `[0]` is the most recent
 * holding and its model is the name most likely recognised as "mine".
 *
 *   one holding            -> "ThinkPad T16 Gen 1"
 *   several, same model    -> "ThinkPad T16 Gen 1 x2"
 *   several, mixed models  -> "ThinkPad T16 Gen 1 +1"
 *
 * Returns null when there's nothing to say, so the caller renders nothing.
 */
export function summariseAssetHoldings(holdings: AssetHolding[]): string | null {
  if (holdings.length === 0) return null;

  const first = holdings[0].model?.trim() || "Unnamed model";
  if (holdings.length === 1) return first;

  const names = holdings.map((h) => h.model?.trim() || "Unnamed model");
  const allSame = names.every((n) => n === names[0]);
  return allSame ? `${first} x${holdings.length}` : `${first} +${holdings.length - 1}`;
}

/**
 * The line shown on an ACCESSORY tile.
 *
 *   one holding    -> "Jabra Evolve 65 TE MS"
 *   several        -> "Jabra Evolve 65 TE MS +1"
 *
 * Never "xN": a repeated name here means two accessory records, which is not
 * the same claim as "you hold two of this", and that claim isn't available
 * from the endpoint. Snipe's own row order is kept — unlike assets, there is
 * no per-checkout date to sort on.
 */
export function summariseAccessoryHoldings(
  holdings: AccessoryHolding[]
): string | null {
  if (holdings.length === 0) return null;

  const first = holdings[0].name?.trim() || "Unnamed accessory";
  if (holdings.length === 1) return first;
  return `${first} +${holdings.length - 1}`;
}
