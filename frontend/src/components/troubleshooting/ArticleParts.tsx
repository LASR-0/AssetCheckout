import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { Tray, TrayLabel, Sheet } from "@/components/ui/tray";
import { btn } from "@/components/ui/variants";
import { orderedBlocks } from "@/lib/troubleshootingBlocks";
import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";
import { scrollRoot } from "@/lib/scrollRoot";
import { stepAnchorId, troubleshootingArticlePath } from "@/lib/troubleshootingRoutes";
import RichText from "./RichText";
import FigureLightbox from "./FigureLightbox";
import { trackEscape } from "./escape";
import type { Figure, FigureImage, Step } from "@/types/troubleshootingType";


///  +-----------------------------------------------------------------+
///  |                  READING AN ARTICLE                             |
///  +-----------------------------------------------------------------+
//
//  Two ways to read the same steps, switchable and remembered per browser:
//
//  GUIDED, one step at a time, asking "Did that fix it?" after each. A
//  reader who answers yes is done and told which step fixed it; one who
//  runs out of steps is handed to IT with what they tried already listed.
//  This is the default: most fixes are in the first three steps, and one
//  step on screen is one thing to do.
//
//  ALL STEPS, the whole article as a numbered list, for the reader who
//  wants to scan ahead or already knows which step they need.
//
//  Either way a step is its body and up to five blocks in the author's
//  order (see lib/troubleshootingBlocks): a note (amber, safe to skip), a
//  warning (red, the cost of getting it wrong), a screenshot, a branch to
//  another symptom, and a link out of the library.
///  +-----------------------------------------------------------------+

export type ArticleText = { before: string[]; steps: Step[] };

/// ── Blocks ───────────────────────────────────────────────────────────

const CALLOUT = {
  note: { label: "Note", icon: "info", frame: "bg-prog-bg shadow-[inset_0_0_0_1px_var(--prog-line)]", tone: "text-prog" },
  warn: { label: "Warning", icon: "warning", frame: "bg-stop-bg shadow-[inset_0_0_0_1px_var(--stop-line)]", tone: "text-stop" },
  branch: { label: "If this applies", icon: "alt_route", frame: "bg-brand-sub shadow-[inset_0_0_0_1px_var(--brand-line)]", tone: "text-brand-tx" },
  link: { label: "External link", icon: "open_in_new", frame: "bg-sheet shadow-[inset_0_0_0_1px_var(--brand-line)]", tone: "text-brand-tx" },
} as const;

function Callout({ kind, children, after }: { kind: keyof typeof CALLOUT; children: ReactNode; after?: ReactNode }) {
  const c = CALLOUT[kind];
  return (
    <div className={cn("grid max-w-[72ch] grid-cols-[1.25rem_minmax(0,1fr)] gap-2.5 rounded-10 px-3.5 py-3", c.frame)}>
      <Icon name={c.icon} size={17} className={cn("leading-5", c.tone)} />
      <div className="flex min-w-0 flex-col gap-1">
        <TrayLabel className={cn("leading-5", c.tone)}>{c.label}</TrayLabel>
        <span className="fs-13 leading-[1.6] text-pretty text-tx">{children}</span>
        {after}
      </div>
    </div>
  );
}

/** Host only, never the path: these are often Teams deep links, and the one
 *  word a reader can act on is where it lands. Null if it won't parse. */
function linkHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// Three widths, chosen by the figure rather than measured from the file: a
// flyout is legible small, a window isn't, and a whole-screen capture needs
// the column. A pair takes about the room one would, so the next step stays
// in view; a pair of whole-screen captures stacks instead of halving.
const FIGURE_WIDTH = { flyout: "phone:max-w-68", window: "phone:max-w-136", full: "phone:max-w-full" } as const;
const FIGURE_WIDTH_PAIRED = { flyout: "max-w-36 phone:max-w-44", window: "phone:max-w-68", full: "phone:max-w-96" } as const;

/**
 * One picture in whichever theme is on screen. Read from next-themes, as
 * the app's dark mode is a class Tailwind's `dark:` variant doesn't follow.
 * `alt=""` because the caption beneath says the same thing once.
 */
function FigureShot({ image, className }: { image: FigureImage; className: string }) {
  const { resolvedTheme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const src = `/troubleshooting/${resolvedTheme === "dark" && image.srcDark ? image.srcDark : image.src}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Show this screenshot full size"
        className="cursor-zoom-in appearance-none border-0 bg-transparent p-0 text-left outline-none focus-visible:outline-2 focus-visible:outline-brand"
      >
        <img src={src} alt="" loading="lazy" className={cn("max-w-full self-start rounded-10 border border-line", className)} />
      </button>
      {expanded && <FigureLightbox src={src} onClose={() => setExpanded(false)} />}
    </>
  );
}

export function StepFigure({ figure }: { figure: Figure }) {
  const images = figure.images ?? [];
  const many = images.length > 1;
  const size = figure.size ?? "flyout";
  const stacked = many && size === "full";
  const width = stacked ? FIGURE_WIDTH.full : many ? FIGURE_WIDTH_PAIRED[size] : FIGURE_WIDTH[size];
  return (
    <figure className="m-0 flex flex-col gap-2">
      {images.length > 0 && (
        <div className={stacked ? "flex flex-col items-start gap-3" : "flex flex-wrap items-start gap-3"}>
          {images.map((image) => (
            <FigureShot key={image.src} image={image} className={width} />
          ))}
        </div>
      )}
      <figcaption className="flex items-center gap-1.5 font-mono fs-11.5 text-tx3">
        <Icon name="image" size={14} className="text-mut" />
        {figure.caption}
      </figcaption>
    </figure>
  );
}

type BlocksProps = {
  step: Step;
  subjectKey: string;
  /** A branch's destination, worded as the reader will find it. */
  labelOf: (symptomId: string) => string | null;
};

export function StepBlocks({ step, subjectKey, labelOf }: BlocksProps) {
  return (
    <>
      {orderedBlocks(step).map((kind) => {
        switch (kind) {
          case "note":
          case "warn":
            return (
              <Callout key={kind} kind={kind}>
                <RichText text={step[kind]!} />
              </Callout>
            );
          case "figure":
            return <StepFigure key="figure" figure={step.figure!} />;
          case "branch": {
            const b = step.branch!;
            return (
              <Callout
                key="branch"
                kind="branch"
                after={
                  <Link
                    to={troubleshootingArticlePath(b.targetSubjectKey ?? subjectKey, b.targetSymptomId)}
                    className="mt-1 flex h-8.5 items-center gap-1.5 self-start rounded-8 bg-sheet px-3 fs-12 font-medium text-brand-tx no-underline shadow-[inset_0_0_0_1px_var(--brand-line)] outline-none hover:bg-brand-sub focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {labelOf(b.targetSymptomId) ?? "Open it"}
                    <Icon name="arrow_forward" size={15} />
                  </Link>
                }
              >
                {b.label}
              </Callout>
            );
          }
          case "link": {
            const l = step.link!;
            const host = linkHost(l.url);
            // A new tab: it leaves the library, and a reader part-way
            // through should come back to find their place.
            return (
              <Callout
                key="link"
                kind="link"
                after={
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-1.25 self-start fs-12 font-medium text-brand-tx hover:underline"
                  >
                    {host ?? "Open it"}
                    <Icon name="north_east" size={14} />
                  </a>
                }
              >
                {l.label}
              </Callout>
            );
          }
        }
      })}
    </>
  );
}

export function BeforeYouStart({ items }: { items: string[] }) {
  return (
    <div className="flex gap-3 rounded-12 bg-ok-bg px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--ok-line)]">
      <Icon name="checklist" size={18} className="text-ok" />
      <div className="flex flex-col gap-1">
        <TrayLabel className="text-ok">Before you start</TrayLabel>
        {items.map((item, i) => (
          <span key={i} className="fs-13 leading-[1.55]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

/// ── Guided ───────────────────────────────────────────────────────────

export type Stage = "step" | "fixed" | "out";

type GuidedProps = {
  text: ArticleText;
  subjectKey: string;
  symptomId: string;
  labelOf: (symptomId: string) => string | null;
  step: number;
  stage: Stage;
  onGo: (step: number, stage: Stage) => void;
  /** Showing an unpublished draft: nothing is recorded and "Yes" does nothing. */
  preview?: boolean;
  /** Below the edit bar, the rail sticks lower. */
  stickLow?: boolean;
  /** Null when no Teams channel is set up: there's nothing to skip ahead to. */
  onMessage: ((tried: number[]) => void) | null;
  /** The ways out, rendered at the end of the steps. */
  escapes: (tried: number[]) => ReactNode;
  backTo: { to: string; onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void };
};

export function Guided({ text, subjectKey, symptomId, labelOf, step, stage, onGo, preview, stickLow, onMessage, escapes, backTo }: GuidedProps) {
  const steps = text.steps;
  const n = steps.length;
  const si = Math.min(step, Math.max(0, n - 1));
  const cur = steps[si];
  const doneN = stage === "out" ? n : si;
  const tried = Array.from({ length: doneN }, (_, i) => i);

  // "Steps reached": once per step, the first time it's shown.
  const reached = useRef(new Set<number>());
  useEffect(() => {
    if (preview || stage !== "step" || reached.current.has(si)) return;
    reached.current.add(si);
    trackTroubleshooting({ type: "STEP_REACHED", subjectKey, symptomId, stepNumber: si + 1 });
  }, [preview, stage, si, subjectKey, symptomId]);

  // A new step starts at the top of the page, as a new page would.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    scrollRoot()?.scrollTo({ top: 0 });
  }, [si, stage]);

  const next = () => {
    if (si < n - 1) return onGo(si + 1, "step");
    if (preview) return;
    trackEscape("nothing_worked", { subjectKey, symptomId });
    onGo(si, "out");
  };

  const rail = steps.map((s, i) => {
    const done = stage === "out" || i < si;
    const isCur = stage === "step" && i === si;
    const fix = stage === "fixed" && i === si;
    const skip = stage === "fixed" && i > si;
    return { i, title: s.title || "Untitled step", done, isCur, fix, skip };
  });

  return (
    <div className="grid grid-cols-1 items-start gap-x-9 gap-y-5 desk:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className={cn("hidden flex-col gap-2.5 desk:sticky desk:flex", stickLow ? "desk:top-24" : "desk:top-6")}>
        <Tray label="Your progress" aside={preview ? "Preview" : `${doneN} of ${n} tried`}>
          <Sheet className="flex flex-col p-1.5">
            {rail.map((r) => (
              <button
                key={r.i}
                type="button"
                onClick={() => onGo(r.i, "step")}
                aria-current={r.isCur ? "step" : undefined}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-8 border-0 p-2 text-left font-sans fs-12 leading-[1.4] outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-brand",
                  r.isCur ? "bg-brand-sub font-medium text-brand-tx hover:bg-brand-sub" : cn("bg-transparent", r.skip ? "text-dis" : r.done ? "text-tx3" : "text-tx2")
                )}
              >
                <span
                  className={cn(
                    "grid size-5 flex-none place-items-center rounded-full",
                    r.fix ? "bg-ok text-sheet" : r.done ? "bg-track text-tx3" : r.isCur ? "bg-brand text-on-brand" : "bg-sheet text-mut shadow-[inset_0_0_0_1px_var(--line)]"
                  )}
                >
                  {r.done || r.fix ? <Icon name={r.fix ? "check" : "done"} size={14} /> : <span className="font-title fs-10">{r.i + 1}</span>}
                </span>
                <span className="min-w-0 flex-1 text-pretty">{r.title}</span>
              </button>
            ))}
          </Sheet>
        </Tray>
        {onMessage && (
        <button
          type="button"
          onClick={() => onMessage(tried)}
          className="flex cursor-pointer items-center gap-2 rounded-10 border-0 bg-transparent px-3 py-2.5 text-left font-sans fs-12 text-tx3 outline-none hover:bg-hover hover:text-tx focus-visible:outline-2 focus-visible:outline-brand"
        >
          <Icon name="support_agent" size={17} />
          Skip ahead and contact IT
        </button>
        )}
      </aside>

      <div className="flex flex-col gap-2 desk:hidden">
        <div className="flex justify-between">
          <TrayLabel>Your progress</TrayLabel>
          <TrayLabel>{preview ? "Preview" : `${doneN} of ${n} tried`}</TrayLabel>
        </div>
        <div className="flex gap-1">
          {rail.map((r) => (
            <button
              key={r.i}
              type="button"
              title={r.title}
              aria-label={`Step ${r.i + 1}: ${r.title}`}
              onClick={() => onGo(r.i, "step")}
              className={cn("h-1.5 flex-1 cursor-pointer rounded-3 border-0 p-0", r.fix ? "bg-ok" : r.isCur ? "bg-brand" : r.done ? "bg-strong" : "bg-track")}
            />
          ))}
        </div>
      </div>

      <div className="flex min-w-0 max-w-205 flex-col gap-3">
        {stage === "step" && si === 0 && text.before.length > 0 && <BeforeYouStart items={text.before} />}

        {stage === "step" && cur && (
          <section aria-label={`Step ${si + 1} of ${n}`} className="flex flex-col rounded-16 border border-line bg-sheet shadow-card">
            <div className="flex flex-col gap-3.5 px-4.5 py-5 desk:px-8 desk:py-7">
              <TrayLabel className="text-brand-tx">
                Step {si + 1} of {n}
              </TrayLabel>
              <h2 className="m-0 font-head fs-18 leading-[1.3] font-semibold tracking-[-0.01em] text-pretty desk:fs-21">{cur.title || "Untitled step"}</h2>
              <p className="m-0 max-w-[64ch] fs-15 leading-[1.7] text-pretty text-tx2">
                <RichText text={cur.body} />
              </p>
              <StepBlocks step={cur} subjectKey={subjectKey} labelOf={labelOf} />
            </div>
            <div data-tour="ts-escape" className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-b-16 border-t border-line2 bg-subtle px-4.5 py-4 desk:px-8">
              <span className="flex-[1_1_10rem] fs-14 font-semibold">Did that fix it?</span>
              {si > 0 && (
                <button type="button" onClick={() => onGo(si - 1, "step")} className={btn({ variant: "ghost", size: "lg", className: "h-10.5 px-3 fs-12.5" })}>
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={() => !preview && onGo(si, "fixed")}
                className={btn({ size: "lg", className: "h-10.5 border-ok-line bg-ok-bg fs-12.5 text-ok hover:bg-ok-bg hover:brightness-97" })}
              >
                <Icon name="check" size={17} />
                Yes, it&rsquo;s working
              </button>
              <button type="button" onClick={next} className={btn({ variant: "primary", size: "lg", className: "h-10.5 fs-12.5" })}>
                {si < n - 1 ? "No, next step" : "No, still broken"}
                <Icon name="arrow_forward" size={17} />
              </button>
            </div>
          </section>
        )}

        {stage === "fixed" && cur && (
          <section className="flex flex-col items-start gap-3 rounded-16 border border-ok-line bg-sheet px-4.5 py-5 desk:px-8 desk:py-7">
            <span className="grid size-12 place-items-center rounded-full bg-ok-bg text-ok">
              <Icon name="check" size={24} />
            </span>
            <h2 className="m-0 font-head fs-18 font-semibold tracking-[-0.01em] desk:fs-21">Good, it&rsquo;s working again</h2>
            <p className="m-0 max-w-[60ch] fs-14 leading-[1.6] text-pretty text-tx3">
              Fixed at step {si + 1}: {cur.title}. If it happens again, start from that step.
            </p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              <Link {...backTo} className={btn({ variant: "primary", size: "lg", className: "h-10.5 fs-12.5 no-underline" })}>
                Back to troubleshooting
              </Link>
              <button
                type="button"
                onClick={() => (si < n - 1 ? onGo(si + 1, "step") : next())}
                className={btn({ size: "lg", className: "h-10.5 border-line fs-12.5" })}
              >
                It stopped working again
              </button>
            </div>
          </section>
        )}

        {stage === "out" && (
          <section className="flex flex-col gap-4 rounded-16 border border-brand-line bg-sheet px-4.5 py-5 shadow-[0_0_0_3px_var(--brand-sub)] desk:px-8 desk:py-7">
            <span className="grid size-12 place-items-center rounded-14 bg-brand-sub text-brand-tx">
              <Icon name="support_agent" size={24} weight={300} />
            </span>
            <div className="flex flex-col gap-1.5">
              <h2 className="m-0 font-head fs-18 font-semibold tracking-[-0.01em] desk:fs-21">Time to hand it to IT</h2>
              <p className="m-0 max-w-[60ch] fs-14 leading-[1.6] text-pretty text-tx3">
                You&rsquo;ve worked through every step. IT will ask what you&rsquo;ve already tried, so the message lists it for you.
              </p>
            </div>
            <div className="flex flex-col gap-1.5 rounded-11 border border-line2 bg-subtle px-3.5 py-3">
              {steps.map((s, i) => (
                <div key={i} className="flex gap-2.25 fs-12.5 leading-[1.45] text-tx2">
                  <Icon name="done" size={15} className="leading-4.5 text-mut" />
                  {i + 1}. {s.title}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {escapes(tried)}
              <button type="button" onClick={() => onGo(0, "step")} className={btn({ variant: "ghost", size: "lg", className: "h-10.5 px-3 fs-12.5" })}>
                Start over
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/// ── All steps ────────────────────────────────────────────────────────

function AllStep({ step, index, subjectKey, symptomId, labelOf }: { step: Step; index: number } & Omit<BlocksProps, "step"> & { symptomId: string }) {
  const ref = useRef<HTMLElement | null>(null);

  // "Steps reached" here is a step half in view, once: re-scrolling past
  // step 2 isn't a second attempt at it.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        trackTroubleshooting({ type: "STEP_REACHED", subjectKey, symptomId, stepNumber: index + 1 });
        observer.disconnect();
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [subjectKey, symptomId, index]);

  return (
    <section
      ref={ref}
      id={stepAnchorId(index)}
      className="grid scroll-mt-6 grid-cols-[2rem_minmax(0,1fr)] gap-x-4.5 rounded-14 border border-line bg-sheet px-4.5 py-5 desk:px-8 desk:py-7"
    >
      <span className="grid size-8 place-items-center rounded-full bg-brand-sub font-title fs-12 font-medium text-brand-tx shadow-[inset_0_0_0_1px_var(--brand-line)]">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="m-0 mt-1 font-head fs-16 leading-[1.35] font-semibold text-pretty">{step.title}</h3>
        <p className="m-0 max-w-[64ch] fs-14 leading-[1.7] text-pretty text-tx2">
          <RichText text={step.body} />
        </p>
        <StepBlocks step={step} subjectKey={subjectKey} labelOf={labelOf} />
      </div>
    </section>
  );
}

export function AllSteps({
  text,
  subjectKey,
  symptomId,
  labelOf,
  escapes,
}: {
  text: ArticleText;
  subjectKey: string;
  symptomId: string;
  labelOf: (symptomId: string) => string | null;
  escapes: ReactNode;
}) {
  return (
    <div className="flex max-w-215 flex-col gap-3">
      {text.before.length > 0 && <BeforeYouStart items={text.before} />}
      {text.steps.map((s, i) => (
        <AllStep key={i} step={s} index={i} subjectKey={subjectKey} symptomId={symptomId} labelOf={labelOf} />
      ))}
      <div data-tour="ts-escape" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-14 border border-brand-line bg-sheet px-5 py-4.5">
        <Icon name="support_agent" size={22} weight={300} className="text-brand-tx" />
        <div className="flex flex-[1_1_15rem] flex-col gap-0.5">
          <span className="fs-14 font-semibold">None of it worked?</span>
          <span className="fs-12.5 text-tx3">IT can take it from here. Have your asset tag ready.</span>
        </div>
        {escapes}
      </div>
    </div>
  );
}

/// ── Around the steps ─────────────────────────────────────────────────

export function Others({ category, subjectKey, siblings }: { category: string; subjectKey: string; siblings: { id: string; label: string }[] }) {
  if (!siblings.length) return null;
  return (
    <div className="flex flex-col gap-2.5 pt-2">
      <TrayLabel>Not quite it? Others in {category}</TrayLabel>
      <div className="flex flex-wrap gap-1.5">
        {siblings.map((s) => (
          <Link
            key={s.id}
            to={troubleshootingArticlePath(subjectKey, s.id)}
            className="min-h-8.5 rounded-pill border border-line bg-sheet px-3.25 py-1.5 fs-12.5 leading-[1.3] text-tx2 no-underline outline-none hover:border-strong hover:text-tx focus-visible:outline-2 focus-visible:outline-brand"
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
