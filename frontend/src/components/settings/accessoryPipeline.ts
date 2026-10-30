import { useQuery } from "@tanstack/react-query";
import {
  accessoryAssetMapQuery,
  accessorySettingsQuery,
  allAccessoryCategoriesQuery,
  allAssetCategoriesQuery,
  requestableAssetIdsQuery,
} from "@/api/queries";

///  +-----------------------------------------------------------------+
///  |        WHY CAN'T ANYONE REQUEST CASES? (the pipeline)            |
///  +-----------------------------------------------------------------+
//
//  An accessory is requestable only when three layers agree:
//
//    1. Requestable: a site-wide filter. Empty means everything is allowed.
//       It only filters; it never grants anything on its own.
//    2. Options: the named choices on the form. Optional: with none, the
//       first in-stock item is issued.
//    3. Availability by asset: the gate. An accessory category shows only to
//       holders of the asset categories it's mapped to.
//
//  Getting any one wrong looks the same from the outside ("I saved it and
//  nobody can see it"), so the health is computed here, per category, from
//  the three settings — and the page shows it before the layers.
///  +-----------------------------------------------------------------+

export type CategoryHealth = {
  id: number;
  name: string;
  /** In layer 1 (or layer 1 is empty, so everything is). */
  requestable: boolean;
  /** Requestable asset categories mapping to it in layer 3. */
  mappedBy: string[];
  /** Named options in layer 2. */
  options: number;
  /** ok: someone can request it. unmapped: requestable, but no asset maps to
   *  it. stale: mapped, but not requestable. off: neither. */
  state: "ok" | "unmapped" | "stale" | "off";
};

export function useAccessoryPipeline() {
  const acc = useQuery(allAccessoryCategoriesQuery);
  const assets = useQuery(allAssetCategoriesQuery);
  const assetReq = useQuery(requestableAssetIdsQuery);
  const settings = useQuery(accessorySettingsQuery);
  const map = useQuery(accessoryAssetMapQuery);

  const allAcc = acc.data ?? [];
  const reqIds = settings.data?.requestableCategoryIds ?? null;
  // Empty or unset: no restriction.
  const reqSet = new Set(reqIds && reqIds.length ? reqIds : allAcc.map((c) => c.id));
  const assetRows = (assets.data ?? []).filter((a) => (assetReq.data ?? []).includes(a.id));
  const mapping = map.data ?? {};
  const options = settings.data?.standardAccessories ?? {};

  const health: CategoryHealth[] = allAcc.map((c) => {
    const requestable = reqSet.has(c.id);
    const mappedBy = assetRows.filter((a) => (mapping[String(a.id)] ?? []).includes(c.id)).map((a) => a.name);
    const state = requestable && mappedBy.length ? "ok" : requestable ? "unmapped" : mappedBy.length ? "stale" : "off";
    return { id: c.id, name: c.name, requestable, mappedBy, options: options[String(c.id)]?.options.length ?? 0, state };
  });

  const issues = health.filter((h) => h.state === "unmapped" || h.state === "stale");
  /** Requestable asset categories whose holders can request nothing at all. */
  const blockedAssets = assetRows.filter((a) => !(mapping[String(a.id)] ?? []).some((id) => reqSet.has(id)));

  return {
    loading: acc.isPending || settings.isPending || map.isPending || assetReq.isPending,
    snipeDown: acc.isError || assets.isError,
    refetch: () => Promise.all([acc.refetch(), assets.refetch()]),
    categories: allAcc,
    reqIds,
    reqSet,
    assetRows,
    hiddenAssets: (assets.data ?? []).filter((a) => !(assetReq.data ?? []).includes(a.id)),
    mapping,
    options,
    health,
    issues,
    blockedAssets,
    /** For the sidebar badge: how many things need attention. */
    attention: issues.length + blockedAssets.length,
  };
}

/** A stable identity dot for a category, from its name. */
export function idDot(name: string): string {
  const n = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  return ["bg-id1", "bg-id2", "bg-id3", "bg-id4"][n];
}
