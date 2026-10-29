///  +-----------------------------------------------------------------+
///  |                 WHERE EACH PAGE'S CODE COMES FROM               |
///  +-----------------------------------------------------------------+
//
//  Every page is its own chunk, loaded when first visited, so the first
//  paint carries only the shell and the page in front of you rather than the
//  whole app (the single bundle was 1.3 MB). The loaders live here, apart
//  from App, so a nav link can start fetching a page's code on hover
//  (api/prefetch.ts) through the same import that App renders.
///  +-----------------------------------------------------------------+

export const pages = {
  home: () => import("@/pages/Home"),
  assets: () => import("@/pages/RequestFormPage"),
  accessories: () => import("@/pages/AccessoryFormPage"),
  loan: () => import("@/pages/LoanFormPage"),
  success: () => import("@/pages/SuccessRedirect"),
  requests: () => import("@/pages/RequestsPage"),
  stock: () => import("@/pages/StockPage"),
  settings: () => import("@/pages/SettingsPage"),
  feedback: () => import("@/pages/FeedbackPage"),
  troubleshooting: () => import("@/pages/TroubleshootingPage"),
  troubleshootingArticle: () => import("@/pages/TroubleshootingArticlePage"),
  noAccess: () => import("@/pages/NoAccessPage"),
  notFound: () => import("@/pages/NotFoundPage"),
};

/** A nav destination's page loader, for preloading on intent. */
export const PAGE_FOR_PATH: Record<string, () => Promise<unknown>> = {
  "/": pages.home,
  "/assets": pages.assets,
  "/accessories": pages.accessories,
  "/loan": pages.loan,
  "/requests": pages.requests,
  "/stock": pages.stock,
  "/settings": pages.settings,
  "/feedback": pages.feedback,
  "/troubleshooting": pages.troubleshooting,
};
