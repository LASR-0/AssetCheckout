import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import ThemeSwitch from "@/components/nav/ThemeSwitch";
import DevAuthToggle from "@/components/nav/DevAuthToggle";
import RequestableCategoriesSelector from "@/components/settings/RequestableCategoriesSelector";
import StandardModelsSelector from "@/components/settings/StandardModelsSelector";
import SkeletonStatusSelector from "@/components/settings/SkeletonStatusSelector";
import ScheduledJobsCard from "@/components/settings/ScheduledJobs";
import JobHistoryTable from "@/components/settings/JobsHistoryTable";
import FeedbackSettingsCard from "@/components/settings/FeedbackSettingsCard";
import CollapsibleTableSection from "@/components/settings/CollapsibleTable";
import SharepointSyncCard from "@/components/settings/SharepointSyncCard";
import MobileFilterCard from "@/components/settings/MobileFilterCard";

export default function SettingsPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";
  const isDev = import.meta.env.VITE_APP_ENV === "development";

  // Bumped whenever a job is manually queued, so the history table refetches.
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);

  // -- Left column: the vertically-stacked settings ------------------
  const stackedSettings = (
    <div className="space-y-8">
      {/* Appearance -- visible to everyone */}
      <SettingsSection icon="palette" title="Appearance">
        <SettingsRow
          title="Theme"
          description="Switch between light and dark visual interfaces."
        >
          <ThemeSwitch />
        </SettingsRow>
      </SettingsSection>

      {/* Asset Configuration -- admin-only */}
      {isAdmin && (
        <SettingsSection icon="inventory" title="Asset Configuration">
          <div className="space-y-6">
            <RequestableCategoriesSelector />
            <StandardModelsSelector />
          </div>
        </SettingsSection>
      )}

      {/* Snipe-IT Configuration -- admin-only */}
      {isAdmin && (
        <SettingsSection icon="settings_applications" title="Snipe-IT Configuration">
          <SkeletonStatusSelector />
        </SettingsSection>
      )}

      {/* FIXED: Mobile Number Filtering -- admin-only */}
      {isAdmin && (
        <SettingsSection icon="smartphone" title="Mobile Number Filtering">
          <p className="text-sm text-info-light mb-4">
            Which numbers count as mobiles when reusing an existing number on
            checkout. Numbers not matching these patterns are treated as
            landlines and hidden from the reuse picker.
          </p>
          <MobileFilterCard />
        </SettingsSection>
      )}

      {isAdmin && (
        <SettingsSection icon="sync" title="SharePoint Sync">
          <p className="text-sm text-info-light mb-4">
            Mirror tablet and phone requests to the SharePoint ordering ledger. The sync runs
            nightly; adjust its schedule under Background Jobs.
          </p>
          <SharepointSyncCard />
        </SettingsSection>
      )}

      {/* Dev Auth -- development-only */}
      {isDev && (
        <SettingsSection icon="science" title="Dev Auth">
          <p className="text-sm text-info-light mb-4">
            Developer-only control for impersonating users when running outside the SSO gateway.
          </p>
          <DevAuthToggle />
        </SettingsSection>
      )}
    </div>
  );

  // -- Right column: the wide Background Jobs section (admin-only) ----
  const jobsSection = (
    <div className="min-w-0 space-y-8">
      <SettingsSection icon="schedule" title="Background Jobs">
        <div className="space-y-8">
          <div>
            <h3 className="font-semibold text-on-background mb-1">Scheduled Jobs</h3>
            <p className="text-sm text-info-light mb-4">
              Maintenance jobs that run on a schedule. Trigger any of them manually with "Run now".
            </p>
            <ScheduledJobsCard onQueued={() => setJobsRefreshKey((k) => k + 1)} />
          </div>

          <div>
            <h3 className="font-semibold text-on-background mb-1">Job History</h3>
            <p className="text-sm text-info-light mb-4">
              Recent job runs, newest first. Filter by status or type.
            </p>
            <CollapsibleTableSection title="Jobs History Table">
              <JobHistoryTable refreshKey={jobsRefreshKey} />
            </CollapsibleTableSection>
          </div>
        </div>
      </SettingsSection>
      <SettingsSection icon="forum" title="Feedback">
        <p className="text-sm text-info-light mb-4">
          Anonymous staff feedback about Checkout. Toggle collection on or off, review
          responses, and export them.
        </p>
        <FeedbackSettingsCard />
      </SettingsSection>
    </div>
  );

  return (
    <main className="w-full min-h-[calc(100vh-4rem)] bg-landing-bg">
      <div
        className={`${isAdmin ? "max-w-3xl lg:max-w-[1600px]" : "max-w-3xl"} py-12 px-6 mx-auto`}
      >
        {/* Page header */}
        <div className="mb-10 text-center">
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-background mb-2">
            Settings
          </h1>
          <p className="text-info-light">
            Configure your workspace and asset lifecycle parameters. Changes save automatically.
          </p>
        </div>

        {isAdmin ? (
          // Two columns on lg+: fixed-width settings stack on the left,
          // flexible (wide) jobs section on the right. minmax(0,1fr) lets the
          // right track shrink so JobHistoryTable's own overflow-x-auto can
          // scroll on very narrow viewports instead of blowing out the grid.
          // Collapses to a single stacked column below lg.
          <div className="grid grid-cols-1 lg:grid-cols-[380px_minmax(0,1fr)] gap-8 lg:items-start">
            {stackedSettings}
            {jobsSection}
          </div>
        ) : (
          stackedSettings
        )}
      </div>
    </main>
  );
}

type SectionProps = {
  icon: string;
  title: string;
  children: React.ReactNode;
};

function SettingsSection({ icon, title, children }: SectionProps) {
  return (
    <section className="bg-surface-container-lowest shadow-md rounded-xl p-8 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <span className="material-symbols-outlined text-on-background">{icon}</span>
        <h2 className="font-headline text-xl font-bold text-info-light">{title}</h2>
      </div>
      {children}
    </section>
  );
}

type RowProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
};

function SettingsRow({ title, description, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="font-semibold text-on-background">{title}</h3>
        {description && (
          <p className="text-sm text-info-light">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}