import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";
import type { Query } from "@tanstack/react-query";
import {
  assetCategoriesQuery,
  locationsQuery,
  troubleshootingConfigQuery,
  troubleshootingSubjectsQuery,
  PERSISTED_GC,
} from "@/api/queries";

///  +-----------------------------------------------------------------+
///  |              WHAT THE BROWSER KEEPS BETWEEN VISITS              |
///  +-----------------------------------------------------------------+
//
//  A short allowlist of reference data that is the same for everybody and
//  changes rarely. On a return visit it paints at once from localStorage,
//  then revalidates in the background like any stale query.
//
//  NEVER WORKFLOW STATE. Requests, holdings, stock and counts are not here:
//  painting yesterday's queue, even for a moment, invites somebody to act
//  on it. Nor is anything per-person (identity, the user directory), so a
//  shared machine never shows one person another's data.
//
//  The saved copy is dropped after a day, and on every new build, so a
//  change to a payload's shape never meets an old copy.
///  +-----------------------------------------------------------------+

const PERSISTED = new Set(
  [assetCategoriesQuery, locationsQuery, troubleshootingConfigQuery, troubleshootingSubjectsQuery].map((q) =>
    JSON.stringify(q.queryKey)
  )
);

function shouldPersist(query: Query): boolean {
  return query.state.status === "success" && PERSISTED.has(JSON.stringify(query.queryKey));
}

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister: createSyncStoragePersister({
    storage: typeof window === "undefined" ? undefined : window.localStorage,
    key: "checkout-query-cache",
  }),
  maxAge: PERSISTED_GC,
  buster: __BUILD_ID__,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};
