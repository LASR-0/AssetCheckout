import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Page } from "@/components/shell/Page";
import { Icon } from "@/components/ui/icon";
import { SegmentedControl } from "@/components/ui/segmented";
import { btn } from "@/components/ui/variants";
import { symptomQuery } from "@/api/queries";
import { createArticleDraft } from "@/api/troubleshooting";
import { useAuth } from "@/hooks/useAuth";
import { useArticleEditor } from "@/hooks/useArticleEditor";
import { useSubjectBackNav } from "@/hooks/useSubjectBackNav";
import { useViewState } from "@/hooks/useViewState";
import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";
import {
  START_EDITING,
  troubleshootingSubjectPath,
  type TroubleshootingLinkState,
} from "@/lib/troubleshootingRoutes";
import RichText from "@/components/troubleshooting/RichText";
import { useLibrary } from "@/components/troubleshooting/useLibrary";
import { AllSteps, Guided, Others, type Stage } from "@/components/troubleshooting/ArticleParts";
import { ArticleEditor, Confirm, EditBar, type EditState, type Part } from "@/components/troubleshooting/ArticleEditor";
import { EditButton, EmptyCard } from "@/components/troubleshooting/IndexParts";
import { EscapeButtons, MessageDialog } from "@/components/troubleshooting/support";


///  +-----------------------------------------------------------------+
///  |                    TROUBLESHOOTING: AN ARTICLE                  |
///  +-----------------------------------------------------------------+
//
//  One symptom's steps at its own URL, because IT sending somebody a direct
//  link is much of what this is for. Read Guided (one step at a time) or as
//  All steps; the choice is remembered per browser.
//
//  AN UNWRITTEN SYMPTOM IS A DESTINATION, not a 404: the symptom being known
//  is itself worth saying, and the way to IT is right there.
//
//  ADMINS EDIT IN PLACE. Edit mode is off until asked for, so an admin reads
//  exactly what readers read, unless they arrived from the list editor's
//  "Edit article" (START_EDITING), which has already asked.
//
//  The editor loads for any admin on the page, not only once editing: the
//  public endpoint can't see an article that's never been published, and
//  that is exactly the one that needs a "Continue the draft".
///  +-----------------------------------------------------------------+

type Mode = "Guided" | "All steps";
const MODE_KEY = "troubleshooting-article-mode";

function readMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === "All steps" ? "All steps" : "Guided";
  } catch {
    return "Guided";
  }
}

export default function TroubleshootingArticlePage() {
  const { subjectKey = "", symptomId = "" } = useParams<{ subjectKey: string; symptomId: string }>();
  // Keyed, so a branch to another article starts it at step 1 rather than
  // carrying the last one's progress and edit state across.
  return <Article key={`${subjectKey}/${symptomId}`} subjectKey={subjectKey} symptomId={symptomId} />;
}

function Article({ subjectKey, symptomId }: { subjectKey: string; symptomId: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const backTo = useSubjectBackNav(subjectKey);
  const isAdmin = useAuth().role === "ADMIN";
  const lib = useLibrary();
  const symptom = useQuery(symptomQuery(subjectKey, symptomId));
  const editor = useArticleEditor(subjectKey, symptomId, isAdmin);

  const [mode, setMode] = useState<Mode>(readMode);
  const [step, setStep] = useState(0);
  const [stage, setStage] = useState<Stage>("step");
  const [editing, setEditing] = useState(() => Boolean((location.state as TroubleshootingLinkState | null)?.[START_EDITING]));
  const [preview, setPreview] = useState(false);
  const [part, setPart] = useState<Part>("details");
  const [starting, setStarting] = useState(false);
  const [confirm, setConfirm] = useState<"publish" | "discard" | null>(null);
  const [message, setMessage] = useState<number[] | null>(null);

  // "Articles opened", Drafts included: a gap opened often is the next one
  // worth writing.
  useEffect(() => {
    trackTroubleshooting({ type: "ARTICLE_OPENED", subjectKey, symptomId });
  }, [subjectKey, symptomId]);

  // Following a branch from step 5 and pressing Back returns to step 5's
  // scroll position, not the top.
  useViewState("troubleshooting-article", location.key, null, symptom.isSuccess);

  const data = symptom.data;
  const article = data?.article ?? null;
  const isEditing = editing && isAdmin && !!editor.working;
  const text = isEditing ? editor.working : article;
  const config = lib.config;

  const here = useMemo(
    () => new Set((lib.taxonomy[subjectKey] ?? []).flatMap((c) => c.symptoms.map((s) => s.id))),
    [lib.taxonomy, subjectKey]
  );
  const labelOf = (id: string) => lib.rows.find((r) => r.id === id)?.label ?? null;
  const alsoUnder = (editor.article?.subjectKeys ?? [])
    .filter((k) => k !== subjectKey)
    .map((k) => lib.subjectOf(k)?.label ?? k);

  const editState: EditState = !editor.article?.published
    ? "draft"
    : editor.hasDraft
      ? "changes"
      : editor.warnings.length
        ? "notes"
        : "clean";

  const pickMode = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // A private window: it just won't be remembered.
    }
  };

  const go = (s: number, st: Stage) => {
    setStep(s);
    setStage(st);
  };

  function startEditing() {
    if (editor.article) return setEditing(true);
    // Nothing written: make the empty draft, then open it.
    setStarting(true);
    createArticleDraft(subjectKey, symptomId)
      .then(() => editor.reload())
      .then(() => {
        setPart("details");
        setEditing(true);
      })
      .finally(() => setStarting(false));
  }

  const escapes = (tried: number[], label = "Message IT") => (
    <EscapeButtons config={config} context={{ subjectKey, symptomId }} onMessage={() => setMessage(tried)} messageLabel={label} />
  );

  const path = data ? `${data.subject?.label ?? subjectKey} › ${data.category.name}` : "";
  const n = text?.steps.length ?? 0;

  return (
    <>
      {isEditing && (
        <div className="sticky top-0 z-6 border-b border-brand-line bg-sheet shadow-bar">
          <Page max={1240} className="px-3.5 py-2.5 desk:px-8 desk:py-3">
            <EditBar
              state={editState}
              saveState={editor.saveState}
              alsoUnder={alsoUnder}
              preview={preview}
              onPreview={(on) => {
                setPreview(on);
                go(typeof part === "number" ? part : 0, "step");
              }}
              publishing={editor.publishing}
              issues={editor.issues}
              warnings={editor.warnings}
              onDiscardChanges={() => void editor.discard()}
              onPublish={() => setConfirm("publish")}
              onDone={() => {
                setEditing(false);
                setPreview(false);
                go(0, "step");
              }}
            />
          </Page>
        </div>
      )}

      <Page max={1240} className="flex flex-col gap-6.5 px-3.5 pt-5 pb-30 desk:px-8 desk:pt-8 desk:pb-40">
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 fs-12 text-mut">
            <Link
              {...backTo}
              className="flex h-7.5 items-center gap-1 rounded-pill border border-line bg-sheet pr-2.75 pl-1.75 fs-12 font-medium text-tx2 no-underline outline-none hover:border-strong focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Icon name="arrow_back" size={15} />
              Troubleshooting
            </Link>
            <span>{path}</span>
          </div>

          {symptom.isError ? (
            <EmptyCard
              title="We couldn't find that article"
              actions={
                <Link to={troubleshootingSubjectPath(subjectKey)} className={btn({ size: "md", className: "no-underline" })}>
                  Back to troubleshooting
                </Link>
              }
            >
              The link may be old, or the article may have been removed. Search the library for the problem instead.
            </EmptyCard>
          ) : !data ? (
            <p className="m-0 py-6 fs-13 text-mut">Loading the article…</p>
          ) : (
            <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3.5">
              <div className="flex min-w-0 flex-[1_1_26.25rem] flex-col gap-2.5">
                <h1 className="m-0 max-w-150 font-head fs-22 leading-[1.2] font-medium tracking-[-0.02em] text-balance desk:fs-29">{data.symptom.label}</h1>
                {text && (
                  <>
                    <p className="m-0 max-w-[66ch] fs-14 leading-[1.6] text-pretty text-tx3">
                      <RichText text={text.summary} />
                    </p>
                    <div className="flex flex-wrap gap-x-4.5 gap-y-1.5 fs-12 text-tx3">
                      {text.timeEstimate && <Meta icon="schedule">{text.timeEstimate}</Meta>}
                      {text.appliesTo && <Meta icon="devices">{text.appliesTo}</Meta>}
                      <Meta icon="format_list_numbered">
                        {n} {n === 1 ? "step" : "steps"}
                      </Meta>
                      {/* Stamped on publish, so a whitespace fix doesn't bump the date a reader trusts. */}
                      {article?.updated && (
                        <Meta icon="update">
                          Updated {new Date(article.updated).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                        </Meta>
                      )}
                    </div>
                  </>
                )}
                {isEditing && !preview && (
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 fs-12 text-mut">
                    <Icon name="info" size={14} />
                    The title is the symptom&rsquo;s wording.
                    <button
                      type="button"
                      onClick={() => navigate(troubleshootingSubjectPath(subjectKey), { state: { [START_EDITING]: true } })}
                      className="cursor-pointer border-0 bg-transparent p-0 font-sans fs-12 font-medium text-brand-tx underline underline-offset-2"
                    >
                      Reword it in the list
                    </button>
                  </div>
                )}
              </div>
              {article && !isEditing && (
                <div data-tour="ts-article-modes" className="flex flex-wrap items-center gap-2">
                  <SegmentedControl
                    label="How to read it"
                    size="md"
                    value={mode}
                    onValueChange={pickMode}
                    options={[
                      { value: "Guided", label: "One step at a time", icon: "route" },
                      { value: "All steps", label: "All steps", icon: "view_agenda" },
                    ]}
                  />
                  {isAdmin && editor.article && (
                    <EditButton onClick={startEditing} className="h-9.5 rounded-10">
                      Edit
                    </EditButton>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {data && text && isEditing && !preview && (
          <ArticleEditor
            editor={editor}
            subjectKey={subjectKey}
            symptomId={symptomId}
            part={part}
            onPart={setPart}
            rows={lib.rows}
            here={here}
            labelOf={labelOf}
            onDiscardArticle={editor.article?.published ? null : () => setConfirm("discard")}
          />
        )}

        {data && text && (!isEditing || preview) && (mode === "Guided" || preview) && (
          <Guided
            text={text}
            subjectKey={subjectKey}
            symptomId={symptomId}
            labelOf={labelOf}
            step={step}
            stage={preview ? "step" : stage}
            onGo={go}
            preview={preview}
            stickLow={preview}
            onMessage={config?.supportChannelConfigured ? setMessage : null}
            escapes={(tried) => escapes(tried, "Message IT on Teams")}
            backTo={backTo}
          />
        )}

        {data && text && !isEditing && mode === "All steps" && (
          <AllSteps text={text} subjectKey={subjectKey} symptomId={symptomId} labelOf={labelOf} escapes={escapes([])} />
        )}

        {data && !text && (
          <div className="max-w-190">
            <EmptyCard
              dashed
              title="IT hasn't written steps for this yet"
              actions={
                <>
                  {isAdmin && !editor.loading && (
                    <button type="button" disabled={starting} onClick={startEditing} className={btn({ variant: "brand", size: "lg", className: "h-10 fs-12.5" })}>
                      <Icon name="edit" size={16} />
                      {starting ? "Starting…" : editor.article ? "Continue the draft" : "Write this article"}
                    </button>
                  )}
                  {escapes([])}
                </>
              }
            >
              They can still help, and knowing people are looking for it moves it up their list.
              {isAdmin && !editor.loading && (
                <span className="mt-2 block fs-11.5 text-mut">
                  {editor.article ? "There's an unpublished draft." : "Creates a draft. Nobody sees it until you publish."}
                </span>
              )}
            </EmptyCard>
          </div>
        )}

        {data && !isEditing && article?.source && (
          <p className="m-0 flex items-center gap-1.5 fs-12 text-mut">
            <Icon name="link" size={15} />
            Adapted from{" "}
            <a href={article.source.url} target="_blank" rel="noreferrer noopener" className="font-medium text-brand-tx">
              {article.source.name}
            </a>
          </p>
        )}

        {data && !isEditing && <Others category={data.category.name} subjectKey={subjectKey} siblings={data.siblings} />}
      </Page>

      {config?.supportChannelConfigured && (
        <MessageDialog
          open={message !== null}
          onOpenChange={(open) => !open && setMessage(null)}
          target={{ kind: "article", subjectKey, symptomId, tried: message ?? [] }}
          channelName={config.supportChannelName}
        />
      )}

      <Confirm
        open={confirm === "publish"}
        title="Publish this article?"
        okLabel={editor.publishing ? "Publishing…" : "Publish"}
        busy={editor.publishing}
        onClose={() => setConfirm(null)}
        onOk={() => {
          void editor.publish().then((ok) => ok && setConfirm(null));
        }}
      >
        Readers see it straight away{alsoUnder.length ? `, here and under ${alsoUnder.join(", ")}` : ""}.
      </Confirm>

      <Confirm
        open={confirm === "discard"}
        title="Discard this article?"
        okLabel="Discard article"
        danger
        onClose={() => setConfirm(null)}
        onOk={() => {
          void editor.discard().then((r) => {
            setConfirm(null);
            if (r.articleRemoved) setEditing(false);
          });
        }}
      >
        Its text is removed. The symptom stays in the list with nothing written for it, and readers see that IT hasn&rsquo;t written steps yet.
      </Confirm>
    </>
  );
}

function Meta({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <Icon name={icon} size={15} className="text-mut" />
      {children}
    </span>
  );
}
