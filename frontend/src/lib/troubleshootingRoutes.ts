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

/**
 * Marks a navigation as "I came here from the symptom list".
 *
 * Set by the symptom links on the index and read by the article's own
 * "All symptoms" links and breadcrumb, which use it to go genuinely BACK
 * rather than pushing a fresh copy of the page the reader just left.
 *
 * It lives here with the route contract because it is part of that contract:
 * the link that sets it and the link that reads it are in different files,
 * and a typo between them would fail silently — the exact failure mode this
 * whole module exists to prevent.
 */
export const FROM_SYMPTOM_LIST = "fromSymptomList";

export type TroubleshootingLinkState = { [FROM_SYMPTOM_LIST]?: boolean };

/** Route patterns — these are what App.tsx registers. */
export const TROUBLESHOOTING_ROUTES = {
  index: "/troubleshooting",
  subject: "/troubleshooting/:subjectKey",
  article: "/troubleshooting/:subjectKey/:symptomId",
} as const;

export function troubleshootingIndexPath(): string {
  return TROUBLESHOOTING_ROUTES.index;
}

export function troubleshootingSubjectPath(subjectKey: string): string {
  return `/troubleshooting/${encodeURIComponent(subjectKey)}`;
}

export function troubleshootingArticlePath(
  subjectKey: string,
  symptomId: string
): string {
  return `/troubleshooting/${encodeURIComponent(subjectKey)}/${encodeURIComponent(symptomId)}`;
}

/** The id given to a step section, and the anchor the sidebar links to. */
export function stepAnchorId(index: number): string {
  return `step-${index + 1}`;
}

/**
 * Where to send someone who is looking at a specific holding.
 *
 * Straight to that device's symptoms when we have articles for it, and to
 * the plain index otherwise. Falling back rather than blocking is the point:
 * most categories have no content yet, so a "troubleshoot this" action that
 * only worked for phones would be a dead control almost everywhere. The
 * index at least shows them the picker and the support number.
 */
export function troubleshootingPathForCategory(
  subjects: { key: string; available: boolean; categoryIds: number[] }[],
  categoryId: number | null
): string {
  if (categoryId === null) return troubleshootingIndexPath();

  const match = subjects.find(
    (s) => s.available && s.categoryIds.includes(categoryId)
  );

  return match ? troubleshootingSubjectPath(match.key) : troubleshootingIndexPath();
}
