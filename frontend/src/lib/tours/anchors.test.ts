import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { TOURS } from "./registry";

///  +-----------------------------------------------------------------+
///  |      EVERY ANCHOR A TOUR NAMES MUST EXIST IN THE SOURCE         |
///  +-----------------------------------------------------------------+
//
//  The failure this catches is the one nothing else can. A tour points at
//  elements by `data-tour` attribute, and those attributes live in nine
//  components that have nothing else to do with tours. Rename one — or delete
//  the element it sat on during an unrelated redesign — and the tour still
//  runs, still looks correct, and has silently lost a step. Nobody notices,
//  because the step that vanished is the one nobody sees.
//
//  So this reads the source off disk rather than trusting a list. Both forms
//  count: the literal `data-tour="x"` and the string "x" appearing in a
//  ternary or passed as a prop, which is how the per-row and per-item anchors
//  are written.
///  +-----------------------------------------------------------------+

const SRC = new URL("../../", import.meta.url);

function sourceFiles(dir: URL): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);

    if (entry.isDirectory()) {
      out.push(...sourceFiles(child));
      continue;
    }
    if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(readFileSync(child, "utf8"));
    }
  }

  return out;
}

const sources = sourceFiles(SRC);
const allSource = sources.join("\n");

/** Anchor names used anywhere in the app, in either form. */
const declared = new Set<string>([
  ...[...allSource.matchAll(/data-tour="([a-z0-9-]+)"/g)].map((m) => m[1]),
  // The dynamic form: data-tour={cond ? "name" : undefined} and tour="name".
  ...[...allSource.matchAll(/(?:data-tour=\{[^}]*|tour=)"([a-z0-9-]+)"/g)].map((m) => m[1]),
]);

/** Every anchor referenced by a tour definition, as a bare name. */
const referenced = Object.entries(TOURS).flatMap(([tourId, tour]) =>
  tour.steps.flatMap((step) =>
    step.anchors.map((selector) => ({
      tourId,
      stepId: step.id,
      selector,
      name: selector.replace(/^\[data-tour="/, "").replace(/"\]$/, ""),
    }))
  )
);

describe("the source scan itself", () => {
  it("found the components, so the assertions below mean something", () => {
    // A glob that quietly matched nothing would make every test here pass.
    expect(sources.length).toBeGreaterThan(50);
    expect(declared.size).toBeGreaterThan(15);
  });

  it("found both the literal and the conditional forms", () => {
    // A regex that only caught data-tour="x" would miss every per-row anchor,
    // which is most of what the manager tour depends on.
    expect(declared).toContain("home-greeting");
    expect(declared).toContain("home-my-stuff-item");
    expect(declared).toContain("requests-approve");
    expect(declared).toContain("requests-actions-header");
  });
});

describe("tour anchors", () => {
  it("all exist somewhere in the source", () => {
    const missing = referenced
      .filter((r) => !declared.has(r.name))
      .map((r) => `${r.tourId}/${r.stepId} -> ${r.selector}`);

    expect(missing).toEqual([]);
  });

  it("are all written as [data-tour=...] selectors", () => {
    // One shape, so pickVisible and this test agree about what an anchor is.
    for (const r of referenced) {
      expect(r.selector, `${r.tourId}/${r.stepId}`).toMatch(/^\[data-tour="[a-z0-9-]+"\]$/);
    }
  });

  it("gives every required step a fallback or a genuinely universal anchor", () => {
    // A required step with a single anchor that can vanish is a page-level
    // popover waiting to happen — technically handled, but it means the tour
    // silently stops pointing at anything on the page it was written for.
    const universal = new Set([
      "home-greeting",
      "home-recent-requests",
      "home-request-assets",
      "home-quick-links",
      "nav-tour",
      "requests-table",
      "requests-search",
      "ts-subject",
      "ts-escape",
      "settings-theme",
    ]);

    for (const [tourId, tour] of Object.entries(TOURS)) {
      for (const step of tour.steps) {
        if (!step.required) continue;
        const ok = step.anchors.length > 1 || universal.has(
          step.anchors[0].replace(/^\[data-tour="/, "").replace(/"\]$/, "")
        );
        expect(ok, `${tourId}/${step.id} is required with one fragile anchor`).toBe(true);
      }
    }
  });
});
