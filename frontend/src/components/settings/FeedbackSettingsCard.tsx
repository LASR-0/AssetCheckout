import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  getFeedbackEnabled,
  setFeedbackEnabled,
  getAllFeedback,
  type FeedbackRow,
  type FeedbackResponse,
} from "@/api/feedback";
import CollapsibleTableSection from "./CollapsibleTable";
import { getDevHeaders } from "@/api/client";

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
//  Feedback is structurally anonymous — there's no submitter column because
//  the data simply doesn't carry one.
///  +-----------------------------------------------------------------+

const RESPONSE_DISPLAY: Record<FeedbackResponse, { label: string; cls: string }> = {
  improved: { label: "Improved", cls: "bg-green-500/10 text-green-600 border border-green-600" },
  no_change: { label: "No change", cls: "bg-yellow-500/10 text-yellow-600 border border-yellow-600" },
  worse: { label: "Worse", cls: "bg-red-500/10 text-red-600 border border-red-600" },
};

function ResponsePill({ value }: { value: FeedbackResponse }) {
  const d = RESPONSE_DISPLAY[value] ?? { label: value, cls: "bg-surface-container text-info-light" };
  return (
    <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${d.cls}`}>
      {d.label}
    </span>
  );
}

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
      {/* Enable toggle — always rendered */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-outline/20 bg-surface p-4">
        <div className="min-w-0">
          <h4 className="font-semibold text-on-background text-sm">Collect feedback</h4>
          <p className="text-xs text-info-light mt-0.5">
            When on, staff can submit anonymous feedback via the feedback page, the
            post-receipt prompt, and the landing-page link.
          </p>
        </div>
        <Switch
          className="hover:cursor-pointer shrink-0 data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500 bg-gray-200 dark:bg-gray-800"
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

          <CollapsibleTableSection title="Feedback Table">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-low/30 border-b !border-outline">
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
                <tbody className="divide-y divide-outline-variant/10">
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-10 text-center text-sm text-info-light"
                      >
                        {loadingRows ? "Loading…" : "No feedback submitted yet"}
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-surface-container-low/20 transition-colors border-b border-outline/10"
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
          </CollapsibleTableSection>
        </>
      )}
    </div>
  );
}