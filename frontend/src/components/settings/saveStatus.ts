import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { Tone } from "./parts";

///  +-----------------------------------------------------------------+
///  |                  HOW SAVING WORKS, IN ONE PLACE                 |
///  +-----------------------------------------------------------------+
//
//  Settings has one save model, stated once in its sidebar:
//
//    - a single setting saves the moment it changes (or when you leave the
//      field), and says so beside itself: Saving…, Saved, Didn't save;
//    - an editor that opens on the right holds its edits until Save changes.
//
//  This is the first half. Every immediate save goes through `save(key, fn)`,
//  so the row that made it and the page header both read the same status,
//  and a failed save can be retried from either.
///  +-----------------------------------------------------------------+

export type SaveState = {
  key: string;
  state: "saving" | "saved" | "failed";
  /** When it saved, for the header: "All changes saved · 2:14 pm". */
  at?: string;
  message?: string;
};

export type SaveApi = {
  status: SaveState | null;
  /** Run one save, tracked under `key`. Resolves true when it saved. */
  save: (key: string, fn: () => Promise<unknown>) => Promise<boolean>;
  /** Run the last failed save again. */
  retry: () => void;
};

export const SaveContext = createContext<SaveApi | null>(null);

export function useSave(): SaveApi {
  const api = useContext(SaveContext);
  if (!api) throw new Error("useSave must be used inside the settings page");
  return api;
}

/** The store itself, owned by the settings page. */
export function useSaveStore(): SaveApi {
  const [status, setStatus] = useState<SaveState | null>(null);
  const last = useRef<{ key: string; fn: () => Promise<unknown> } | null>(null);

  const save = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    last.current = { key, fn };
    setStatus({ key, state: "saving" });
    try {
      await fn();
      setStatus({ key, state: "saved", at: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) });
      return true;
    } catch (err) {
      setStatus({ key, state: "failed", message: err instanceof Error ? err.message : undefined });
      return false;
    }
  }, []);

  const retry = useCallback(() => {
    if (last.current) void save(last.current.key, last.current.fn);
  }, [save]);

  return { status, save, retry };
}

/** The panel's chip for a draft that's clean, dirty, saving or failed. */
export function draftChip(state: "idle" | "saving" | "failed", dirty: boolean): { tone: Tone; icon: string; text: string } {
  if (state === "saving") return { tone: "neut", icon: "hourglass_top", text: "Saving…" };
  if (state === "failed") return { tone: "stop", icon: "error", text: "Not saved" };
  if (dirty) return { tone: "prog", icon: "edit", text: "Unsaved" };
  return { tone: "ok", icon: "check", text: "Saved" };
}

///  ── Where a section's panel goes ─────────────────────────────────────
//
//  The page owns the column the panel sits in (or slides over); a section
//  owns the panel's content and drafts. The section portals its panel into
//  the page's slot, so both can be true.

export type PanelHost = {
  slot: HTMLElement | null;
  layout: "docked" | "float" | "phone";
};

export const PanelHostContext = createContext<PanelHost>({ slot: null, layout: "phone" });

export function usePanelHost(): PanelHost {
  return useContext(PanelHostContext);
}
