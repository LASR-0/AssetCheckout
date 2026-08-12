import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

///  +-----------------------------------------------------------------+
///  |            VIEW STATE ACROSS BACK NAVIGATION                    |
///  +-----------------------------------------------------------------+
//
//  Opening an article and pressing Back should return you to the page you
//  left — same categories expanded, same search, same scroll position — not
//  a freshly reset one. React unmounts the page component on every
//  navigation, so without this all of that is thrown away and coming back
//  feels like a reload.
//
//  KEYED ON THE HISTORY ENTRY, NOT ON THE URL. React Router gives every entry
//  in the history stack its own `location.key`, and Back returns you to the
//  entry you left, key and all. That one fact does all the work here:
//
//    * Back lands on the entry that saved a snapshot, finds it, and restores;
//    * clicking a link to the SAME url pushes a NEW entry with a new key,
//      finds nothing, and correctly starts fresh.
//
//  So there is no need to inspect the navigation type or infer intent — the
//  key IS the intent. Keying on the url instead would get the second case
//  wrong and drop somebody halfway down a page they had deliberately
//  navigated to from the top.
//
//  SESSION STORAGE rather than a module-level cache, so a snapshot survives
//  a reload of the tab, and per-tab rather than shared so two tabs don't
//  overwrite each other. Every access is wrapped in try/catch: storage throws
//  outright in some private modes and when quota is exceeded, and a page
//  failing to render because it could not remember a scroll position would be
//  a very poor trade.
//
//  RESTORING SCROLL IS THE PART THAT NEEDS CARE. The page is short until its
//  content arrives, and scrolling to 900px on a page currently 400px tall
//  does nothing at all — silently. Hence `ready`: the caller says when the
//  content that determines the page height has rendered, and only then does
//  the scroll happen.
//
//  KNOWN LIMIT: THE SNAPSHOT IS READ AT MOUNT. That covers the case this
//  exists for — into an article and back, where the page genuinely unmounts.
//  It does not cover going Back between two states of the SAME route, such as
//  picking Laptops, then Phones, then pressing Back: React keeps the
//  component mounted across that, so nothing re-reads and only the url is
//  restored. The device is right and the accordion is collapsed, which is a
//  reasonable page rather than a broken one. Fixing it properly means
//  re-seeding state when `location.key` changes without a remount; worth
//  doing if anyone actually notices, not before.
///  +-----------------------------------------------------------------+

const PREFIX = "ksb:view:";

type Snapshot<T> = { state: T; scrollY: number };

function storageKey(name: string, historyKey: string): string {
  return `${PREFIX}${name}:${historyKey}`;
}

/**
 * Read a saved snapshot, or null when this history entry has never been here.
 *
 * Synchronous and exported separately so it can seed `useState` initialisers
 * directly. Restoring expanded sections through an effect instead would
 * render the collapsed page first and then visibly snap open.
 */
export function readViewState<T>(name: string, historyKey: string): Snapshot<T> | null {
  try {
    const raw = sessionStorage.getItem(storageKey(name, historyKey));
    return raw ? (JSON.parse(raw) as Snapshot<T>) : null;
  } catch {
    // Unavailable, or corrupted by an older shape of this data. Either way
    // the page works fine without it.
    return null;
  }
}

/**
 * Seed state from the snapshot for this history entry.
 *
 * Returns the saved state once, at mount, or null. A hook rather than a bare
 * call so the read happens exactly once however often the page re-renders.
 */
export function useRestoredState<T>(name: string, historyKey: string): T | null {
  const [restored] = useState(() => readViewState<T>(name, historyKey)?.state ?? null);
  return restored;
}

/**
 * Keep this history entry's snapshot current, and restore its scroll position
 * once the page is tall enough to honour it.
 *
 * `state` is whatever the page wants back — it is serialised on every change,
 * so keep it small and JSON-safe.
 */
export function useViewState<T>(
  name: string,
  historyKey: string,
  state: T,
  ready: boolean
): void {
  const key = storageKey(name, historyKey);

  // Captured during the FIRST RENDER, before any effect below can overwrite
  // the stored snapshot with this fresh page's scroll position of zero.
  // `undefined` means "not read yet", `null` means "read, nothing to do".
  const pendingScroll = useRef<number | null | undefined>(undefined);
  if (pendingScroll.current === undefined) {
    pendingScroll.current = readViewState<T>(name, historyKey)?.scrollY ?? null;
  }

  // Latest state, so the scroll listener can persist the current value
  // without being torn down and re-registered on every keystroke.
  const stateRef = useRef(state);
  stateRef.current = state;

  const write = useCallback(
    (scrollY: number) => {
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({ state: stateRef.current, scrollY })
        );
      } catch {
        // Full, or blocked. Not worth surfacing.
      }
    },
    [key]
  );

  // Serialised rather than compared by reference: `state` is an object
  // literal built fresh on every render, so using it directly as a dependency
  // would write to storage on every render rather than on every change.
  const serialised = JSON.stringify(state);

  useEffect(() => {
    write(window.scrollY);
  }, [write, serialised]);

  // Keep the scroll position current as the page moves. Coalesced to one
  // write per frame — scroll fires far more often than storage should be
  // touched, and the last value in a frame is the only one that matters.
  useEffect(() => {
    let frame = 0;

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        write(window.scrollY);
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [write]);

  // Restore once, and only once the caller says the content has rendered.
  //
  // `done` is a separate flag from `pendingScroll` on purpose. Marking the
  // restore finished up front would break under StrictMode's deliberate
  // double-invocation in development: the first pass would scroll, schedule
  // the follow-up frame and then have it cancelled by its own cleanup, while
  // the second pass saw the target already cleared and skipped it. Clearing
  // only after the follow-up has actually run makes a cancelled pass a
  // genuine no-op that the next one repeats.
  const done = useRef(false);

  useLayoutEffect(() => {
    const target = pendingScroll.current;
    if (!ready || target == null || done.current) return;

    window.scrollTo(0, target);

    // Again on the next frame. Layout can settle a beat after the effect — a
    // font swapping, an image resolving — and if the first call already
    // landed the second is a no-op.
    const frame = requestAnimationFrame(() => {
      window.scrollTo(0, target);
      done.current = true;
      pendingScroll.current = null;
    });

    // Cancelled on unmount as well as on a re-run, so a pending frame can
    // never scroll the page that replaced this one.
    return () => cancelAnimationFrame(frame);
  }, [ready]);
}
