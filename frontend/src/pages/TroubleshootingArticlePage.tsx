import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTheme } from "next-themes";
import TroubleshootingLayout, { Eyebrow } from "@/components/troubleshooting/TroubleshootingLayout";
import { SupportEscapeSection } from "@/components/troubleshooting/SupportEscape";
import SymptomLink from "@/components/troubleshooting/SymptomLink";
import { Callout } from "@/components/ui/callout";
import { Badge } from "@/components/ui/statusbadge";
import { getSymptom, getTroubleshootingConfig } from "@/api/troubleshooting";
import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";
import { useViewState } from "@/hooks/useViewState";
import { useAuth } from "@/hooks/useAuth";
import { useArticleEditor } from "@/hooks/useArticleEditor";
import EditModeBar from "@/components/troubleshooting/edit/EditModeBar";
import EditableText from "@/components/troubleshooting/edit/EditableText";
import StepEditor from "@/components/troubleshooting/edit/StepEditor";
import { useSubjectBackNav } from "@/hooks/useSubjectBackNav";
import { stepAnchorId, troubleshootingIndexPath } from "@/lib/troubleshootingRoutes";
import type {
  Figure,
  FigureImage,
  Step,
  SymptomResponse,
  TroubleshootingConfig,
} from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                    TROUBLESHOOTING ARTICLE                      |
///  +-----------------------------------------------------------------+
//
//  One symptom's steps, at its own URL. The URL is the point: IT sending
//  somebody a direct link to the right article is a large part of what this
//  feature is for, so the symptom is a route parameter rather than component
//  state.
//
//  The sidebar switches to step navigation in here rather than staying on
//  page navigation: the index's section anchors don't exist on this page.
//
//  Steps are observed as they scroll into view, but ONLY to record how far
//  people get. The escape hatch carries no context by decision — someone who
//  has exhausted these steps has a problem past what surface-level
//  troubleshooting covers, so which step they stopped at doesn't travel
//  usefully to whoever picks up the phone. It is still worth knowing in
//  aggregate, which is what the tracking is for and all it is for.
///  +-----------------------------------------------------------------+

/** Shown for a symptom that is listed but not yet written. A placeholder
 *  rather than a 404: the symptom being KNOWN is itself information, and the
 *  escape block below is what the person actually needs. */
function DraftNotice() {
  return (
    <div className="rounded-lg border border-outline bg-surface-container-low/20 p-6">
      <div className="mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined !text-[20px] text-info-light">
          edit_note
        </span>
        <strong className="text-base font-bold">Steps haven&apos;t been written yet</strong>
      </div>
      <p className="max-w-[62ch] text-sm text-info-light">
        This symptom is one we know about, but the written steps for it aren&apos;t
        ready. Contact IT support below and mention the symptom name — it also tells
        us this is one worth writing up next.
      </p>
    </div>
  );
}

/**
 * A step's figure: none, one or several screenshots above a required caption.
 *
 * The caption renders either way and carries the accessible description, so
 * the pictures are all `alt=""` — the two would say the same thing, and a
 * screen reader announcing a caption once per image is worse than once.
 *
 * Bordered and boxed rather than bare so a screenshot of a window doesn't
 * bleed into the page around it; screenshots of UI have no natural edge.
 *
 * A cap rather than a percentage, because a percentage is relative to the
 * column and would scale a narrow screenshot and a wide one by different
 * amounts.
 */
const FIGURE_IMAGE = "max-w-full self-start rounded-lg border border-outline";

// Three widths, chosen by the figure rather than measured from the file. A
// tray flyout is legible small and dominates the step at full size; a Task
// Manager window is unreadable at flyout width; and a whole-screen capture is
// unreadable at either, because the control being pointed at is a small part
// of a 1400px-wide picture. Full class literals, not built by concatenation,
// so Tailwind can see them.
//
// `full` fills the column rather than naming a number. Every capture using it
// is at least 1129px wide against a column of roughly 790px, so it is still
// being scaled DOWN — the size is a ceiling on how small to draw it, never a
// licence to upscale a small image into a blurry one.
const FIGURE_WIDTH = {
  flyout: "sm:max-w-[17rem]",
  window: "sm:max-w-[34rem]",
  full: "sm:max-w-full",
} as const;

// The same three sizes when a figure holds a sequence, so the whole row takes
// about as much room as one picture would and the step below stays in view.
// Phone screenshots are portrait and very tall, which is why the paired
// flyout width is well under half — two full-height iPhone captures at 17rem
// each would be a 1200px wall in the middle of a five-step article.
const FIGURE_WIDTH_PAIRED = {
  flyout: "max-w-[9rem] sm:max-w-[11rem]",
  window: "sm:max-w-[17rem]",
  full: "sm:max-w-[24rem]",
} as const;

/**
 * One picture in a figure, in whichever theme is on screen.
 *
 * Read from next-themes rather than swapped with a `dark:` utility. This app
 * has a `.dark` class but has never wired Tailwind's `dark:` variant to it —
 * under Tailwind v4 that variant defaults to prefers-color-scheme, so
 * `dark:hidden` follows the OPERATING SYSTEM and ignores the in-app toggle
 * entirely. Theming here works through CSS custom properties instead (the
 * tokens take different values inside `.dark`), which is why nothing else in
 * the app needed the variant.
 *
 * resolvedTheme rather than theme, so "system" resolves to what is actually
 * on screen. It is undefined until the provider mounts; the light image shows
 * until then, which is what a reader on the default theme sees anyway.
 */
function FigureShot({ image, className }: { image: FigureImage; className: string }) {
  const { resolvedTheme } = useTheme();
  const src = resolvedTheme === "dark" && image.srcDark ? image.srcDark : image.src;

  return (
    <img
      src={`/troubleshooting/${src}`}
      // Empty alt on purpose: the figcaption below carries the same words, and
      // a screen reader would otherwise announce them once per picture. The
      // caption is the accessible description — see schema.ts, where it is
      // required and the images are not.
      alt=""
      className={className}
      loading="lazy"
    />
  );
}

function StepFigure({ figure }: { figure: Figure }) {
  const images = figure.images ?? [];

  // A pair renders side by side and each picture takes half the room, so the
  // two together occupy what one would have. That is the point of a pair —
  // the route and the destination read as one illustration, not as two
  // figures stacked up pushing the next step off the screen.
  //
  // `flex-wrap` rather than a fixed two-column grid: on a narrow screen a
  // phone screenshot cut to half width is unreadable, so they stack instead.
  const many = images.length > 1;
  const width = many
    ? FIGURE_WIDTH_PAIRED[figure.size ?? "flyout"]
    : FIGURE_WIDTH[figure.size ?? "flyout"];

  return (
    <figure className="flex flex-col gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap items-start gap-3">
          {images.map((image) => (
            <FigureShot
              key={image.src}
              image={image}
              className={`${FIGURE_IMAGE} ${width}`}
            />
          ))}
        </div>
      )}
      <figcaption className="flex items-center gap-2 text-[13px] text-info-light">
        <span className="material-symbols-outlined !text-[16px]">image</span>
        {figure.caption}
      </figcaption>
    </figure>
  );
}

function StepBlock({
  step,
  index,
  subjectKey,
  symptomId,
}: {
  step: Step;
  index: number;
  subjectKey: string;
  symptomId: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  // "Steps reached" — how far into an article people get before giving up.
  //
  // Fired once per step, the first time it comes into view, and then the
  // observer disconnects: re-scrolling past step 2 is not a second attempt at
  // it, and counting it as one would inflate exactly the shallow steps that
  // are least interesting.
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        trackTroubleshooting({
          type: "STEP_REACHED",
          subjectKey,
          symptomId,
          stepNumber: index + 1,
        });
        observer.disconnect();
      },
      // Half the step visible, so a step clipped at the bottom of the
      // viewport on the way past doesn't count as reached.
      { threshold: 0.5 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [subjectKey, symptomId, index]);

  return (
    // scroll-mt clears the fixed navbar, so a step linked from the sidebar
    // lands with its heading visible rather than tucked underneath it.
    <section
      ref={ref}
      id={stepAnchorId(index)}
      className="grid scroll-mt-24 grid-cols-[2rem_minmax(0,1fr)] gap-4 border-b border-outline/40 py-6 last:border-b-0"
    >
      <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {index + 1}
      </span>
      <div className="flex min-w-0 flex-col gap-3">
        <h3 className="text-base font-bold">{step.title}</h3>
        <p className="max-w-[68ch] text-[15px] leading-relaxed text-info-light">
          {step.body}
        </p>

        {step.note && <Callout variant="note">{step.note}</Callout>}
        {step.warn && <Callout variant="warn">{step.warn}</Callout>}

        {step.figure && <StepFigure figure={step.figure} />}

        {/* The exit for when this step reveals the real problem is a
            different symptom. Branches may point at another device, so the
            target's own key wins when it carries one. */}
        {step.branch && (
          <SymptomLink
            variant="branch"
            subjectKey={step.branch.targetSubjectKey ?? subjectKey}
            symptomId={step.branch.targetSymptomId}
            label={step.branch.label}
          />
        )}
      </div>
    </section>
  );
}

export default function TroubleshootingArticlePage() {
  const { subjectKey, symptomId } = useParams<{ subjectKey: string; symptomId: string }>();
  const location = useLocation();

  // Returns to the symptom list as the reader left it when they arrived from
  // it, and behaves as an ordinary link when they didn't.
  const backToSymptoms = useSubjectBackNav(subjectKey);

  // Edit mode is OFF by default, so an admin reads the page exactly as a user
  // does until they ask to change it. The button is a courtesy — the real
  // guard is server-side, and every admin route 403s without it.
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";
  const [editing, setEditing] = useState(false);
  const editor = useArticleEditor(subjectKey, symptomId, editing && isAdmin);

  const [config, setConfig] = useState<TroubleshootingConfig | null>(null);
  const [data, setData] = useState<SymptomResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getTroubleshootingConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (!subjectKey || !symptomId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getSymptom(subjectKey, symptomId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Couldn't load this article.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectKey, symptomId]);

  const article = data?.article ?? null;

  // "Articles opened" — which articles anyone actually reads.
  //
  // Keyed on the route rather than on the fetch, and fired for Drafts too: a
  // Draft that gets opened repeatedly is the strongest signal there is that
  // it's the next one worth writing.
  useEffect(() => {
    if (!subjectKey || !symptomId) return;
    trackTroubleshooting({ type: "ARTICLE_OPENED", subjectKey, symptomId });
  }, [subjectKey, symptomId]);

  // An article has no state of its own worth keeping — no accordion, no
  // search — but scroll position matters as much as it does on the index.
  // Following a branch from step 5 and pressing Back should return you to
  // step 5, not to the top of an article you had already worked through.
  //
  // Ready once the steps have rendered: until then the page is a spinner and
  // scrolling down it would do nothing.
  useViewState(
    "troubleshooting-article",
    location.key,
    null,
    !loading && !error && data !== null
  );

  // Inside an article the sidebar is step navigation rather than page
  // navigation — the index's "Your device / Symptoms" anchors point at
  // sections that don't exist here, so carrying them over would leave two
  // dead links in the rail.
  //
  // Plain anchors, no scroll-spy: nothing on this page needs to know which
  // step you're on now that the escape hatch doesn't carry context.
  const sidebar = (
    <>
      <Eyebrow>{article ? "Steps" : "This article"}</Eyebrow>

      {article && (
        <nav className="flex flex-col gap-0.5">
          {article.steps.map((step, i) => (
            <a
              key={stepAnchorId(i)}
              href={`#${stepAnchorId(i)}`}
              className="flex gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] leading-snug text-info-light hover:bg-surface-container-low/30 hover:text-on-background transition-colors"
            >
              <span className="shrink-0 text-info-light">{i + 1}</span>
              <span className="min-w-0">{step.title}</span>
            </a>
          ))}
        </nav>
      )}

      <a
        href="#help"
        className="rounded-lg px-2.5 py-2 text-[13px] font-semibold text-info-light hover:text-primary transition-colors"
      >
        ↳ Still not fixed
      </a>

      <Link
        {...backToSymptoms}
        className="rounded-lg border border-outline px-2.5 py-2 text-center text-[13px] font-semibold text-info-light hover:bg-surface-container-low/30 hover:text-on-background transition-colors"
      >
        ← All symptoms
      </Link>
    </>
  );

  return (
    <TroubleshootingLayout
      subjectKey={subjectKey ?? null}
      subjectLabel={data?.subject.label ?? ""}
      subjectLabelSingular={data?.subject.labelSingular ?? "device"}
      breadcrumbTail={data?.symptom.label}
      config={config}
      sidebar={sidebar}
    >
      {loading && (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-info-light">
          <span className="size-5 animate-spin rounded-full border-2 border-outline border-t-transparent" />
          Loading article...
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-outline bg-surface p-6">
          <div className="flex items-center gap-2 text-sm text-error">
            <span className="material-symbols-outlined !text-[18px]">info</span>
            {error}
          </div>
          <Link
            to={troubleshootingIndexPath()}
            className="text-sm font-semibold text-primary hover:underline"
          >
            ← Back to troubleshooting
          </Link>
        </div>
      )}

      {editing && isAdmin && editor.working && (
        <EditModeBar
          hasDraft={editor.hasDraft}
          saveState={editor.saveState}
          publishing={editor.publishing}
          issues={editor.issues}
          warnings={editor.warnings}
          subjectKeys={editor.article?.subjectKeys ?? []}
          currentSubjectKey={subjectKey ?? ""}
          onPublish={() => {
            void editor.publish().then((ok) => {
              // Republish means the page's own copy is stale — reload it so
              // the admin sees what a reader now sees.
              if (ok) void getSymptom(subjectKey!, symptomId!).then(setData);
            });
          }}
          onDiscard={() => void editor.discard()}
          onDone={() => setEditing(false)}
        />
      )}

      {!loading && !error && data && (
        <article className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 border-b border-outline/40 pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                {...backToSymptoms}
                className="rounded-lg border border-outline px-2.5 py-1 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 transition-colors"
              >
                ← All symptoms
              </Link>
              <Badge
                icon="category"
                label={data.category.name}
                bg="bg-primary/10"
                text="text-primary"
                size="compact"
              />
              {isAdmin && !editing && article && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-primary/40 px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10 hover:cursor-pointer transition-colors"
                >
                  <span className="material-symbols-outlined !text-[16px]">edit</span>
                  Edit
                </button>
              )}
            </div>

            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              {data.symptom.label}
            </h2>

            {article && (
              <>
                {editing && editor.working ? (
                  <EditableText
                    value={editor.working.summary}
                    onChange={(summary) =>
                      editor.update((body) => ({ ...body, summary }))
                    }
                    ariaLabel="Article summary"
                    className="max-w-[66ch] text-[15px] text-info-light"
                    rows={2}
                  />
                ) : (
                  <p className="max-w-[66ch] text-[15px] text-info-light">
                    {article.summary}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-info-light">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[16px]">schedule</span>
                    {article.timeEstimate}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[16px]">devices</span>
                    Applies to {article.appliesTo}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[16px]">update</span>
                    {/* Authored, not derived from git — a whitespace fix must
                        not bump the date a reader trusts. */}
                    Updated{" "}
                    {new Date(article.updated).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </>
            )}
          </div>

          {!article && <DraftNotice />}

          {article && article.before.length > 0 && (
            <section className="rounded-lg border border-outline bg-surface p-5">
              <strong className="mb-2 block text-sm font-bold">Before you start</strong>
              <ul className="flex flex-col gap-1.5">
                {article.before.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-info-light">
                    <span aria-hidden className="text-info-light">
                      —
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {article && editing && editor.working ? (
            <div className="flex flex-col">
              {editor.working.steps.map((step, i) => (
                <StepEditor
                  key={i}
                  step={step}
                  index={i}
                  total={editor.working!.steps.length}
                  subjectKey={subjectKey!}
                  symptomId={symptomId!}
                  symptoms={[data.symptom, ...data.siblings]}
                  onChange={(next) =>
                    editor.update((body) => ({
                      ...body,
                      steps: body.steps.map((s, j) => (j === i ? next : s)),
                    }))
                  }
                  onMove={(direction) =>
                    editor.update((body) => {
                      const target = i + direction;
                      if (target < 0 || target >= body.steps.length) return body;
                      const steps = [...body.steps];
                      [steps[i], steps[target]] = [steps[target], steps[i]];
                      return { ...body, steps };
                    })
                  }
                  onRemove={() =>
                    editor.update((body) => ({
                      ...body,
                      // The schema requires at least one step, so the last one
                      // cannot be deleted — an article with no steps is a
                      // draft, not an article.
                      steps:
                        body.steps.length > 1
                          ? body.steps.filter((_, j) => j !== i)
                          : body.steps,
                    }))
                  }
                />
              ))}

              <button
                type="button"
                onClick={() =>
                  editor.update((body) => ({
                    ...body,
                    steps: [...body.steps, { title: "", body: "" }],
                  }))
                }
                className="mt-4 self-start rounded-lg border border-dashed border-outline px-3 py-2 text-sm font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
              >
                + Add step
              </button>
            </div>
          ) : article ? (
            <div className="flex flex-col">
              {article.steps.map((step, i) => (
                <StepBlock
                  key={stepAnchorId(i)}
                  step={step}
                  index={i}
                  subjectKey={subjectKey!}
                  symptomId={symptomId!}
                />
              ))}
            </div>
          ) : null}

          {/* Where the steps came from, when they came from a manufacturer.
              Most of the library is rewritten from Apple's and Samsung's own
              documentation, because people will not leave this site to go and
              read a vendor page — so we bring the content to them.

              BELOW THE STEPS, NOT ABOVE THEM, and deliberately quiet. The
              reader is here to fix a phone, and a citation at the top is an
              invitation to go and read the other page instead, which is the
              exact behaviour this library exists to remove. It sits at the
              end for the person who wants to check our working, and for a
              reviewer who needs to know which page to re-check when Apple
              moves a setting. */}
          {article?.source && (
            <p className="flex items-center gap-1.5 text-[13px] text-info-light">
              <span className="material-symbols-outlined !text-[16px]">link</span>
              Adapted from{" "}
              <a
                href={article.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-primary hover:underline"
              >
                {article.source.name}
              </a>
            </p>
          )}

          {/* Siblings from the same category, offered once the steps have run
              out. Drafts are included deliberately — the same reasoning as
              listing them on the index: a symptom we know about but haven't
              written up is still worth showing, and hiding it here would make
              the category look thinner than it is. */}
          {data.siblings.length > 0 && (
            <section className="flex flex-col gap-3 pt-2">
              <Eyebrow>Other symptoms in {data.category.name}</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {data.siblings.map((sibling) => (
                  <SymptomLink
                    key={sibling.id}
                    variant="chip"
                    subjectKey={subjectKey!}
                    symptomId={sibling.id}
                    label={sibling.label}
                  />
                ))}
              </div>
            </section>
          )}
        </article>
      )}

      {config && (
        <SupportEscapeSection
          config={config}
          context={{ subjectKey, symptomId }}
        />
      )}
    </TroubleshootingLayout>
  );
}
