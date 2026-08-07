import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TroubleshootingLayout, { Eyebrow } from "@/components/troubleshooting/TroubleshootingLayout";
import { SupportEscapeSection } from "@/components/troubleshooting/SupportEscape";
import { Callout } from "@/components/ui/callout";
import { Badge } from "@/components/ui/statusbadge";
import { getSymptom, getTroubleshootingConfig } from "@/api/troubleshooting";
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
//  Still to come in the next increment: the sidebar switching to step
//  navigation, branch buttons through to a related symptom, and the sibling
//  chips at the foot. The step data already carries its branches — they just
//  aren't rendered yet.
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

function StepBlock({ step, index }: { step: Step; index: number }) {
  return (
    <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 border-b border-outline/40 py-6 last:border-b-0">
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
      </div>
    </section>
  );
}

export default function TroubleshootingArticlePage() {
  const { deviceKey, symptomId } = useParams<{ deviceKey: string; symptomId: string }>();

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
    if (!deviceKey || !symptomId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getSymptom(deviceKey, symptomId)
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
  }, [deviceKey, symptomId]);

  const article = data?.article ?? null;

  const sidebar = (
    <>
      <Eyebrow>This article</Eyebrow>
      <Link
        to={`/troubleshooting/${deviceKey}`}
        className="rounded-lg px-2.5 py-2 text-sm font-semibold text-info-light hover:bg-surface-container-low/30 hover:text-on-background transition-colors"
      >
        ← All symptoms
      </Link>
      <a
        href="#help"
        className="rounded-lg px-2.5 py-2 text-[13px] font-semibold text-info-light hover:text-primary transition-colors"
      >
        ↳ Still not fixed
      </a>
    </>
  );

  return (
    <TroubleshootingLayout
      deviceKey={deviceKey ?? null}
      deviceLabel={data?.device.label ?? ""}
      deviceLabelSingular={data?.device.labelSingular ?? "device"}
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
            to="/troubleshooting"
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
                to={`/troubleshooting/${deviceKey}`}
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
                <StepBlock key={step.title} step={step} index={i} />
              ))}
            </div>
          )}
        </article>
      )}

      {config && <SupportEscapeSection config={config} />}
    </TroubleshootingLayout>
  );
}
