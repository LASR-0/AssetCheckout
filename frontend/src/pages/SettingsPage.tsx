import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import ThemeSwitch from "@/components/nav/ThemeSwitch";
import DevAuthToggle from "@/components/nav/DevAuthToggle";
import AssetConfigurationSettings from "@/components/settings/AssetConfiguration";
import AccessoryConfigurationSettings from "@/components/settings/AccessoryConfiguration";
import SkeletonStatusSelector from "@/components/settings/SkeletonStatusSelector";
import ScheduledJobsCard from "@/components/settings/ScheduledJobs";
import JobHistoryTable from "@/components/settings/JobsHistoryTable";
import JobStatusBar from "@/components/settings/JobStatusBar";
import FeedbackSettingsCard from "@/components/settings/FeedbackSettingsCard";
import CollapsibleSection from "@/components/ui/collapsible-section";
import TroubleshootingSettingsCard from "@/components/settings/TroubleshootingSettingsCard";
import SharepointSyncCard from "@/components/settings/SharepointSyncCard";
import MobileFilterCard from "@/components/settings/MobileFilterCard";
import ScheduledJobsTimeline from "@/components/settings/JobsTimeline";
import AccessoryAssetMap from "@/components/settings/AccessoryAssetMap";

export default function SettingsPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";
  const isDev = import.meta.env.VITE_APP_ENV === "development";

  // Bumped whenever a job is manually queued, so the history table refetches.
  const [jobsRefreshKey, setJobsRefreshKey] = useState(0);
  const [assetConfigRefreshKey, setAssetConfigRefreshKey] = useState(0);

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
          <AssetConfigurationSettings onRequestableChange={() => setAssetConfigRefreshKey((k) => k + 1)}/>
        </SettingsSection>
      )}

      {/* Accessory Configuration -- admin-only */}
      {isAdmin && (
        <SettingsSection icon="keyboard" title="Accessory Configuration">
          <p className="text-sm text-info-light mb-4">
            Which accessory categories can be requested, and the named options
            requesters pick from in each. "Something else" is always offered
            automatically and locks a request to non-standard.
          </p>
          {/* Half of the cross-layer story. Repeated in scoped form under
              Accessory Availability by Asset rather than hoisted into one
              page-level panel, so each section explains itself where the
              admin is working. */}
          <p className="text-sm text-info-light mb-4">
            This controls what <em>exists</em>, not who can see it. A category
            set up perfectly here is still invisible to everyone until it's
            mapped to at least one asset category under{" "}
            <span className="font-semibold text-on-surface-variant">
              Accessory Availability by Asset
            </span>{" "}
            below — requesters only ever see the two combined. Leaving the
            requestable list empty applies no restriction rather than blocking
            everything.
          </p>
          <AccessoryConfigurationSettings />
        </SettingsSection>
      )}

      {/* Accessory Availability by Asset (L3) -- admin-only */}
      {isAdmin && (
        <SettingsSection icon="account_tree" title="Accessory Availability by Asset">
          <p className="text-sm text-info-light mb-4">
            Which accessory categories a user can request, based on the asset
            categories they hold in Snipe-IT. Only requestable accessory
            categories can be mapped here, and requesters only see accessories
            tied to assets they actually have.
          </p>
          {/* The other half. This is the layer that gates: an unmapped
              accessory category is invisible no matter how it's configured
              above, which is the most common "I set it up and nobody can
              request it" cause. */}
          <p className="text-sm text-info-light mb-4">
            This is what decides what a given person sees. An accessory
            category mapped to nothing here can't be requested by anyone, even
            when it's requestable and has options configured under{" "}
            <span className="font-semibold text-on-surface-variant">
              Accessory Configuration
            </span>{" "}
            above. If an admin reports configuring an accessory that nobody can
            request, check this mapping first.
          </p>
          <AccessoryAssetMap refreshKey={assetConfigRefreshKey}/>
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
          <ScheduledJobsTimeline />
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
            <div className="mb-4">
              <JobStatusBar refreshKey={jobsRefreshKey} />
            </div>
            <CollapsibleSection title="Jobs History Table">
              <JobHistoryTable refreshKey={jobsRefreshKey} />
            </CollapsibleSection>
          </div>
        </div>
      </SettingsSection>
      <SettingsSection icon="troubleshoot" title="Troubleshooting">
        <p className="text-sm text-info-light mb-4">
          How the troubleshooting library is being used, and whether it stops tickets.
          Collection is anonymous; turn it off here if you'd rather not gather it.
        </p>
        <TroubleshootingSettingsCard />
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
          <div className="flex items-center mb-2 justify-center">
            <span className="material-symbols-outlined text-on-background mx-5 !text-4xl"> display_settings </span>
            <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-background">
              Settings
            </h1>
          </div>
          {/* Deliberately says nothing about saving. Most sections save on
              change, but the standard accessories, mobile filter and job
              schedules have their own Save button — so a blanket "changes save
              automatically" told people the opposite of the truth in exactly
              the places where losing an edit costs the most. Save behaviour is
              stated next to the control it applies to, not up here. */}
          <p className="text-info-light">
            What can be requested, how it's fulfilled, and the background jobs that keep it running.
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
        <h2 className="font-headline text-xl font-bold text-on-background">{title}</h2>
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