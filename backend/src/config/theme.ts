///  +-----------------------------------------------------------------+
///  |                  THE ORGANISATION'S PALETTE                     |
///  +-----------------------------------------------------------------+
//
//  Which theme preset people get before they choose one for themselves. Env
//  rather than a database setting for the same reason as SUPPORT_PHONE: it is
//  a property of the deployment, changes about never, and putting it in the
//  Settings UI would buy an editing screen for a value nobody edits.
//
//  A DEFAULT, NOT A POLICY. Anyone who picks a palette in their own settings
//  keeps it; this only decides what an untouched browser shows. If it ever
//  needs to be enforced rather than defaulted, that is a different feature and
//  should look different — a locked setting, not a silent override.
//
//  UNSET IS THE NORMAL CASE and falls back to the built-in palette, so a
//  deployment that never thinks about this gets exactly what it got before
//  presets existed.
///  +-----------------------------------------------------------------+

/**
 * The presets that exist, mirroring `frontend/src/lib/presets.ts`.
 *
 * Duplicated across the package boundary rather than shared, which is the same
 * trade the subject keys make: a build-time dependency between the two
 * packages costs more than a list of two strings that changes when somebody
 * designs a palette. The validation below is what stops the copies drifting
 * silently — a name that exists in only one of them is refused out loud.
 */
const KNOWN_PRESETS = ["default", "ksb", "grayscale", "miramare"] as const;

export type ThemePreset = (typeof KNOWN_PRESETS)[number];

export const DEFAULT_THEME_PRESET: ThemePreset = "default";

/**
 * The configured preset, or the built-in palette.
 *
 * An unrecognised name warns and falls back rather than throwing. A wrong
 * palette is a cosmetic problem and taking the whole app down over one would
 * be a worse trade — the same reasoning as the support number. But it warns,
 * because the alternative is somebody setting `THEME_PRESET=greyscale` and
 * quietly getting the default forever.
 */
export function getThemePreset(): ThemePreset {
  const raw = process.env.THEME_PRESET?.trim();
  if (!raw) return DEFAULT_THEME_PRESET;

  if (!(KNOWN_PRESETS as readonly string[]).includes(raw)) {
    console.warn(
      `[theme] THEME_PRESET is "${raw}", which is not a known preset ` +
        `(${KNOWN_PRESETS.join(", ")}). Falling back to "${DEFAULT_THEME_PRESET}".`
    );
    return DEFAULT_THEME_PRESET;
  }

  return raw as ThemePreset;
}
