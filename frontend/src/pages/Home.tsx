import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { getFeedbackEnabled } from "@/api/feedback";
import { fetchUsers } from "@/api/users";
import { getRequests } from "@/api/requests";
import { getAssetCategories } from "@/api/categories";
import { iconForCategory } from "@/lib/categoryIcon";
import { useAuth } from "@/hooks/useAuth";
import type { AssetCategory } from "@/types/categoriesType";

///  +-----------------------------------------------------------------+
///  |                     HOME PAGE (internal tool)                   |
///  +-----------------------------------------------------------------+
//
//  Redesign: the old marketing-style landing (Hero/Features/Lifecycle/CTA)
//  is replaced with an internal-tool home — greeting + status snapshot,
//  start-a-request tiles, recent requests, and quick links.
//  Footer is unchanged from the previous page.

const CARD = "bg-landing-card border border-landing-border rounded-xl";
const RAISED = "bg-landing-raised border border-landing-border rounded-lg";

const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Checkout Central";

// Minimal structural type for what this page reads off a request.
// TODO: swap for the real `Request` import from your types file.
type HomeRequest = {
  id: number;
  userName: string;
  categoryName: string;
  status: "PENDING" | "COMPLETED" | "REJECTED" | "APPROVED";
  createdAt: string;
  modelRequest?: {
    modelName: string;
  };
};

///  +-----------------------------------------------------------------+
///  |                  DATA: THE USER'S REQUESTS                      |
///  +-----------------------------------------------------------------+
//
//  Scope: requests where the signed-in person is the TARGET USER.
//  Resolved deterministically: auth email → users list → userId →
//  getRequests({ userId }). Stats are derived client-side from the
//  returned page (limit 100 — plenty at our org size).

function useMyRequests() {
  const { email, isLoading: authLoading } = useAuth();
  const [requests, setRequests] = useState<HomeRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!email) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const users = await fetchUsers();
        const me = users.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );
        if (!me) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = await getRequests({ userId: Number(me.id), limit: 100 });
        if (!cancelled) setRequests(data.requests ?? []);
      } catch (err) {
        console.error("Failed to load home page requests", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [email, authLoading]);

  return { requests, loading };
}

export default function LandingPage() {
  const { requests, loading } = useMyRequests();

  return (
    <div className="bg-landing-bg text-on-background min-h-screen flex flex-col">
      <main className="w-full max-w-[1160px] mx-auto px-6 md:px-8 flex-grow pb-16">
        <HomeHead requests={requests} loading={loading} />
        <QuickStart />
        <RecentRequests requests={requests} loading={loading} />
        <QuickLinks />
      </main>

      {/* FIXED: bg-nav-bg had no token in theme.css (silently no-op) — now uses
          the derived footer token: nav lightness +0.1 in dark, -0.1 in light */}
      <footer className="mt-16 border-t border-outline shadow-md bg-footer-bg">
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
  requests: HomeRequest[];
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
        <p className="text-on-surface-variant text-lg max-w-[52ch]">
          Need a device for yourself or someone on your team? Start a request
          below — we'll route it to the right approver and keep you posted.
        </p>
      </div>

      {/* Status snapshot */}
      <div className="flex gap-3 shrink-0" aria-label="Your request summary">
        <Stat num={inProgress} label="In progress" loading={loading} />
        <Stat num={completed} label="Completed" loading={loading} />
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
}: {
  num: number;
  label: string;
  loading: boolean;
  attention?: boolean;
}) {
  return (
    <div
      className={`${CARD} flex flex-col items-center justify-center gap-1 px-5 py-4 min-w-[110px] ${
        attention ? "!border-red-500/50" : ""
      }`}
    >
      <span
        className={`font-headline font-extrabold text-2xl ${
          attention ? "text-red-500" : ""
        }`}
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
    <section className={`${CARD} shadow-sm p-6 md:p-8 mb-8`}>
      <div className="mb-5">
        <h2 className="font-headline font-bold text-xl">Start a request</h2>
        <p className="text-on-surface-variant text-[15px]">
          Pick what you need to get going.
        </p>
      </div>

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
            to="/checkout"
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
              to={`/checkout?categoryId=${cat.id}`}
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
    </section>
  );
}

///  +-----------------------------------------------------------------+
///  |                    YOUR RECENT REQUESTS                         |
///  +-----------------------------------------------------------------+

const STATUS_PILL: Record<
  HomeRequest["status"],
  { label: string; className: string }
> = {
  PENDING: {
    label: "Pending approval",
    className: "bg-blue-500/10 text-blue-400 border border-blue-400",
  },
  APPROVED: {
    label: "Approved",
    className: "bg-purple-500/10 text-purple-400 border border-purple-400",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-500/10 text-green-600 border border-green-600",
  },
  REJECTED: {
    label: "Rejected",
    className: "bg-red-500/10 text-red-600 border border-red-600",
  },
};

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${d.toLocaleDateString("en-AU", { month: "short" })}`;
}

function RecentRequests({
  requests,
  loading,
}: {
  requests: HomeRequest[];
  loading: boolean;
}) {
  const { name } = useAuth();

  const recent = [...requests]
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 4);

  return (
    <section className={`${CARD} shadow-sm p-6 md:p-8 mb-8`} id="requests">
      <div className="flex items-center mb-4">
        <h2 className="font-headline font-bold text-xl">Your recent requests</h2>
        <Link
          to="/requests"
          className="ml-auto text-sm font-semibold text-info-light hover:text-on-background transition-colors"
        >
          View all →
        </Link>
      </div>

      <div className="flex flex-col">
        <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_1fr] gap-2 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-info-light border-b border-outline/10">
          <span>Asset</span>
          <span>Requested</span>
          <span>For</span>
          <span>Status</span>
        </div>

        {loading && (
          <p className="px-3 py-6 text-sm text-info-light">Loading…</p>
        )}

        {!loading && recent.length === 0 && (
          <p className="px-3 py-6 text-sm text-info-light">
            Nothing yet — start your first request above.
          </p>
        )}

        {!loading &&
          recent.map((r) => (
            <Link
              key={r.id}
              to="/requests"
              className="grid grid-cols-[1.6fr_0.8fr_0.8fr_1fr] gap-2 items-center px-3 py-3 border-b border-outline/10 text-sm hover:bg-landing-raised transition-colors rounded-md"
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
                <span
                  className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_PILL[r.status].className}`}
                >
                  {STATUS_PILL[r.status].label}
                </span>
              </span>
            </Link>
          ))}
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
      desc: "Every non-standard request across the org",
      to: "/requests",
    },
    {
      icon: "list",
      title: "Request Form",
      desc: "Request an Asset here",
      to: "/checkout",
    },
    {
      icon: "settings",
      title: "Settings",
      desc: "Categories, price tiers & approvers",
      to: "/settings",
    },
    {
      icon: "feedback",
      title: "Feedback",
      desc: "Let us know if this service is an improvement",
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
///  |                      FEEDBACK NAV LINK                          |
///  +-----------------------------------------------------------------+

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