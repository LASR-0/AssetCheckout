import { describe, it, expect, vi, beforeEach } from "vitest";

///  +-----------------------------------------------------------------+
///  |            TROUBLESHOOTING ANALYTICS — AGGREGATION              |
///  +-----------------------------------------------------------------+
//
//  The summary is the only place in this feature where numbers are DERIVED
//  rather than stored, and a wrong derivation here is worse than no data:
//  the whole point of the pilot is deciding whether to keep writing articles,
//  and that decision is made from these figures.
//
//  The deflection rate is the one to get right. It has to count VISITS, not
//  events — one person reading an article three times and then ringing IT is
//  one failure, not three — and it must ignore escapes from visits that never
//  read anything, which are people who came straight for the phone number.
///  +-----------------------------------------------------------------+

const findMany = vi.fn();

vi.mock("../db/prisma.js", () => ({
  prisma: {
    troubleshootingEvent: {
      findMany: () => findMany(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("./settings.js", () => ({
  getSetting: async () => "true",
}));

const { getAnalyticsSummary } = await import("./troubleshootingAnalytics.js");

type Ev = Record<string, unknown>;

const event = (type: string, sessionId: string, extra: Ev = {}): Ev => ({
  type,
  sessionId,
  subjectKey: null,
  symptomId: null,
  stepNumber: null,
  query: null,
  detail: null,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  ...extra,
});

const article = { subjectKey: "phone", symptomId: "wifi" };

beforeEach(() => findMany.mockReset());

describe("deflection rate", () => {
  it("counts visits rather than events", async () => {
    // One visit, three opens of the same article, one escape. That is one
    // person the article failed — not three.
    findMany.mockResolvedValue([
      event("ARTICLE_OPENED", "s1", article),
      event("ARTICLE_OPENED", "s1", article),
      event("ARTICLE_OPENED", "s1", article),
      event("ESCAPE_TAKEN", "s1", { ...article, detail: "teams_call" }),
    ]);

    const { totals } = await getAnalyticsSummary(90);

    expect(totals.articlesOpened).toBe(3);
    expect(totals.sessionsWithArticle).toBe(1);
    expect(totals.sessionsWithEscape).toBe(1);
  });

  ///  Someone who lands on the index and rings IT without reading anything
  ///  has not been failed by an article, and counting them would make a
  ///  perfectly good library look broken.
  it("ignores escapes from visits that never opened an article", async () => {
    findMany.mockResolvedValue([
      event("ARTICLE_OPENED", "reader", article),
      event("ESCAPE_TAKEN", "passer-by", { detail: "nothing_worked" }),
    ]);

    const { totals } = await getAnalyticsSummary(90);

    expect(totals.sessionsWithArticle).toBe(1);
    expect(totals.sessionsWithEscape).toBe(0);
    // The raw count still reflects reality; only the rate excludes it.
    expect(totals.escapesTaken).toBe(1);
  });

  it("separates two readers who both escaped from one who read twice", async () => {
    findMany.mockResolvedValue([
      event("ARTICLE_OPENED", "a", article),
      event("ESCAPE_TAKEN", "a", { ...article, detail: "teams_call" }),
      event("ARTICLE_OPENED", "b", article),
      event("ESCAPE_TAKEN", "b", { ...article, detail: "nothing_worked" }),
      event("ARTICLE_OPENED", "c", article),
    ]);

    const { totals } = await getAnalyticsSummary(90);

    expect(totals.sessionsWithArticle).toBe(3);
    expect(totals.sessionsWithEscape).toBe(2);
  });
});

describe("per-article stats", () => {
  it("averages the furthest step each visit reached, not every step seen", async () => {
    // One visit that scrolled steps 1..4, another that stopped at 2.
    // Furthest-per-visit is 4 and 2, so the average is 3 — whereas averaging
    // all six step events would give 2.
    findMany.mockResolvedValue([
      event("ARTICLE_OPENED", "deep", article),
      ...[1, 2, 3, 4].map((n) =>
        event("STEP_REACHED", "deep", { ...article, stepNumber: n })
      ),
      event("ARTICLE_OPENED", "shallow", article),
      ...[1, 2].map((n) =>
        event("STEP_REACHED", "shallow", { ...article, stepNumber: n })
      ),
    ]);

    const { articles } = await getAnalyticsSummary(90);

    expect(articles).toHaveLength(1);
    expect(articles[0].deepestStep).toBe(3);
  });

  it("attributes escapes to the articles the escaping visit read", async () => {
    findMany.mockResolvedValue([
      event("ARTICLE_OPENED", "s1", { subjectKey: "phone", symptomId: "wifi" }),
      event("ARTICLE_OPENED", "s2", { subjectKey: "phone", symptomId: "portal" }),
      event("ESCAPE_TAKEN", "s1", { detail: "teams_call" }),
    ]);

    const { articles } = await getAnalyticsSummary(90);
    const byId = Object.fromEntries(articles.map((a) => [a.symptomId, a]));

    expect(byId.wifi.escapes).toBe(1);
    expect(byId.portal.escapes).toBe(0);
  });

  it("falls back to the symptom id when the content no longer has a label", async () => {
    findMany.mockResolvedValue([
      event("ARTICLE_OPENED", "s1", { subjectKey: "phone", symptomId: "since-deleted" }),
    ]);

    const { articles } = await getAnalyticsSummary(90);

    // History must survive the content moving on.
    expect(articles[0].label).toBe("since-deleted");
  });

  it("resolves the label from the content library when it exists", async () => {
    findMany.mockResolvedValue([event("ARTICLE_OPENED", "s1", article)]);

    const { articles } = await getAnalyticsSummary(90);

    expect(articles[0].label).toBe("Won't connect to KSB Wi-Fi");
  });
});

describe("no-match searches", () => {
  it("folds case so one phrasing isn't split across rows", async () => {
    findMany.mockResolvedValue([
      event("SEARCH_NO_MATCH", "s1", { query: "Bluetooth" }),
      event("SEARCH_NO_MATCH", "s2", { query: "bluetooth" }),
      event("SEARCH_NO_MATCH", "s3", { query: "BLUETOOTH" }),
    ]);

    const { noMatchSearches } = await getAnalyticsSummary(90);

    expect(noMatchSearches).toHaveLength(1);
    expect(noMatchSearches[0].count).toBe(3);
  });

  it("ranks by how many people asked", async () => {
    findMany.mockResolvedValue([
      event("SEARCH_NO_MATCH", "s1", { query: "rare" }),
      event("SEARCH_NO_MATCH", "s2", { query: "common" }),
      event("SEARCH_NO_MATCH", "s3", { query: "common" }),
    ]);

    const { noMatchSearches } = await getAnalyticsSummary(90);

    expect(noMatchSearches.map((s) => s.query)).toEqual(["common", "rare"]);
  });
});

describe("escape controls", () => {
  it("keeps the two escape routes apart", async () => {
    findMany.mockResolvedValue([
      event("ESCAPE_TAKEN", "s1", { detail: "teams_call" }),
      event("ESCAPE_TAKEN", "s2", { detail: "teams_call" }),
      event("ESCAPE_TAKEN", "s3", { detail: "nothing_worked" }),
    ]);

    const { escapesByControl } = await getAnalyticsSummary(90);

    expect(escapesByControl).toEqual([
      { detail: "teams_call", count: 2 },
      { detail: "nothing_worked", count: 1 },
    ]);
  });
});

describe("empty state", () => {
  it("reports zeroes rather than dividing by zero", async () => {
    findMany.mockResolvedValue([]);

    const summary = await getAnalyticsSummary(90);

    expect(summary.totals.sessionsWithArticle).toBe(0);
    expect(summary.articles).toEqual([]);
    expect(summary.noMatchSearches).toEqual([]);
  });
});
