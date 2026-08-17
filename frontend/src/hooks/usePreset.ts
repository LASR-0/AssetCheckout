import { useCallback, useEffect, useState } from "react";
import { resetPalettes } from "@/lib/theme-transition";
import {
  DEFAULT_PRESET,
  PRESET_DEFAULT_CACHE_KEY,
  PRESET_STORAGE_KEY,
  isPresetId,
  type PresetId,
} from "@/lib/presets";

///  +-----------------------------------------------------------------+
///  |            WHICH PALETTE THIS BROWSER IS WEARING                 |
///  +-----------------------------------------------------------------+
//
//  Presets sit alongside light/dark rather than replacing it: next-themes owns
//  the `.dark` class, this owns `data-preset`, and the two compose — every
//  preset defines both a light and a dark palette.
//
//  PRECEDENCE: the user's own choice, then the organisation's default, then
//  the built-in palette. The org default arrives from the server and therefore
//  AFTER first paint, so it is cached in localStorage and the pre-paint script
//  in index.html applies the cached value immediately. The fetch only ever
//  corrects it. Without that cache every load would show the built-in palette
//  for a frame before settling — the exact flash next-themes exists to avoid
//  for light and dark.
//
//  APPLYING A PRESET MUST INVALIDATE THE PALETTE CACHE. theme-transition.ts
//  reads the two palettes once and keeps them forever; if that cache survives
//  a preset change, the next light/dark toggle cross-fades toward the colours
//  of the preset you just left and then snaps. It looks like a rendering bug
//  and nothing points back here, which is why `resetPalettes()` is called on
//  every write rather than only when it seems necessary.
///  +-----------------------------------------------------------------+

/** Read the stored choice, tolerating anything that is not a preset we know. */
function storedPreset(): PresetId | null {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    return isPresetId(raw) ? raw : null;
  } catch {
    // Storage can be unavailable — private mode, blocked cookies. The app has
    // to work without a preference, it just cannot remember one.
    return null;
  }
}

function cachedDefault(): PresetId {
  try {
    const raw = localStorage.getItem(PRESET_DEFAULT_CACHE_KEY);
    return isPresetId(raw) ? raw : DEFAULT_PRESET;
  } catch {
    return DEFAULT_PRESET;
  }
}

/**
 * Put a preset on the document.
 *
 * The default carries NO attribute rather than `data-preset="default"` — the
 * default palette IS index.css, so there is no rule to match and an attribute
 * would only invite one to be written later.
 */
export function applyPreset(id: PresetId): void {
  const root = document.documentElement;

  if (id === DEFAULT_PRESET) root.removeAttribute("data-preset");
  else root.setAttribute("data-preset", id);

  resetPalettes();
}

/** As above, but suppressing transitions so the new palette arrives in one
 *  piece rather than in two waves — see `.preset-swapping` in presets.css. */
function swapPreset(id: PresetId): void {
  const root = document.documentElement;
  root.classList.add("preset-swapping");
  applyPreset(id);

  // Two frames: one for the browser to apply the new values with transitions
  // off, a second before allowing them again. Removing it in the same frame
  // is too early — the style recalculation has not happened yet and the
  // transitions come back in time to animate it after all.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove("preset-swapping"));
  });
}

/**
 * Ask the server what the organisation's default palette is, once, at boot.
 *
 * NOT A HOOK, and called from App rather than from the picker: the default has
 * to reach everybody, and the picker only mounts when somebody opens Settings.
 * A user who never visits that page would otherwise never see the org palette.
 *
 * Failure is silent by design. The worst case is the browser keeps whatever it
 * already had, which is a correct-looking app — surfacing a toast because a
 * colour preference could not be fetched would be noise about nothing.
 */
export async function syncOrgPreset(): Promise<void> {
  let preset: unknown;
  try {
    const res = await fetch("/api/settings/appearance", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return;
    preset = (await res.json())?.preset;
  } catch {
    return;
  }

  if (!isPresetId(preset)) return;

  try {
    localStorage.setItem(PRESET_DEFAULT_CACHE_KEY, preset);
  } catch {
    /* the cache only saves a flash on the NEXT load; this one is already fine */
  }

  // Only moves the page if nobody has chosen. An admin changing the default
  // must not overwrite a deliberate preference.
  if (storedPreset() === null) applyPreset(preset);
}

export function usePreset() {
  const [preset, setPresetState] = useState<PresetId>(
    () => storedPreset() ?? cachedDefault()
  );

  // Whether this browser has an explicit choice, as opposed to following the
  // organisation. The picker needs to say which, and "follow the default" has
  // to be a distinct option from "pick the same thing the default happens to
  // be" — otherwise changing the org default would not move anyone.
  const [isExplicit, setIsExplicit] = useState<boolean>(() => storedPreset() !== null);

  const setPreset = useCallback((id: PresetId) => {
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, id);
    } catch {
      // Not fatal — it applies for this session and is forgotten on reload.
    }
    setPresetState(id);
    setIsExplicit(true);
    swapPreset(id);
  }, []);

  const clearPreset = useCallback(() => {
    try {
      localStorage.removeItem(PRESET_STORAGE_KEY);
    } catch {
      /* nothing to clear */
    }
    const fallback = cachedDefault();
    setPresetState(fallback);
    setIsExplicit(false);
    swapPreset(fallback);
  }, []);

  /**
   * Record what the organisation's default is, from the server.
   *
   * Only moves the browser if the user has NOT chosen for themselves — an
   * admin changing the default should not overwrite somebody's deliberate
   * preference.
   */
  const setOrgDefault = useCallback(
    (id: PresetId) => {
      try {
        localStorage.setItem(PRESET_DEFAULT_CACHE_KEY, id);
      } catch {
        /* the cache is an optimisation, not a requirement */
      }

      if (storedPreset() === null) {
        setPresetState(id);
        applyPreset(id);
      }
    },
    []
  );

  // The attribute is set before React runs by the script in index.html; this
  // only keeps it honest if something else moved it, and covers the first
  // render in development where that script may not have run.
  useEffect(() => {
    applyPreset(preset);
  }, [preset]);

  return { preset, isExplicit, setPreset, clearPreset, setOrgDefault };
}
