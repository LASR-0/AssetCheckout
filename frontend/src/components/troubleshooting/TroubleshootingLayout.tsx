import { Link } from "react-router-dom";
import { SupportEscapeCard } from "./SupportEscape";
import { useSubjectBackNav } from "@/hooks/useSubjectBackNav";
import { troubleshootingIndexPath } from "@/lib/troubleshootingRoutes";
import type { TroubleshootingConfig } from "@/types/troubleshootingType";

///  +-----------------------------------------------------------------+
///  |                  TROUBLESHOOTING PAGE SHELL                     |
///  +-----------------------------------------------------------------+
//
//  Breadcrumb, page heading, escape card and the sticky sidebar column —
//  everything the index and an article have in common. The heading stays the
//  same inside an article ("Troubleshoot your phone"); the article's own
//  title lives in the content column and in the breadcrumb tail.
//
//  No nav bar and no footer here. The app has its own chrome in App.tsx, and
//  the design mockup's header, brand mark, theme toggle and footer were
//  scaffolding for a standalone prototype.
//
//  The mockup set its eyebrow labels in JetBrains Mono. --font-mono is
//  commented out in index.css, so rather than reviving a font for decoration
//  they are uppercase and letter-spaced in the app's own stack — the same
//  treatment the feedback form already uses for its question labels.
///  +-----------------------------------------------------------------+

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">
      {children}
    </p>
  );
}

type Props = {
  subjectKey: string | null;
  subjectLabel: string;
  subjectLabelSingular: string;
  /** The article title, when inside one. Becomes the last breadcrumb crumb. */
  breadcrumbTail?: string;
  config: TroubleshootingConfig | null;
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export default function TroubleshootingLayout({
  subjectKey,
  subjectLabel,
  subjectLabelSingular,
  breadcrumbTail,
  config,
  sidebar,
  children,
}: Props) {
  // The subject crumb is a Back affordance when the reader came from the
  // symptom list, and an ordinary link otherwise. On the index itself
  // there is no list behind it and it stays a plain link either way.
  const backToSymptoms = useSubjectBackNav(subjectKey);

  return (
    <main className="min-h-screen bg-landing-bg text-on-background">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 md:px-8">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-info-light"
        >
          <Link to="/" className="hover:text-on-background transition-colors">
            Home
          </Link>
          <span aria-hidden>/</span>
          <Link to={troubleshootingIndexPath()} className="hover:text-on-background transition-colors">
            Troubleshooting
          </Link>
          {subjectKey && (
            <>
              <span aria-hidden>/</span>
              {/* On the symptom list itself this crumb IS the current page,
                  so it is marked as such rather than being a link back to
                  where you already are — which would push a fresh entry and
                  collapse everything the reader had opened.

                  Inside an article it behaves as Back when the list is
                  directly behind, returning them to it as they left it. */}
              {breadcrumbTail ? (
                <Link
                  {...backToSymptoms}
                  className="hover:text-on-background transition-colors"
                >
                  {subjectLabel}
                </Link>
              ) : (
                <span aria-current="page" className="text-on-background">
                  {subjectLabel}
                </span>
              )}
            </>
          )}
          {breadcrumbTail && (
            <>
              <span aria-hidden>/</span>
              {/* aria-current marks the crumb for the page you're already on,
                  which is otherwise only signalled by it not being a link. */}
              <span aria-current="page" className="text-on-background">
                {breadcrumbTail}
              </span>
            </>
          )}
        </nav>

        <header className="flex flex-col gap-6 py-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <Eyebrow>Support{subjectLabel && ` · ${subjectLabel}`}</Eyebrow>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Troubleshoot your {subjectLabelSingular}
            </h1>
            <p className="max-w-[62ch] text-base text-info-light">
              Work through the checks below before raising a ticket. Pick the symptom
              that matches what you&apos;re seeing and follow the steps in order — most
              issues are resolved in the first three.
            </p>
          </div>
          {config && <SupportEscapeCard config={config} />}
        </header>

        <div className="grid items-start gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Sticky under the fixed navbar. Hidden on small screens, where a
              sticky rail would eat most of the viewport — the page is short
              enough there to scroll. */}
          <aside className="hidden lg:sticky lg:top-24 lg:flex lg:flex-col lg:gap-4">
            {sidebar}
          </aside>
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
        </div>
      </div>
    </main>
  );
}
