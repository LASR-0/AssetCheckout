import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
// @ts-expect-error -- a plain .mjs build script, deliberately not part of the
// app's TS project: the test and the font builder must share one definition of
// "an icon this app uses", and that definition lives with the builder.
import { resolveIconNames } from "../../../scripts/build-icon-font.mjs";

///  +-----------------------------------------------------------------+
///  |        THE SUBSETTED ICON FONT MUST NOT FALL BEHIND             |
///  +-----------------------------------------------------------------+
//
//  The app ships ~140 of Material Symbols' 4,284 glyphs, because shipping all
//  of them is a 3.98 MB download before a single icon can paint. The cost of
//  that trade is that the font can go stale: somebody adds
//  <span className="material-symbols-outlined">rocket_launch</span>, never
//  runs `pnpm run icons`, and the glyph is not in the subset.
//
//  IT FAILS UGLY, NOT INVISIBLY, WHICH IS WHY THIS TEST IS WORTH ITS WEIGHT.
//  A missing glyph does not render blank — these icons are addressed by
//  ligature, so the element's own text shows through and the UI displays the
//  literal word "rocket_launch". That is exactly the breakage the subset was
//  introduced to remove, so it must not be reintroduced by forgetting a build
//  step.
//
//  It compares against the same scanner the builder uses, so the two cannot
//  disagree about what counts as a used icon.
///  +-----------------------------------------------------------------+

const MANIFEST = path.resolve(__dirname, "../../../scripts/material-symbols.manifest.json");
const FONT = path.resolve(__dirname, "../../assets/fonts/material-symbols-subset.woff2");

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
  axes: string;
  icons: string[];
};

describe("the subsetted icon font", () => {
  it("contains every glyph the source actually uses", () => {
    const { used } = resolveIconNames() as { used: string[] };
    const shipped = new Set(manifest.icons);
    const missing = used.filter((name) => !shipped.has(name));

    expect(
      missing,
      `These icons are used but are not in the font: ${missing.join(", ")}. ` +
        `Run \`pnpm run icons\` to rebuild it, and commit the result.`
    ).toEqual([]);
  });

  it("does not carry glyphs nothing references any more", () => {
    // Not a correctness failure — a stale glyph renders fine, it is just
    // weight nobody asked for. Worth catching because the fix is the same
    // command, and because it is the only signal that an icon was retired.
    const used = new Set((resolveIconNames() as { used: string[] }).used);
    const orphaned = manifest.icons.filter((name) => !used.has(name));

    expect(
      orphaned,
      `These glyphs are in the font but unused: ${orphaned.join(", ")}. ` +
        `Run \`pnpm run icons\` to shrink it.`
    ).toEqual([]);
  });

  it("has no icon name that is not a real glyph", () => {
    // A DIFFERENT FAILURE FROM THE ONES ABOVE, and one no rebuild can fix.
    // `icon="Devices"` — capital D — is not a Material Symbols name, so it
    // rendered the word "Devices" in the requests table header. It did that
    // with the full 3.98 MB font too; subsetting did not cause it, it just
    // made it visible. Only explicit `icon` literals are checked, because
    // those are the ones somebody unambiguously meant as a glyph.
    const { misspelled } = resolveIconNames() as { misspelled: string[] };

    expect(
      misspelled,
      `These are written as icons but are not Material Symbols names, so they ` +
        `render as their own text: ${misspelled.join(", ")}. Check the spelling ` +
        `at fonts.google.com/icons — names are lowercase with underscores.`
    ).toEqual([]);
  });

  it("keeps the variable axes the UI animates", () => {
    // index.css transitions 'FILL' 0 -> 1 on hover. Rebuilding against a
    // static instance would silently freeze that, and nothing else would
    // notice until somebody looked at a hover state.
    expect(manifest.axes).toContain("FILL");
    expect(manifest.axes).toContain("0..1");
  });

  it("is a subset, not the whole library", () => {
    // The guard that matters most: if a rebuild ever silently fetched the
    // full face, everything above would still pass while every visitor
    // downloaded 3.98 MB again.
    const bytes = statSync(FONT).size;

    expect(bytes).toBeGreaterThan(10_000);
    expect(bytes).toBeLessThan(500_000);
  });
});
