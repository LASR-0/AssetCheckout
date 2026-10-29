import type { FocusEvent, MouseEvent } from "react";
import { queryClient } from "@/api/queryClient";
import {
  accessoryCategoriesForMeQuery,
  assetCategoriesQuery,
  holdingsQuery,
  identityQuery,
  loanDevicesQuery,
  requestsQuery,
  troubleshootingConfigQuery,
  troubleshootingSubjectsQuery,
  usersQuery,
} from "@/api/queries";

///  +-----------------------------------------------------------------+
///  |                 WARM A PAGE BEFORE IT IS OPENED                 |
///  +-----------------------------------------------------------------+
//
//  Hovering or focusing a link is a strong hint of where somebody is going,
//  and usually a couple of hundred milliseconds ahead of the click. Starting
//  that page's queries then means it often renders with its data already
//  in hand. A prefetch of anything still fresh is a no-op, so hovering back
//  and forth costs nothing.
///  +-----------------------------------------------------------------+

const ROUTE_QUERIES = {
  "/": [requestsQuery, holdingsQuery, assetCategoriesQuery, accessoryCategoriesForMeQuery],
  "/assets": [usersQuery, assetCategoriesQuery],
  "/accessories": [usersQuery],
  "/loan": [usersQuery, loanDevicesQuery],
  "/requests": [requestsQuery],
  "/stock": [requestsQuery],
  "/troubleshooting": [troubleshootingConfigQuery, troubleshootingSubjectsQuery],
} as const;

export function prefetchRoute(path: string): void {
  // Everything here is the signed-in person's; nobody signed in, no hint.
  if (!queryClient.getQueryData(identityQuery.queryKey)?.name) return;
  const queries = ROUTE_QUERIES[path as keyof typeof ROUTE_QUERIES];
  // Each recipe has its own data type, which a loop over a mixed list
  // cannot keep; prefetchQuery only needs the shape every recipe shares.
  for (const q of queries ?? []) void queryClient.prefetchQuery(q as typeof requestsQuery);
}

/** For a container of links: onMouseOver and onFocus both bubble. */
export function prefetchFromLink(e: MouseEvent | FocusEvent): void {
  const href = (e.target as Element).closest?.("a[href]")?.getAttribute("href");
  if (href) prefetchRoute(href);
}
