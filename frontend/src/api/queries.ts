import { queryOptions } from "@tanstack/react-query";
import { invalidate } from "@/api/queryClient";
import { apiFetch } from "@/api/client";
import { getIdentity } from "@/api/auth";
import { getAssetCategories, getAllAssetCategories } from "@/api/categories";
import { getCompanies, getLocations, getStatuses } from "@/api/snipe";
import { fetchUsers } from "@/api/users";
import { getTiers, getPriceAverages } from "@/api/analytics";
import { getFeedbackEnabled } from "@/api/feedback";
import { getTourState } from "@/api/tours";
import { getMyHoldings } from "@/api/holdings";
import {
  getAccessoryCategories,
  getAccessoryCategoriesForMe,
  getAccessoryCategoriesForUser,
  getAccessoryOptions,
  getAllAccessoryCategories,
  getAccessorySettings,
} from "@/api/accessories";
import { getLoanDevices } from "@/api/loans";
import { getAccessoriesAtLocation, getAssetsAtLocation } from "@/api/stock";
import {
  getEditableSubject,
  getSymptom,
  getTroubleshootingConfig,
  getTroubleshootingLibrary,
  getTroubleshootingSubjects,
} from "@/api/troubleshooting";
import { getLoanConfig, getSiteColours, getStockKeepers } from "@/api/settings";
import type { Request } from "@/types/requestType";

///  +-----------------------------------------------------------------+
///  |               EVERY CACHED READ, BY KEY AND RHYTHM              |
///  +-----------------------------------------------------------------+
//
//  Each export is a complete recipe (key, fetcher, freshness) that a
//  component passes to useQuery, or imperative code passes to
//  queryClient.fetchQuery. The same recipe in two places is one request.
//
//  FRESHNESS FOLLOWS VOLATILITY:
//
//    SESSION    who you are, feature switches, the tour checklist.
//               Fetched once; anything that changes them invalidates them.
//    REFERENCE  Snipe-IT lookups (locations, users, categories). The backend
//               caches Snipe for about this long anyway, so asking sooner
//               cannot return anything newer.
//    WORKFLOW   requests, holdings, stock, the nav badges. Stale after 30 s
//               and revalidated on window focus, so nobody acts on a
//               state that moved while they were away.
//
//  KEYS NEST, so invalidation can be broad or narrow. Everything about
//  requests starts with "requests"; invalidating ["requests"] after an
//  approval refreshes the list AND the nav badge in one call.
///  +-----------------------------------------------------------------+

export const SESSION = Infinity;
export const REFERENCE = 10 * 60_000;
export const WORKFLOW = 30_000;
/** Kept in memory as long as the browser keeps it (api/persist.ts), or the
 *  cache would drop it after ten idle minutes and stop saving it. */
export const PERSISTED_GC = 24 * 60 * 60_000;

// ---- who is signed in -------------------------------------------------

export const identityQuery = queryOptions({
  queryKey: ["identity"],
  queryFn: ({ signal }) => getIdentity(signal),
  staleTime: SESSION,
});

// ---- requests ---------------------------------------------------------

type RequestsResponse = { success: boolean; count: number; requests: Request[] };

/**
 * Every request the viewer can see. The endpoint has no server-side paging
 * (it ignores page/limit/search), so Home, Requests and Stock all read this
 * one list and filter it themselves, instead of each fetching it again.
 */
export const requestsQuery = queryOptions({
  queryKey: ["requests", "list"],
  queryFn: async ({ signal }) => (await apiFetch<RequestsResponse>("/api/requests", { signal })).requests,
  staleTime: WORKFLOW,
});

export type ActionCounts = {
  /** Requests blocked on this person and not yet seen by them. */
  requests: number;
  /** Devices at their site waiting to be handed over. */
  stock: number;
};

export const actionCountsQuery = queryOptions({
  queryKey: ["requests", "action-counts"],
  // FAILS TO ZERO, SILENTLY. A badge is an enhancement; a red error where a
  // count should be is worse than no count. The next refetch picks it up.
  queryFn: async ({ signal }): Promise<ActionCounts> => {
    try {
      const data = await apiFetch<ActionCounts>("/api/requests/action-counts", { signal });
      return {
        requests: Number.isFinite(data.requests) ? data.requests : 0,
        stock: Number.isFinite(data.stock) ? data.stock : 0,
      };
    } catch {
      return { requests: 0, stock: 0 };
    }
  },
  staleTime: WORKFLOW,
});

/**
 * After anything that moves a request: the list, the nav badges, and what
 * the move can change downstream (what people hold, what is on loan, what
 * sits in stock). Only queries on screen refetch; the rest are marked stale
 * and refetch when next shown.
 */
export function invalidateWorkflow(): Promise<void> {
  return invalidate(["requests"], ["holdings"], ["loans"], ["stock"]);
}

// ---- price analytics (the asset details dialog's comparison) ------------

export const tiersQuery = queryOptions({
  queryKey: ["price-analytics", "tiers"],
  queryFn: ({ signal }) => getTiers(signal),
  staleTime: REFERENCE,
});

export const priceAveragesQuery = (tier: string) =>
  queryOptions({
    queryKey: ["price-analytics", "averages", tier],
    queryFn: async ({ signal }) => ({ tier, averages: await getPriceAverages(tier, signal) }),
    staleTime: REFERENCE,
  });

export const loanDevicesQuery = queryOptions({
  queryKey: ["loans", "devices"],
  queryFn: () => getLoanDevices(),
  // Carries live availability, so it is workflow-fresh, not reference.
  staleTime: WORKFLOW,
});

// ---- what the viewer holds ---------------------------------------------

export const holdingsQuery = queryOptions({
  queryKey: ["holdings", "me"],
  queryFn: () => getMyHoldings(),
  staleTime: WORKFLOW,
});

// ---- what is physically at a site (stock keepers) ------------------------

export const stockAssetsQuery = (locationId: number) =>
  queryOptions({
    queryKey: ["stock", "assets", locationId],
    queryFn: () => getAssetsAtLocation(locationId),
    staleTime: WORKFLOW,
  });

/** Who keeps stock where, by location id. Admin-only on the server: Stock
 *  uses it to say whose site an admin is covering. */
export const stockKeepersQuery = queryOptions({
  queryKey: ["settings", "stock-keepers"],
  queryFn: async () => (await getStockKeepers()).config,
  staleTime: REFERENCE,
});

export const stockAccessoriesQuery = (locationId: number) =>
  queryOptions({
    queryKey: ["stock", "accessories", locationId],
    queryFn: () => getAccessoriesAtLocation(locationId),
    staleTime: WORKFLOW,
  });

// ---- Snipe-IT reference data -------------------------------------------

export const assetCategoriesQuery = queryOptions({
  queryKey: ["reference", "asset-categories"],
  queryFn: ({ signal }) => getAssetCategories(signal),
  staleTime: REFERENCE,
  gcTime: PERSISTED_GC,
});

export const allAssetCategoriesQuery = queryOptions({
  queryKey: ["reference", "asset-categories", "all"],
  queryFn: ({ signal }) => getAllAssetCategories(signal),
  staleTime: REFERENCE,
});

export const accessoryCategoriesForMeQuery = queryOptions({
  queryKey: ["reference", "accessory-categories", "for-me"],
  queryFn: () => getAccessoryCategoriesForMe(),
  staleTime: REFERENCE,
});

/** What one person's devices unlock (the accessory form, filing for anyone). */
export const accessoryCategoriesForUserQuery = (userId: string) =>
  queryOptions({
    queryKey: ["reference", "accessory-categories", "for-user", userId],
    queryFn: () => getAccessoryCategoriesForUser(userId),
    staleTime: REFERENCE,
  });

/** The named options configured for one accessory category. */
export const accessoryOptionsQuery = (categoryId: number) =>
  queryOptions({
    queryKey: ["settings", "accessories", "options", categoryId],
    queryFn: () => getAccessoryOptions(categoryId),
    staleTime: REFERENCE,
  });

/** The site-wide requestable whitelist (not what this viewer's devices unlock). */
export const requestableAccessoryCategoriesQuery = queryOptions({
  queryKey: ["reference", "accessory-categories", "requestable"],
  queryFn: () => getAccessoryCategories(),
  staleTime: REFERENCE,
});

export const allAccessoryCategoriesQuery = queryOptions({
  queryKey: ["reference", "accessory-categories", "all"],
  queryFn: () => getAllAccessoryCategories(),
  staleTime: REFERENCE,
});

export const accessorySettingsQuery = queryOptions({
  queryKey: ["settings", "accessories"],
  queryFn: () => getAccessorySettings(),
  staleTime: REFERENCE,
});

export const locationsQuery = queryOptions({
  queryKey: ["reference", "locations"],
  queryFn: ({ signal }) => getLocations(signal),
  staleTime: REFERENCE,
  gcTime: PERSISTED_GC,
});

export const companiesQuery = queryOptions({
  queryKey: ["reference", "companies"],
  queryFn: ({ signal }) => getCompanies(signal),
  staleTime: REFERENCE,
});

export const statusesQuery = queryOptions({
  queryKey: ["reference", "statuses"],
  queryFn: ({ signal }) => getStatuses(signal),
  staleTime: REFERENCE,
});

/** Admin-set dot colour per site (Snipe location id → "#rrggbb"). */
export const siteColoursQuery = queryOptions({
  queryKey: ["reference", "site-colours"],
  queryFn: () => getSiteColours(),
  staleTime: REFERENCE,
  gcTime: PERSISTED_GC,
});

/** Loanable devices and the longest loan, as Settings configures them. */
export const loanConfigQuery = queryOptions({
  queryKey: ["loans", "config"],
  queryFn: () => getLoanConfig(),
  staleTime: REFERENCE,
});

export const usersQuery = queryOptions({
  queryKey: ["reference", "users"],
  queryFn: ({ signal }) => fetchUsers(signal),
  staleTime: REFERENCE,
});

// ---- feature switches and per-session state ------------------------------

export const feedbackEnabledQuery = queryOptions({
  queryKey: ["feature", "feedback"],
  queryFn: async () => (await getFeedbackEnabled()).enabled,
  staleTime: SESSION,
});

export const tourStateQuery = queryOptions({
  queryKey: ["tours"],
  queryFn: () => getTourState(),
  staleTime: SESSION,
});

// ---- troubleshooting ------------------------------------------------------

// REFERENCE rather than SESSION because both are saved in the browser (see
// api/persist.ts): a saved copy is painted at once on the next visit, and a
// finite staleTime is what makes it revalidate behind that paint instead of
// being trusted for a day.

export const troubleshootingConfigQuery = queryOptions({
  queryKey: ["troubleshooting", "config"],
  queryFn: () => getTroubleshootingConfig(),
  staleTime: REFERENCE,
  gcTime: PERSISTED_GC,
});

export const troubleshootingSubjectsQuery = queryOptions({
  queryKey: ["troubleshooting", "subjects"],
  queryFn: () => getTroubleshootingSubjects(),
  staleTime: REFERENCE,
  gcTime: PERSISTED_GC,
});

/** Every subject's listed taxonomy and the "Most looked up" row, for the
 *  front page's search across the whole library. */
export const troubleshootingLibraryQuery = queryOptions({
  queryKey: ["troubleshooting", "library"],
  queryFn: () => getTroubleshootingLibrary(),
  staleTime: REFERENCE,
});

/** One symptom as readers see it: its article (or null), category and
 *  siblings. */
export const symptomQuery = (subjectKey: string, symptomId: string) =>
  queryOptions({
    queryKey: ["troubleshooting", "symptom", subjectKey, symptomId],
    queryFn: () => getSymptom(subjectKey, symptomId),
    staleTime: REFERENCE,
  });

/** A subject's list as an admin edits it: nothing filtered out. */
export const editableSubjectQuery = (subjectKey: string) =>
  queryOptions({
    queryKey: ["troubleshooting", "admin", "subject", subjectKey],
    queryFn: () => getEditableSubject(subjectKey),
  });
