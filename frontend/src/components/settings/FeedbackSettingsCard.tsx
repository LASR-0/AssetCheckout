import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import ComboboxField from "@/components/ui/comboboxfield";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getFeedbackEnabled,
  setFeedbackEnabled,
  getAllFeedback,
  type FeedbackRow,
  type FeedbackResponse,
} from "@/api/feedback";
import CollapsibleSection from "@/components/ui/collapsible-section";
import { getDevHeaders } from "@/api/client";
import { Badge } from "@/components/ui/statusbadge";

///  +-----------------------------------------------------------------+
///  |                   FEEDBACK SETTINGS CARD                        |
///  +-----------------------------------------------------------------+
//
//  Admin view of the anonymous feedback feature. The enable/disable toggle
//  always renders; the responses table and CSV export render only when the
//  feature is enabled. Disabling collapses the section back to just the
//  toggle (the data still exists in the DB — it's only hidden from the view
//  and the submit/nudge/CTA stop surfacing).
//
//  The distribution bar always renders below the section title in one of
//  three states: sentiment segments (enabled + data), an empty placeholder
//  (enabled, no data), or a disabled placeholder (feature off).
//
//  Feedback is structurally anonymous — there's no submitter column because
//  the data simply doesn't carry one.
//
//  Filtering and pagination mirror the job history table (filters above the
//  table, pager below, 20 rows a page) but run CLIENT-side: /api/feedback/all
//  returns the whole set in one request and the distribution bar needs all of
//  it anyway, so there's nothing to gain from paging the API. The bar and the
//  CSV export stay unfiltered — they describe the whole data set, not the view.
///  +-----------------------------------------------------------------+

// Response pills render through the shared <Badge> primitive with the
// theme-aware status tokens: improved → success, no change → pending,
// worse → error. Trending icons give the sentiment at a glance.
const RESPONSE_DISPLAY: Record<
  FeedbackResponse,
  { label: string; bg: string; text: string; icon: string }
> = {
  improved: {
    label: "Improved",
    bg: "bg-status-success/15",
    text: "text-status-success",
    icon: "trending_up",
  },
  no_change: {
    label: "No change",
    bg: "bg-status-pending/15",
    text: "text-status-pending",
    icon: "trending_flat",
  },
  worse: {
    label: "Worse",
    bg: "bg-status-error/15",
    text: "text-status-error",
    icon: "trending_down",
  },
};

function ResponsePill({ value }: { value: FeedbackResponse }) {
  const d = RESPONSE_DISPLAY[value];
  if (!d) {
    // Unknown enum value — render neutrally rather than crashing.
    return (
      <Badge
        size="compact"
        icon="help"
        label={value}
        bg="bg-surface-container"
        text="text-info-light"
      />
    );
  }
  return <Badge size="compact" icon={d.icon} label={d.label} bg={d.bg} text={d.text} />;
}

///  +-----------------------------------------------------------------+
///  |                  FEEDBACK DISTRIBUTION BAR                      |
///  +-----------------------------------------------------------------+
//
//  A single stacked bar summarising the sentiment split of all collected
//  responses. Segments use the badge styling: translucent /15 background
//  with a solid border in the same status token, so they track the theme
//  exactly like the pills. The tooltip slides horizontally with the cursor
//  (Radix align offset driven by onMouseMove). Zero-count segments are
//  omitted. When there's no data (or the feature is off) the bar renders
//  as a grey placeholder with a centred message.

// Fixed display order: positive → neutral → negative, left to right.
const BAR_ORDER: FeedbackResponse[] = ["improved", "no_change", "worse"];

// Badge-matched styling: translucent fill + solid border per status.
const BAR_SEGMENT_STYLE: Record<FeedbackResponse, string> = {
  improved: "bg-status-success/15 border-status-success border-r-0",
  no_change: "bg-status-pending/15 border-status-pending border-r-0 border-l-0",
  worse: "bg-status-error/15 border-status-error border-l-0",
};

const BAR_HEIGHT = "h-6";

type BarSegmentData = {
  key: FeedbackResponse;
  count: number;
  width: number; // exact %, segments sum to 100
  pct: number; // rounded, for display
};

function BarSegment({ segment }: { segment: BarSegmentData }) {
  // Horizontal offset of the cursor from the segment's centre. Feeding this
  // into Radix's alignOffset (align="center") makes the tooltip slide with
  // the mouse as it moves across the segment.
  const [cursorOffset, setCursorOffset] = useState(0);
  const d = RESPONSE_DISPLAY[segment.key];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`h-full border-1 first:rounded-l-full last:rounded-r-full transition-opacity hover:opacity-70 ${BAR_SEGMENT_STYLE[segment.key]}`}
          style={{ width: `${segment.width}%` }}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursorOffset(e.clientX - (rect.left + rect.width / 2));
          }}
        />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="center"
        alignOffset={cursorOffset}
        sideOffset={8}
        collisionPadding={8}
        className="pointer-events-none text-xs"
      >
        <span className="font-semibold">{d.label}</span>
        {" — "}
        {segment.pct}% ({segment.count})
      </TooltipContent>
    </Tooltip>
  );
}

// Grey placeholder used for both the "no data" and "feature off" states.
function PlaceholderBar({ message }: { message: string }) {
  return (
    <div
      className={`flex ${BAR_HEIGHT} w-full items-center justify-center rounded-full border-2 border-outline bg-surface-container-low`}
    >
      <span className="text-xs text-info-light/60 select-none">{message}</span>
    </div>
  );
}

function FeedbackDistributionBar({
  values,
  featureEnabled,
}: {
  values: FeedbackResponse[];
  featureEnabled: boolean;
}) {
  const segments = useMemo<BarSegmentData[]>(() => {
    const total = values.length;
    if (total === 0) return [];
    const counts = new Map<FeedbackResponse, number>();
    for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    return BAR_ORDER.flatMap((key) => {
      const count = counts.get(key) ?? 0;
      if (count === 0) return [];
      return [
        {
          key,
          count,
          width: (count / total) * 100,
          pct: Math.round((count / total) * 100),
        },
      ];
    });
  }, [values]);

  if (!featureEnabled) return <PlaceholderBar message="Feedback is turned off" />;
  if (segments.length === 0) return <PlaceholderBar message="No feedback collected" />;

  return (
    <TooltipProvider delayDuration={100} skipDelayDuration={300}>
      <div
        className={`flex ${BAR_HEIGHT} w-full overflow-hidden rounded-full`}
        role="img"
        aria-label={segments
          .map((s) => `${RESPONSE_DISPLAY[s.key].label}: ${s.pct}%`)
          .join(", ")}
      >
        {segments.map((s) => (
          <BarSegment key={s.key} segment={s} />
        ))}
      </div>
    </TooltipProvider>
  );
}

///  +-----------------------------------------------------------------+
///  |                     FILTERS & PAGINATION                        |
///  +-----------------------------------------------------------------+
//
//  Same page size as the job history table so the two tables in Settings
//  scroll identically. Filter labels map back to the enum values stored on
//  the row; the sentiment options are derived from RESPONSE_DISPLAY (in
//  BAR_ORDER) so the dropdown labels can't drift from the pills.

const PAGE_SIZE = 20;

const RESPONSE_ALL = "All responses";
const RESPONSE_LABEL_TO_ENUM: Record<string, FeedbackResponse | undefined> = {
  [RESPONSE_ALL]: undefined,
  ...Object.fromEntries(BAR_ORDER.map((key) => [RESPONSE_DISPLAY[key].label, key])),
};
const RESPONSE_ITEMS = Object.keys(RESPONSE_LABEL_TO_ENUM);

// Comments are optional on a submission, so "did they write anything" is its
// own dimension rather than a value of one of the response columns.
type CommentsFilter = "with" | "without" | undefined;
const COMMENTS_ALL = "All comments";
const COMMENTS_LABEL_TO_ENUM: Record<string, CommentsFilter> = {
  [COMMENTS_ALL]: undefined,
  "With comments": "with",
  "Without comments": "without",
};
const COMMENTS_ITEMS = Object.keys(COMMENTS_LABEL_TO_ENUM);

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function FeedbackSettingsCard() {

  const [enabled, setEnabled] = useState<boolean | null>(null); // null = loading
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // View state for the table — filters + page. Purely client-side over `rows`.
  const [page, setPage] = useState(1);
  const [requestingFilter, setRequestingFilter] = useState<FeedbackResponse | undefined>();
  const [overallFilter, setOverallFilter] = useState<FeedbackResponse | undefined>();
  const [commentsFilter, setCommentsFilter] = useState<CommentsFilter>(undefined);

  // Both response dimensions feed the one bar. To visualise a single
  // question instead, map just that field here. Deliberately built from the
  // unfiltered rows — the bar summarises everything collected, not the page.
  const distributionValues = useMemo(
    () => rows.flatMap((r) => [r.improvedRequesting, r.improvesItOverall]),
    [rows]
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (requestingFilter && r.improvedRequesting !== requestingFilter) return false;
        if (overallFilter && r.improvesItOverall !== overallFilter) return false;
        // Treat a whitespace-only comment as no comment.
        const hasComments = Boolean(r.comments?.trim());
        if (commentsFilter === "with" && !hasComments) return false;
        if (commentsFilter === "without" && hasComments) return false;
        return true;
      }),
    [rows, requestingFilter, overallFilter, commentsFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  // Clamp rather than reset: filters already send us back to page 1, but a
  // refetch can shrink the set underneath a page that's still selected.
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  // Load the enabled state on mount.
  useEffect(() => {
    getFeedbackEnabled()
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  // Load feedback rows whenever the feature is enabled.
  useEffect(() => {
    if (enabled !== true) {
      setRows([]);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);
    setError(null);
    setPage(1);
    getAllFeedback()
      .then((r) => {
        if (!cancelled) setRows(r.feedback);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load feedback");
      })
      .finally(() => {
        if (!cancelled) setLoadingRows(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const res = await setFeedbackEnabled(next);
      setEnabled(res.enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSaving(false);
    }
  }

  // CSV export — raw fetch (not apiFetch) because we want the CSV bytes, not
  // parsed JSON. Carries the dev identity header in development; production
  // relies on the forward-auth session. Triggers a client-side download.
  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback/export", {
        headers: getDevHeaders(),   // canonical dev headers (empty in prod)
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `feedback-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (enabled === null) {
    return (
      <div className="flex items-center justify-center gap-3 text-info-light text-sm py-8">
        <span className="animate-spin h-5 w-5 border-2 border-outline border-t-transparent rounded-full" />
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Sentiment distribution — always rendered below the section title:
          segments (enabled + data), "No feedback collected" (enabled, no
          data), or "Feedback is turned off" (feature off) */}
      <FeedbackDistributionBar values={distributionValues} featureEnabled={enabled} />

      {/* Enable toggle — always rendered */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-outline bg-surface p-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-on-background text-sm">Collect feedback</h4>
          <p className="text-xs text-info-light mt-0.5">
            When on, staff can submit anonymous feedback via the feedback page, the
            post-receipt prompt, and the landing-page link.
          </p>
        </div>
        <Switch
          className="hover:cursor-pointer shrink-0 rounded-full border-2 transition-colors data-[state=checked]:bg-status-success border-outline/70 data-[state=unchecked]:bg-status-error"
          checked={enabled}
          disabled={saving}
          onCheckedChange={handleToggle}
        />
      </div>

      {error && (
        <div className="text-xs text-error bg-error/10 rounded-md p-2">{error}</div>
      )}

      {/* Table + export — only when enabled */}
      {enabled && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-info-light">
              {rows.length} response{rows.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={handleExport}
              disabled={exporting || rows.length === 0}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-md text-nav-tab-selected bg-surface-container-low border border-outline/30 hover:cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <span
                className={`material-symbols-outlined !text-[16px] ${exporting ? "animate-spin" : ""}`}
                style={{ fontVariationSettings: "'wght' 900" }}
              >
                {exporting ? "progress_activity" : "download"}
              </span>
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>

          <CollapsibleSection title="Feedback Table">
            {/* Filters — same layout as the job history table: a wrapping row
                above the table, each change resetting back to page 1. */}
            <div className="flex items-end gap-3 flex-wrap mb-4">
              <div className="w-44">
                <label className="block text-xs font-semibold text-info-light uppercase tracking-wider mb-1">
                  Requesting
                </label>
                <ComboboxField
                  items={RESPONSE_ITEMS}
                  defaultValue={RESPONSE_ALL}
                  keyHint="feedback-requesting-filter"
                  size="compact"
                  placeholder="Requesting"
                  onSelect={(label) => {
                    setRequestingFilter(RESPONSE_LABEL_TO_ENUM[label]);
                    setPage(1);
                  }}
                />
              </div>

              <div className="w-44">
                <label className="block text-xs font-semibold text-info-light uppercase tracking-wider mb-1">
                  IT Overall
                </label>
                <ComboboxField
                  items={RESPONSE_ITEMS}
                  defaultValue={RESPONSE_ALL}
                  keyHint="feedback-overall-filter"
                  size="compact"
                  placeholder="IT Overall"
                  onSelect={(label) => {
                    setOverallFilter(RESPONSE_LABEL_TO_ENUM[label]);
                    setPage(1);
                  }}
                />
              </div>

              <div className="w-52">
                <label className="block text-xs font-semibold text-info-light uppercase tracking-wider mb-1">
                  Comments
                </label>
                <ComboboxField
                  items={COMMENTS_ITEMS}
                  defaultValue={COMMENTS_ALL}
                  keyHint="feedback-comments-filter"
                  size="compact"
                  placeholder="Comments"
                  onSelect={(label) => {
                    setCommentsFilter(COMMENTS_LABEL_TO_ENUM[label]);
                    setPage(1);
                  }}
                />
              </div>
            </div>

            {/* The wrapper owns the border, radius, and clipping. Keeping them
                off the <table> is what fixes the corner artifacts (square cell
                backgrounds no longer poke through the rounded border) and the
                missing bottom edge (it's now just the wrapper's own border).
                overflow-hidden does the corner clip; the inner div keeps the
                horizontal scroll without re-squaring the corners. */}
            <div className="rounded-md border !border-outline overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-low/30 border-b border-outline">
                      <th className="px-4 py-3 text-xs font-semibold font-mono uppercase tracking-wider text-on-surface-variant">
                        Requesting
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold font-mono uppercase tracking-wider text-on-surface-variant">
                        IT Overall
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold font-mono uppercase tracking-wider text-on-surface-variant">
                        Comments
                      </th>
                      <th className="px-4 py-3 text-xs font-semibold font-mono uppercase tracking-wider text-on-surface-variant">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline">
                    {pageRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-4 py-10 text-center text-sm text-info-light"
                        >
                          {loadingRows
                            ? "Loading…"
                            : rows.length === 0
                              ? "No feedback submitted yet"
                              : "No feedback matches these filters"}
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((row) => (
                        <tr
                          key={row.id}
                          className="hover:bg-surface-container-low/20 transition-colors"
                        >
                          <td className="px-4 py-3 align-middle">
                            <ResponsePill value={row.improvedRequesting} />
                          </td>
                          <td className="px-4 py-3 align-middle">
                            <ResponsePill value={row.improvesItOverall} />
                          </td>
                          <td className="px-4 py-3 align-middle text-sm text-on-surface-variant max-w-md">
                            {row.comments ? (
                              <span className="whitespace-pre-wrap break-words">{row.comments}</span>
                            ) : (
                              <span className="text-info-light/50 italic">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-middle text-sm text-info-light whitespace-nowrap">
                            {formatDate(row.createdAt)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination — only once there's more than one page, matching the
                job history table. */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm mt-4">
                <span className="text-info-light">
                  {filteredRows.length} response{filteredRows.length !== 1 ? "s" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-xs text-nav-tab-selected rounded-md bg-surface border border-outline/30 hover:brightness-95 hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Previous
                  </button>
                  <span className="text-info-light">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-xs rounded-md text-nav-tab-selected bg-surface border border-outline/30 hover:brightness-95 hover:cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}