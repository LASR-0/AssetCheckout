import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import CollapsibleSection from "@/components/ui/collapsible-section";
import { Badge } from "@/components/ui/statusbadge";
import {
  getTroubleshootingAnalytics,
  setTroubleshootingAnalyticsEnabled,
  type AnalyticsSummary,
} from "@/api/troubleshooting";

///  +-----------------------------------------------------------------+
///  |              TROUBLESHOOTING ANALYTICS (admin)                  |
///  +-----------------------------------------------------------------+
//
//  Whether the troubleshooting library is doing its job.
//
//  The layout follows what the numbers are actually for, which is not the
//  order the brief listed them in:
//
//    1. Deflection rate — the pilot's whole question. Did people who read an
//       article go away satisfied, or ring IT anyway?
//    2. Searches with no match — the only actionable output. These are users
//       naming the articles that should be written next, in their own words,
//       so they get a list rather than a count.
//    3. Per-article detail — which articles earn their place, and how far
//       into each one people get before they stop.
//
//  Raw totals are the least useful of the set and sit smallest.
///  +-----------------------------------------------------------------+

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "12 months" },
];

/** What the escape `detail` values mean, spelled out — the stored strings are
 *  for the database, not for an admin to decode. */
const ESCAPE_LABELS: Record<string, string> = {
  called: "Pressed Call IT support",
  nothing_worked: "Pressed “Nothing here worked”",
  unknown: "Unrecorded",
};

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-outline bg-surface p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-on-background">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-info-light">{hint}</p>}
    </div>
  );
}

export default function TroubleshootingSettingsCard() {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [days, setDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getTroubleshootingAnalytics(days)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "Couldn't load troubleshooting data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      await setTroubleshootingAnalyticsEnabled(next);
      setData((prev) => (prev ? { ...prev, enabled: next } : prev));
    } catch (err) {
      setError(
        err instanceof Error && err.message ? err.message : "Couldn't save that."
      );
    } finally {
      setSaving(false);
    }
  }

  const totals = data?.totals;

  // The deflection rate, stated as the share of reading visits that ended in
  // an escape. Only computed from visits that opened an article — an escape
  // with no article behind it is someone who came for the phone number, not
  // an article that failed.
  const escapeRate =
    totals && totals.sessionsWithArticle > 0
      ? Math.round((totals.sessionsWithEscape / totals.sessionsWithArticle) * 100)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-lg border border-outline bg-surface p-4">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-on-background">
            Record troubleshooting usage
          </h4>
          <p className="mt-0.5 text-xs text-info-light">
            Anonymous. No name or email is stored — events are grouped only by a
            random per-visit id that is discarded when the tab closes.
          </p>
        </div>
        <Switch
          className="hover:cursor-pointer shrink-0 rounded-full border-2 transition-colors data-[state=checked]:bg-status-success border-outline/70 data-[state=unchecked]:bg-status-error"
          checked={data?.enabled ?? false}
          disabled={saving || loading}
          onCheckedChange={handleToggle}
        />
      </div>

      {error && (
        <div className="rounded-md bg-error/10 p-2 text-xs text-error">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
          Window
        </span>
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            type="button"
            onClick={() => setDays(w.days)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors hover:cursor-pointer ${
              days === w.days
                ? "border-primary text-primary"
                : "border-outline text-info-light hover:border-primary/50"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-3 py-10 text-sm text-info-light">
          <span className="size-5 animate-spin rounded-full border-2 border-outline border-t-transparent" />
          Loading...
        </div>
      )}

      {!loading && data && totals && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Reading visits"
              value={String(totals.sessionsWithArticle)}
              hint="Visits that opened at least one article"
            />
            <StatTile
              label="Still called IT"
              value={escapeRate === null ? "—" : `${escapeRate}%`}
              hint={
                escapeRate === null
                  ? "No reading visits yet"
                  : `${totals.sessionsWithEscape} of ${totals.sessionsWithArticle} visits`
              }
            />
            <StatTile
              label="Articles opened"
              value={String(totals.articlesOpened)}
              hint={`${totals.stepsReached} steps reached`}
            />
            <StatTile
              label="Searches with no match"
              value={String(totals.searchesWithNoMatch)}
              hint="What to write next"
            />
          </div>

          {/* The actionable list, above the per-article table on purpose. */}
          <CollapsibleSection
            title="Searches with no match"
            subtitle="Users describing problems the library doesn't cover, in their own words"
            meta={`${data.noMatchSearches.length} distinct`}
            defaultOpen
          >
            {data.noMatchSearches.length === 0 ? (
              <p className="py-3 text-sm text-info-light">
                Nothing yet. Either the library is covering what people look for, or
                nobody has searched.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-outline/20">
                {data.noMatchSearches.map((s) => (
                  <li
                    key={s.query}
                    className="flex items-center gap-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-on-background">
                      “{s.query}”
                    </span>
                    <span className="shrink-0 text-xs text-info-light">
                      {new Date(s.lastSearchedAt).toLocaleDateString()}
                    </span>
                    <Badge
                      size="compact"
                      icon="search"
                      label={`${s.count}×`}
                      bg="bg-status-pending/15"
                      text="text-status-pending"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="Articles"
            subtitle="Opens, escapes and how far people get"
            meta={`${data.articles.length} opened`}
            defaultOpen={false}
          >
            {data.articles.length === 0 ? (
              <p className="py-3 text-sm text-info-light">
                No articles have been opened in this window.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="py-2 pr-3 font-medium">Symptom</th>
                      <th className="py-2 pr-3 font-medium">Device</th>
                      <th className="py-2 pr-3 font-medium">Opens</th>
                      <th className="py-2 pr-3 font-medium">Escapes</th>
                      <th className="py-2 font-medium">Avg. step reached</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline/20">
                    {data.articles.map((a) => (
                      <tr key={`${a.deviceKey}/${a.symptomId}`}>
                        <td className="py-2 pr-3 text-on-background">{a.label}</td>
                        <td className="py-2 pr-3 text-info-light">{a.deviceKey}</td>
                        <td className="py-2 pr-3 text-on-background">{a.opens}</td>
                        <td className="py-2 pr-3 text-on-background">{a.escapes}</td>
                        <td className="py-2 text-info-light">
                          {a.deepestStep ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleSection>

          {data.escapesByControl.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
                How they escaped
              </span>
              {data.escapesByControl.map((e) => (
                <Badge
                  key={e.detail}
                  size="compact"
                  icon={e.detail === "called" ? "call" : "flag"}
                  label={`${ESCAPE_LABELS[e.detail] ?? e.detail} · ${e.count}`}
                  bg="bg-surface-container-low/40"
                  text="text-info-light"
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
