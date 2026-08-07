///  +-----------------------------------------------------------------+
///  |                  TROUBLESHOOTING ROUTES                         |
///  +-----------------------------------------------------------------+
//
//  The patterns registered in App.tsx and the builders every link uses, in
//  one file so they cannot disagree.
//
//  WHY THIS EXISTS. In Phase 0 the accessory quick-select deep link broke
//  because a placeholder route constant was never reconciled with the route
//  actually registered — the link pointed somewhere nothing was mounted, and
//  nothing failed until a user clicked it. Deep links are most of the value
//  of putting articles on their own URLs, so the same mistake here would be
//  expensive and, again, silent.
//
//  Keeping the patterns beside the builders doesn't make that impossible,
//  but it does put the two things that must match on adjacent lines.
///  +-----------------------------------------------------------------+

/** Route patterns — these are what App.tsx registers. */
export const TROUBLESHOOTING_ROUTES = {
  index: "/troubleshooting",
  device: "/troubleshooting/:deviceKey",
  article: "/troubleshooting/:deviceKey/:symptomId",
} as const;

export function troubleshootingIndexPath(): string {
  return TROUBLESHOOTING_ROUTES.index;
}

export function troubleshootingDevicePath(deviceKey: string): string {
  return `/troubleshooting/${encodeURIComponent(deviceKey)}`;
}

export function troubleshootingArticlePath(
  deviceKey: string,
  symptomId: string
): string {
  return `/troubleshooting/${encodeURIComponent(deviceKey)}/${encodeURIComponent(symptomId)}`;
}

/** The id given to a step section, and the anchor the sidebar links to. */
export function stepAnchorId(index: number): string {
  return `step-${index + 1}`;
}
