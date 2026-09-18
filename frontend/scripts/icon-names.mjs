import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

///  +-----------------------------------------------------------------+
///  |            WHICH GLYPHS THIS APP ACTUALLY USES                  |
///  +-----------------------------------------------------------------+
//
//  Shared by the font builder and the test that guards it, so the two cannot
//  disagree about what "used" means — which is the only way the guard could
//  pass while the font is missing a glyph.
//
//  IT COLLECTS FAR MORE THAN IT NEEDS, ON PURPOSE. The first version of this
//  tried to be precise — it matched the ligature text of a span, and string
//  literals on a property called `icon` — and it was wrong in two ways that
//  both shipped:
//
//    * An expression child. `{isDark ? "dark_mode" : "light_mode"}` is the
//      commonest way an icon varies, and it is not a property called `icon`
//      and not literal ligature text. The nav's light_mode, the sort header's
//      unfold_more and the CSV button's download were all missed this way.
//    * A map whose KEY is the domain and whose value is the glyph, as in
//      lib/categoryIcon.ts: `outlook: "mail"`. Every troubleshooting app tile
//      came through one of those.
//
//  Both rendered as their own name — the word "light_mode" sitting in the
//  navbar — because these glyphs are addressed by ligature, so a missing one
//  shows the element's text rather than nothing.
//
//  SO THE RULE IS NOW THE DUMBEST ONE THAT CANNOT MISS: every string literal
//  and every bare JSX word in the package is a candidate, and
//  build-icon-font.mjs keeps whichever of them are real glyph names according
//  to the committed codepoint list. The asymmetry justifies it — a false
//  positive costs about a kilobyte of font, a false negative puts a word in
//  the UI — and it is immune to however the next icon gets written, which the
//  clever version was not.
//
//  It does mean the subset carries glyphs for words that merely COLLIDE with
//  icon names ("search" as a variable, "info" in a string). That is the price
//  of the guarantee, and it is a few dozen KB against the 3.98 MB full face.
///  +-----------------------------------------------------------------+

const here = path.dirname(fileURLToPath(import.meta.url));
export const SRC_DIR = path.resolve(here, "..", "src");

/** Anything in quotes: "download", 'mail', `sunny`. */
const QUOTED = /["'`]\s*([a-z][a-z0-9_]*)\s*["'`]/g;

/**
 * Bare ligature text sitting directly inside a Material Symbols span —
 * `<span className="material-symbols-outlined"> sunny </span>`, which is not
 * a string literal anywhere and so is invisible to QUOTED.
 */
const JSX_CHILD = /material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]*)\s*</g;

/**
 * String literals on something explicitly named `icon` — `icon="devices"`,
 * `icon: "mail"`.
 *
 * Unlike the candidates above, these are UNAMBIGUOUS: whoever wrote one meant
 * a glyph. So any that is not a real glyph name is a typo, and the font
 * builder cannot save it — it renders as its own text. `icon="Devices"` sat
 * in the requests table doing exactly that, capital D and all, long before
 * the font was ever subsetted. iconFont.test.ts checks these against the
 * codepoint list for that reason.
 */
const DECLARED_ICON = /\bicon(?:Name)?\s*[:=]\s*["'`]([A-Za-z][A-Za-z0-9_]*)["'`]/g;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every candidate glyph name referenced anywhere in src/, sorted.
 *
 * Candidates, not glyphs: the caller filters these against the real
 * Material Symbols name list. See the header for why that split is where the
 * safety comes from.
 */
export function collectIconNames() {
  const found = new Set();

  for (const file of walk(SRC_DIR)) {
    const source = readFileSync(file, "utf8");

    for (const [, name] of source.matchAll(QUOTED)) found.add(name);
    for (const [, name] of source.matchAll(JSX_CHILD)) found.add(name);
  }

  return [...found].sort();
}

/** Every name written as an explicit `icon` literal. See DECLARED_ICON. */
export function collectDeclaredIconNames() {
  const found = new Set();

  for (const file of walk(SRC_DIR)) {
    for (const [, name] of readFileSync(file, "utf8").matchAll(DECLARED_ICON)) {
      found.add(name);
    }
  }

  return [...found].sort();
}
