import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "@/api/client";

///  +-----------------------------------------------------------------+
///  |                     THE SHARED QUERY CACHE                      |
///  +-----------------------------------------------------------------+
//
//  One cache for the whole app. A component asks for data by key (see
//  api/queries.ts); if another component already asked, it gets the cached
//  copy instead of a second request. Freshness is per resource, set by each
//  query's staleTime. This default covers anything that doesn't say: the
//  workflow rhythm of 30 seconds, revalidated when the window regains focus.
//
//  RETRIES. A 4xx is an answer (no permission, not found, bad input), and
//  asking again gets the same answer, so it is never retried. Anything else
//  (a network blip, a 5xx while Snipe-IT restarts) gets one more try.
//
//  Exported as a module-level instance, not just through the provider,
//  because a few callers live outside React: the dev user switcher resets
//  it, and the old event-style helpers in useActionCounts invalidate
//  through it.
///  +-----------------------------------------------------------------+

function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: shouldRetry,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Mark cached reads stale after a write that changes them. Those on screen
 * refetch at once; the rest refetch when next shown.
 */
export async function invalidate(...keys: QueryKey[]): Promise<void> {
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
