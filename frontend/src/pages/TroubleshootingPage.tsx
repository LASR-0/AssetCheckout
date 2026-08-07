import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TroubleshootingLayout, { Eyebrow } from "@/components/troubleshooting/TroubleshootingLayout";
import SubjectPicker from "@/components/troubleshooting/SubjectPicker";
import SymptomCategories from "@/components/troubleshooting/SymptomCategories";
import { SupportEscapeSection } from "@/components/troubleshooting/SupportEscape";
import {
  getSubjectCategories,
  getTroubleshootingConfig,
  getTroubleshootingSubjects,
} from "@/api/troubleshooting";
import { troubleshootingSubjectPath } from "@/lib/troubleshootingRoutes";
import { trackTroubleshooting } from "@/lib/troubleshootingAnalytics";
import type {
  SubjectCategoriesResponse,
  SubjectPickerTile,
  TroubleshootingConfig,
} from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                   TROUBLESHOOTING INDEX                         |
///  +-----------------------------------------------------------------+
//
//  Device picker, then the symptom accordion for whichever device is
//  selected, with a client-side search over symptom labels.
//
//  THE DEVICE IS IN THE URL. /troubleshooting on its own redirects to the
//  first device that has content, so there is no state in which the address
//  bar doesn't say what you're looking at. The prototype held all of this in
//  component state and could link to none of it.
//
//  Search is client-side because the whole taxonomy for one device — a
//  couple of dozen labels — is already in hand once the page loads. A round
//  trip per keystroke would buy nothing at this size.
///  +-----------------------------------------------------------------+

export default function TroubleshootingPage() {
  const { subjectKey } = useParams<{ subjectKey?: string }>();
  const navigate = useNavigate();

  const [config, setConfig] = useState<TroubleshootingConfig | null>(null);
  const [subjects, setSubjects] = useState<SubjectPickerTile[]>([]);
  const [data, setData] = useState<SubjectCategoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<string[]>([]);

  // Config is decorative relative to the rest of the page — a missing
  // support number must not stop the symptoms rendering, so it fails quietly
  // and the escape blocks simply don't appear.
  useEffect(() => {
    getTroubleshootingConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    getTroubleshootingSubjects()
      .then(setSubjects)
      .catch(() => setSubjects([]));
  }, []);

  // No device in the URL: pick the first one with content and put it there,
  // replacing rather than pushing so Back doesn't bounce through the redirect.
  useEffect(() => {
    if (subjectKey || subjects.length === 0) return;
    const first = subjects.find((s) => s.available);
    if (first) navigate(troubleshootingSubjectPath(first.key), { replace: true });
  }, [subjectKey, subjects, navigate]);

  useEffect(() => {
    if (!subjectKey) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getSubjectCategories(subjectKey)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        // Nothing expanded on arrival: six open categories is a wall of
        // links, and the blurbs are what the closed state is for.
        setOpenIds([]);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Couldn't load troubleshooting steps.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [subjectKey]);

  const needle = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!needle) return data.categories;

    return data.categories
      .map((category) => ({
        ...category,
        symptoms: category.symptoms.filter((s) =>
          s.label.toLowerCase().includes(needle)
        ),
      }))
      .filter((category) => category.symptoms.length > 0);
  }, [data, needle]);

  const matchCount = filtered.reduce((n, c) => n + c.symptoms.length, 0);

  // While searching every surviving category is open — a match hidden inside
  // a collapsed section reads as no match at all.
  const effectiveOpenIds = needle ? filtered.map((c) => c.id) : openIds;

  // "Searches with no match" — the most useful signal of the four, because
  // it is users naming the articles that should be written next in their own
  // words.
  //
  // Debounced hard, and only when the box has settled: typing "bluetooth"
  // passes through "b", "bl", "blu" and so on, every one of which matches
  // nothing on the way. Recording those would bury the real misses under a
  // pile of prefixes. A pause this long means they stopped and looked at an
  // empty result, which is the thing worth knowing.
  useEffect(() => {
    if (!needle || matchCount > 0) return;

    const timer = setTimeout(() => {
      trackTroubleshooting({
        type: "SEARCH_NO_MATCH",
        query: query.trim(),
        subjectKey: subjectKey ?? null,
      });
    }, 1200);

    return () => clearTimeout(timer);
  }, [needle, matchCount, query, subjectKey]);

  function handleOpenChange(categoryId: string, open: boolean) {
    if (needle) return; // Search owns the open state while it's active.
    setOpenIds((prev) =>
      open ? [...prev, categoryId] : prev.filter((id) => id !== categoryId)
    );
  }

  const sidebar = (
    <>
      <Eyebrow>On this page</Eyebrow>
      <nav className="flex flex-col gap-1">
        {[
          { href: "#subject", label: "What\u2019s affected" },
          { href: "#symptoms", label: "Symptoms" },
        ].map((item, i) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-info-light hover:bg-surface-container-low/30 hover:text-on-background transition-colors"
          >
            <span className="grid size-[18px] shrink-0 place-items-center rounded-full border border-outline text-[10px]">
              {i + 1}
            </span>
            {item.label}
          </a>
        ))}
      </nav>
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
      subjectKey={subjectKey ?? null}
      subjectLabel={data?.subject.label ?? ""}
      subjectLabelSingular={data?.subject.labelSingular ?? "device"}
      config={config}
      sidebar={sidebar}
    >
      <section id="subject" className="scroll-mt-24 rounded-lg border border-outline bg-surface p-5">
        <h2 className="mb-4 text-lg font-bold">What are you having trouble with?</h2>
        {subjects.length > 0 ? (
          <SubjectPicker
            subjects={subjects}
            selectedKey={subjectKey ?? null}
            onSelect={(key) => navigate(troubleshootingSubjectPath(key))}
          />
        ) : (
          <p className="text-sm text-info-light">
            Nothing is available to troubleshoot yet.
          </p>
        )}
      </section>

      <section id="symptoms" className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold">What&apos;s happening?</h2>
          {data && (
            <span className="text-[13px] text-info-light">
              {matchCount} {matchCount === 1 ? "symptom" : "symptoms"}
              {needle
                ? ` matching “${query.trim()}”`
                : ` across ${data.categories.length} categories`}
            </span>
          )}
          {data && !needle && (
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setOpenIds(data.categories.map((c) => c.id))}
                className="rounded-lg border border-outline px-2.5 py-1 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => setOpenIds([])}
                className="rounded-lg border border-outline px-2.5 py-1 text-xs font-semibold text-info-light hover:bg-surface-container-low/30 hover:cursor-pointer transition-colors"
              >
                Collapse all
              </button>
            </div>
          )}
        </div>

        <div className="relative mb-4">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 !text-[18px] text-info-light">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symptoms — e.g. battery, wi-fi, screen"
            aria-label="Search symptoms"
            className="w-full rounded-lg border border-outline bg-surface py-2.5 pl-10 pr-3 text-sm text-on-background placeholder:text-info-light focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-info-light">
            <span className="size-5 animate-spin rounded-full border-2 border-outline border-t-transparent" />
            Loading symptoms...
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center gap-2 rounded-lg bg-error-background p-3 text-sm text-error">
            <span className="material-symbols-outlined !text-[18px]">info</span>
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            <SymptomCategories
              subjectKey={subjectKey!}
              categories={filtered}
              openIds={effectiveOpenIds}
              onOpenChange={handleOpenChange}
            />
            {matchCount === 0 && (
              <p className="py-8 text-center text-sm text-info-light">
                No symptoms match that search. Try a shorter word, or use the support
                number below.
              </p>
            )}
          </>
        )}
      </section>

      {config && <SupportEscapeSection config={config} />}
    </TroubleshootingLayout>
  );
}
