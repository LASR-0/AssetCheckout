import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { getFeedbackEnabled } from "@/api/feedback";

///  +-----------------------------------------------------------------+
///  |                        LANDING PAGE                             |
///  +-----------------------------------------------------------------+

const CARD = "bg-landing-card border border-landing-border rounded-xl";
const RAISED = "bg-landing-raised border border-landing-border rounded-lg";

const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Checkout Central";

export default function LandingPage() {
  return (
    <div className="bg-landing-bg text-on-background">
      <main className="max-w-[1260px] mx-auto px-8">
        <Hero />
        <Features />
        <Lifecycle />
        <CtaBand />
      </main>
    <footer className="mt-16 border-t border-outline shadow-md bg-nav-bg">
    <div className="max-w-[1160px] mx-auto px-8 py-8 flex items-center gap-6 text-sm text-info-light">
        <span>{COMPANY}</span>
        <nav className="ml-auto flex gap-5 font-semibold">
        <Link className="hover:text-on-background transition-colors" to="/request">
            Checkouts
        </Link>
        <Link className="hover:text-on-background transition-colors" to="/requests">
            Requests
        </Link>
        <FeedbackNavLink />
        </nav>
    </div>
    </footer>
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                           HERO                                  |
///  +-----------------------------------------------------------------+

function Hero() {
  return (
    <section className="grid grid-cols-1 md:grid-cols-[1.05fr_1fr] gap-14 items-center pt-14 md:pt-24 pb-16">
      <div className="flex flex-col gap-5">
        <span className="self-start inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-full bg-blue-500/10 text-blue-400">
          Internal tool · IT Asset Management
        </span>

        <h1 className="font-headline font-extrabold text-4xl md:text-[54px] md:leading-[1.08] tracking-tight">
          Request hardware in{" "}
          <span className="bg-gradient-to-r from-[#c060f5] to-purple-700 bg-clip-text text-transparent">
            minutes
          </span>
          , not weeks.
        </h1>

        <p className="text-lg text-on-surface-variant max-w-[46ch]">
          {COMPANY} is the one place to request laptops, phones, tablets and
          desktops — routed to the right approver, tracked end to end, and
          synced with the asset register automatically.
        </p>

        <div className="flex items-center gap-4 mt-1 flex-wrap">
          <Link
            to="/checkout"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-white font-bold text-base twilight-gradient shadow-[0_8px_30px_rgba(140,60,240,0.45)] hover:opacity-90 hover:-translate-y-px active:scale-95 transition-all"
          >
            Start a checkout
            <span className="material-symbols-outlined !text-[18px]">arrow_forward</span>
          </Link>
          <Link
            to="/requests"
            className={`inline-flex items-center px-7 py-3.5 rounded-full font-bold text-base ${RAISED} text-on-background hover:border-outline hover:cursor-pointer transition-all`}
          >
            View request log
          </Link>
        </div>

        <p className="text-sm text-info-light flex items-center gap-2">
          <span className="material-symbols-outlined !text-[16px]">badge</span>
          Signs you in with your work account — no setup needed.
        </p>
      </div>

      <PreviewCard />
    </section>
  );
}

/** Static miniature of the real request form, fading out at the bottom. */
function PreviewCard() {
  return (
    <div aria-hidden="true">
      <div
        className={`${CARD} shadow-md p-6 pb-0 overflow-hidden max-h-[480px] [mask-image:linear-gradient(to_bottom,black_42%,transparent_97%)]`}
      >
        <MiniLabel>1. Asset selection</MiniLabel>
        <div className="grid grid-cols-4 gap-3 mb-6">
          <AssetTile icon="laptop_windows" label="Laptop" selected />
          <AssetTile icon="smartphone" label="Phone" />
          <AssetTile icon="tablet" label="Tablet" />
          <AssetTile icon="desktop_windows" label="Desktop" />
        </div>

        <MiniLabel>2. User details</MiniLabel>
        <MiniInput className="mb-6">Who will use this device?</MiniInput>

        <MiniLabel>3. Specification level</MiniLabel>
        <div className="mb-6">
          <span className="inline-flex p-1 bg-surface-container rounded-lg">
            <span className="px-4 py-2 rounded-md text-[13px] font-semibold bg-surface-container-lowest text-on-background shadow-sm">
              Standard
            </span>
            <span className="px-4 py-2 rounded-md text-[13px] font-semibold text-on-surface-variant/40">
              Non-Standard
            </span>
          </span>
        </div>

        <MiniLabel>4. Approval authority</MiniLabel>
        <MiniInput className="mb-6">Who manages the user of this device?</MiniInput>

        <div className="mb-6">
          <span className="block w-full text-center py-3.5 rounded-full text-white font-bold text-[15px] twilight-gradient">
            Submit Request
          </span>
        </div>
      </div>
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                         FEATURES                                |
///  +-----------------------------------------------------------------+

function Features() {
  return (
    <section className="py-14" id="features">
      <div className="text-center max-w-[620px] mx-auto mb-11 flex flex-col gap-3">
        <h2 className="font-headline font-extrabold text-2xl md:text-[34px]">
          Everything between &ldquo;I need a laptop&rdquo; and &ldquo;it&rsquo;s on your desk&rdquo;
        </h2>
        <p className="text-on-surface-variant text-lg">
          Three views, one workflow — built around how requests actually move
          through the org.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:-mx-12">
        <FeatureCard
          icon="checklist"
          title="Guided checkout"
          copy="A five-step form that asks only what's needed: asset type, user, specs and approver. Standard specs sail through; non-standard ones explain themselves."
        >
          <div className="flex flex-col w-[70%] mx-auto gap-3 pb-3">
            <div className="grid grid-cols-2 gap-3">
              <AssetTile icon="laptop_windows" label="Laptop" selected />
              <AssetTile icon="smartphone" label="Phone" />
            </div>
            <MiniInput>Who will use this device?</MiniInput>
            <MiniInput>Who manages the user?</MiniInput>
          </div>
        </FeatureCard>

        <FeatureCard
          icon="table_rows"
          title="Transparent request log"
          copy="Every non-standard request in one searchable table — who asked, who approves, and where it stands. No more chasing email threads."
        >
          <MiniTable />
        </FeatureCard>

        <FeatureCard
          icon="schedule"
          title="Hands-off housekeeping"
          copy="Scheduled jobs keep the catalogue fresh and the queue clean — categories and prices re-sync on a timer, stale requests auto-close overnight."
        >
          <MiniJobs />
        </FeatureCard>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  copy,
  children,
}: {
  icon: string;
  title: string;
  copy: string;
  children: React.ReactNode;
}) {
  return (
    <article className={`${CARD} shadow-sm flex flex-col overflow-hidden`}>
      <div className="p-5 pb-3 flex flex-col gap-1.5">
        <span className="w-9 h-9 rounded-lg grid place-items-center bg-modal-surface-accent text-modal-text-accent mb-1">
          <span className="material-symbols-outlined !text-[18px]">{icon}</span>
        </span>
        <h3 className="font-headline font-bold text-xl">{title}</h3>
        <p className="text-on-surface-variant text-[15px]">{copy}</p>
      </div>
      <div
        aria-hidden="true"
        className="mt-auto px-4 max-h-[220px] overflow-hidden [mask-image:linear-gradient(to_bottom,black_35%,transparent_95%)]"
      >
        {children}
      </div>
    </article>
  );
}

function MiniTable() {
  const rows = [
    { initials: "JD", name: "J. Doe", type: "Phone", pill: "green", status: "Completed" },
    { initials: "MS", name: "M. Smith", type: "Laptop", pill: "blue", status: "Pending" },
    { initials: "JD", name: "J. Doe", type: "Phone", pill: "red", status: "Rejected" },
    { initials: "MS", name: "M. Smith", type: "Tablet", pill: "green", status: "Completed" },
  ] as const;

  const pillClass = {
    green: "bg-green-500/10 text-green-600 border border-green-600",
    blue: "bg-blue-500/10 text-blue-400 border border-blue-400",
    red: "bg-red-500/10 text-red-600 border border-red-600",
  };

  const avatarClass: Record<string, string> = {
    JD: "bg-purple-500/15 text-purple-400",
    MS: "bg-amber-500/15 text-amber-500",
  };

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1.3fr_1fr_0.9fr] gap-2 px-2.5 py-2 font-mono text-[10px] uppercase tracking-wider text-info-light border-b border-outline/10">
        <span>Requester</span>
        <span>Type</span>
        <span>Status</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className="grid grid-cols-[1.3fr_1fr_0.9fr] gap-2 items-center px-2.5 py-2.5 border-b border-outline/10 text-[13px]"
        >
          <span className="flex items-center gap-2 font-semibold">
            <span
              className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-bold shrink-0 ${avatarClass[r.initials]}`}
            >
              {r.initials}
            </span>
            {r.name}
          </span>
          <span className="text-on-surface-variant">{r.type}</span>
          <span>
            <span
              className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${pillClass[r.pill]}`}
            >
              {r.status}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniJobs() {
  const jobs = [
    {
      title: "Refresh Prices Cache",
      schedule: "Every 10 min",
      desc: "Re-fetches the hardware list used for tier prices.",
    },
    {
      title: "Cleanup Stale Requests",
      schedule: "At 12:00 AM",
      desc: "Auto-rejects requests with no recent activity.",
    },
    {
      title: "Refresh Categories",
      schedule: "Every hour",
      desc: "Re-fetches the asset category list.",
    },
  ];

  return (
    <div className="flex flex-col gap-2.5 pb-2.5">
      {jobs.map((j) => (
        <div
          key={j.title}
          className={`${RAISED} flex flex-col items-start gap-2 px-3.5 py-3 sm:flex-row sm:items-center sm:gap-3`}
        >
          <div className="flex flex-col gap-1 min-w-0">
            <span className="flex items-center gap-2 font-bold text-[13px]">
              {j.title}
              {/* badge sits inline with the title from sm up */}
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400">
                <span className="material-symbols-outlined !text-[12px]">schedule</span>
                {j.schedule}
              </span>
            </span>
            {/* on mobile the badge gets its own line under the title */}
            <span className="self-start inline-flex sm:hidden items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-400">
              <span className="material-symbols-outlined !text-[12px]">schedule</span>
              {j.schedule}
            </span>
            <span className="text-xs text-info-light sm:whitespace-nowrap sm:overflow-hidden sm:text-ellipsis">
              {j.desc}
            </span>
          </div>
          <span className="shrink-0 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-md text-white text-xs font-bold twilight-gradient sm:ml-auto">
            <span
              className="material-symbols-outlined !text-[14px]"
              style={{ fontVariationSettings: "'wght' 900" }}
            >
              play_arrow
            </span>
            Run now
          </span>
        </div>
      ))}
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                    LIFECYCLE + CTA BAND                         |
///  +-----------------------------------------------------------------+

function Lifecycle() {
  const steps = [
    "Pick an asset",
    "Name the user",
    "Choose specs",
    "Manager approves",
    "IT Admin approves",
    "Asset registered",
  ];

  return (
    <section className="py-14" id="lifecycle">
      <div
        className={`${CARD} shadow-sm flex items-center justify-start md:justify-center gap-3.5 flex-wrap px-8 py-6`}
      >
        {steps.map((label, i) => (
          <span key={label} className="flex items-center gap-3.5">
            <span className="flex items-center gap-2.5 font-bold text-[15px]">
              <span className="w-[26px] h-[26px] rounded-full grid place-items-center bg-modal-surface-accent text-modal-text-accent text-[13px]">
                {i + 1}
              </span>
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className="text-info-light material-symbols-outlined !text-[16px]">
                arrow_forward
              </span>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="py-14">
      <div
        className={`${CARD} shadow-md relative overflow-hidden text-center px-8 py-16 flex flex-col items-center gap-4`}
      >
        <div className="pointer-events-none absolute -top-[40%] inset-x-[-20%] h-[70%] bg-[radial-gradient(ellipse_at_center,rgba(164,77,240,0.14),transparent_70%)]" />
        <h2 className="font-headline font-extrabold text-2xl md:text-[32px] relative">
          Need a device? Start here.
        </h2>
        <p className="text-on-surface-variant text-lg relative">
          Most standard requests are approved the same day.
        </p>
        <Link
          to="/checkout"
          className="relative inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-white font-bold text-base twilight-gradient shadow-[0_8px_30px_rgba(140,60,240,0.45)] hover:opacity-90 hover:-translate-y-px active:scale-95 transition-all"
        >
          Start a checkout
          <span className="material-symbols-outlined !text-[18px]">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
}

function FeedbackNavLink() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    getFeedbackEnabled()
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  return (
    <Link className="hover:text-on-background transition-colors" to="/feedback">
      Feedback
    </Link>
  );
}

///  +-----------------------------------------------------------------+
///  |                       SHARED MINI BITS                          |
///  +-----------------------------------------------------------------+

function MiniLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant mb-3">
      {children}
    </p>
  );
}

function MiniInput({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`${RAISED} flex items-center justify-between px-4 py-3 text-sm text-info-light ${className}`}
    >
      <span>{children}</span>
      <span className="material-symbols-outlined !text-[16px]">expand_more</span>
    </div>
  );
}

function AssetTile({
  icon,
  label,
  selected = false,
}: {
  icon: string;
  label: string;
  selected?: boolean;
}) {
  return (
    <span
      className={`flex flex-col items-center gap-2.5 px-2 pt-4 pb-3.5 rounded-lg text-[13px] font-semibold text-on-background ${RAISED} ${
        selected
          ? "!border-purple-500 shadow-[0_0_0_1px_rgb(168_85_247),0_4px_16px_rgba(164,77,240,0.14)]"
          : ""
      }`}
    >
      <span className="material-symbols-outlined !text-[26px]">{icon}</span>
      {label}
    </span>
  );
}