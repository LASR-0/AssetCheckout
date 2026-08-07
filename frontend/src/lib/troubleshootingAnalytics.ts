import { getDevHeaders } from "@/api/client";

///  +-----------------------------------------------------------------+
///  |              TROUBLESHOOTING EVENT TRACKING                     |
///  +-----------------------------------------------------------------+
//
//  Fire-and-forget usage events. Four of them, each answering a question the
//  pilot has to be able to answer:
//
//    ARTICLE_OPENED   which articles anyone actually reads
//    STEP_REACHED     how far in people get before giving up
//    ESCAPE_TAKEN     how often an article failed and they contacted IT
//    SEARCH_NO_MATCH  what people looked for and didn't find
//
//  ANONYMOUS. No name, no email. The session id below is random, lives in
//  sessionStorage, and dies with the tab. It exists so events from one visit
//  can be tied together — the deflection rate is "of the visits that opened
//  an article, how many escaped", and that is unanswerable from totals. It
//  identifies nobody.
//
//  NOTHING HERE MAY THROW. Every call is wrapped and swallowed. This page is
//  where somebody lands when their device is already broken; an analytics
//  failure breaking it on top of that would be indefensible, and there is no
//  recovery the user could take part in anyway.
///  +-----------------------------------------------------------------+

const SESSION_KEY = "troubleshooting-session";

/**
 * A random per-visit id.
 *
 * sessionStorage rather than localStorage on purpose: localStorage would
 * persist across visits and slowly become a stable pseudo-identifier for a
 * person, which is exactly what this is meant not to be. Per-tab and
 * discarded on close is the whole intent.
 */
function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;

    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing or a blocked storage API. A per-call id means the
    // totals stay right and only the session correlation is lost, which is a
    // better failure than dropping the event.
    return "ephemeral";
  }
}

export type TroubleshootingEvent =
  | { type: "ARTICLE_OPENED"; subjectKey: string; symptomId: string }
  | { type: "STEP_REACHED"; subjectKey: string; symptomId: string; stepNumber: number }
  | {
      type: "ESCAPE_TAKEN";
      subjectKey?: string | null;
      symptomId?: string | null;
      /** Which control was used — "nothing_worked" or "teams_call". */
      detail: string;
    }
  | { type: "SEARCH_NO_MATCH"; query: string; subjectKey?: string | null };

/**
 * Record an event. Never awaited by callers, never throws, never blocks.
 *
 * keepalive lets the request survive the page being navigated away from,
 * which matters for the escape events specifically: pressing "call in Teams"
 * hands the browser to another app, and without it the write is cancelled in
 * flight — losing exactly the event we most wanted.
 */
export function trackTroubleshooting(event: TroubleshootingEvent): void {
  try {
    void fetch("/api/troubleshooting/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getDevHeaders() },
      body: JSON.stringify({ ...event, sessionId: sessionId() }),
      keepalive: true,
    }).catch(() => {
      // Swallowed deliberately — see the header note.
    });
  } catch {
    // Same.
  }
}
