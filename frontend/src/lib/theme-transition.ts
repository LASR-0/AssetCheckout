///  +-----------------------------------------------------------------+
///  |                  THEME CROSS-FADE                                |
///  +-----------------------------------------------------------------+
//
//  Walks the palette custom properties from the outgoing theme's values to
//  the incoming one's, a frame at a time, as inline styles on <html>.
//  Everything downstream — rgb(var(--x)) in @theme, every utility built on
//  it — recomputes from those, so the whole page moves together off a single
//  animating element.
//
//  Why not `* { transition: color ... }`: colour is an inherited property, so
//  an element that doesn't declare its own colour takes the ANIMATING value
//  from its parent as its computed value. With a transition of its own it
//  then chases that moving target and lands a full duration late. Removing
//  the transition mid-chase leaves a residual, which Tailwind's own
//  `transition-colors` (59 call sites here) then animates out — the second
//  fade on text. Interpolating the source variables removes the per-element
//  transitions entirely, so there is nothing to chase and nothing to leave
//  behind.

const DEFAULT_DURATION = 300;

type Palette = Record<string, string>;

/** How a palette value is written, so we can put it back the same way. */
type ValueKind = "triple" | "hex" | "rgb";

interface ParsedValue {
  kind: ValueKind;
  channels: [number, number, number];
}

let palettes: { light: Palette; dark: Palette } | null = null;
let paletteLookupFailed = false;

let frame = 0;
/** Values currently pinned inline, so a click mid-fade resumes from here. */
let inFlight: Palette | null = null;

///  +-----------------------------------------------------------------+
///  |                  READING THE TWO PALETTES                        |
///  +-----------------------------------------------------------------+

/**
 * Names of every custom property the dark theme overrides — which is exactly
 * the set that changes between themes. Read from the stylesheet rather than
 * hardcoded so adding a colour to index.css needs no change here.
 */
function collectThemedVarNames(): string[] {
  const names = new Set<string>();

  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      const styleRule = rule as CSSStyleRule;

      // Exact match only. `dark:` utilities compile to `.dark\:bg-transparent`
      // and friends, which contain ".dark" as a substring and carry Tailwind's
      // own --tw-* properties — none of which are palette entries.
      if (
        typeof styleRule.selectorText === "string" &&
        styleRule.style &&
        styleRule.selectorText.split(",").some((sel) => sel.trim() === ".dark")
      ) {
        for (const prop of Array.from(styleRule.style)) {
          if (prop.startsWith("--")) names.add(prop);
        }
      }

      // @layer base { .dark { ... } } — Tailwind v4 emits native cascade
      // layers, so the theme blocks sit at least one level down. Checked after
      // the style-rule branch because CSSStyleRule also exposes cssRules now
      // (CSS nesting), and taking that branch first would skip the palette.
      if ("cssRules" in rule) visit((rule as CSSGroupingRule).cssRules);
    }
  };

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin sheet — nothing of ours lives there.
    }
  }

  return Array.from(names);
}

/**
 * Both palettes, by flipping the class on <html> and reading back computed
 * values. Nothing yields to the event loop between the flips, so no frame is
 * ever painted in the wrong theme.
 */
function readPalettes(): { light: Palette; dark: Palette } | null {
  const names = collectThemedVarNames();
  if (names.length === 0) return null;

  const root = document.documentElement;
  const wasDark = root.classList.contains("dark");

  const read = (dark: boolean): Palette => {
    root.classList.toggle("dark", dark);
    const computed = getComputedStyle(root);
    const out: Palette = {};
    for (const name of names) {
      const value = computed.getPropertyValue(name).trim();
      if (value) out[name] = value;
    }
    return out;
  };

  const light = read(false);
  const dark = read(true);
  root.classList.toggle("dark", wasDark);

  return { light, dark };
}

function getPalettes() {
  if (palettes || paletteLookupFailed) return palettes;
  palettes = readPalettes();
  paletteLookupFailed = palettes === null;
  return palettes;
}

/**
 * Forget the cached palettes.
 *
 * MUST be called whenever anything changes what the custom properties resolve
 * to while the page is open — which today means switching theme preset. The
 * cache above is read once and kept forever, so without this the next
 * cross-fade animates toward the palette of the preset you just left and then
 * snaps to the real one at the end.
 *
 * That failure reads as a rendering glitch rather than a stale cache, and
 * nothing points back here, which is why it is exported rather than left as an
 * internal detail for a caller to rediscover.
 */
export function resetPalettes(): void {
  palettes = null;
  paletteLookupFailed = false;
}

///  +-----------------------------------------------------------------+
///  |                  PARSING / INTERPOLATION                         |
///  +-----------------------------------------------------------------+

// Three formats appear in index.css: bare rgb triples consumed as
// rgb(var(--x)) (most of the palette, and note --nav-tab is comma-separated),
// hex for the --status-* set, and computed rgb(). Anything else — gradients,
// box-shadows, the oklch(from ...) footer derivation — is left alone and
// simply changes with the class.
function parseValue(value: string): ParsedValue | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const digits = hex[1];
    const full =
      digits.length === 3
        ? digits
            .split("")
            .map((d) => d + d)
            .join("")
        : digits;
    return {
      kind: "hex",
      channels: [
        parseInt(full.slice(0, 2), 16),
        parseInt(full.slice(2, 4), 16),
        parseInt(full.slice(4, 6), 16),
      ],
    };
  }

  if (/^rgba?\(/i.test(value)) {
    const parts = value
      .slice(value.indexOf("(") + 1, value.lastIndexOf(")"))
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    return { kind: "rgb", channels: [parts[0], parts[1], parts[2]] };
  }

  const parts = value.split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    return { kind: "triple", channels: [parts[0], parts[1], parts[2]] };
  }

  return null;
}

function formatValue(kind: ValueKind, [r, g, b]: [number, number, number]): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  if (kind === "triple") return `${clamp(r)} ${clamp(g)} ${clamp(b)}`;
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

/** Cubic ease-in-out — matches the feel of the CSS keyword of the same name. */
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

///  +-----------------------------------------------------------------+
///  |                  THE FADE                                        |
///  +-----------------------------------------------------------------+

function clearInlinePalette(names: string[]) {
  const root = document.documentElement;
  for (const name of names) root.style.removeProperty(name);
  inFlight = null;
}

/** Abandons a running palette fade, leaving the class to speak for itself. */
function cancelPaletteFade() {
  cancelAnimationFrame(frame);
  if (inFlight) clearInlinePalette(Object.keys(inFlight));
}

/**
 * Fades the palette to `nextTheme`, calling `applyTheme` immediately so the
 * store and any theme-dependent UI update up front.
 *
 * The class flip is invisible while the fade runs: inline custom properties
 * on <html> outrank both :root and .dark, so the page keeps showing the
 * interpolated values until they land on the new theme's and the overrides
 * come off.
 *
 * Safe to call again mid-fade — the running frame loop is cancelled and the
 * new one starts from the values currently on screen, so a double-click
 * reverses smoothly instead of restarting.
 */
export function withThemeFade(
  nextTheme: "light" | "dark",
  applyTheme: () => void,
  duration: number = DEFAULT_DURATION
): void {
  const root = document.documentElement;
  const loaded = getPalettes();

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!loaded || reducedMotion) {
    applyTheme();
    return;
  }

  const target = nextTheme === "dark" ? loaded.dark : loaded.light;
  const source = inFlight ?? (nextTheme === "dark" ? loaded.light : loaded.dark);

  // Pair up only the properties we can actually interpolate; the rest ride
  // along with the class flip below.
  const tracks: { name: string; kind: ValueKind; from: [number, number, number]; to: [number, number, number] }[] = [];
  for (const name of Object.keys(target)) {
    const from = parseValue(source[name] ?? "");
    const to = parseValue(target[name]);
    if (!from || !to || from.kind !== to.kind) continue;
    tracks.push({ name, kind: to.kind, from: from.channels, to: to.channels });
  }

  const names = tracks.map((t) => t.name);

  // Pin the current appearance before handing the class over to the store,
  // otherwise the theme would land in one step on this frame.
  const pinned: Palette = {};
  for (const track of tracks) {
    const value = formatValue(track.kind, track.from);
    root.style.setProperty(track.name, value);
    pinned[track.name] = value;
  }
  inFlight = pinned;

  applyTheme();

  cancelAnimationFrame(frame);
  const start = performance.now();

  const step = (now: number) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = ease(t);
    const next: Palette = {};

    for (const track of tracks) {
      const value = formatValue(track.kind, [
        track.from[0] + (track.to[0] - track.from[0]) * eased,
        track.from[1] + (track.to[1] - track.from[1]) * eased,
        track.from[2] + (track.to[2] - track.from[2]) * eased,
      ]);
      root.style.setProperty(track.name, value);
      next[track.name] = value;
    }
    inFlight = next;

    if (t < 1) {
      frame = requestAnimationFrame(step);
      return;
    }
    // Landed on the new theme's own values, so dropping the overrides is a
    // no-op on screen — the class underneath already says the same thing.
    clearInlinePalette(names);
  };

  frame = requestAnimationFrame(step);
}

///  +-----------------------------------------------------------------+
///  |                  THE REVEAL                                      |
///  +-----------------------------------------------------------------+
//
//  Spatial version: the new theme grows out of the control that triggered it.
//  This needs the View Transitions API, because a circle that reveals the new
//  theme has to composite two full renderings of the page at once — something
//  no amount of variable interpolation can do on its own.
//
//  The reveal and the fade run together on the same pseudo-element: the circle
//  grows, and the incoming theme dissolves in across it rather than arriving at
//  full strength. Because the old snapshot sits directly underneath, blending
//  the new one in over it interpolates every pixel between the two themes —
//  the same colour walk the palette fade does, done by the compositor and
//  confined to the circle. Growing a hard-edged circle skips that entirely,
//  which is why the fade looked like it had gone.
//
//  Falls back to the palette fade above when the API is missing, when motion
//  is reduced, or if anything throws on the way in.

const REVEAL_ATTR = "data-theme-reveal";

/**
 * Length of the dissolve relative to the reveal. Above 1, so the circle
 * finishes covering the viewport while the colours are still blending and the
 * last stretch plays out full-screen — the reveal places the change, the fade
 * carries it. Note this makes the fade the longer of the two, so it is what
 * decides when the transition (and its snapshots) actually end.
 */
const REVEAL_FADE_RATIO = 1.5;

let activeTransition: ViewTransition | null = null;
let activeAnimations: Animation[] = [];

export type RevealOrigin = Element | { x: number; y: number } | null | undefined;

/** Viewport point the circle grows from; defaults to the centre. */
function resolveOrigin(origin: RevealOrigin): { x: number; y: number } {
  if (origin && "getBoundingClientRect" in origin) {
    const { top, left, width, height } = origin.getBoundingClientRect();
    return { x: left + width / 2, y: top + height / 2 };
  }
  if (origin) return origin;
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

/**
 * Collapsed and full clip circles, in percentages.
 *
 * Percentages rather than pixels on purpose: on fractional display scaling
 * (Windows at 125%/150%) Chrome has shipped bugs where absolute clip-path
 * lengths on the view-transition pseudo-elements are not scaled to match the
 * snapshot, putting the circle in the wrong place. Percentages resolve against
 * the snapshot's own reference box and stay correct.
 */
function revealClipPaths(x: number, y: number): [string, string] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Farthest corner from the origin — how big the circle must get to cover.
  const radius = Math.hypot(Math.max(x, vw - x), Math.max(y, vh - y));

  const at = `${(x / vw) * 100}% ${(y / vh) * 100}%`;
  // circle() percentage radii resolve against hypot(w, h) / sqrt(2).
  const r = (radius / (Math.hypot(vw, vh) / Math.SQRT2)) * 100;

  return [`circle(0% at ${at})`, `circle(${r}% at ${at})`];
}

function endReveal(root: HTMLElement) {
  activeTransition = null;
  // Safe to drop only now: `finished` means the pseudo-elements are gone, so
  // the collapsed clip-path pinned in CSS can no longer paint a frame.
  for (const animation of activeAnimations) animation.cancel();
  activeAnimations = [];
  root.removeAttribute(REVEAL_ATTR);
  root.style.removeProperty("--theme-reveal-from");
}

/**
 * Switches theme with a circular reveal growing from `origin`.
 *
 * The class flip happens synchronously inside the transition callback — that
 * is the one thing the API requires — while `applyTheme` (the React/store
 * half) is deferred to `ready`, so no state update ever re-enters the renderer
 * from inside the callback. That re-entrancy is what tore the tree down when
 * this was driven by flushSync.
 *
 * Spam-safe: a click arriving mid-reveal cancels the running clip animation
 * and skips the outstanding transition before starting the next, so no
 * fill-forwards animation is ever left holding a stale clip over the page.
 */
export function withThemeReveal(
  nextTheme: "light" | "dark",
  applyTheme: () => void,
  origin?: RevealOrigin,
  duration: number = DEFAULT_DURATION
): void {
  const root = document.documentElement;

  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (typeof document.startViewTransition !== "function" || reducedMotion) {
    withThemeFade(nextTheme, applyTheme, duration);
    return;
  }

  // A fade and a reveal must never overlap: the reveal snapshots the page, and
  // half-interpolated inline variables would be baked into that snapshot.
  cancelPaletteFade();

  // Tear down anything still in flight before snapshotting again.
  for (const animation of activeAnimations) animation.cancel();
  activeAnimations = [];
  activeTransition?.skipTransition();
  activeTransition = null;

  const { x, y } = resolveOrigin(origin);
  const clipPath = revealClipPaths(x, y);

  root.setAttribute(REVEAL_ATTR, "active");
  root.style.setProperty("--theme-reveal-from", clipPath[0]);

  const transition = document.startViewTransition(() => {
    root.classList.toggle("dark", nextTheme === "dark");
    root.style.colorScheme = nextTheme;
  });
  activeTransition = transition;

  transition.finished.finally(() => {
    if (activeTransition === transition) endReveal(root);
  });

  transition.ready
    .then(() => {
      applyTheme();

      const pseudoElement = "::view-transition-new(root)";

      activeAnimations = [
        // The reveal.
        root.animate(
          { clipPath },
          { duration, easing: "ease-in-out", fill: "forwards", pseudoElement }
        ),
        // The fade, over the top of it. The old snapshot underneath shows
        // through until this lands, so the circle's interior walks from the
        // outgoing palette to the incoming one instead of cutting to it.
        // Eased like the reveal rather than ease-out: front-loading the blend
        // would spend the extra length on a tail too faint to read, which is
        // the opposite of asking for a longer fade.
        root.animate(
          { opacity: [0, 1] },
          {
            duration: duration * REVEAL_FADE_RATIO,
            easing: "ease-in-out",
            fill: "forwards",
            pseudoElement,
          }
        ),
      ];
    })
    // A skipped transition rejects `ready`, but the callback has already run,
    // so the class is flipped — the store still has to be told.
    .catch(() => applyTheme());
}
