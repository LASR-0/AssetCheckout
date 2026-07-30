import { apiFetch } from "@/api/client";
import type { UserHoldings } from "@/types/holdingsType";

///  +-----------------------------------------------------------------+
///  |                        HOLDINGS API                             |
///  +-----------------------------------------------------------------+
//
//  What the signed-in user currently holds in Snipe-IT. Self-only — there is
//  no per-user variant, so no permissions dimension.
//
//  One call returns both assets and accessories, because the home page needs
//  them together.
///  +-----------------------------------------------------------------+

type HoldingsResponse = UserHoldings & {
  success: boolean;
  /** True when one half failed server-side and came back empty. */
  partial: boolean;
};

export async function getMyHoldings(): Promise<HoldingsResponse> {
  return apiFetch<HoldingsResponse>("/api/holdings/for-me");
}

///  +-----------------------------------------------------------------+
///  |            DIAGNOSTIC: UNREACHABLE HOLDINGS (admin)             |
///  +-----------------------------------------------------------------+

export type UnreachableHolding = {
  categoryId: number;
  categoryName: string;
  /** Units currently checked out to people in this category. */
  heldCount: number;
  /** Whether the category survives L1. False = not in the whitelist. */
  requestable: boolean;
  /** Whether any asset category maps to it (L3). False = nothing unlocks it. */
  mapped: boolean;
};

/**
 * Accessory categories people are holding but nobody can request. Admin-only;
 * 403 for everyone else.
 */
export async function getUnreachableHoldings(): Promise<{
  success: boolean;
  unreachable: UnreachableHolding[];
}> {
  return apiFetch("/api/holdings/unreachable");
}
