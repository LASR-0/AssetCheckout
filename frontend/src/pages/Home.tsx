import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { getRequests } from "@/api/requests";
import { getAssetCategories } from "@/api/categories";
import { iconForCategory } from "@/lib/categoryIcon";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge, deriveFulfilment } from "@/components/ui/statusbadge";
import type { AssetCategory } from "@/types/categoriesType";
import { getAccessoryCategoriesForMe } from "@/api/accessories";
import type { AccessoryCategory } from "@/types/accessoriesType";
import type { Request } from "@/types/requestType"

///  +-----------------------------------------------------------------+
///  |                     HOME PAGE (internal tool)                   |
///  +-----------------------------------------------------------------+
//
//  Redesign: the old marketing-style landing (Hero/Features/Lifecycle/CTA)
//  is replaced with an internal-tool home — greeting + status snapshot,
//  start-a-request tiles, recent requests, and quick links.
//
//  The footer now lives in its own component (components/Footer.tsx) and
//  is rendered app-wide from App.tsx, so this page no longer owns the
//  min-h-screen flex column — App.tsx does. The root here is flex-grow
//  so the page background fills the space between nav and footer.
//
//  TABLE-FEEL PASS: the three content cards (Start a request, Accessories,
//  Your recent requests) now wear the same chrome as the settings tables
//  (see components/settings/CollapsibleTableSection.tsx) — a tinted header
//  bar in surface-container-low/30 with a hairline divider, then the body.
//  CARD gained overflow-hidden so the tint clips to the rounded corners.

const CARD =
  "bg-landing-card border border-landing-border rounded-xl overflow-hidden";
const RAISED = "bg-landing-raised border border-landing-border rounded-lg";

///  +-----------------------------------------------------------------+
///  |                 SHARED: TINTED SECTION HEADER                   |
///  +-----------------------------------------------------------------+
//
//  Mirrors CollapsibleTableSection's trigger row: tinted bar, hairline
//  divider, optional right-aligned actions slot. Not collapsible — the
//  home page sections are always open — so no trigger/chevron.
//
//  Type scale is a step down from the old text-xl headings so the cards
//  read as table chrome rather than marketing sections; bump `text-base`
//  back to `text-xl` if you'd rather keep the larger heading.

function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 bg-surface-container-low/30 border-b border-outline/50">
      <div className="flex flex-col min-w-0">
        <h2 className="font-headline font-bold text-base text-on-background">
          {title}
        </h2>
        {subtitle && (
          <p className="text-info-light text-[13px] leading-snug">{subtitle}</p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                  DATA: THE USER'S REQUESTS                      |
///  +-----------------------------------------------------------------+
//
//  Scope: requests where the signed-in person is the TARGET USER.
//  getRequests no longer accepts a userId filter, so we fetch the most
//  recent org-wide page (limit 100) and filter client-side by userName —
//  the same comparison RecentRequests already uses. NOTE: the 100-request
//  window is now org-wide, so stats reflect the user's share of recent
//  activity rather than a guaranteed all-time count.

function useMyRequests() {
  const { name, isLoading: authLoading } = useAuth();
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!name) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const data = await getRequests({ limit: 100 });
        const all: Request[] = data.requests ?? [];
        const mine = all.filter((r) => r.userName === name);
        if (!cancelled) setRequests(mine);
      } catch (err) {
        console.error("Failed to load home page requests", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [name, authLoading]);

  return { requests, loading };
}

export default function LandingPage() {
  const { requests, loading } = useMyRequests();

  return (
    <div className="bg-landing-bg text-on-background flex-grow">
      <main className="w-full max-w-[1160px] mx-auto px-6 md:px-8 pb-16">
        <HomeHead requests={requests} loading={loading} />
        <QuickStart />
        <AccessoryQuickStart />
        <RecentRequests requests={requests} loading={loading} />
        <QuickLinks />
      </main>
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                GREETING + STATUS SNAPSHOT                       |
///  +-----------------------------------------------------------------+

function timeOfDayGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formattedDate(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString("en-AU", { weekday: "long" });
  const day = now.getDate();
  const month = now.toLocaleDateString("en-AU", { month: "long" });
  return `${weekday}, ${day} ${month}`;
}

function HomeHead({
  requests,
  loading,
}: {
  requests: Request[];
  loading: boolean;
}) {
  // useAuth already provides the display name — works in dev mode too
  // (name comes from the DevAuthToggle).
  const { name } = useAuth();
  const firstName = name ? name.split(" ")[0] : null;

  // No "needs input" state exists in the status model, so the snapshot is:
  // in progress (PENDING + APPROVED — approved but not yet fulfilled is
  // still in flight), completed, and rejected (attention-styled when > 0).
  const inProgress = requests.filter(
    (r) => r.status === "PENDING" || r.status === "APPROVED"
  ).length;
  const completed = requests.filter((r) => r.status === "COMPLETED").length;
  const rejected = requests.filter((r) => r.status === "REJECTED").length;

  return (
    <section className="pt-14 md:pt-20 pb-10 flex flex-col md:flex-row md:items-end gap-8 md:gap-12">
      <div className="flex flex-col gap-2 flex-grow">
        <p className="font-mono text-[13px] uppercase tracking-wider text-info-light">
          {formattedDate()}
        </p>
        <h1 className="font-headline font-extrabold text-3xl md:text-[42px] tracking-tight">
          {timeOfDayGreeting()}
          {firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className="text-info-light text-lg max-w-[52ch]">
          Need a device for yourself or someone on your team? Start a request
          below — we'll route it to the right approver and keep you posted.
        </p>
      </div>

      {/* Status snapshot — mobile: full-width 3-col grid so the cards
          share the space equally (centred, equal side padding);
          desktop: unchanged flex row. */}
      <div
        className="grid grid-cols-3 gap-3 w-full md:w-auto md:flex md:shrink-0"
        aria-label="Your request summary"
      >
        <Stat num={inProgress} label="In progress" loading={loading} pending={inProgress > 0} />
        <Stat num={completed} label="Completed" loading={loading} complete={completed > 0} />
        <Stat
          num={rejected}
          label="Rejected"
          loading={loading}
          attention={rejected > 0}
        />
      </div>
    </section>
  );
}

function Stat({
  num,
  label,
  loading,
  attention = false,
  complete = false,
  pending = false,
}: {
  num: number;
  label: string;
  loading: boolean;
  attention?: boolean;
  complete?: boolean;
  pending?: boolean;
}) {
  return (
    <div
      className={`${CARD} flex flex-col items-center justify-center gap-1 px-3 md:px-5 py-4 min-w-0 md:min-w-[110px] 
        ${attention ? "!border-status-error/50" : ""} 
        ${complete ? "!border-status-success/50" : ""} 
        ${pending ? "!border-status-model/50" : ""}`}
    >
      <span
        className={`font-headline font-extrabold text-2xl 
          ${attention ? "text-status-error" : "" } 
          ${complete ? "text-status-success" : ""}
          ${pending ? "text-status-model" : ""}
          `}
      >
        {loading ? "–" : num}
      </span>
      <span className="text-xs text-info-light text-center whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

///  +-----------------------------------------------------------------+
///  |                PRIMARY ACTION: START A REQUEST                  |
///  +-----------------------------------------------------------------+
//
//  Dynamic: tiles come from the server-configured asset categories,
//  same source as AssetTypeSelector on the form. Homepage-grade states:
//  quiet loading spinner, and a soft fallback (plain link to the form)
//  if the catalogue can't be fetched — the form has its own full error UI.
//
//  Chrome: tinted SectionHeader + padded body. The tiles themselves are
//  untouched.

function QuickStart() {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getAssetCategories();
        if (!cancelled) setCategories(data);
      } catch (err) {
        console.error("Failed to load categories for home page", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className={`${CARD} shadow-sm mb-8`}>
      <SectionHeader
        title="Start a request"
        subtitle="Pick what you need to get going."
      />

      <div className="p-5 md:p-6">
        {loading && (
          <div className="flex items-center py-8 font-semibold text-info-light text-sm">
            <span className="animate-spin h-5 w-5 border-2 border-info-light border-t-transparent rounded-full mr-3" />
            Loading asset types...
          </div>
        )}

        {!loading && (error || categories.length === 0) && (
          <p className="py-6 text-sm text-info-light">
            Couldn't load the asset catalogue right now — you can still{" "}
            <Link
              to="/assets"
              className="font-semibold underline hover:text-on-background transition-colors"
            >
              start a request from the form
            </Link>
            .
          </p>
        )}

        {!loading && !error && categories.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((cat) => (
              // FIXED: deep-link with the category id — the form validates it
              // against its own fetched list before preselecting.
              <Link
                key={cat.id}
                to={`/assets?categoryId=${cat.id}`}
                className={`${RAISED} group flex flex-col items-start gap-3 px-5 py-5 hover:border-purple-500 hover:-translate-y-px transition-all`}
              >
                <span className="material-symbols-outlined !text-[28px]">
                  {iconForCategory(cat.name)}
                </span>
                <span className="font-bold text-[15px]">{cat.name}</span>
                <span className="text-sm font-semibold text-info-light group-hover:text-on-background transition-colors">
                  Request →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

///  +-----------------------------------------------------------------+
///  |                    YOUR RECENT REQUESTS                         |
///  +-----------------------------------------------------------------+
//
//  Status column renders the shared StatusBadge (same component as the
//  requests table) with the derived fulfilment stage, so colours, icons,
//  labels, and post-completion states (Assigned / Shipped / Ready to
//  collect / Collected / Received) are identical site-wide.
//
//  The rows now sit inside a settings-style table shell: rounded-lg +
//  border-outline container on bg-surface, a tinted header row in
//  surface-container-low/20, and border-outline/10 hairlines between rows.
//  "View all" moved into the card header's actions slot.

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${d.toLocaleDateString("en-AU", { month: "short" })}`;
}

const RECENT_GRID = "grid grid-cols-[1.6fr_0.8fr_0.8fr_1fr] gap-2";

function RecentRequests({
  requests,
  loading,
}: {
  requests: Request[];
  loading: boolean;
}) {
  const { name } = useAuth();

  const recent = [...requests]
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 4);

  return (
    <section className={`${CARD} shadow-sm mb-8`} id="requests">
      <SectionHeader
        title="Your recent requests"
        subtitle="The last few things you've asked for."
        actions={
          <Link
            to="/requests"
            className="text-sm font-semibold text-info-light hover:text-on-background transition-colors"
          >
            View all →
          </Link>
        }
      />

      <div className="p-3 md:p-4">
        <div className="rounded-lg border border-outline bg-surface/50 overflow-hidden">
          <div
            className={`${RECENT_GRID} px-3 py-2 bg-surface-container-low/20 font-mono text-[11px] uppercase tracking-wider text-info-light`}
          >
            <span>Asset</span>
            <span>Requested</span>
            <span>For</span>
            <span>Status</span>
          </div>

          {loading && (
            <p className="px-3 py-6 text-sm text-info-light border-t border-outline/10">
              Loading…
            </p>
          )}

          {!loading && recent.length === 0 && (
            <p className="px-3 py-6 text-sm text-info-light border-t border-outline/10">
              Nothing yet — start your first request above.
            </p>
          )}

          {!loading &&
            recent.map((r) => (
              <Link
                key={r.id}
                to="/requests"
                className={`${RECENT_GRID} items-center px-3 py-3 border-t border-outline text-sm hover:bg-surface-container-low/40 transition-colors`}
              >
                <span className="flex items-center gap-2.5 font-semibold">
                  <span className="material-symbols-outlined !text-[18px] text-on-surface-variant">
                    {iconForCategory(r.categoryName)}
                  </span>
                  {r.modelRequest?.modelName ?? r.categoryName}
                </span>
                <span className="text-on-surface-variant">
                  {shortDate(r.createdAt)}
                </span>
                <span className="text-on-surface-variant">
                  {r.userName === name ? "Yourself" : r.userName}
                </span>
                <span>
                  <StatusBadge status={deriveFulfilment(r).badgeKey} />
                </span>
              </Link>
            ))}
        </div>
      </div>
    </section>
  );
}

///  +-----------------------------------------------------------------+
///  |                        QUICK LINKS                              |
///  +-----------------------------------------------------------------+

function QuickLinks() {
  // TODO: confirm real routes for jobs / settings / helpdesk.
  const links = [
    {
      icon: "table_rows",
      title: "Request log",
      desc: "Every non-standard request across the org.",
      to: "/requests",
    },
    {
      icon: "list",
      title: "Request Assets",
      desc: "Request an Asset here.",
      to: "/assets",
    },
    {
      icon: "settings",
      title: "Settings",
      desc: "Categories, price tiers & approvers.",
      to: "/settings",
    },
    {
      icon: "feedback",
      title: "Feedback",
      desc: "Let us know if this service is an improvement.",
      to: "/feedback",
    },
        {
      icon: "keyboard",
      title: "Request Accessories",
      desc: "Request Asset Accessories here.",
      to: "/feedback",
    },
  ];

  return (
    <section id="links">
      <div className="mb-4">
        <h2 className="font-headline font-bold text-xl">Go somewhere</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {links.map((l) => (
          <Link
            key={l.title}
            to={l.to}
            className={`${RAISED} group flex items-center gap-4 px-5 py-4 hover:border-purple-500 transition-all`}
          >
            <span className="w-10 h-10 rounded-lg grid place-items-center shrink-0 bg-modal-surface-accent text-modal-text-accent">
              <span className="material-symbols-outlined !text-[20px]">
                {l.icon}
              </span>
            </span>
            <span className="flex flex-col min-w-0">
              <strong className="font-bold text-[15px]">{l.title}</strong>
              <small className="text-[13px] text-info-light">{l.desc}</small>
            </span>
            <span className="ml-auto text-info-light group-hover:text-on-background transition-colors">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

///  +-----------------------------------------------------------------+
///  |            ACCESSORIES FOR YOUR DEVICES (device-derived)        |
///  +-----------------------------------------------------------------+
//
//  Only the accessory categories the signed-in user's own devices unlock
//  (L3 ∩ L1). Deliberately quiet: renders nothing until loaded, and nothing
//  at all when the user has no eligible accessories (or the fetch fails) —
//  the home page shouldn't carry an empty accessory card.
//
//  Chrome matches QuickStart: tinted SectionHeader + padded tile body.

// Must stay in step with the route registered in App.tsx.
const ACCESSORY_FORM_ROUTE = "/accessories";

function AccessoryQuickStart() {
  const [categories, setCategories] = useState<AccessoryCategory[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAccessoryCategoriesForMe();
        if (!cancelled) setCategories(data);
      } catch (err) {
        console.error("Failed to load accessory categories for home page", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded || categories.length === 0) return null;

  return (
    <section className={`${CARD} shadow-sm mb-8`}>
      <SectionHeader
        title="Accessories for your devices"
        subtitle={
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-dashed border-status-pending bg-status-pending/10 px-2 py-0.5 text-status-pending text-[12px] font-semibold">
            <span className="material-symbols-outlined !text-[14px]">info</span>
            Based on the equipment assigned to you.
          </span>
        }
      />

      <div className="p-5 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`${ACCESSORY_FORM_ROUTE}?categoryId=${cat.id}`}
              className={`${RAISED} group flex flex-col items-start gap-3 px-5 py-5 hover:border-purple-500 hover:-translate-y-px transition-all`}
            >
              <span className="material-symbols-outlined !text-[28px]">
                {iconForCategory(cat.name)}
              </span>
              <span className="font-bold text-[15px]">{cat.name}</span>
              <span className="text-sm font-semibold text-info-light group-hover:text-on-background transition-colors">
                Request →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}