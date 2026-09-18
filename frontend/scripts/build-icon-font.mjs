import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectIconNames, collectDeclaredIconNames } from "./icon-names.mjs";

///  +-----------------------------------------------------------------+
///  |        BUILDING A 40KB ICON FONT INSTEAD OF A 4MB ONE           |
///  +-----------------------------------------------------------------+
//
//  Run with `pnpm run icons` after adding or removing an icon. Commits its
//  output; the Docker build does NOT run this, on purpose -- see below.
//
//  WHY THIS EXISTS. The app used to pull Material Symbols straight from
//  fonts.googleapis.com. That stylesheet resolves to a 3.98 MB woff2 -- the
//  entire 4,284-glyph library, to draw the ~140 icons this app uses. Two
//  round trips to a third party before a single icon could paint, and until
//  the font landed every icon rendered as its own ligature TEXT: the literal
//  words "error", "close", "content_copy" laid out in the UI. That is the
//  "scrappy" first second, and it is not a caching problem -- a cold visitor
//  has nothing to cache.
//
//  WHAT IT DOES. Scans the source for the glyphs actually referenced, asks
//  Google for a subset containing only those, and writes the font into the
//  repo. Vite then fingerprints it like any other asset, so it is served from
//  our own origin under an immutable cache header.
//
//  THE AXES ARE KEPT. The subset request repeats the full
//  opsz,wght,FILL,GRAD range rather than pinning a static instance, because
//  index.css animates 'FILL' 0->1 on hover and a static subset would freeze
//  that. It costs very little: the weight is in the glyph count, not the axes.
//
//  IT IS NOT PART OF THE DOCKER BUILD, deliberately. A production image that
//  reaches out to Google mid-build fails whenever Google is unreachable or
//  the network is locked down, and it would make two builds of the same commit
//  produce different bytes. The font is a committed artifact; this script
//  regenerates it, and icon-font.test.ts fails the suite if somebody adds an
//  icon and forgets to.
///  +-----------------------------------------------------------------+

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.resolve(here, "..", "src", "assets", "fonts");
const CSS_OUT = path.resolve(here, "..", "src", "styles", "material-symbols.css");
const MANIFEST_OUT = path.resolve(here, "material-symbols.manifest.json");
const FONT_OUT = path.join(FONT_DIR, "material-symbols-subset.woff2");

/**
 * The axis range, repeated verbatim from what index.html used to request.
 * Changing it changes what the glyphs can do, not just their size.
 */
const AXES = "opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";

// Google serves a different (static, legacy) face to clients it does not
// recognise as supporting variable woff2, and would answer a bare script with
// one. Asking as a browser is what gets the variable font the CSS expects.
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** The 4,284 real glyph names, committed beside this script. */
export function knownIconNames() {
  const raw = readFileSync(path.join(here, "material-symbols.codepoints"), "utf8");
  return new Set(raw.split("\n").map((line) => line.split(" ")[0]).filter(Boolean));
}

/**
 * The icons to ship.
 *
 * The scanner over-collects (see icon-names.mjs), so this is where a match
 * that was never an icon -- a `called` caught from `onCalled`, a capitalised
 * component name -- is dropped. Filtering here rather than in the scanner is
 * what lets the guard test share the scanner and still agree with the font.
 */
export function resolveIconNames() {
  const known = knownIconNames();
  const scanned = collectIconNames();

  return {
    used: scanned.filter((name) => known.has(name)),
    ignored: scanned.filter((name) => !known.has(name)),
    // Written as an icon but not a glyph: a typo, not a filtering decision.
    // Nothing here can be fixed by rebuilding the font.
    misspelled: collectDeclaredIconNames().filter((name) => !known.has(name)),
  };
}

async function main() {
  const { used, ignored, misspelled } = resolveIconNames();

  console.log(`[icons] ${used.length} glyphs in use`);
  if (misspelled.length) {
    // Loud, because the subset cannot help: these render as their own text.
    console.warn(`[icons] NOT REAL GLYPHS, will render as words: ${misspelled.join(", ")}`);
  }
  if (ignored.length) {
    console.log(`[icons] ignored ${ignored.length} non-glyph matches: ${ignored.join(", ")}`);
  }

  const cssUrl =
    `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:${AXES}` +
    `&icon_names=${used.join(",")}&display=block`;

  const cssRes = await fetch(cssUrl, { headers: { "User-Agent": UA } });
  if (!cssRes.ok) throw new Error(`Google returned ${cssRes.status} for the subset stylesheet`);

  const css = await cssRes.text();
  const fontUrl = css.match(/url\(([^)]+)\)/)?.[1];
  if (!fontUrl) throw new Error("No font URL in the stylesheet Google returned");

  const fontRes = await fetch(fontUrl, { headers: { "User-Agent": UA } });
  if (!fontRes.ok) throw new Error(`Google returned ${fontRes.status} for the font file`);

  const font = Buffer.from(await fontRes.arrayBuffer());

  // A subset of ~140 glyphs lands around 40 KB. Anything near the full 3.98 MB
  // library means icon_names was ignored and we are about to commit the very
  // thing this script exists to avoid.
  if (font.byteLength > 500_000) {
    throw new Error(
      `Refusing to write a ${(font.byteLength / 1e6).toFixed(1)} MB font — ` +
        `the subset request did not take effect.`
    );
  }

  mkdirSync(FONT_DIR, { recursive: true });
  writeFileSync(FONT_OUT, font);

  writeFileSync(
    CSS_OUT,
    `/*
 * GENERATED BY scripts/build-icon-font.mjs — do not edit by hand.
 *
 * Run \`pnpm run icons\` to regenerate after adding or removing an icon.
 * icon-font.test.ts fails the suite if this drifts from what the source uses.
 *
 * Contains ${used.length} of the 4,284 Material Symbols glyphs, which is the
 * difference between ${(font.byteLength / 1024).toFixed(0)} KB and 3.98 MB.
 */

@font-face {
  font-family: 'Material Symbols Outlined';
  font-style: normal;
  font-weight: 100 700;
  /*
   * block, not swap. These glyphs are addressed by LIGATURE — the element's
   * text is the literal word "delete" — so a fallback face does not draw a
   * blank, it draws the word. block keeps them invisible until the real face
   * arrives, which for a same-origin 40 KB file is imperceptible.
   */
  font-display: block;
  src: url('../assets/fonts/material-symbols-subset.woff2') format('woff2');
}

.material-symbols-outlined {
  font-family: 'Material Symbols Outlined';
  font-weight: normal;
  font-style: normal;
  font-size: 24px;
  line-height: 1;
  letter-spacing: normal;
  text-transform: none;
  display: inline-block;
  white-space: nowrap;
  word-wrap: normal;
  direction: ltr;
  -webkit-font-feature-settings: 'liga';
  -webkit-font-smoothing: antialiased;
}
`
  );

  writeFileSync(MANIFEST_OUT, `${JSON.stringify({ axes: AXES, icons: used }, null, 2)}\n`);

  console.log(`[icons] wrote ${(font.byteLength / 1024).toFixed(1)} KB to ${path.relative(process.cwd(), FONT_OUT)}`);
}

// Only when run directly, so the test can import resolveIconNames.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
