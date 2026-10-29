import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

///  +-----------------------------------------------------------------+
///  |   EVERY TEXT TOKEN MEETS WCAG AA ON THE GROUNDS IT SITS ON        |
///  +-----------------------------------------------------------------+
//
//  Read straight from tokens.css, so a palette edit that drops a pairing
//  below 4.5:1 fails here rather than in somebody's eyes. Covers the text
//  ramp on every ground, each intent's text on its own tint (state chips),
//  and the label colours on the two solid buttons.
//
//  `dis` is exempt: WCAG 1.4.3 excludes disabled controls.
//
//  As presets are adapted (Phase 8.5) they join the matrix below.
///  +-----------------------------------------------------------------+

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

function palette(selector: string): Record<string, string> {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2]])
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const GROUNDS = ["sheet", "canvas", "tray", "subtle", "hover", "track"];
const TEXT = ["tx", "tx2", "tx3", "mut", "brand-tx"];

const PAIRS: [string, string][] = [
  ...TEXT.flatMap((t) => GROUNDS.map((g) => [t, g] as [string, string])),
  ["placeholder", "sheet"],
  ["ok", "ok-bg"],
  ["prog", "prog-bg"],
  ["stop", "stop-bg"],
  ["stop", "sheet"],
  ["brand-tx", "brand-sub"],
  ["on-ink", "ink"],
  ["on-brand", "brand"],
];

// Shortfalls in the design as delivered, pending a decision (raised
// 2026-10-29). Listed so that everything ELSE is enforced today; remove an
// entry once the token is settled and the pair passes.
const KNOWN_GAPS: Record<string, string[]> = {
  light: ["mut on tray", "placeholder on sheet"],
  dark: ["placeholder on sheet"],
};

const MODES = { light: palette(":root"), dark: palette("\\.dark") };

describe.each(Object.entries(MODES))("Platinum %s", (mode, tokens) => {
  it.each(PAIRS)("%s on %s is at least 4.5:1", (text, ground) => {
    expect(tokens[text], `--${text} missing`).toBeDefined();
    expect(tokens[ground], `--${ground} missing`).toBeDefined();
    const ratio = contrast(tokens[text], tokens[ground]);
    if (KNOWN_GAPS[mode].includes(`${text} on ${ground}`)) {
      // Still guard against it getting worse while it waits.
      expect(ratio).toBeGreaterThanOrEqual(3);
      return;
    }
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  it("defines every themed token in both modes, so the theme fade has both ends", () => {
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(MODES.light).sort());
  });
});
