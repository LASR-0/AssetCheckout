import tokensCss from "@/styles/tokens.css?raw";
import palettesCss from "@/styles/palettes.css?raw";
import type { PresetId } from "@/lib/presets";

///  +-----------------------------------------------------------------+
///  |                  A PALETTE'S COLOURS, FROM ITS CSS               |
///  +-----------------------------------------------------------------+
//
//  The resolved token values for any palette in either mode, read from the
//  stylesheets themselves: Platinum from tokens.css, then the palette's own
//  blocks from palettes.css, layered the way the browser layers them (in
//  dark mode the light block still applies, then the dark block on top).
//
//  One reader for two jobs, so neither can drift from what's on screen: the
//  contrast test checks every palette in both modes, and the Appearance
//  cards draw their strips from it.
///  +-----------------------------------------------------------------+

export type Mode = "light" | "dark";

/** The `--name: #hex` declarations in the first block for `selector`. */
function block(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]]));
}

/** The palette from the two stylesheets' text. Pure, so the contrast test
 *  can hand it the files from disk (Vitest stubs CSS imports out). */
export function resolvePalette(tokens: string, palettes: string, id: PresetId, mode: Mode): Record<string, string> {
  const base = block(tokens, mode === "dark" ? ".dark" : ":root");
  if (id === "default") return base;
  return {
    ...base,
    ...block(palettes, `[data-preset="${id}"]`),
    ...(mode === "dark" ? block(palettes, `[data-preset="${id}"].dark`) : {}),
  };
}

export function palette(id: PresetId, mode: Mode): Record<string, string> {
  return resolvePalette(tokensCss, palettesCss, id, mode);
}
