import { describe, it, expect } from "vitest";
import { resolveSteps } from "./resolveSteps";
import { homeTour } from "./home";
import { requestsManagerTour } from "./requests";
import type { TourStepSpec } from "./types";

///  +-----------------------------------------------------------------+
///  |          THE TOUR ON A PAGE THAT HAS ALMOST NOTHING             |
///  +-----------------------------------------------------------------+
//
//  The audience for the home tour is people with no devices and no requests,
//  which is precisely when the home page renders least. These tests describe
//  what those people actually see — that the topics survive, that the words
//  change when the target does, and that a fallback shared by two steps does
//  not produce the same spotlight twice.
//
//  `find` is a Set lookup, so a "page" here is just the list of anchors that
//  happen to exist on it.
///  +-----------------------------------------------------------------+

const finder = (present: string[]) => (anchor: string) => present.includes(anchor);

/** Everything on the home page that renders regardless of what you hold. */
const ALWAYS_ON_HOME = [
  '[data-tour="home-greeting"]',
  '[data-tour="home-stats"]',
  '[data-tour="home-request-assets"]',
  '[data-tour="home-see-all-devices"]',
  '[data-tour="home-recent-requests"]',
  '[data-tour="home-quick-links"]',
  '[data-tour="home-feedback"]',
  '[data-tour="nav-tour"]',
];

describe("a brand new account on the home page", () => {
  // No holdings, no requests: MyStuff shows its empty state, the accessory
  // suggestions are absent entirely, and no status badge has rendered.
  const present = [...ALWAYS_ON_HOME, '[data-tour="home-my-stuff-empty"]',
    '[data-tour="home-report-unlogged"]'];
  const steps = resolveSteps(homeTour.steps, finder(present));

  it("never points at something that is not there", () => {
    for (const step of steps) {
      if (step.anchor === null) continue;
      expect(present, step.id).toContain(step.anchor);
    }
  });

  it("still covers every headline topic", () => {
    // The things somebody would leave not knowing.
    const ids = steps.map((s) => s.id);
    for (const required of ["welcome", "report-fault", "request-assets", "your-requests", "tour-button"]) {
      expect(ids, required).toContain(required);
    }
  });

  it("drops the accessory suggestions, which are not rendered", () => {
    expect(steps.map((s) => s.id)).not.toContain("request-accessories");
  });

  it("says something true about an empty holdings list", () => {
    const step = steps.find((s) => s.id === "my-stuff")!;

    expect(step.anchor).toBe('[data-tour="home-my-stuff-empty"]');
    // Not "everything recorded against your name" — there isn't any.
    expect(step.description).toContain("Nothing is yet");
  });

  it("explains statuses using the count tiles when no badge exists", () => {
    const step = steps.find((s) => s.id === "statuses")!;

    expect(step.anchor).toBe('[data-tour="home-stats"]');
    expect(step.description).toContain("in flight");
  });

  it("does not spotlight the same button twice in a row", () => {
    // "report a fault" and "report an unrecorded device" both fall back to
    // the one button here. Two identical highlights reads as a bug.
    for (let i = 1; i < steps.length; i += 1) {
      if (steps[i].anchor === null) continue;
      expect(steps[i].anchor, `${steps[i - 1].id} then ${steps[i].id}`)
        .not.toBe(steps[i - 1].anchor);
    }
  });

  it("folds the two reporting steps into one that still says both things", () => {
    const step = steps.find((s) => s.id === "report-fault")!;

    expect(step.anchor).toBe('[data-tour="home-report-unlogged"]');
    // The second step's words survive the fold rather than being discarded.
    expect(step.description).toContain("never made it onto our records");
  });
});

describe("an established account on the home page", () => {
  const present = [
    ...ALWAYS_ON_HOME,
    '[data-tour="home-my-stuff"]',
    '[data-tour="home-my-stuff-item"]',
    '[data-tour="home-request-accessories"]',
    '[data-tour="home-see-all-accessories"]',
    '[data-tour="home-status-badge"]',
    '[data-tour="home-report-unlogged"]',
  ];
  const steps = resolveSteps(homeTour.steps, finder(present));

  it("prefers the real targets over every fallback", () => {
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));

    expect(byId["my-stuff"].anchor).toBe('[data-tour="home-my-stuff"]');
    expect(byId["report-fault"].anchor).toBe('[data-tour="home-my-stuff-item"]');
    expect(byId["statuses"].anchor).toBe('[data-tour="home-status-badge"]');
  });

  it("uses the authored copy, not the fallback wording", () => {
    const step = steps.find((s) => s.id === "statuses")!;
    expect(step.description).toContain("waiting on an approver");
  });

  it("includes the accessory step this time", () => {
    expect(steps.map((s) => s.id)).toContain("request-accessories");
  });
});

describe("the manager tour in each state the queue can be in", () => {
  ///  The state this lands in is data, not layout, so all three are normal and
  ///  each has to read properly. The regression that prompted these: when the
  ///  table had not loaded, both steps fell back to the same element and were
  ///  folded into one — correct behaviour by dedupeAdjacent, wrong tour.

  const HEADER = '[data-tour="requests-actions-header"]';

  it("shows both actions when something is actually waiting", () => {
    const steps = resolveSteps(
      requestsManagerTour.steps,
      finder([HEADER, '[data-tour="requests-row-actions"]',
        '[data-tour="requests-approve"]', '[data-tour="requests-reject"]'])
    );

    expect(steps.map((s) => s.title)).toEqual(["Requests waiting on you", "Turning one down"]);
  });

  it("says one coherent thing when the queue is clear", () => {
    // Rows exist, none of them waiting on this person. The most common day.
    const steps = resolveSteps(
      requestsManagerTour.steps,
      finder([HEADER, '[data-tour="requests-row-actions"]'])
    );

    expect(steps).toHaveLength(1);
    // Names both verbs, so dropping the Reject step costs nothing.
    expect(steps[0].description).toContain("Approve and Reject");
  });

  it("says one coherent thing when the table is empty", () => {
    const steps = resolveSteps(requestsManagerTour.steps, finder([HEADER]));

    expect(steps).toHaveLength(1);
    expect(steps[0].anchor).toBe(HEADER);
    expect(steps[0].description).toContain("Nothing is waiting on you right now");
  });

  it("never folds two descriptions together, in any state", () => {
    // The actual regression. A folded step reads as two half-thoughts, and
    // the only way to get one was to give both steps the same fallback.
    for (const present of [
      [HEADER],
      [HEADER, '[data-tour="requests-row-actions"]'],
      [HEADER, '[data-tour="requests-row-actions"]', '[data-tour="requests-approve"]',
        '[data-tour="requests-reject"]'],
    ]) {
      const steps = resolveSteps(requestsManagerTour.steps, finder(present));
      const anchors = steps.map((s) => s.anchor);

      expect(new Set(anchors).size, JSON.stringify(present)).toBe(anchors.length);
    }
  });
});

describe("the required escape hatch", () => {
  const spec: TourStepSpec[] = [
    { id: "kept", anchors: ['[data-tour="nowhere"]'], title: "T", description: "D", required: true },
    { id: "dropped", anchors: ['[data-tour="nowhere"]'], title: "T", description: "D" },
  ];

  it("keeps a required step with nothing to point at, as a page-level one", () => {
    const steps = resolveSteps(spec, () => false);

    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe("kept");
    expect(steps[0].anchor).toBeNull();
  });

  it("does not fold two page-level steps together", () => {
    // Both have a null anchor, which is not "the same element".
    const both: TourStepSpec[] = [
      { id: "a", anchors: [], title: "T", description: "A", required: true },
      { id: "b", anchors: [], title: "T", description: "B", required: true },
    ];

    expect(resolveSteps(both, () => false)).toHaveLength(2);
  });
});

describe("narrow screens", () => {
  // Distinct anchors, or dedupeAdjacent quite correctly folds them into one.
  const spec: TourStepSpec[] = [
    { id: "l", anchors: ['[data-tour="a"]'], title: "T", description: "D", side: "left" },
    { id: "r", anchors: ['[data-tour="b"]'], title: "T", description: "D", side: "right" },
    { id: "t", anchors: ['[data-tour="c"]'], title: "T", description: "D", side: "top" },
  ];

  it("turns side popovers into vertical ones below md", () => {
    // A left-anchored popover on a 360px screen has nowhere to live.
    const steps = resolveSteps(spec, () => true, { isDesktop: false });
    for (const step of steps) expect(["top", "bottom"], step.id).toContain(step.side);
  });

  it("leaves them alone on a desktop", () => {
    const steps = resolveSteps(spec, () => true, { isDesktop: true });
    expect(steps.map((s) => s.side)).toEqual(["left", "right", "top"]);
  });
});

describe("the form links in the nav bar", () => {
  ///  Two steps on a desktop, where Assets and Accessories are separate links.
  ///  One on a phone, where both live behind the burger — which means the two
  ///  descriptions get folded together and have to read as a single sentence.

  it("points at each link separately on a desktop", () => {
    const steps = resolveSteps(
      homeTour.steps,
      finder([...ALWAYS_ON_HOME, '[data-tour="nav-assets"]', '[data-tour="nav-accessories"]'])
    );
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));

    expect(byId["nav-assets"].anchor).toBe('[data-tour="nav-assets"]');
    expect(byId["nav-accessories"].anchor).toBe('[data-tour="nav-accessories"]');
  });

  it("folds them into one readable step on a phone", () => {
    // Below md the desktop nav is hidden and both fall back to the burger.
    const steps = resolveSteps(
      homeTour.steps,
      finder([...ALWAYS_ON_HOME, '[data-tour="nav-menu"]']),
      { isDesktop: false }
    );

    const folded = steps.filter((s) => s.anchor === '[data-tour="nav-menu"]');
    expect(folded).toHaveLength(1);

    // The two halves have to make one sentence, not two fragments.
    expect(folded[0].description).toBe(
      "This opens the same links from any page — Assets for anything we issue you, " +
        "and Accessories for chargers, docks and cables."
    );
  });

  it("drops both when neither the nav nor the burger resolved", () => {
    // Neither step is required: the QuickStart section already covers how to
    // request things, so this is a shortcut, not a topic.
    const steps = resolveSteps(homeTour.steps, finder(ALWAYS_ON_HOME));
    const ids = steps.map((s) => s.id);

    expect(ids).not.toContain("nav-assets");
    expect(ids).not.toContain("nav-accessories");
  });
});
