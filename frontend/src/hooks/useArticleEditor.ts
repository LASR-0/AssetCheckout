import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  /**
   * Throw away unpublished changes.
   *
   * Resolves with `articleRemoved: true` when the article had never been
   * published — the server removes it outright, so the caller must leave edit
   * mode rather than reload something that no longer exists.
   */
  discard: () => Promise<{ articleRemoved: boolean }>;
  reload: () => Promise<void>;
};

export function useArticleEditor(
  subjectKey: string | undefined,
  symptomId: string | undefined,
  enabled: boolean
): ArticleEditor {
  // The editable copy comes through the query cache, so a publish or a
  // discard (which invalidate "troubleshooting") reloads it on their own.
  // Never refetched on focus: re-seeding mid-sentence would reset the field
  // under the cursor. Draft saves and uploads don't invalidate it either.
  const query = useQuery({
    queryKey: ["troubleshooting", "admin", "article", subjectKey, symptomId],
    queryFn: () => getEditableArticle(subjectKey!, symptomId!),
    enabled: enabled && !!subjectKey && !!symptomId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const article = query.data ?? null;
  const loading = query.isFetching;

  const [working, setWorking] = useState<ArticleBody | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "clean" });
  const [publishing, setPublishing] = useState(false);
  const [issues, setIssues] = useState<ContentIssue[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Seed the working copy whenever a fresh copy arrives, during render
  // rather than in an effect, so there's no frame showing the old one.
  // Resume the draft if there is one — see the header.
  const [seeded, setSeeded] = useState<EditableArticle | null | undefined>(undefined);
  if (query.data !== undefined && query.data !== seeded) {
    setSeeded(query.data);
    setWorking(query.data ? (query.data.draft ?? query.data.published) : null);
    setHasDraft(Boolean(query.data?.draft));
    setSaveState({ kind: "clean" });
  }

  const timer = useRef<number | null>(null);
  const pending = useRef<ArticleBody | null>(null);

  const load = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const publishedAt = article?.publishedAt;

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
        publishedAt
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
  }, [subjectKey, symptomId, publishedAt]);

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
        setWarnings([]);

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
      // The publish invalidated the cache, which reloads the copy; the
      // warnings are kept until the next edit.
      setWarnings(result.warnings);
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
  }, [subjectKey, symptomId, flush]);

  const discard = useCallback(async (): Promise<{ articleRemoved: boolean }> => {
    if (!subjectKey || !symptomId) return { articleRemoved: false };

    if (timer.current) window.clearTimeout(timer.current);
    pending.current = null;

    const { articleRemoved } = await discardArticleDraft(subjectKey, symptomId);

    // An article that was never published is removed outright rather than
    // emptied, so there is nothing left to reload — reloading would show the
    // "not written yet" state under an editor that is still open.
    if (articleRemoved) {
      setWorking(null);
      setHasDraft(false);
      setSaveState({ kind: "clean" });
      setIssues([]);
      setWarnings([]);
      return { articleRemoved: true };
    }

    return { articleRemoved: false };
  }, [subjectKey, symptomId]);

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
