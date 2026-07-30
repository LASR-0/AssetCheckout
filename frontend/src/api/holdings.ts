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
