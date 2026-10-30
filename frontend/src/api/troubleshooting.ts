import { apiFetch, ApiError, type ApiFetchOptions } from "@/api/client";
import { invalidate } from "@/api/queryClient";
import type {
  ArticleBody,
  ContentHealth,
  ContentIssue,
  EditableArticle,
  EditableCategory,
  SlugPreview,
  SupportMessageDraft,
  SymptomLink,
  DeletedSymptom,
  PublishResult,
  UploadedImage,
  SubjectPickerTile,
  TroubleshootingLibrary,
  SymptomResponse,
  TroubleshootingConfig,
} from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                    TROUBLESHOOTING API                          |
///  +-----------------------------------------------------------------+
//
//  Read-only. Troubleshooting writes nothing — not to the request workflow,
//  not to Snipe — so there is no mutation here and won't be until the
//  instrumentation in a later increment.
//
//  Symptom search runs in the browser over the whole library, fetched once
//  (getTroubleshootingLibrary): a few hundred short labels, so filtering them
//  is instant and costs no round trip per search.
///  +-----------------------------------------------------------------+

export async function getTroubleshootingConfig(): Promise<TroubleshootingConfig> {
  return apiFetch<TroubleshootingConfig>("/api/troubleshooting/config");
}

export async function getTroubleshootingSubjects(): Promise<SubjectPickerTile[]> {
  const res = await apiFetch<{ subjects: SubjectPickerTile[] }>(
    "/api/troubleshooting/subjects"
  );
  return res.subjects;
}

export async function getTroubleshootingLibrary(): Promise<TroubleshootingLibrary> {
  return apiFetch<TroubleshootingLibrary>("/api/troubleshooting/library");
}

export async function getSymptom(
  subjectKey: string,
  symptomId: string
): Promise<SymptomResponse> {
  return apiFetch<SymptomResponse>(
    `/api/troubleshooting/subjects/${encodeURIComponent(subjectKey)}` +
      `/symptoms/${encodeURIComponent(symptomId)}`
  );
}

///  +-----------------------------------------------------------------+
///  |                    ANALYTICS (admin)                            |
///  +-----------------------------------------------------------------+
//
//  Recording events is deliberately NOT here — see lib/troubleshootingAnalytics,
//  which posts directly rather than through apiFetch. That path must never
//  throw and never block a page render, which is the opposite of what
//  apiFetch is built to do.

export type ArticleStat = {
  subjectKey: string;
  symptomId: string;
  label: string;
  opens: number;
  escapes: number;
  deepestStep: number | null;
};

export type NoMatchSearch = {
  query: string;
  count: number;
  lastSearchedAt: string;
};

export type AnalyticsSummary = {
  enabled: boolean;
  totals: {
    articlesOpened: number;
    stepsReached: number;
    escapesTaken: number;
    searchesWithNoMatch: number;
    sessionsWithArticle: number;
    sessionsWithEscape: number;
  };
  articles: ArticleStat[];
  noMatchSearches: NoMatchSearch[];
  escapesByControl: { detail: string; count: number }[];
};

export async function getTroubleshootingAnalytics(
  days: number
): Promise<AnalyticsSummary> {
  return apiFetch<AnalyticsSummary>(`/api/troubleshooting/analytics?days=${days}`);
}

export async function setTroubleshootingAnalyticsEnabled(
  enabled: boolean
): Promise<void> {
  await apiFetch("/api/troubleshooting/analytics/enabled", {
    method: "POST",
    body: { enabled },
  });
}

///  +-----------------------------------------------------------------+
///  |                    ADMIN EDITING (admin only)                   |
///  +-----------------------------------------------------------------+
//
//  The header at the top of this file used to say troubleshooting writes
//  nothing. That stopped being true when the library moved into the database
//  and admins gained an editor; everything below is that editor's half.
//
//  All of it 403s for anyone who isn't an admin — the guard is server-side at
//  the router, so hiding the buttons is a courtesy rather than the control.
//
//  Errors carry `details` when the server rejected specific fields: a zod
//  failure, or the publish gate naming which branch dead-ends. apiFetch only
//  surfaces `error`, so these use a wrapper that keeps them.

/** An error from the admin API that names specific problems. */
export class ContentApiError extends ApiError {
  issues: ContentIssue[];

  constructor(err: ApiError) {
    super(err.message, err.status, err.body);
    this.name = "ContentApiError";
    this.issues = Array.isArray(err.body?.details) ? (err.body.details as ContentIssue[]) : [];
  }
}

const ADMIN = "/api/troubleshooting/admin";

/**
 * Like apiFetch, but keeps the `details` array.
 *
 * The publish gate's whole value is telling you WHICH branch dead-ends and
 * under which subject; collapsing that to a single message would make the
 * error true and useless.
 */
async function adminFetch<T>(
  path: string,
  init: ApiFetchOptions = {},
  { invalidates = true }: { invalidates?: boolean } = {}
): Promise<T> {
  let result: T;
  try {
    result = ((await apiFetch<T>(path, init)) ?? {}) as T;
  } catch (err) {
    throw err instanceof ApiError ? new ContentApiError(err) : err;
  }
  // Any edit can change what readers see: the subject tiles, the config.
  // A draft save is the exception — readers never see a draft, and refetching
  // the library on every pause in typing would be pure waste.
  if (invalidates && init.method && init.method !== "GET") await invalidate(["troubleshooting"]);
  return result;
}

export async function getEditableSubject(subjectKey: string): Promise<EditableCategory[]> {
  const res = await adminFetch<{ categories: EditableCategory[] }>(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}`
  );
  return res.categories;
}

export async function getEditableArticle(
  subjectKey: string,
  symptomId: string
): Promise<EditableArticle | null> {
  const res = await adminFetch<{ article: EditableArticle | null }>(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}`
  );
  return res.article;
}

export async function saveArticleDraft(
  subjectKey: string,
  symptomId: string,
  body: ArticleBody,
  expectedPublishedAt?: string
): Promise<{ draftUpdatedAt: string }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}/draft`,
    { method: "PUT", body: { body, expectedPublishedAt } },
    { invalidates: false }
  );
}

/**
 * Throw away unpublished changes.
 *
 * `articleRemoved` comes back true when the article had never been published:
 * the server removes it entirely rather than leaving a row with no body and no
 * draft, which nothing could open again. The caller has to stop showing an
 * editor for something that no longer exists.
 */
export async function discardArticleDraft(
  subjectKey: string,
  symptomId: string
): Promise<{ articleRemoved: boolean }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}/draft`,
    { method: "DELETE" }
  );
}

export async function publishArticle(
  subjectKey: string,
  symptomId: string
): Promise<PublishResult> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}/publish`,
    { method: "POST" }
  );
}

export async function setSymptomHidden(
  subjectKey: string,
  symptomId: string,
  hidden: boolean
): Promise<{ hidden: boolean; subjectKeys: string[] }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}/hidden`,
    { method: "POST", body: { hidden } }
  );
}

export async function setSymptomLabel(
  subjectKey: string,
  symptomId: string,
  label: string
): Promise<{ label: string }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}/label`,
    { method: "POST", body: { label } }
  );
}

export async function setCategoryDisabled(
  subjectKey: string,
  categoryId: string,
  disabled: boolean
): Promise<{ disabled: boolean; symptomCount: number }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/categories/${encodeURIComponent(categoryId)}/disabled`,
    { method: "POST", body: { disabled } }
  );
}

export async function setCategoryText(
  subjectKey: string,
  categoryId: string,
  fields: { name?: string; blurb?: string; glyph?: string }
): Promise<{ name: string; blurb: string; glyph: string }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/categories/${encodeURIComponent(categoryId)}/text`,
    { method: "POST", body: fields }
  );
}

/**
 * Upload a screenshot, and its dark twin when there is one.
 *
 * Both variants go in ONE request so the pair shares a minted base name and
 * cannot drift apart — `srcDark` depends on that pairing.
 */
export async function uploadTroubleshootingImage(
  subjectKey: string,
  symptomId: string,
  payload: { name: string; light: string; dark?: string }
): Promise<UploadedImage> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}/images`,
    {
      method: "POST",
      body: {
        name: payload.name,
        light: { base64: payload.light },
        ...(payload.dark ? { dark: { base64: payload.dark } } : {}),
      },
    },
    // Nothing a reader sees changes until the figure is saved and published.
    { invalidates: false }
  );
}

export async function getContentHealth(): Promise<ContentHealth> {
  return adminFetch(`${ADMIN}/health`);
}

/// ── Creating ─────────────────────────────────────────────────────────────
//
//  A symptom and its article are created separately, because a symptom with
//  no article is a real and deliberate state: it renders as Draft, which makes
//  a gap in the library visible rather than silent. Ten shipped symptoms are
//  exactly that today, and this is how one of them gets written.

/**
 * What the address for this label would be, before anything is created.
 *
 * The slug is a URL, a branch target and an analytics key, and it can never be
 * changed afterwards. Showing it while the label is still being typed is the
 * whole reason this endpoint exists.
 */
export async function previewSymptomSlug(
  subjectKey: string,
  label: string
): Promise<SlugPreview> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/slug-preview` +
      `?label=${encodeURIComponent(label)}`
  );
}

export async function createSymptom(
  subjectKey: string,
  categoryId: string,
  label: string
): Promise<{ symptomId: string; label: string }> {
  return adminFetch(`${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms`, {
    method: "POST",
    body: { categoryId, label },
  });
}

/** Start an article for a symptom that has none. Created unpublished. */
export async function createArticleDraft(
  subjectKey: string,
  symptomId: string
): Promise<{ symptomId: string; draftUpdatedAt: string }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/` +
      `${encodeURIComponent(symptomId)}/article`,
    { method: "POST" }
  );
}

export async function createCategory(
  subjectKey: string,
  input: { name: string; glyph: string; blurb: string }
): Promise<{ categoryId: string; name: string }> {
  return adminFetch(`${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/categories`, {
    method: "POST",
    body: input,
  });
}

/// ── Reordering ───────────────────────────────────────────────────────────
//
//  Both return the full new order rather than an acknowledgement, so the list
//  re-renders from what the server actually did instead of from what the UI
//  assumed it would do. At the ends of a list that is the unchanged order,
//  which is why neither of these is an error.

export async function moveCategory(
  subjectKey: string,
  categoryId: string,
  direction: "up" | "down"
): Promise<{ order: string[] }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/categories/` +
      `${encodeURIComponent(categoryId)}/move`,
    { method: "POST", body: { direction } }
  );
}

export async function moveSymptom(
  subjectKey: string,
  categoryId: string,
  symptomId: string,
  direction: "up" | "down"
): Promise<{ order: string[] }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/categories/` +
      `${encodeURIComponent(categoryId)}/symptoms/${encodeURIComponent(symptomId)}/move`,
    { method: "POST", body: { direction } }
  );
}

/// ── Deleting ─────────────────────────────────────────────────────────────
//
//  Asked BEFORE offering to delete, so the consequences are on screen while
//  the decision is being made. The server checks again on the way through —
//  a UI that asks nicely is not a constraint, and content changes underneath.

/** Every branch button pointing at this symptom, published or draft. */
export async function getSymptomLinks(
  subjectKey: string,
  symptomId: string
): Promise<SymptomLink[]> {
  const res = await adminFetch<{ links: SymptomLink[] }>(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/` +
      `${encodeURIComponent(symptomId)}/links`
  );
  return res.links;
}

/**
 * Delete a symptom and its article.
 *
 * Throws a 409 listing what would break unless `force` is set. The article is
 * archived first — it can be recovered from `backend/content-archive/` after
 * the next export.
 */
export async function deleteSymptom(
  subjectKey: string,
  symptomId: string,
  options: { force?: boolean; reason?: string } = {}
): Promise<DeletedSymptom> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/symptoms/${encodeURIComponent(symptomId)}`,
    { method: "DELETE", body: { force: options.force ?? false, reason: options.reason } }
  );
}

/**
 * Remove an empty category.
 *
 * Refuses with a 409 listing what is still inside. Emptying it first is
 * deliberate: removing each symptom runs its own link check, so branch buttons
 * pointing into the category surface one at a time rather than breaking all at
 * once. To take a populated category off the site, disable it instead.
 */
export async function deleteCategory(
  subjectKey: string,
  categoryId: string
): Promise<{ categoryId: string; name: string }> {
  return adminFetch(
    `${ADMIN}/subjects/${encodeURIComponent(subjectKey)}/categories/${encodeURIComponent(categoryId)}`,
    { method: "DELETE" }
  );
}

/**
 * Compose the message somebody sends when the article did not fix it.
 *
 * Server-side because the template is a database setting and the step titles
 * carry {device} tokens the repository resolves at serve time. Nothing is
 * stored and nothing is sent — the user posts it themselves from Teams.
 */
export async function composeSupportMessage(
  subjectKey: string,
  symptomId: string,
  input: { stepsTried: number[]; notes: string }
): Promise<SupportMessageDraft> {
  return apiFetch(
    `/api/troubleshooting/subjects/${encodeURIComponent(subjectKey)}/symptoms/` +
      `${encodeURIComponent(symptomId)}/support-message`,
    // `body` is stringified by apiFetch — passing a string here would
    // send a JSON-encoded JSON string and the server would reject it.
    { method: "POST", body: input }
  );
}

/**
 * Compose a message from the front page, where there is no article: a search
 * that found nothing, or a subject with nothing written. Same rules as above —
 * composed on the server, never sent.
 */
export async function composeGeneralSupportMessage(input: {
  query: string;
  subjectKey: string | null;
  notes: string;
}): Promise<SupportMessageDraft> {
  return apiFetch("/api/troubleshooting/support-message", { method: "POST", body: input });
}
