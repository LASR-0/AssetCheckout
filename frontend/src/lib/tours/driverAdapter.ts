import { driver, type Driver } from "driver.js";
import { resolveSteps } from "./resolveSteps";
import type { ResolvedStep, TourStepSpec } from "./types";

///  +-----------------------------------------------------------------+
///  |            THE ONLY FILE THAT KNOWS ABOUT driver.js             |
///  +-----------------------------------------------------------------+
//
//  Everything above this is pure and tested; this is the thin layer that
//  touches a document, so it is kept as small as the job allows.
//
//  ELEMENTS, NOT SELECTORS. driver.js accepts either, but a selector is
//  resolved with querySelector, which takes the first match in document
//  order — and the navbar renders every link twice, once in the desktop nav
//  and once in the burger panel that is always mounted. Below `md` the first
//  match is the hidden desktop copy, so the highlight would land on a node
//  with no box. pickVisible chooses among the matches instead.
//
//  A SINGLETON, destroyed before any new run. React's StrictMode mounts
//  effects twice in development, and two live drivers means two overlays and
//  two popovers, one of which can never be closed.
///  +-----------------------------------------------------------------+

/** Clearance for the fixed navbar — the same 6rem `scroll-mt-24` buys. */
const NAV_OFFSET = 96;

let active: Driver | null = null;

/**
 * The first match that is actually rendered.
 *
 * Zero-size and `visibility: hidden` are the easy cases. The burger panel is
 * neither: it is collapsed with `max-h-0 opacity-0`, so its links report a
 * box and are technically visible — hence the walk up for a transparent or
 * fully-clipped ancestor.
 */
function pickVisible(selector: string): HTMLElement | null {
  const matches = document.querySelectorAll<HTMLElement>(selector);

  for (const el of matches) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (getComputedStyle(el).visibility === "hidden") continue;

    let parent: HTMLElement | null = el;
    let clipped = false;

    while (parent && parent !== document.body) {
      const style = getComputedStyle(parent);
      if (style.opacity === "0" || style.display === "none") {
        clipped = true;
        break;
      }
      if (style.overflow === "hidden" && parent.getBoundingClientRect().height === 0) {
        clipped = true;
        break;
      }
      parent = parent.parentElement;
    }

    if (!clipped) return el;
  }

  return null;
}

/**
 * Bring a target into view horizontally.
 *
 * The request table is a fixed-width table inside an `overflow-x-auto`
 * wrapper, so on a narrow screen its actions column — the whole subject of
 * the manager tour — sits outside the viewport. driver.js scrolls the window
 * vertically and knows nothing about a scrolled ancestor, so without this the
 * spotlight lands on empty space beside a popover describing something the
 * reader cannot see.
 */
function scrollIntoViewX(el: Element): void {
  let parent = el.parentElement;

  while (parent && parent !== document.body) {
    const overflowX = getComputedStyle(parent).overflowX;

    if (parent.scrollWidth > parent.clientWidth && /auto|scroll/.test(overflowX)) {
      const target = el.getBoundingClientRect();
      const container = parent.getBoundingClientRect();

      if (target.right > container.right || target.left < container.left) {
        parent.scrollLeft += target.left - container.left - 16;
      }
      return;
    }

    parent = parent.parentElement;
  }
}

export type StartOptions = {
  steps: TourStepSpec[];
  /** Called once the run ends, however it ended — finished or dismissed. */
  onDone: () => void;
};

/** Whether a tour is on screen right now. */
export function isTourRunning(): boolean {
  return active?.isActive() ?? false;
}

export function stopTour(): void {
  active?.destroy();
  active = null;
}

/**
 * Resolve the steps against this page and run them.
 *
 * Returns false when nothing survived resolution, so the caller can decline
 * to mark a tour as seen that never actually ran.
 */
export function startTour({ steps, onDone }: StartOptions): boolean {
  stopTour();

  const isDesktop = window.matchMedia("(min-width: 768px)").matches;
  const resolved = resolveSteps(steps, (a) => pickVisible(a) !== null, { isDesktop });

  if (resolved.length === 0) return false;

  const instance = driver({
    showProgress: resolved.length > 1,
    progressText: "{{current}} of {{total}}",
    allowClose: true,
    stagePadding: isDesktop ? 8 : 4,
    stageRadius: 12,
    smoothScroll: false,
    // Every step explains; none asks for a click. This also stops a press on
    // the highlighted tour button restarting the tour from inside itself.
    disableActiveInteraction: true,
    // Belt and braces behind resolveSteps: if an element disappears between
    // resolution and display, skip rather than show an unattached popover.
    skipMissingElement: true,
    animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    overlayOpacity: 0.6,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Got it",
    steps: resolved.map(toDriverStep),
    onHighlighted: (element) => {
      if (!element) return;

      scrollIntoViewX(element);

      // Nudge out from under the fixed navbar, which driver's own scrolling
      // does not account for, then reposition — the popover was placed
      // against the pre-scroll rectangle.
      const rect = element.getBoundingClientRect();
      if (rect.top < NAV_OFFSET) {
        window.scrollBy({ top: rect.top - NAV_OFFSET, behavior: "auto" });
      }

      instance.refresh();
    },
    onDestroyed: () => {
      active = null;
      onDone();
    },
  });

  active = instance;
  instance.drive();

  return true;
}

function toDriverStep(step: ResolvedStep) {
  // Resolved a second time, at display rather than at planning: between the
  // two, a fetch may have landed and replaced the element. Falling back to a
  // page-level popover beats pointing at a detached node.
  const element = step.anchor ? pickVisible(step.anchor) ?? undefined : undefined;

  return {
    element,
    popover: {
      title: step.title,
      description: step.description,
      side: step.side,
      align: step.align,
    },
  };
}
