import { useState, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { TrayLabel } from "@/components/ui/tray";
import { useAuth } from "@/hooks/useAuth";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { loanConfigQuery, requestableAssetIdsQuery } from "@/api/queries";
import { PanelHostContext, SaveContext, useSave, useSaveStore, type PanelHost } from "@/components/settings/saveStatus";
import { useAccessoryPipeline } from "@/components/settings/accessoryPipeline";
import { Appearance } from "@/components/settings/sections/Appearance";
import { DevAuth } from "@/components/settings/sections/DevAuth";
import { DevSwitches } from "@/components/settings/sections/DevSwitches";
import { Assets } from "@/components/settings/sections/Assets";
import { Accessories } from "@/components/settings/sections/Accessories";
import { Sites } from "@/components/settings/sections/Sites";
import { Loans } from "@/components/settings/sections/Loans";
import { Jobs } from "@/components/settings/sections/Jobs";
import { Insight } from "@/components/settings/sections/Insight";

///  +-----------------------------------------------------------------+
///  |                  SETTINGS                                       |
///  +-----------------------------------------------------------------+
//
//  A settings workspace rather than a stack of cards: the areas grouped by
//  the job they do down the left, one area at a time on the right, and a
//  panel beyond that for anything too big for a row. Each area has its own
//  address (/settings/loans), so a link can land on it.
//
//  ONE SAVE MODEL, said once in the sidebar: single settings save the moment
//  they change; editors that open on the right wait for Save changes. The
//  header carries the page's latest save, and a failed one can be retried
//  from there or from the row.
//
//  EVERYONE GETS APPEARANCE. For anyone but an admin that's the whole page,
//  laid out as a small complete page rather than an admin page with one
//  card left on it.
//
//  On a phone the sidebar becomes an index page, and an area opens with a
//  back bar; panels take the whole screen.
///  +-----------------------------------------------------------------+

type Key = "assets" | "accessories" | "sites" | "loans" | "jobs" | "insight" | "appearance" | "dev";

const NAV: { group: string; dev?: boolean; items: { key: Key; label: string; icon: string }[] }[] = [
  { group: "Requesting", items: [{ key: "assets", label: "Assets", icon: "inventory_2" }, { key: "accessories", label: "Accessories", icon: "cable" }] },
  { group: "Fulfilment", items: [{ key: "sites", label: "Sites & stock keepers", icon: "location_on" }, { key: "loans", label: "Loans", icon: "event_repeat" }] },
  { group: "Automation", items: [{ key: "jobs", label: "Jobs & integrations", icon: "schedule" }] },
  { group: "Insight", items: [{ key: "insight", label: "Troubleshooting & feedback", icon: "insights" }] },
  { group: "You", items: [{ key: "appearance", label: "Appearance", icon: "palette" }] },
  { group: "Developer", dev: true, items: [{ key: "dev", label: "Dev tools", icon: "key" }] },
];

const TITLES: Record<Key, [string, string]> = {
  assets: ["Assets", "What people can request, and which models standard requests use."],
  accessories: ["Accessories", "Three layers decide who can request an accessory. Set them up in order."],
  sites: ["Sites & stock keepers", "Who hands out hardware at each site, and each site's colour."],
  loans: ["Loans", "Loanable devices, booking length and reminders."],
  jobs: ["Jobs & integrations", "Background jobs, their schedules and history, and the two outbound integrations."],
  insight: ["Troubleshooting & feedback", "How the troubleshooting library is used, and what staff say about Checkout."],
  appearance: ["Appearance", "How Checkout looks for you on this browser."],
  dev: ["Dev tools", "Switch off the guards that get in the way of testing, and sign in as someone else."],
};

const SECTIONS: Record<Key, () => ReactNode> = {
  assets: () => <Assets />,
  accessories: () => <Accessories />,
  sites: () => <Sites />,
  loans: () => <Loans />,
  jobs: () => <Jobs />,
  insight: () => <Insight />,
  appearance: () => <Appearance staff={false} />,
  dev: () => (
    <>
      <DevSwitches />
      <DevAuth />
    </>
  ),
};

const isKey = (s: string | undefined): s is Key => !!s && s in TITLES;

export default function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const { role, isLoading } = useAuth();
  const store = useSaveStore();
  const desk = useMediaQuery("(min-width: 55rem)");
  const wide = useMediaQuery("(min-width: 80rem)");
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const isDev = import.meta.env.VITE_APP_ENV === "development";
  const admin = role === "ADMIN";

  if (isLoading) return null;

  // Anyone but an admin: Appearance, and impersonation in a development build.
  if (!admin) {
    if (section) return <Navigate to="/settings" replace />;
    return (
      <SaveContext.Provider value={store}>
        <div className="mx-auto flex w-full max-w-[42.5rem] flex-col gap-4 px-3 pt-4 pb-30 [zoom:1.2] phone:px-8 phone:pt-6">
          <Header k="appearance" />
          <Appearance staff />
          {isDev && <DevAuth />}
        </div>
      </SaveContext.Provider>
    );
  }

  const key = isKey(section) && (section !== "dev" || isDev) ? section : null;
  if (section && !key) return <Navigate to="/settings" replace />;
  if (!key && desk) return <Navigate to="/settings/assets" replace />;

  const host: PanelHost = { slot, layout: !desk ? "phone" : wide ? "docked" : "float" };
  const narrow = key === "appearance" || key === "dev";

  const page = key && (
    <div className={cn("mx-auto flex w-full flex-col gap-4 px-3 pt-4 pb-30 [zoom:1.2] desk:px-8 desk:pt-6", narrow ? "max-w-[55rem]" : "max-w-[82.5rem]")}>
      <Header k={key} />
      {SECTIONS[key]()}
    </div>
  );

  return (
    <SaveContext.Provider value={store}>
      <PanelHostContext.Provider value={host}>
        {desk ? (
          <div className="grid h-full min-h-0 grid-cols-[17.75rem_minmax(0,1fr)]">
            <Sidebar current={key} isDev={isDev} />
            <div className="relative grid min-h-0 grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-h-0 min-w-0 overflow-auto">{page}</div>
              <div ref={setSlot} className="min-h-0" />
            </div>
          </div>
        ) : key ? (
          <>
            <div className="sticky top-0 z-3 flex h-13 items-center border-b border-line bg-sheet px-2">
              <Link to="/settings" className="flex h-11 items-center gap-1 rounded-10 pr-2.5 pl-1.5 fs-13 font-medium text-tx no-underline outline-none focus-visible:outline-2 focus-visible:outline-brand">
                <Icon name="arrow_back" size={19} />
                Settings
              </Link>
            </div>
            {page}
          </>
        ) : (
          <Index isDev={isDev} />
        )}
      </PanelHostContext.Provider>
    </SaveContext.Provider>
  );
}

/** Which areas need attention, for the sidebar's and the index's marks. */
function useIssues() {
  const pipeline = useAccessoryPipeline();
  const loans = useQuery(loanConfigQuery);
  const loansOff = loans.isSuccess && loans.data.devices.length === 0;
  return {
    accessories: pipeline.attention > 0 ? `${pipeline.attention} need attention` : null,
    loans: loansOff ? "Loans are off" : null,
  } as Partial<Record<Key, string | null>>;
}

function Sidebar({ current, isDev }: { current: Key | null; isDev: boolean }) {
  const issues = useIssues();
  return (
    <aside className="relative z-2 min-h-0 overflow-auto border-r border-line bg-subtle shadow-[2px_0_6px_var(--shade)] [clip-path:inset(0_-1.5rem_0_0)]">
      <nav aria-label="Settings" className="flex flex-col gap-4.5 pt-5.5 pr-3 pb-30 pl-4 [zoom:1.2]">
        <div className="px-2 font-head fs-15 font-medium tracking-head">Settings</div>
        {NAV.filter((g) => !g.dev || isDev).map((g) => (
          <div key={g.group} className="flex flex-col gap-1">
            <TrayLabel className="flex items-center gap-1.5 px-2 pb-0.5 fs-10.5">
              {g.group}
              {g.dev && <span className="font-sans fs-11 font-normal tracking-normal normal-case">· dev builds</span>}
            </TrayLabel>
            {g.items.map((it) => {
              const on = it.key === current;
              const issue = issues[it.key];
              return (
                <Link
                  key={it.key}
                  to={`/settings/${it.key}`}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex min-h-8 items-center gap-2.25 rounded-8 px-2 py-1.5 fs-13.5 leading-[1.3] no-underline outline-none focus-visible:outline-2 focus-visible:outline-brand",
                    on ? "bg-sheet font-medium text-tx shadow-[0_0_0_1px_var(--line)]" : "text-tx3 hover:bg-hover hover:text-tx"
                  )}
                >
                  <Icon name={it.icon} size={18} weight={300} fill={on} className={on ? "text-brand" : "text-mut"} />
                  <span className="flex-1">{it.label}</span>
                  {issue && <Icon name="error" size={16} weight={300} className="text-stop" aria-label={issue} />}
                </Link>
              );
            })}
          </div>
        ))}
        <div className="rounded-12 bg-tray p-0.75">
          <TrayLabel className="px-2.25 pt-1.5 pb-1.25 fs-10.5">How saving works</TrayLabel>
          <div className="flex flex-col gap-2 rounded-9 border border-line bg-sheet px-2.75 py-2.5 fs-12 leading-[1.45] text-tx3">
            <span className="flex gap-1.75">
              <Icon name="bolt" size={15} className="text-ok" />
              Single settings save the moment you change them.
            </span>
            <span className="flex gap-1.75">
              <Icon name="right_panel_open" size={15} className="text-prog" />
              Editors that open on the right wait for Save changes.
            </span>
          </div>
        </div>
      </nav>
    </aside>
  );
}

function Index({ isDev }: { isDev: boolean }) {
  const navigate = useNavigate();
  const issues = useIssues();
  const { resolvedTheme } = useTheme();
  const assetReq = useQuery(requestableAssetIdsQuery);
  const loans = useQuery(loanConfigQuery);
  const sums: Record<Key, string> = {
    assets: `${assetReq.data?.length ?? 0} categories requestable`,
    accessories: issues.accessories ?? "All visible",
    sites: "Keepers and colours",
    loans: loans.data ? (loans.data.devices.length ? `${loans.data.devices.length} devices` : "Loans off") : "",
    jobs: "Schedules, history, SharePoint",
    insight: "Analytics and feedback",
    appearance: resolvedTheme === "dark" ? "Dark" : "Light",
    dev: "Impersonation",
  };
  return (
    <div className="flex flex-col gap-3.5 px-3 pt-4.5 pb-30 [zoom:1.2]">
      <div className="px-1">
        <div className="font-head fs-17.5 font-medium tracking-head">Settings</div>
        <div className="mt-0.75 fs-11.5 text-mut">Single settings save as you change them.</div>
      </div>
      {NAV.filter((g) => !g.dev || isDev).map((g) => (
        <section key={g.group} className="rounded-14 bg-tray p-0.75">
          <TrayLabel className="px-2.5 pt-1.75 pb-1.5">{g.group}</TrayLabel>
          <div className="overflow-hidden rounded-11 border border-line bg-sheet">
            {g.items.map((it, i) => (
              <button
                key={it.key}
                type="button"
                onClick={() => navigate(`/settings/${it.key}`)}
                className={cn(
                  "flex min-h-15 w-full cursor-pointer items-center gap-3 border-0 bg-transparent py-2 pr-3 pl-3.5 text-left font-sans text-tx outline-none focus-visible:bg-subtle",
                  i > 0 && "border-t border-line2"
                )}
              >
                <Icon name={it.icon} size={17.5} weight={300} className="text-tx3" />
                <span className="min-w-0 flex-1">
                  <span className="block fs-13 font-medium">{it.label}</span>
                  <span className="mt-0.5 block fs-11 text-mut">{sums[it.key]}</span>
                </span>
                {issues[it.key] && <Icon name="error" size={15.5} className="text-stop" />}
                <Icon name="chevron_right" size={17.5} className="text-mut" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Header({ k }: { k: Key }) {
  const { status, retry } = useSave();
  const [title, sub] = TITLES[k];
  const tracked = k !== "insight" && k !== "dev";
  const s =
    k === "appearance"
      ? { icon: "cloud_done", text: "Saved to this browser", tone: "text-mut" }
      : status?.state === "saving"
        ? { icon: "hourglass_top", text: "Saving…", tone: "text-mut" }
        : status?.state === "failed"
          ? { icon: "error", text: "A change didn’t save", tone: "text-stop" }
          : status?.state === "saved"
            ? { icon: "cloud_done", text: `All changes saved · ${status.at}`, tone: "text-tx3" }
            : { icon: "cloud_done", text: "All changes saved", tone: "text-mut" };
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className="m-0 font-head fs-18.5 font-medium tracking-head">{title}</h1>
        <div className="mt-0.75 fs-11.5 text-pretty text-mut">{sub}</div>
      </div>
      {tracked && (
        <span role="status" className={cn("inline-flex items-center gap-1.5 pb-0.5 fs-11 whitespace-nowrap", s.tone)}>
          <Icon name={s.icon} size={14} weight={300} />
          {s.text}
          {status?.state === "failed" && k !== "appearance" && (
            <button
              type="button"
              onClick={retry}
              className="h-6.5 cursor-pointer rounded-7 border border-stop-line bg-sheet px-2.25 font-sans fs-10.5 font-medium text-stop"
            >
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
}
