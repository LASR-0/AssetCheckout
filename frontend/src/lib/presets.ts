///  +-----------------------------------------------------------------+
///  |                     THEME PRESETS                                |
///  +-----------------------------------------------------------------+
//
//  A preset is a set of palette overrides — a `[data-preset="…"]` block in
//  styles/palettes.css (and, until Phase 9, the old tokens' blocks in
//  styles/presets.css). This file is only the CATALOGUE: which ones exist,
//  what to call them, and what to show in the picker.
//
//  THE COLOURS LIVE IN CSS, NOT HERE. Two reasons. The cascade does the work:
//  a preset declares only what it changes and everything else falls through to
//  `:root` / `.dark`, so a re-brand is a dozen lines rather than 76. And the
//  cross-fade in theme-transition.ts reads COMPUTED values off the document,
//  so anything expressed as a CSS rule is picked up by it for free — a palette
//  held in JavaScript would have to be taught to it separately.
//
//  The picker draws a preset it isn't wearing from the CSS too: lib/palettes
//  reads the stylesheets' own text, so a card can't drift from the palette.
///  +-----------------------------------------------------------------+

export type PresetId = "default" | "ksb" | "grayscale" | "miramare";

export type Preset = {
  id: PresetId;
  label: string;
  /** What it looks like, for somebody choosing without trying each one. */
  description: string;
};

/**
 * Every preset, in the order the picker shows them.
 *
 * `default` is first and carries NO attribute — it is the palette the app has
 * always had, expressed as an entry so the picker can offer it as a choice
 * rather than as "none".
 */
export const PRESETS: Preset[] = [
  {
    id: "default",
    label: "Platinum",
    description: "Purple on a warm neutral ground",
  },
  {
    id: "ksb",
    label: "KSB",
    description: "Corporate blue, brand-only override",
  },
  {
    id: "grayscale",
    label: "Grayscale",
    description: "Near-monochrome, slate-teal accent",
  },
  {
    id: "miramare",
    label: "Miramare",
    description: "Sage on brown and cream, full ground",
  },
];

export const DEFAULT_PRESET: PresetId = "default";

/** Where the user's own choice is kept, alongside next-themes' own key. */
export const PRESET_STORAGE_KEY = "ui-preset";

/**
 * The last org default we were told about.
 *
 * Cached because it comes from the server and therefore arrives AFTER first
 * paint. The pre-paint script in index.html reads this to apply the right
 * palette immediately; the fetch only ever corrects it. Without the cache
 * every load would flash the built-in palette before settling.
 */
export const PRESET_DEFAULT_CACHE_KEY = "ui-preset-default";

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && PRESETS.some((p) => p.id === value);
}

export function findPreset(id: string | null | undefined): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0];
}
