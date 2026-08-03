import { Link } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { getRequests } from "@/api/requests";
import { getAssetCategories } from "@/api/categories";
import { iconForCategory } from "@/lib/categoryIcon";
import { useAuth } from "@/hooks/useAuth";
import { StatusBadge, Badge, deriveFulfilment } from "@/components/ui/statusbadge";
import type { AssetCategory } from "@/types/categoriesType";
import { getAccessoryCategoriesForMe } from "@/api/accessories";
import type { AccessoryCategory } from "@/types/accessoriesType";
import type { Request } from "@/types/requestType"
import { getMyHoldings } from "@/api/holdings";
import MyHoldingsDialog, { type Row as HoldingRow } from "@/components/dialogs/MyHoldingsDialog";
import type {
  UserHoldings,
  AssetHolding,
  AccessoryHolding,
} from "@/types/holdingsType";
import {
  groupByCategoryId,
  summariseAssetHoldings,
  summariseAccessoryHoldings,
} from "@/lib/holdings";

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
  "bg-surface-container-lowest border border-landing-border rounded-xl overflow-hidden";
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
    // Stacks on mobile so the title gets the full width instead of competing
    // with the actions link for a narrow row; side by side from sm up.
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 px-5 py-3 bg-surface-container-low/30 border-b border-outline/50">
      <div className="flex flex-col min-w-0 w-full sm:w-auto">
        <h2 className="font-headline font-bold text-base text-on-background">
          {title}
        </h2>
        {subtitle && (
          <p className="text-info-light text-[13px] leading-snug">{subtitle}</p>
        )}
      </div>
      {actions && <div className="shrink-0 sm:ml-auto">{actions}</div>}
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

///  +-----------------------------------------------------------------+
///  |                  DATA: WHAT THE USER HOLDS                      |
///  +-----------------------------------------------------------------+
//
//  Fetched once here and passed to both tile sections, since one endpoint
//  returns both halves and rendering them twice would double the round trips.
//
//  DELIBERATELY QUIET. A failure logs and leaves the maps empty, so the tiles
//  render exactly as they did before this feature existed. No error state on
//  the home page — matching AccessoryQuickStart, which already renders nothing
//  when it can't resolve anything.
//
//  Accessory results WILL be sparse in practice: Snipe's accessory data is
//  incomplete because accessories get handed out and never logged. That is the
//  problem this phase addresses, not a fault here.

function useMyHoldings() {
  const { name, isLoading: authLoading } = useAuth();
  const [holdings, setHoldings] = useState<UserHoldings>({
    assets: [],
    accessories: [],
  });
  // "Did the fetch actually succeed?" — NOT the same question as "is the list
  // empty?". The tiles above can treat both the same way (they just render as
  // they did before holdings existed), but the "what you already have" section
  // cannot: telling someone they hold nothing when the request failed is a
  // confident lie, and the whole point of that section is to be trusted.
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    if (authLoading || !name) return;

    let cancelled = false;
    (async () => {
      try {
        const data = await getMyHoldings();
        if (cancelled) return;
        setHoldings({
          assets: data.assets ?? [],
          accessories: data.accessories ?? [],
        });
        setResolved(true);
      } catch (err) {
        console.error("Failed to load holdings for home page", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [name, authLoading]);

  const assetsByCategory = useMemo(
    () => groupByCategoryId(holdings.assets),
    [holdings.assets]
  );
  const accessoriesByCategory = useMemo(
    () => groupByCategoryId(holdings.accessories),
    [holdings.accessories]
  );

  return { holdings, resolved, assetsByCategory, accessoriesByCategory };
}

export default function LandingPage() {
  const { requests, loading } = useMyRequests();
  const { holdings, resolved, assetsByCategory, accessoriesByCategory } =
    useMyHoldings();

  return (
    <div className="bg-landing-bg text-on-background flex-grow">
      <main className="w-full max-w-[1160px] mx-auto px-6 md:px-8 pb-16">
        <HomeHead requests={requests} loading={loading} />
        <QuickStart holdingsByCategory={assetsByCategory} />
        <AccessoryQuickStart holdingsByCategory={accessoriesByCategory} />
        <MyStuff holdings={holdings} resolved={resolved} />
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

/**
 * Destination for a status-snapshot tile: the requests table filtered to the
 * same status the tile counted, with the person's name seeded into the search
 * so they land on their own rows rather than the whole org.
 *
 * Returns undefined for an empty count, which leaves the tile unlinked.
 *
 * IN_PROGRESS is resolved client-side by the table (it means PENDING +
 * APPROVED, which the backend's single-status param can't express); the rest
 * are real statuses and filter server-side. Note the name is seeded into the
 * free-text filter, which matches any field — so it also catches rows where
 * this person is the MANAGER rather than the requester, and the table can show
 * more rows than the tile counted.
 */
function requestsLink(
  status: "IN_PROGRESS" | "COMPLETED" | "REJECTED",
  count: number,
  name: string | null
): string | undefined {
  if (count <= 0) return undefined;
  const scope = name ? `&q=${encodeURIComponent(name)}` : "";
  return `/requests?status=${status}${scope}`;
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
        {/* Each tile links to the requests table pre-filtered to the rows it
            counted: its status, scoped to this person by name. Only linked
            when the count is above zero — a zero leading to an empty table is
            worse than not being clickable. */}
        <Stat
          num={inProgress}
          label="In progress"
          loading={loading}
          pending={inProgress > 0}
          to={requestsLink("IN_PROGRESS", inProgress, name)}
        />
        <Stat
          num={completed}
          label="Completed"
          loading={loading}
          complete={completed > 0}
          to={requestsLink("COMPLETED", completed, name)}
        />
        <Stat
          num={rejected}
          label="Rejected"
          loading={loading}
          attention={rejected > 0}
          to={requestsLink("REJECTED", rejected, name)}
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
  to,
}: {
  num: number;
  label: string;
  loading: boolean;
  attention?: boolean;
  complete?: boolean;
  pending?: boolean;
  /** When set, the tile becomes a link to this route. */
  to?: string;
}) {
  const className = `${CARD} flex flex-col items-center justify-center gap-1 px-3 md:px-5 py-4 min-w-0 md:min-w-[110px]
        ${attention ? "!border-status-error/50" : ""}
        ${complete ? "!border-status-success/50" : ""}
        ${pending ? "!border-status-model/50" : ""}`;

  // Linked tiles get the same hover lift as the request tiles below, so the
  // affordance reads the same way across the page. Only rendered as a link
  // when there's somewhere to go — a tile showing 0 leads to an empty table,
  // which is worse than not being clickable.
  if (to) {
    return (
      <Link
        to={to}
        className={`${className} hover:border-purple-500 hover:-translate-y-px transition-all`}
      >
        <StatBody
          num={num}
          label={label}
          loading={loading}
          attention={attention}
          complete={complete}
          pending={pending}
        />
      </Link>
    );
  }

  return (
    <div className={className}>
      <StatBody
        num={num}
        label={label}
        loading={loading}
        attention={attention}
        complete={complete}
        pending={pending}
      />
    </div>
  );
}

/** The number + label, shared by the linked and plain variants of Stat so the
 *  two can never drift apart visually. */
function StatBody({
  num,
  label,
  loading,
  attention,
  complete,
  pending,
}: {
  num: number;
  label: string;
  loading: boolean;
  attention: boolean;
  complete: boolean;
  pending: boolean;
}) {
  return (
    <>
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
    </>
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

///  +-----------------------------------------------------------------+
///  |                  HOLDINGS ON A QUICK START TILE                 |
///  +-----------------------------------------------------------------+
//
//  THE CORNER COUNT IS GONE. A number in a pill at a tile's top-right is, by
//  every convention people have met elsewhere, an unread badge — so "2" on the
//  Laptop tile read as two pending actions rather than two laptops held, and
//  the real meaning lived only in a tooltip nobody hovers over something they
//  think they already understand.
//
//  The NAME badge stays. It says what it means in words, and beside "Request →"
//  that is useful context: you already have one of these. What misled was a
//  bare number standing alone, not the idea of showing holdings here. The
//  full picture now lives in "What you already have" further down the page.

/**
 * The held model name(s) as a badge. No icon — the tile's own icon already
 * says what kind of thing this is, and a second glyph here competes with it.
 *
 * Also used for the serial on the "what you already have" tiles, so the two
 * treatments can't drift apart.
 *
 * min-w-0 + truncate because it shares its row with "Request →" and model
 * names run long ("ThinkPad T16 Gen 1"); the full text stays on hover.
 */
function HoldingsBadge({
  summary,
  title,
}: {
  summary: string | null;
  /** Hover text. Defaults to the holdings phrasing the request tiles use. */
  title?: string;
}) {
  if (!summary) return null;
  return (
    <span
      // max-w-full is what makes truncate actually work. min-w-0 alone only
      // helps when a flex row squeezes the badge; stacked on mobile the badge
      // is shrink-to-fit, so without a cap it grew past the tile instead of
      // ellipsing.
      className="max-w-full min-w-0 truncate rounded-full border border-outline bg-surface-container-low/40 px-2 py-0.5 text-[10px] font-semibold text-info-light"
      title={title ?? `You already hold: ${summary}`}
    >
      {summary}
    </span>
  );
}

/**
 * The shared tile body: icon and category name centred, the "Request →"
 * affordance beneath, and — when the user holds something here — a tinted band
 * across the foot of the tile. Used by both tile sets so the two can't drift.
 *
 * WHY A BAND. The thing being fixed is that holdings didn't read as holdings.
 * A count in the corner read as an unread badge; a grey pill beside "Request →"
 * read as metadata. A band is a different surface from the rest of the tile,
 * so a held tile is distinguishable while scanning the grid rather than only
 * once you're reading one — and it says "You have" in words, so there is no
 * icon or number left to interpret.
 *
 * It sits BELOW the action and behind a hairline on purpose: what you already
 * have and what you're about to request are two different statements, and the
 * old layout put them on one line where they read as one.
 *
 * Full-bleed via negative margins that cancel the tile's own padding, so the
 * band meets the tile edges. That needs overflow-hidden on the tile, or its
 * square corners overhang the rounded ones.
 *
 * flex-1 on the identity block is load-bearing, where it used to be inert.
 * Grid rows stretch every tile to the tallest in the row, and flex-1 is what
 * absorbs that extra space so the band stays pinned to the foot.
 *
 * It also means the band's slot has to exist on EVERY tile, held or not — see
 * the note on the band below. Without that, flex-1 hands the band's height to
 * the identity block on unheld tiles and their icons sit lower than their
 * neighbours'.
 */
function TileBody({
  icon,
  name,
  nameClass,
  iconClass,
  heldCount,
  heldTitle,
}: {
  icon: string;
  name: string;
  nameClass: string;
  iconClass: string;
  /** How many the user holds in this category. 0 renders no band at all, so
   *  a category you own nothing in looks exactly as it did before. */
  heldCount: number;
  /**
   * Hover text for the band: what they actually hold, by name
   * ("ThinkPad T16 Gen 1 +1"). The band states a count because a count can't
   * truncate; the names are what someone hovering actually wants, and they're
   * too long to sit on the tile itself.
   */
  heldTitle: string | null;
}) {
  return (
    <>
      {/* Request → leads rather than trails. It's the tile's purpose, and at
          the foot it competed with the holdings band directly beneath it for
          the same corner of the eye. */}
      <div className="flex w-full items-center">
        <span className="ml-auto shrink-0 text-sm font-semibold text-info-light group-hover:text-on-background transition-colors">
          Request →
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center my-6 justify-center gap-2 text-center">
        <span className={`material-symbols-outlined ${iconClass}`}>{icon}</span>
        {/* On the name rather than a larger parent gap, so the extra breathing
            room lands below the category text only and not also between the
            icon and the name. */}
        <span className={`${nameClass} `}>{name}</span>
      </div>

      {/* ALWAYS RENDERED, hidden when there's nothing to say.
          Not `heldCount > 0 &&` — that made the icons sit at different heights
          across a row. The identity block above is flex-1, so on a tile with no
          band it grows by exactly the band's height, and justify-center then
          centres the icon in that taller box, dropping it lower than its
          neighbour's. Reserving the space keeps every identity block the same
          height, so the icons line up whatever anyone happens to hold.
          `invisible` rather than a hand-built spacer: the placeholder is the
          real band, so its height can't drift from the thing it stands in for.
          visibility:hidden also takes it out of the accessibility tree, so
          nothing announces "You have 0". */}
      <div
        className={`-mx-5 -mb-2 mt-1 border-t px-5 py-2 ${
          heldCount > 0
            ? "border-outline/50 bg-status-success/10"
            : "invisible border-transparent"
        }`}
        // The models by name. Falls back to nothing rather than a generic
        // phrase — an empty title shows no tooltip, which beats one that
        // repeats the band.
        title={heldCount > 0 ? heldTitle ?? undefined : undefined}
      >
        <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-status-success">
          <span className="material-symbols-outlined !text-[14px]">
            check_circle
          </span>
          You have {heldCount}
        </span>
      </div>
    </>
  );
}

function QuickStart({
  holdingsByCategory,
}: {
  /** What the user already holds, keyed by Snipe asset category id. Empty
   *  when holdings couldn't be resolved — the tiles then look as they always
   *  did. */
  holdingsByCategory: Map<number, AssetHolding[]>;
}) {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);

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
        actions={
          <button
            type="button"
            onClick={() => setHoldingsOpen(true)}
            className="text-xs sm:text-sm font-semibold text-info-light hover:text-on-background transition-colors hover:cursor-pointer whitespace-nowrap"
          >
            See all my devices →
          </button>
        }
      />

      <MyHoldingsDialog
        open={holdingsOpen}
        onOpenChange={setHoldingsOpen}
        subject="ASSET"
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
            {categories.map((cat) => {
              const held = holdingsByCategory.get(cat.id) ?? [];
              return (
                // FIXED: deep-link with the category id — the form validates it
                // against its own fetched list before preselecting.
                <Link
                  key={cat.id}
                  to={`/assets?categoryId=${cat.id}`}
                  // overflow-hidden clips the full-bleed holdings band to the
                  // rounded corners. Tiles stay level with each other — grid
                  // rows stretch to the tallest — so the band reads as a
                  // difference in surface, not a difference in height.
                  className={`${RAISED} group flex flex-col gap-2 overflow-hidden px-5 pt-5 pb-2 hover:border-purple-500 hover:-translate-y-px transition-all`}
                >
                  <TileBody
                    icon={iconForCategory(cat.name)}
                    name={cat.name}
                    iconClass="!text-[26px]"
                    nameClass="font-bold text-[13px]"
                    // One row per physical asset, so this is a true count.
                    heldCount={held.length}
                    heldTitle={summariseAssetHoldings(held)}
                  />
                </Link>
              );
            })}
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

// The "For" column is dropped below sm — on a phone it's the least useful of
// the four (this list is already the signed-in user's own requests, so it
// reads "Yourself" nearly every time) and its absence buys real width for the
// asset name. The cell itself is hidden to match, so the columns stay aligned.
const RECENT_GRID =
  "grid grid-cols-[1.6fr_0.8fr_1fr] sm:grid-cols-[1.6fr_0.8fr_0.8fr_1fr] gap-2";

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
        <div className="rounded-lg border border-outline bg-landing-card/70 overflow-hidden">
          <div
            className={`${RECENT_GRID} px-3 py-2 bg-surface-container-low/20 font-mono text-[11px] uppercase tracking-wider text-info-light`}
          >
            <span>Asset</span>
            <span>Requested</span>
            <span className="hidden sm:block">For</span>
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
                <span className="hidden sm:block text-on-surface-variant">
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

function AccessoryQuickStart({
  holdingsByCategory,
}: {
  /** Accessory holdings keyed by Snipe accessory category id. */
  holdingsByCategory: Map<number, AccessoryHolding[]>;
}) {
  const [categories, setCategories] = useState<AccessoryCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [holdingsOpen, setHoldingsOpen] = useState(false);

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
          // The shared Badge rather than a hand-rolled span: it already does
          // max-w-full + min-w-0 + truncate with the full text on hover, which
          // is exactly what this needed on a narrow screen.
          <span className="mt-1 flex min-w-0">
            <Badge
              icon="info"
              label="Based on the equipment assigned to you."
              bg="bg-status-pending/10"
              text="text-status-pending"
              size="compact"
            />
          </span>
        }
        actions={
          <button
            type="button"
            onClick={() => setHoldingsOpen(true)}
            className="text-xs sm:text-sm font-semibold text-info-light hover:text-on-background transition-colors hover:cursor-pointer whitespace-nowrap"
          >
            See all my accessories →
          </button>
        }
      />

      <MyHoldingsDialog
        open={holdingsOpen}
        onOpenChange={setHoldingsOpen}
        subject="ACCESSORY"
      />

      <div className="p-5 md:p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((cat) => {
            const held = holdingsByCategory.get(cat.id) ?? [];
            return (
              <Link
                key={cat.id}
                to={`${ACCESSORY_FORM_ROUTE}?categoryId=${cat.id}`}
                className={`${RAISED} group flex flex-col gap-2 overflow-hidden px-5 pt-5 pb-2 hover:border-purple-500 hover:-translate-y-px transition-all`}
              >
                <TileBody
                  icon={iconForCategory(cat.name)}
                  name={cat.name}
                  iconClass="!text-[28px]"
                  // Matches the asset tiles. The two sets sit one above the
                  // other on the same page, so a different type size read as
                  // an accident rather than a distinction.
                  nameClass="font-bold text-[13px]"
                  // Accessory records Snipe returns for this user here — NOT a
                  // quantity. summariseAccessoryHoldings keeps that distinction
                  // in the tooltip: "+N" for more records, never "xN".
                  heldCount={held.length}
                  heldTitle={summariseAccessoryHoldings(held)}
                />
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

///  +-----------------------------------------------------------------+
///  |                  WHAT YOU ALREADY HAVE                          |
///  +-----------------------------------------------------------------+
//
//  The count badge and name badge on the request tiles were doing two jobs at
//  once and failing the second. A number in a pill at the top-right corner of
//  a tile is, by every convention people have learned elsewhere, an unread
//  count — so "2" on the Laptop tile read as two pending actions rather than
//  two laptops held. The meaning was only ever in the tooltip, and nobody
//  hovers a thing they think they already understand.
//
//  This section states it outright instead. One tile per actual item, naming
//  the thing rather than its category, so there is no number left to
//  misinterpret. The badges above stay: as a hint alongside "Request →" they
//  are useful ("you already have one of these"), and it's the ambiguity of a
//  bare count standing alone that was the problem.
//
//  Clicking a tile is the correction path — it opens the report dialog with
//  that item already chosen. Someone who spots a wrong record is looking at
//  the wrong record when they spot it, so asking them to find it again in a
//  list is a step that exists only because the list came first.
//
//  Rendered only once holdings have actually resolved. An empty list and a
//  failed fetch look identical from here, and "nothing is assigned to you" is
//  too confident a claim to make on a request that never came back.

/** One held item, flattened across both kinds so the grid can mix them. */
type HeldItem = {
  key: string;
  subject: "ASSET" | "ACCESSORY";
  icon: string;
  title: string;
  manufacturer: string | null;
  serial: string | null;
  /** Shaped exactly as MyHoldingsDialog builds its own rows, so the copy
   *  downstream reads identically whether you arrived here or via the list. */
  row: HoldingRow;
};

function toHeldItems(holdings: UserHoldings): HeldItem[] {
  const assets: HeldItem[] = (holdings.assets ?? []).map((a: AssetHolding) => ({
    key: `asset-${a.id}`,
    subject: "ASSET",
    icon: iconForCategory(a.categoryName ?? a.model ?? ""),
    title: a.model?.trim() || "Unnamed model",
    manufacturer: a.manufacturer,
    serial: a.serial,
    row: {
      snipeRecordId: a.id,
      title: a.model?.trim() || "Unnamed model",
      categoryId: a.categoryId,
      categoryName: a.categoryName,
      detail: a.serial ? `Serial ${a.serial}` : null,
    },
  }));

  const accessories: HeldItem[] = (holdings.accessories ?? []).map(
    (c: AccessoryHolding) => ({
      key: `accessory-${c.id}`,
      subject: "ACCESSORY",
      icon: iconForCategory(c.categoryName ?? c.name),
      title: c.name?.trim() || "Unnamed accessory",
      manufacturer: c.manufacturer,
      // Accessories are stocked by quantity with no per-unit serial, so there
      // is nothing to show and the tile simply omits the line.
      serial: null,
      row: {
        snipeRecordId: c.id,
        title: c.name?.trim() || "Unnamed accessory",
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        detail: c.manufacturer,
      },
    })
  );

  return [...assets, ...accessories];
}

function MyStuff({
  holdings,
  resolved,
}: {
  holdings: UserHoldings;
  /** False until the holdings fetch has actually succeeded — see the note
   *  above on why an empty list isn't good enough. */
  resolved: boolean;
}) {
  // One dialog for the whole grid. `subject` follows whatever was clicked,
  // because the dialog is strictly one kind at a time.
  const [openFor, setOpenFor] = useState<HeldItem | null>(null);
  const [browse, setBrowse] = useState<"ASSET" | "ACCESSORY" | null>(null);

  const items = useMemo(() => toHeldItems(holdings), [holdings]);

  if (!resolved) return null;

  return (
    <section className={`${CARD} shadow-sm mb-8`}>
      <SectionHeader
        title="What you already have"
        subtitle="Assigned to you in our records. Something look wrong? Select it and tell us."
        actions={
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBrowse("ASSET")}
              className="text-xs sm:text-sm font-semibold text-info-light hover:text-on-background transition-colors hover:cursor-pointer whitespace-nowrap"
            >
              Assets →
            </button>
            <button
              type="button"
              onClick={() => setBrowse("ACCESSORY")}
              className="text-xs sm:text-sm font-semibold text-info-light hover:text-on-background transition-colors hover:cursor-pointer whitespace-nowrap"
            >
              Accessories →
            </button>
          </div>
        }
      />

      {/* Keyed on the item so a fresh dialog mounts per tile — otherwise the
          previous item's answers would still be sitting in its state. */}
      {openFor && (
        <MyHoldingsDialog
          key={openFor.key}
          open
          onOpenChange={(next) => !next && setOpenFor(null)}
          subject={openFor.subject}
          initialSelection={openFor.row}
        />
      )}

      {browse && (
        <MyHoldingsDialog
          key={`browse-${browse}`}
          open
          onOpenChange={(next) => !next && setBrowse(null)}
          subject={browse}
        />
      )}

      <div className="p-5 md:p-6">
        {items.length === 0 ? (
          // Not a dead end: holding nothing is itself often the wrong record,
          // and this is the one place that says so.
          <div className="py-6 text-sm text-info-light">
            <p>Nothing is assigned to you in our records.</p>
            <button
              type="button"
              onClick={() => setBrowse("ASSET")}
              className="mt-2 font-semibold text-on-background underline hover:cursor-pointer"
            >
              Have something that isn't listed? Tell us →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setOpenFor(item)}
                title={`Report a problem with ${item.title}`}
                className={`${RAISED} group flex flex-col gap-2 px-5 pt-5 pb-3 text-left hover:border-purple-500 hover:-translate-y-px transition-all hover:cursor-pointer`}
              >
                <div className="flex flex-1 flex-col items-center my-4 justify-center gap-2 text-center">
                  <span className="material-symbols-outlined !text-[26px]">
                    {item.icon}
                  </span>
                  {/* The model name is the identity here, so it gets the weight
                      the category name carries on the request tiles. */}
                  <span className="max-w-full truncate font-bold text-[13px]">
                    {item.title}
                  </span>
                  {item.manufacturer && (
                    <span className="max-w-full truncate text-[11px] text-info-light">
                      {item.manufacturer}
                    </span>
                  )}
                  {/* Same badge treatment as the model-name badges on the
                      request tiles above, so the two read as one system. */}
                  <HoldingsBadge
                    summary={item.serial}
                    title={`Serial ${item.serial}`}
                  />
                </div>

                <span className="ml-auto shrink-0 text-sm font-semibold text-info-light group-hover:text-on-background transition-colors">
                  Not right? →
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}