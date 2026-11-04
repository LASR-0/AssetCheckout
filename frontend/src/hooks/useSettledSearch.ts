import { useEffect, useState } from "react";

/**
 * A search box's text once typing pauses, for filtering a list.
 *
 * The box itself stays on the live text; the list waits for a pause, so it
 * re-filters (and its rows cascade in again) once per search rather than
 * once per keystroke. Clearing applies at once: an emptied box shouldn't
 * leave the old results up for a beat.
 */
export function useSettledSearch(text: string, ms = 250): string {
  const [settled, setSettled] = useState(text);
  const cleared = text.trim() === "";
  useEffect(() => {
    if (cleared) return;
    const t = window.setTimeout(() => setSettled(text), ms);
    return () => window.clearTimeout(t);
  }, [text, cleared, ms]);
  return cleared ? "" : settled;
}
