import { useAuth } from "@/hooks/useAuth";
import ThemeSwitch from "@/components/nav/ThemeSwitch";
import DevAuthToggle from "@/components/nav/DevAuthToggle";
import RequestableCategoriesSelector from "@/components/settings/RequestableCategoriesSelector";
import StandardModelsSelector from "@/components/settings/StandardModelsSelector";
import SkeletonStatusSelector from "@/components/settings/SkeletonStatusSelector";

export default function SettingsPage() {
  const { role } = useAuth();
  const isAdmin = role === "ADMIN";

  return (
    <main className="w-full h-screen bg-surface">
      <div className="max-w-3xl py-12 px-6 mx-auto">

        {/* Page header */}
        <div className="mb-10 text-center md:text-left">
          <h1 className="font-headline text-4xl font-extrabold tracking-tight text-on-background mb-2">
            Settings
          </h1>
          <p className="text-info-light">
            Configure your workspace and asset lifecycle parameters. Changes save automatically.
          </p>
        </div>

        <div className="space-y-8">

          {/* Appearance — visible to everyone */}
          <SettingsSection icon="palette" title="Appearance">
            <SettingsRow
              title="Theme"
              description="Switch between light and dark visual interfaces."
            >
              <ThemeSwitch />
            </SettingsRow>
          </SettingsSection>

          {/* Asset Configuration — admin-only */}
          {isAdmin && (
            <SettingsSection icon="inventory" title="Asset Configuration">
              <div className="space-y-6">
                <RequestableCategoriesSelector />
                <StandardModelsSelector />
              </div>
            </SettingsSection>
          )}

          {/* Snipe-IT Configuration — admin-only */}
          {isAdmin && (
            <SettingsSection icon="settings_applications" title="Snipe-IT Configuration">
              <SkeletonStatusSelector />
            </SettingsSection>
          )}

          {import.meta.env.VITE_APP_ENV === "development" && (
            <SettingsSection icon="science" title="Dev Auth">
              <p className="text-sm text-info-light mb-4">
                Developer-only control for impersonating users when running outside the SSO gateway.
              </p>
              <DevAuthToggle />
            </SettingsSection>
          )}

        </div>
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