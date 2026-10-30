///  +-----------------------------------------------------------------+
///  |                     THEME PRESETS                                |
///  +-----------------------------------------------------------------+
//
//  A preset is a set of palette overrides — a `[data-preset="…"]` block in
//  styles/presets.css. This file is only the CATALOGUE: which ones exist, what
//  to call them, and what to show in the picker.
//
//  THE COLOURS LIVE IN CSS, NOT HERE. Two reasons. The cascade does the work:
//  a preset declares only what it changes and everything else falls through to
//  `:root` / `.dark`, so a re-brand is a dozen lines rather than 76. And the
//  cross-fade in theme-transition.ts reads COMPUTED values off the document,
//  so anything expressed as a CSS rule is picked up by it for free — a palette
//  held in JavaScript would have to be taught to it separately.
//
//  The swatches below are the exception, and they are duplicated on purpose:
//  the picker has to draw a preset it is not currently wearing, and there is
//  no way to read another rule's values without applying it. Three colours per
//  preset, kept in step with the CSS by hand — a mismatch is cosmetic, which
//  is the right cost for not building a CSSOM reader.
///  +-----------------------------------------------------------------+

export type PresetId = "default" | "ksb" | "grayscale" | "miramare";

export type Preset = {
  id: PresetId;
  label: string;
  /** What it looks like, for somebody choosing without trying each one. */
  description: string;
  /** Brand, surface and accent, in that order. CSS colours, for the swatch. */
  swatch: [string, string, string];
  /**
   * The Appearance card's strip: canvas, tray, sheet, text, brand, then the
   * three intents, in light and dark. Data for a preview, not styling; it
   * moves to the real tokens when the palettes are adapted (Phase 8.5).
   */
  bands: { light: string[]; dark: string[] };
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
    swatch: ["rgb(173, 70, 255)", "rgb(253, 248, 249)", "rgb(137, 37, 177)"],
    bands: {
      light: ["#F6F4F0", "#EBE7E0", "#FFFFFF", "#1F1C18", "#7E22CE", "#1D6B38", "#8A4F00", "#AE2A20"],
      dark: ["#161418", "#252128", "#1F1C22", "#F2EEE8", "#C084FC", "#86D7A1", "#F1C46E", "#F59D92"],
    },
  },
  {
    id: "ksb",
    label: "KSB",
    description: "Corporate blue, brand-only override",
    swatch: ["rgb(14, 116, 190)", "rgb(247, 250, 252)", "rgb(11, 94, 155)"],
    bands: {
      light: ["#F4F5F7", "#E6E9EE", "#FFFFFF", "#1F1C18", "#0E74BE", "#1D6B38", "#8A4F00", "#AE2A20"],
      dark: ["#13161B", "#20242B", "#1B1F25", "#F2EEE8", "#5AACE8", "#86D7A1", "#F1C46E", "#F59D92"],
    },
  },
  {
    id: "grayscale",
    label: "Grayscale",
    description: "Near-monochrome, slate-teal accent",
    swatch: ["rgb(55, 90, 96)", "rgb(250, 250, 249)", "rgb(38, 70, 76)"],
    bands: {
      light: ["#F5F5F5", "#E8E8E8", "#FFFFFF", "#1A1A1A", "#375A60", "#1D6B38", "#8A4F00", "#AE2A20"],
      dark: ["#141414", "#212121", "#1C1C1C", "#EDEDED", "#86AEB4", "#86D7A1", "#F1C46E", "#F59D92"],
    },
  },
  {
    id: "miramare",
    label: "Miramare",
    description: "Sage on brown and cream, full ground",
    swatch: ["rgb(78, 122, 78)", "rgb(245, 237, 222)", "rgb(62, 100, 62)"],
    bands: {
      light: ["#F1ECE2", "#E4DCCD", "#FBF8F2", "#2A241C", "#4E7A4E", "#2F6B2C", "#8A4F00", "#AE2A20"],
      dark: ["#28231E", "#352F28", "#312B25", "#E8DBC4", "#93B88F", "#BCD58F", "#EBAE69", "#E8937F"],
    },
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
