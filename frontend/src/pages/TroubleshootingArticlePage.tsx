import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TroubleshootingLayout, { Eyebrow } from "@/components/troubleshooting/TroubleshootingLayout";
import { SupportEscapeSection } from "@/components/troubleshooting/SupportEscape";
import SymptomLink from "@/components/troubleshooting/SymptomLink";
import { Callout } from "@/components/ui/callout";
import { Badge } from "@/components/ui/statusbadge";
import { getSymptom, getTroubleshootingConfig } from "@/api/troubleshooting";
import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";
import {
  stepAnchorId,
  troubleshootingSubjectPath,
  troubleshootingIndexPath,
} from "@/lib/troubleshootingRoutes";
import type {
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

        {/* A caption with no image. v1 ships no screenshots deliberately — a
            screenshot of a superseded settings screen misleads worse than
            prose does — and the caption carries the navigation path, which
            is what the picture would mostly have shown anyway. */}
        {step.figure && (
          <p className="flex items-center gap-2 text-[13px] text-info-light">
            <span className="material-symbols-outlined !text-[16px]">image</span>
            {step.figure}
          </p>
        )}

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
        to={troubleshootingSubjectPath(subjectKey ?? "")}
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

      {!loading && !error && data && (
        <article className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 border-b border-outline/40 pb-5">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to={troubleshootingSubjectPath(subjectKey ?? "")}
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
            </div>

            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
              {data.symptom.label}
            </h2>

            {article && (
              <>
                <p className="max-w-[66ch] text-[15px] text-info-light">
                  {article.summary}
                </p>
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

          {article && (
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
