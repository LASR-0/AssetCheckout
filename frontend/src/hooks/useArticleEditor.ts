import { useCallback, useEffect, useRef, useState } from "react";
import {
  ContentApiError,
  discardArticleDraft,
  getEditableArticle,
  publishArticle,
  saveArticleDraft,
} from "@/api/troubleshooting";
import type {
  ArticleBody,
  ContentIssue,
  EditableArticle,
} from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                  EDITING ONE ARTICLE                            |
///  +-----------------------------------------------------------------+
//
//  Owns the working copy, the autosave, and the publish cycle.
//
//  AUTOSAVE, SO THERE IS NO SAVE BUTTON. Three states — unsaved, saved as a
//  draft, published — is one more than anyone can hold in their head while
//  also writing. Typing goes to the draft on its own after a pause, and the
//  only deliberate actions left are Publish and Discard, which are the two
//  that actually mean something.
//
//  A DRAFT IS INVISIBLE TO READERS, which is what makes autosaving safe. If
//  saving put text live this would be reckless; because it doesn't, the worst
//  an autosave can do is record work in progress, which is what you wanted.
//
//  THE WORKING COPY IS `draft ?? published`. Opening an article that already
//  has unpublished changes resumes them rather than silently starting again
//  from the live text and discarding whatever was there.
///  +-----------------------------------------------------------------+

const AUTOSAVE_DELAY_MS = 900;

export type SaveState =
  | { kind: "clean" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

export type ArticleEditor = {
  loading: boolean;
  /** Null when this symptom has no article yet. */
  article: EditableArticle | null;
  /** The text being edited. Raw — {device} tokens intact. */
  working: ArticleBody | null;
  /** True when there are changes the published article doesn't have. */
  hasDraft: boolean;
  saveState: SaveState;
  publishing: boolean;
  /** What the publish gate refused, cleared on the next edit. */
  issues: ContentIssue[];
  /** Published anyway, but worth seeing. */
  warnings: string[];
  update: (mutate: (body: ArticleBody) => ArticleBody) => void;
  publish: () => Promise<boolean>;
  discard: () => Promise<void>;
  reload: () => Promise<void>;
};

export function useArticleEditor(
  subjectKey: string | undefined,
  symptomId: string | undefined,
  enabled: boolean
): ArticleEditor {
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<EditableArticle | null>(null);
  const [working, setWorking] = useState<ArticleBody | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "clean" });
  const [publishing, setPublishing] = useState(false);
  const [issues, setIssues] = useState<ContentIssue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  const timer = useRef<number | null>(null);
  const pending = useRef<ArticleBody | null>(null);

  const load = useCallback(async () => {
    if (!subjectKey || !symptomId) return;

    setLoading(true);
    try {
      const loaded = await getEditableArticle(subjectKey, symptomId);
      setArticle(loaded);
      // Resume the draft if there is one — see the header.
      setWorking(loaded ? (loaded.draft ?? loaded.published) : null);
      setHasDraft(Boolean(loaded?.draft));
      setSaveState({ kind: "clean" });
      setIssues([]);
      setWarnings([]);
    } catch (err) {
      setSaveState({
        kind: "error",
        message: err instanceof Error ? err.message : "Couldn't load this article",
      });
    } finally {
      setLoading(false);
    }
  }, [subjectKey, symptomId]);

  // Load on entering edit mode, and clear everything on leaving it so the
  // next article never opens showing the last one's state.
  useEffect(() => {
    if (!enabled) {
      setArticle(null);
      setWorking(null);
      setIssues([]);
      setWarnings([]);
      setSaveState({ kind: "clean" });
      return;
    }
    void load();
  }, [enabled, load]);

  const flush = useCallback(async () => {
    const body = pending.current;
    if (!body || !subjectKey || !symptomId) return;
    pending.current = null;

    setSaveState({ kind: "saving" });
    try {
      // expectedPublishedAt guards against this article having been published
      // from another tab since it was opened — losing an afternoon of edits to
      // your own stale tab is a miserable way to discover there was no check.
      const res = await saveArticleDraft(
        subjectKey,
        symptomId,
        body,
        article?.publishedAt
      );
      setHasDraft(true);
      setSaveState({ kind: "saved", at: res.draftUpdatedAt });
    } catch (err) {
      setSaveState({
        kind: "error",
        message:
          err instanceof ContentApiError
            ? err.message
            : "Couldn't save — your changes are still on screen.",
      });
      if (err instanceof ContentApiError && err.issues.length > 0) {
        setIssues(err.issues);
      }
    }
  }, [subjectKey, symptomId, article?.publishedAt]);

  const update = useCallback(
    (mutate: (body: ArticleBody) => ArticleBody) => {
      setWorking((current) => {
        if (!current) return current;
        const next = mutate(current);
        pending.current = next;

        setSaveState({ kind: "dirty" });
        // A new edit means the last publish refusal is about text that no
        // longer exists, so it stops being shown.
        setIssues([]);

        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);

        return next;
      });
    },
    [flush]
  );

  // Don't lose the last few keystrokes to leaving the page.
  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pending.current) void flush();
    };
  }, [flush]);

  const publish = useCallback(async () => {
    if (!subjectKey || !symptomId) return false;

    // Anything still in the debounce has to land first, or Publish would
    // promote the previous save and silently drop the newest edit.
    if (timer.current) window.clearTimeout(timer.current);
    if (pending.current) await flush();

    setPublishing(true);
    setIssues([]);
    try {
      const result = await publishArticle(subjectKey, symptomId);
      setWarnings(result.warnings);
      await load();
      return true;
    } catch (err) {
      if (err instanceof ContentApiError) {
        setIssues(
          err.issues.length > 0 ? err.issues : [{ path: "", message: err.message }]
        );
      } else {
        setIssues([
          { path: "", message: err instanceof Error ? err.message : "Couldn't publish" },
        ]);
      }
      return false;
    } finally {
      setPublishing(false);
    }
  }, [subjectKey, symptomId, flush, load]);

  const discard = useCallback(async () => {
    if (!subjectKey || !symptomId) return;

    if (timer.current) window.clearTimeout(timer.current);
    pending.current = null;

    await discardArticleDraft(subjectKey, symptomId);
    await load();
  }, [subjectKey, symptomId, load]);

  return {
    loading,
    article,
    working,
    hasDraft,
    saveState,
    publishing,
    issues,
    warnings,
    update,
    publish,
    discard,
    reload: load,
  };
}
