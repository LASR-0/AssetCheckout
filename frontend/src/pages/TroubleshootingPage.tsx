import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Page } from "@/components/shell/Page";
import { Icon } from "@/components/ui/icon";
import { btn } from "@/components/ui/variants";
import { useAuth } from "@/hooks/useAuth";
import { useSettledSearch } from "@/hooks/useSettledSearch";
import { useRestoredState, useViewState } from "@/hooks/useViewState";
import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";
import { START_EDITING, troubleshootingSubjectPath, type TroubleshootingLinkState } from "@/lib/troubleshootingRoutes";
import { searchLibrary, useLibrary } from "@/components/troubleshooting/useLibrary";
import {
  CategoryCards,
  EditButton,
  EmptyCard,
  Hero,
  Results,
  SubjectHead,
  SubjectRail,
} from "@/components/troubleshooting/IndexParts";
import { ListEditBar, ListEditor } from "@/components/troubleshooting/ListEditor";
import { EscapeButtons, MessageDialog, SupportCard } from "@/components/troubleshooting/support";


///  +-----------------------------------------------------------------+
///  |                   TROUBLESHOOTING: THE FRONT PAGE               |
///  +-----------------------------------------------------------------+
//
//  "What's going wrong?" as one search across every device and app, then
//  the library by subject: a rail of devices and apps on the left, the
//  chosen one's problems grouped into cards on the right.
//
//  THE SUBJECT IS IN THE URL (/troubleshooting/laptop), so IT can link to a
//  device's list as well as to an article.
//
//  NOTHING IS PRE-SELECTED. At /troubleshooting the search is the question
//  being asked, and the browse pane waits to be told which device rather
//  than answering for them with a wall of laptop problems.
//
//  COMING BACK FROM AN ARTICLE IS NOT A FRESH VISIT. What was typed and how
//  far down the page you were come back with Back (hooks/useViewState keys
//  them on the history entry, so a deliberate visit still starts clean).
//
//  Admins edit the list in place: the hero gives way to a sticky bar that
//  says the changes are live, and the cards become the editor.
///  +-----------------------------------------------------------------+

type IndexView = { query: string };

const VIEW_NAME = "troubleshooting-index";

export default function TroubleshootingPage() {
  const { subjectKey = null } = useParams<{ subjectKey?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const restored = useRestoredState<IndexView>(VIEW_NAME, location.key);
  const isAdmin = useAuth().role === "ADMIN";
  const lib = useLibrary();

  const [query, setQuery] = useState(restored?.query ?? "");
  // Straight into the list editor when an article's "Reword it in the list"
  // sent them here: they've already said what they want to do.
  const [editing, setEditing] = useState(() => Boolean((location.state as TroubleshootingLinkState | null)?.[START_EDITING]));
  const [messaging, setMessaging] = useState(false);

  const settled = useSettledSearch(query);
  const hits = useMemo(() => searchLibrary(lib.rows, settled), [lib.rows, settled]);
  const searching = !!settled.trim();

  const subject = lib.subjectOf(subjectKey);
  const categories = subjectKey ? (lib.taxonomy[subjectKey] ?? []) : [];
  const listEdit = isAdmin && editing && !!subject;
  const count = categories.reduce((n, c) => n + c.symptoms.length, 0);

  // "Searches with no match", the most useful signal there is: people naming
  // the articles to write next, in their own words. Only once the box has
  // sat still a while, or every prefix of "bluetooth" would count as a miss.
  useEffect(() => {
    if (!searching || hits.length > 0 || lib.loading) return;
    const timer = window.setTimeout(() => {
      trackTroubleshooting({ type: "SEARCH_NO_MATCH", query: settled.trim(), subjectKey });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [searching, hits.length, settled, subjectKey, lib.loading]);

  useViewState<IndexView>(VIEW_NAME, location.key, { query }, !lib.loading);

  const pick = (key: string) => navigate(troubleshootingSubjectPath(key));
  const escapes = (label?: string) => (
    <EscapeButtons config={lib.config} context={{ subjectKey }} onMessage={() => setMessaging(true)} messageLabel={label} size="md" />
  );

  return (
    <>
      {listEdit ? (
        <div className="sticky top-0 z-6 border-b border-brand-line bg-sheet shadow-bar">
          <Page max={1240} className="px-3.5 py-2.5 desk:px-8 desk:py-3">
            <ListEditBar subjectLabel={subject.label} onDone={() => setEditing(false)} />
          </Page>
        </div>
      ) : (
        <div className="relative z-1 border-b border-line bg-sheet shadow-band">
          <Page max={1240} className="px-3.5 pt-6.5 pb-5.5 desk:px-8 desk:pt-12 desk:pb-9">
            <Hero
              query={query}
              onQuery={setQuery}
              popular={lib.popular}
              support={<SupportCard config={lib.config} onMessage={() => setMessaging(true)} />}
            />
          </Page>
        </div>
      )}

      <Page max={1240} className="flex flex-col gap-6 px-3.5 pt-5 pb-30 desk:px-8 desk:pt-8 desk:pb-40">
        {lib.failed && (
          <EmptyCard
            title="Couldn't load troubleshooting"
            actions={
              <button type="button" onClick={() => window.location.reload()} className={btn({ size: "md" })}>
                Try again
              </button>
            }
          >
            Something went wrong reaching the library. IT support can still help.
          </EmptyCard>
        )}

        {searching && !listEdit && (
          <Results
            rows={hits}
            query={settled}
            empty={
              <EmptyCard
                title={<>Nothing written for &ldquo;{settled.trim()}&rdquo; yet</>}
                actions={
                  <>
                    <button type="button" onClick={() => setQuery("")} className={btn({ size: "md", className: "border-line fs-12" })}>
                      Clear search
                    </button>
                    {escapes("Ask IT instead")}
                  </>
                }
              >
                Try a shorter word, or browse by device below. IT sees searches that find nothing and uses them to decide what to write next.
              </EmptyCard>
            }
          />
        )}

        {(!searching || listEdit) && (
          <div className="grid grid-cols-1 items-start gap-x-10 gap-y-5 desk:grid-cols-[14rem_minmax(0,1fr)]">
            <SubjectRail subjects={lib.subjects} selected={subjectKey} onPick={pick} editing={listEdit} />
            <section aria-label={subject?.label ?? "Symptoms"} className="flex min-w-0 flex-col gap-4">
              {lib.loading ? (
                <p className="m-0 py-6 fs-13 text-mut">Loading the library…</p>
              ) : !subjectKey ? (
                <EmptyCard dashed title="Pick a device or app">
                  Choose what&rsquo;s giving you trouble to see the problems IT has written fixes for. Or search above, across all of them.
                </EmptyCard>
              ) : !subject ? (
                <EmptyCard title="We don't have that one">
                  There&rsquo;s nothing in the library called &ldquo;{subjectKey}&rdquo;. Pick a device or app from the list, or search above.
                </EmptyCard>
              ) : (
                <>
                  <SubjectHead
                    subject={subject}
                    meta={
                      count
                        ? `${count} ${count === 1 ? "symptom" : "symptoms"} in ${categories.length} ${categories.length === 1 ? "category" : "categories"}`
                        : "Nothing written yet"
                    }
                    action={
                      isAdmin && !listEdit ? (
                        <EditButton
                          onClick={() => {
                            setQuery("");
                            setEditing(true);
                          }}
                        >
                          Edit this list
                        </EditButton>
                      ) : null
                    }
                  />
                  {listEdit ? (
                    <ListEditor subjectKey={subject.key} subjectLabel={subject.label} />
                  ) : categories.length ? (
                    <CategoryCards subjectKey={subject.key} categories={categories} />
                  ) : (
                    <EmptyCard dashed title={`Nothing written for ${subject.kind === "device" ? subject.label.toLowerCase() : subject.label} yet`} actions={escapes()}>
                      Search above in case it&rsquo;s filed under something else. IT support can still help.
                    </EmptyCard>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {!lib.loading && !lib.config?.supportChannelConfigured && !lib.config?.supportPhoneConfigured && lib.config && (
          <p className="m-0 flex items-center gap-2 fs-12 text-mut">
            <Icon name="info" size={15} />
            No support number or Teams channel is set up yet.
          </p>
        )}
      </Page>

      {lib.config?.supportChannelConfigured && (
        <MessageDialog
          open={messaging}
          onOpenChange={setMessaging}
          target={{ kind: "general", query: settled.trim(), subjectKey: subject?.key ?? null }}
          channelName={lib.config.supportChannelName}
        />
      )}
    </>
  );
}
