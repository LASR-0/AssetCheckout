import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import CountBadge from "@/components/ui/countbadge";
import { BrandMark } from "@/components/ui/brand-mark";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTour } from "@/components/tour/TourProvider";
import { useAuth } from "@/hooks/useAuth";
import { useActionCounts } from "@/hooks/useActionCounts";
import { isStockKeeper } from "@/lib/permissions";
import { withThemeReveal } from "@/lib/theme-transition";
import { feedbackEnabledQuery } from "@/api/queries";
import { prefetchFromLink } from "@/api/prefetch";

///  +-----------------------------------------------------------------+
///  |                         THE TOP BAR                             |
///  +-----------------------------------------------------------------+
//
//  Two bars, swapped at the bar breakpoint (1080 design px): the full bar
//  needs that much even without its icons.
//
//  DESKTOP (72 design px). The brand, then the requester's four pages, then
//  a tray holding the operator pair (Requests and Stock) with their count
//  badges, then the utilities: the tour, light/dark, Settings. Below the nav
//  breakpoint the items drop their icons and the tour its label, so the bar
//  still fits on one line.
//
//  PHONE AND TABLET (52). The brand and a menu button. The menu lists everything the
//  desktop bar does; a dot on the button says something is waiting.
//
//  STOCK IS LOCKED, NOT HIDDEN, for anyone who neither keeps stock nor is an
//  admin: a disabled item that says who it is for, so a keeper's colleague
//  learns the page exists. An admin can act at any site, so it opens for
//  them even unassigned (the page then asks which site).
//
//  THE TOUR BUTTON renders only where the page has a tour. A disabled one
//  would invite a press, do nothing and explain nothing.
///  +-----------------------------------------------------------------+

const LOGO_LIGHT: string | undefined = import.meta.env.VITE_LOGO_PATH_LIGHT;
const LOGO_DARK: string | undefined = import.meta.env.VITE_LOGO_PATH_DARK;
const COMPANY: string | undefined = import.meta.env.VITE_COMPANY_NAME;

const PAGES = [
  { to: "/assets", label: "Assets", icon: "laptop_windows", tour: "nav-assets" },
  { to: "/accessories", label: "Accessories", icon: "headphones", tour: "nav-accessories" },
  { to: "/loan", label: "Loan", icon: "event_available", tour: "nav-loan" },
  { to: "/troubleshooting", label: "Troubleshooting", icon: "build", tour: undefined },
] as const;

const STOCK_LOCKED = "Only stock keepers use Stock";

/** Everything both bars need to know. */
function useNav() {
  const { role, stockKeeperLocations, isLoading } = useAuth();
  const counts = useActionCounts();
  const { tourId, isRunning, run } = useTour();
  const { resolvedTheme, setTheme } = useTheme();

  const keeper = isStockKeeper(stockKeeperLocations);
  // While identity loads, Stock looks ordinary rather than flashing a lock
  // that a keeper would then see vanish.
  const stock: "open" | "locked" | "pending" = isLoading
    ? "pending"
    : keeper || role === "ADMIN"
      ? "open"
      : "locked";

  const dark = resolvedTheme === "dark";
  const toggleTheme = (origin?: HTMLElement) => {
    const next = dark ? "light" : "dark";
    withThemeReveal(next, () => setTheme(next), origin);
  };

  return {
    counts,
    stock,
    // The stock badge is the keeper's own handover queue.
    stockCount: keeper ? counts.stock : 0,
    tour: tourId ? { running: isRunning, run } : null,
    // next-themes reads the stored theme synchronously in the browser;
    // undefined only until it has, and then the icon would be a guess.
    themeKnown: resolvedTheme !== undefined,
    dark,
    toggleTheme,
  };
}

function Brand({ compact }: { compact?: boolean }) {
  const { resolvedTheme } = useTheme();
  const logo = resolvedTheme === "dark" && LOGO_DARK ? LOGO_DARK : LOGO_LIGHT;

  if (logo) {
    return (
      <Link to="/" className="flex items-center gap-2.5 rounded-8 outline-offset-4">
        <img src={logo} alt={COMPANY ?? ""} className={compact ? "h-5 w-auto" : "h-6.5 w-auto"} />
        <span
          className={cn(
            "whitespace-nowrap",
            compact ? "font-head fs-14 font-medium tracking-head" : "fs-15 font-semibold"
          )}
        >
          Checkout Central
        </span>
      </Link>
    );
  }

  if (compact) {
    return (
      <Link to="/" className="flex items-center gap-2.5 rounded-8 outline-offset-4">
        <BrandMark className="size-6 fs-12" />
        <span className="font-head fs-14 font-medium tracking-head whitespace-nowrap">Checkout Central</span>
      </Link>
    );
  }

  return (
    <Link to="/" className="flex items-center gap-2.5 rounded-8 outline-offset-4">
      <BrandMark className="size-7.5 rounded-8 fs-14" />
      <span className="flex flex-col leading-[1.15] whitespace-nowrap">
        {COMPANY && <span className="fs-12 text-mut">{COMPANY}</span>}
        <span className="fs-15 font-semibold">Checkout Central</span>
      </span>
    </Link>
  );
}

// ---- desktop ------------------------------------------------------------

const PAGE_ITEM =
  "flex items-center gap-1.75 rounded-9 px-3 py-2 transition-colors hover:bg-hover hover:text-tx";
const PAGE_ITEM_ON = "bg-track font-medium text-tx shadow-[0_0_0_1px_var(--line)] hover:bg-track";

const OPS_ITEM = "flex items-center gap-2 rounded-8 px-3 py-1.5 transition-colors hover:text-tx";
const OPS_ITEM_ON = "bg-sheet font-medium text-tx shadow-[0_0_0_1px_var(--line)]";

const UTILITY =
  "grid size-9.5 place-items-center rounded-9 transition-colors hover:bg-hover hover:text-tx";

/** The nav's icons step aside below the nav breakpoint. */
function NavIcon({ name }: { name: string }) {
  return <Icon name={name} size={18.5} weight={300} className="hidden nav:inline-block" />;
}

function DesktopBar({ nav }: { nav: ReturnType<typeof useNav> }) {
  return (
    <div className="hidden h-18 min-w-0 items-center gap-4 border-b border-line bg-sheet pr-5 pl-6 bar:flex nav:gap-8">
      <Brand />

      <nav aria-label="Main" className="flex min-w-0 items-center gap-1.5 fs-14.5 whitespace-nowrap text-tx3">
        {PAGES.map((p) => (
          <NavLink
            key={p.to}
            to={p.to}
            data-tour={p.tour}
            className={({ isActive }) => cn(PAGE_ITEM, isActive && PAGE_ITEM_ON)}
          >
            <NavIcon name={p.icon} />
            {p.label}
          </NavLink>
        ))}

        <span aria-hidden className="mx-2 h-5.5 w-px bg-line" />

        <div className="flex gap-1 rounded-11 bg-track p-1">
          <NavLink
            to="/requests"
            data-tour="nav-requests"
            className={({ isActive }) => cn(OPS_ITEM, isActive && OPS_ITEM_ON)}
          >
            <NavIcon name="assignment" />
            Requests
            <CountBadge count={nav.counts.requests} label="requests need you" />
          </NavLink>
          <StockItem nav={nav} />
        </div>
      </nav>

      <div className="ml-auto flex items-center gap-1.5 text-tx3">
        {nav.tour && (
          <button
            type="button"
            onClick={nav.tour.run}
            disabled={nav.tour.running}
            aria-label="Show me around this page"
            data-tour="nav-tour"
            className="flex items-center gap-1.75 rounded-9 px-3 py-2 fs-14 whitespace-nowrap transition-colors hover:bg-hover hover:text-tx disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Icon name="tour" size={19.5} weight={300} />
            <span className="hidden nav:inline">Show me around</span>
          </button>
        )}
        <button
          type="button"
          onClick={(e) => nav.toggleTheme(e.currentTarget)}
          aria-label={nav.dark ? "Switch to light mode" : "Switch to dark mode"}
          title="Light or dark"
          data-tour="nav-theme"
          className={UTILITY}
        >
          {nav.themeKnown && <Icon name={nav.dark ? "light_mode" : "dark_mode"} size={20.5} weight={300} />}
        </button>
        <NavLink
          to="/settings"
          aria-label="Settings"
          data-tour="nav-settings"
          className={({ isActive }) => cn(UTILITY, isActive && "bg-track text-tx shadow-[0_0_0_1px_var(--line)]")}
        >
          <Icon name="settings" size={20.5} weight={300} />
        </NavLink>
      </div>
    </div>
  );
}

function StockItem({ nav }: { nav: ReturnType<typeof useNav> }) {
  if (nav.stock === "locked") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="link"
            aria-disabled="true"
            tabIndex={0}
            className={cn(OPS_ITEM, "cursor-not-allowed text-dis hover:text-dis")}
          >
            <Icon name="lock" size={18.5} weight={300} />
            Stock
          </span>
        </TooltipTrigger>
        <TooltipContent>{STOCK_LOCKED}</TooltipContent>
      </Tooltip>
    );
  }
  if (nav.stock === "pending") {
    return (
      <span className={OPS_ITEM}>
        <NavIcon name="inventory_2" />
        Stock
      </span>
    );
  }
  return (
    <NavLink
      to="/stock"
      title="Waiting to hand over"
      className={({ isActive }) => cn(OPS_ITEM, isActive && OPS_ITEM_ON)}
    >
      <NavIcon name="inventory_2" />
      Stock
      <CountBadge count={nav.stockCount} tone="ink" label="waiting to hand over" />
    </NavLink>
  );
}

// ---- phone ----------------------------------------------------------------

const MENU_ROW = "flex h-11 items-center gap-2 rounded-10 px-3 outline-none focus-visible:bg-hover";
const MENU_ROW_ON = "bg-brand-sub font-medium text-brand-tx";
const MENU_UTILITY = "flex h-11 w-full items-center gap-2.5 rounded-10 px-3 text-left text-tx3 outline-none focus-visible:bg-hover";
const MENU_BADGE = "h-5 min-w-5 rounded-10 px-1.5 fs-11.5";

function MenuDivider() {
  return <span aria-hidden className="mx-3 my-1 h-px bg-line2" />;
}

function PhoneBar({ nav }: { nav: ReturnType<typeof useNav> }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { data: feedback = false } = useQuery(feedbackEnabledQuery);

  // Any navigation, however it happened, closes the menu.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const waiting = nav.counts.requests > 0 || nav.stockCount > 0;
  const row = ({ isActive }: { isActive: boolean }) => cn(MENU_ROW, isActive && MENU_ROW_ON);
  const close = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="relative flex h-13 flex-none items-center gap-2.5 border-b border-line bg-sheet pr-1 pl-4 bar:hidden">
          <Brand compact />
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={open ? "Close menu" : "Open menu"}
              data-tour="nav-menu"
              className="relative ml-auto grid size-11 place-items-center rounded-10 text-tx2 active:bg-hover"
            >
              <Icon name={open ? "close" : "menu"} size={22} />
              {waiting && (
                <span
                  aria-hidden
                  className="absolute top-2.25 right-2 size-2 rounded-full bg-brand shadow-[0_0_0_2px_var(--sheet)]"
                />
              )}
            </button>
          </PopoverTrigger>
        </div>
      </PopoverAnchor>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={0}
        aria-label="Menu"
        className="w-(--radix-popover-trigger-width) gap-0.5 rounded-none border-0 border-b p-2 fs-15 shadow-[0_0.75rem_1.5rem_var(--shade)] data-[state=closed]:animate-menu-up data-[state=open]:animate-menu-down motion-reduce:animate-none!"
      >
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {PAGES.map((p) => (
            <NavLink key={p.to} to={p.to} onClick={close} className={row}>
              {p.label}
            </NavLink>
          ))}
          <MenuDivider />
          <NavLink to="/requests" onClick={close} className={row}>
            Requests
            <CountBadge count={nav.counts.requests} label="requests need you" className={MENU_BADGE} />
          </NavLink>
          {nav.stock === "locked" ? (
            <span aria-disabled="true" className={cn(MENU_ROW, "text-dis")}>
              Stock
              <span className="ml-auto flex items-center gap-1 fs-12.5">
                <Icon name="lock" size={16} />
                Stock keepers only
              </span>
            </span>
          ) : (
            <NavLink to="/stock" onClick={close} className={row}>
              Stock
              <CountBadge count={nav.stockCount} tone="ink" label="waiting to hand over" className={MENU_BADGE} />
            </NavLink>
          )}
          {feedback && (
            <NavLink to="/feedback" onClick={close} className={row}>
              Feedback
            </NavLink>
          )}
        </nav>
        <MenuDivider />
        {nav.tour && (
          <MenuButton
            icon="tour"
            disabled={nav.tour.running}
            onClick={() => {
              close();
              nav.tour?.run();
            }}
          >
            Show me around
          </MenuButton>
        )}
        <MenuButton icon={nav.dark ? "light_mode" : "dark_mode"} onClick={(el) => nav.toggleTheme(el)}>
          {nav.dark ? "Light mode" : "Dark mode"}
        </MenuButton>
        <NavLink to="/settings" onClick={close} className={({ isActive }) => cn(MENU_UTILITY, isActive && MENU_ROW_ON)}>
          <Icon name="settings" size={20} />
          Settings
        </NavLink>
      </PopoverContent>
    </Popover>
  );
}

function MenuButton({
  icon,
  onClick,
  disabled,
  children,
}: {
  icon: string;
  onClick: (el: HTMLElement) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => onClick(e.currentTarget)}
      className={cn(MENU_UTILITY, "disabled:opacity-50")}
    >
      <Icon name={icon} size={20} />
      {children}
    </button>
  );
}

export default function TopBar() {
  const nav = useNav();
  return (
    <header
      data-tour-region="navbar"
      className="relative z-30 flex-none"
      onMouseOver={prefetchFromLink}
      onFocus={prefetchFromLink}
    >
      <DesktopBar nav={nav} />
      <PhoneBar nav={nav} />
    </header>
  );
}
