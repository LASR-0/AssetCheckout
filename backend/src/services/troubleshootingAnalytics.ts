import { prisma } from "../db/prisma.js";
import { getSetting } from "./settings.js";
import { troubleshootingRepository } from "../content/troubleshooting/index.js";

///  +-----------------------------------------------------------------+
///  |               TROUBLESHOOTING ANALYTICS                         |
///  +-----------------------------------------------------------------+
//
//  Recording what the troubleshooting library is actually doing, and reading
//  it back for the settings card.
//
//  The pilot's question is deflection: do these articles stop tickets, or do
//  people read four steps and ring IT anyway? Totals alone can't answer that
//  — you need to know the escapes came from the same visits as the opens —
//  which is what the per-visit session id is for. It identifies nobody.
///  +-----------------------------------------------------------------+

export const EVENT_TYPES = [
  "ARTICLE_OPENED",
  "STEP_REACHED",
  "ESCAPE_TAKEN",
  "SEARCH_NO_MATCH",
] as const;

export type TroubleshootingEventType = (typeof EVENT_TYPES)[number];

export function isEventType(value: unknown): value is TroubleshootingEventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

export async function analyticsEnabled(): Promise<boolean> {
  return (await getSetting("troubleshooting_analytics_enabled")) === "true";
}

/// ── Recording ────────────────────────────────────────────────────────────

export type RecordEventInput = {
  type: TroubleshootingEventType;
  sessionId: string;
  subjectKey?: string | null;
  symptomId?: string | null;
  stepNumber?: number | null;
  query?: string | null;
  detail?: string | null;
};

/** Free text is capped before it reaches the database. A search box is an
 *  open input on an unauthenticated-ish path, and there is no reason to store
 *  more than a search's worth of it. */
const MAX_QUERY = 200;
const MAX_FIELD = 100;

const clamp = (value: string | null | undefined, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

export async function recordEvent(input: RecordEventInput): Promise<void> {
  await prisma.troubleshootingEvent.create({
    data: {
      type: input.type,
      sessionId: input.sessionId.slice(0, MAX_FIELD),
      subjectKey: clamp(input.subjectKey, MAX_FIELD),
      symptomId: clamp(input.symptomId, MAX_FIELD),
      stepNumber:
        typeof input.stepNumber === "number" && Number.isFinite(input.stepNumber)
          ? Math.trunc(input.stepNumber)
          : null,
      query: clamp(input.query, MAX_QUERY),
      detail: clamp(input.detail, MAX_FIELD),
    },
  });
}

/// ── Reading ──────────────────────────────────────────────────────────────

export type ArticleStat = {
  subjectKey: string;
  symptomId: string;
  /** The symptom's human label, resolved from the content library. */
  label: string;
  opens: number;
  /** Distinct visits that opened this article AND then escaped. */
  escapes: number;
  /** Furthest step reached, averaged over visits that reached any step. */
  deepestStep: number | null;
};

export type NoMatchSearch = {
  query: string;
  count: number;
  lastSearchedAt: Date;
};

export type AnalyticsSummary = {
  enabled: boolean;
  totals: {
    articlesOpened: number;
    stepsReached: number;
    escapesTaken: number;
    searchesWithNoMatch: number;
    /** Visits that opened at least one article. The deflection denominator. */
    sessionsWithArticle: number;
    /** Of those, how many also escaped. */
    sessionsWithEscape: number;
  };
  articles: ArticleStat[];
  noMatchSearches: NoMatchSearch[];
  escapesByControl: { detail: string; count: number }[];
};

/**
 * Everything the settings card shows, in one query pass.
 *
 * Deliberately computed here rather than in SQL views: the volume is a few
 * thousand rows a year at 300 staff, so correctness and legibility are worth
 * more than the query plan. If this ever gets slow the shape is already right
 * to push down into groupBy.
 */
export async function getAnalyticsSummary(sinceDays: number): Promise<AnalyticsSummary> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const events = await prisma.troubleshootingEvent.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
  });

  const totals = {
    articlesOpened: 0,
    stepsReached: 0,
    escapesTaken: 0,
    searchesWithNoMatch: 0,
    sessionsWithArticle: 0,
    sessionsWithEscape: 0,
  };

  // Per-article accumulators, keyed device/symptom.
  const articles = new Map<
    string,
    {
      subjectKey: string;
      symptomId: string;
      opens: number;
      sessions: Set<string>;
      /** Furthest step this session got to, per session. */
      deepestBySession: Map<string, number>;
    }
  >();

  const searches = new Map<string, { count: number; lastSearchedAt: Date }>();
  const escapeControls = new Map<string, number>();

  const sessionsWithArticle = new Set<string>();
  const sessionsWithEscape = new Set<string>();

  for (const event of events) {
    const articleKey =
      event.subjectKey && event.symptomId ? `${event.subjectKey}/${event.symptomId}` : null;

    const article = articleKey
      ? articles.get(articleKey) ??
        (articles
          .set(articleKey, {
            subjectKey: event.subjectKey!,
            symptomId: event.symptomId!,
            opens: 0,
            sessions: new Set(),
            deepestBySession: new Map(),
          })
          .get(articleKey)!)
      : null;

    switch (event.type) {
      case "ARTICLE_OPENED":
        totals.articlesOpened++;
        sessionsWithArticle.add(event.sessionId);
        if (article) {
          article.opens++;
          article.sessions.add(event.sessionId);
        }
        break;

      case "STEP_REACHED":
        totals.stepsReached++;
        if (article && typeof event.stepNumber === "number") {
          const current = article.deepestBySession.get(event.sessionId) ?? 0;
          if (event.stepNumber > current) {
            article.deepestBySession.set(event.sessionId, event.stepNumber);
          }
        }
        break;

      case "ESCAPE_TAKEN": {
        totals.escapesTaken++;
        sessionsWithEscape.add(event.sessionId);
        const control = event.detail ?? "unknown";
        escapeControls.set(control, (escapeControls.get(control) ?? 0) + 1);
        break;
      }

      case "SEARCH_NO_MATCH": {
        totals.searchesWithNoMatch++;
        if (!event.query) break;
        // Case-folded so "wifi" and "WiFi" are one row — the point is what
        // people are asking for, not how they capitalised it.
        const key = event.query.toLowerCase();
        const existing = searches.get(key);
        if (existing) {
          existing.count++;
          if (event.createdAt > existing.lastSearchedAt) {
            existing.lastSearchedAt = event.createdAt;
          }
        } else {
          searches.set(key, { count: 1, lastSearchedAt: event.createdAt });
        }
        break;
      }
    }
  }

  totals.sessionsWithArticle = sessionsWithArticle.size;
  // Only escapes from visits that actually read something — an escape with no
  // article behind it isn't a failed article, it's someone who came for the
  // phone number.
  totals.sessionsWithEscape = [...sessionsWithEscape].filter((s) =>
    sessionsWithArticle.has(s)
  ).length;

  return {
    enabled: await analyticsEnabled(),
    totals,
    articles: [...articles.values()]
      .map((a) => {
        const depths = [...a.deepestBySession.values()];
        return {
          subjectKey: a.subjectKey,
          symptomId: a.symptomId,
          label: labelFor(a.subjectKey, a.symptomId),
          opens: a.opens,
          escapes: [...a.sessions].filter((s) => sessionsWithEscape.has(s)).length,
          deepestStep: depths.length
            ? Math.round((depths.reduce((n, d) => n + d, 0) / depths.length) * 10) / 10
            : null,
        };
      })
      .filter((a) => a.opens > 0)
      .sort((a, b) => b.opens - a.opens),
    noMatchSearches: [...searches.entries()]
      .map(([query, v]) => ({ query, ...v }))
      .sort((a, b) => b.count - a.count || +b.lastSearchedAt - +a.lastSearchedAt),
    escapesByControl: [...escapeControls.entries()]
      .map(([detail, count]) => ({ detail, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/** The symptom's label from the content library, falling back to its id —
 *  an article can be renamed or removed after its events were recorded, and
 *  the history shouldn't vanish because the content moved on. */
function labelFor(subjectKey: string, symptomId: string): string {
  const category = troubleshootingRepository
    .getSubjectCategories(subjectKey)
    .find((c) => c.symptoms.some((s) => s.id === symptomId));

  return category?.symptoms.find((s) => s.id === symptomId)?.label ?? symptomId;
}

/// ── Retention ────────────────────────────────────────────────────────────

export async function purgeOldEvents(retentionDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const { count } = await prisma.troubleshootingEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return count;
}
