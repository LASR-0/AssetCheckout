import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export default function Navbar() {
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path;

  const logoLight = import.meta.env.VITE_LOGO_PATH_LIGHT;
  const logoDark = import.meta.env.VITE_LOGO_PATH_DARK;
  const companyName = import.meta.env.VITE_COMPANY_NAME;

  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeLogo = (() => {
    if (!logoLight) return null;
    if (resolvedTheme === "dark" && logoDark) return logoDark;
    return logoLight;
  })();

  const isDark = resolvedTheme === "dark";

  // Shared style for the square icon buttons (theme toggle + settings) —
  // rounded-md square, outline border, house shadow, 22px icon.
  const ICON_BUTTON =
    "w-10 h-10 grid place-items-center rounded-md border border-outline shadow-sm hover:cursor-pointer transition";

  return (
    <header className="fixed top-0 z-50 w-full">

      {/* PRIMARY BAR */}
      <div className="bg-footer-bg shadow-md flex justify-between items-center w-full px-8 h-16">

        {/* Left side */}
        <div className="flex items-center gap-8">
          <Link to="/">
          <div className="flex items-center gap-3">
            {/* Logo — hidden until mounted (to avoid flashing wrong theme),
                then either shown or omitted depending on env config. */}
            {mounted && activeLogo && (
              <img
                src={activeLogo}
                alt=""
                className="h-4 md:h-6 w-auto mb-1"
              />
            )}

            {/* Brand text — hidden on mobile (it lives in the burger panel
                there); the logo remains as the mobile home tap-target. */}
            <span
              className={`hidden md:inline mb-1 text-xl font-bold transition-colors ${
                isActive("/")
                  ? "text-nav-tab-selected"
                  : "text-nav-tab hover:text-nav-tab-selected"
              }`}
            >
              {companyName ? `${companyName} ` : ""}Checkout Central
            </span>
          </div>
          </Link>

          <nav className="hidden md:flex  gap-6">

            <Link
              to="/checkout"
              className={`body-md font-medium pb-1 transition-colors inline-flex items-center gap-2 ${
                isActive("/checkout")
                  ? "text-nav-tab-selected border-b-2 border-underline"
                  : "text-nav-tab hover:text-nav-tab-selected"
              }`}
            >
              <span
                className="material-symbols-outlined !text-xl"
              >
                list_alt
              </span>
              Checkouts
            </Link>

            <Link
              to="/requests"
              className={`body-md font-medium pb-1 transition-colors inline-flex items-center gap-2 ${
                isActive("/requests")
                  ? "text-nav-tab-selected border-b-2 border-underline"
                  : "text-nav-tab hover:text-nav-tab-selected"
              }`}
            >
              <span
                className="material-symbols-outlined !text-xl"
                style={{ fontVariationSettings: `'FILL' 1` }}
              >
                pending_actions
              </span>
              Requests
            </Link>

          </nav>
        </div>

        {/* Right side — burger (mobile only) + theme toggle + settings */}
        <div className="flex items-center gap-4">

          <button
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileNavOpen}
            className={`md:hidden hover:cursor-pointer transition ${
              mobileNavOpen
                ? "text-nav-tab-selected"
                : "text-nav-tab hover:text-nav-tab-selected"
            }`}
          >
            <span
              className={` ${ICON_BUTTON} material-symbols-outlined !text-3xl`}
              style={{ fontVariationSettings: `'FILL' 1` }}
            >
              menu
            </span>
          </button>

          {/* Theme toggle — icon shows the CURRENT theme (sun = light,
              moon = dark). Gated on mounted so the icon can't flash the
              wrong theme before resolvedTheme is known. */}
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
              className={`${ICON_BUTTON} text-nav-tab hover:text-nav-tab-selected`}
            >
              <span
                className="material-symbols-outlined !text-[22px]"
                style={{ fontVariationSettings: `'FILL' 1` }}
              >
                {isDark ? "dark_mode" : "light_mode"}
              </span>
            </button>
          )}

          {/* Settings link — square chip wrapping the icon, matching the
              theme toggle. */}
          <Link
            to="/settings"
            aria-label="Settings"
            className={`${ICON_BUTTON} ${
              isActive("/settings")
                ? "text-nav-tab-selected"
                : "text-nav-tab hover:text-nav-tab-selected"
            }`}
          >
            <span
              className="material-symbols-outlined !text-[22px]"
              style={{ fontVariationSettings: `'FILL' 1` }}
            >
              settings
            </span>
          </Link>

        </div>
      </div>

      {/* MOBILE PANEL — always mounted so it can animate; slides open/closed
          via max-height + opacity. Background is the nav colour mixed 10%
          toward black so it reads a step darker than the primary bar. */}
      <div
        className={`md:hidden overflow-hidden bg-[color-mix(in_srgb,var(--footer-bg),black_3%)] shadow-md transition-all duration-300 ease-in-out ${
          mobileNavOpen
            ? "max-h-56 opacity-100 border-t border-outline/20"
            : "max-h-0 opacity-0 border-t-0"
        }`}
      >
        <nav className="px-8 py-3 flex flex-col gap-3">

          {/* Title — now lives here on mobile */}
          <Link
            to="/"
            onClick={() => setMobileNavOpen(false)}
            className={`text-md font-bold transition-colors ${
              isActive("/")
                ? "text-nav-tab-selected"
                : "text-nav-tab hover:text-nav-tab-selected"
            }`}
          >
            {companyName ? `${companyName} ` : ""}Checkout Central
          </Link>

          <Link
            to="/checkout"
            onClick={() => setMobileNavOpen(false)}
            className={`body-md font-medium pb-1 transition-colors inline-flex items-center gap-2 ${
              isActive("/checkout")
                ? "text-nav-tab-selected border-b-2 border-underline"
                : "text-nav-tab hover:text-nav-tab-selected"
            }`}
          >
            <span
              className="material-symbols-outlined !text-xl"
              style={{ fontVariationSettings: `'FILL' 1` }}
            >
              inventory_2
            </span>
            Checkouts
          </Link>

          <Link
            to="/requests"
            onClick={() => setMobileNavOpen(false)}
            className={`body-md font-medium pb-1 transition-colors inline-flex items-center gap-2 ${
              isActive("/requests")
                ? "text-nav-tab-selected border-b-2 border-underline"
                : "text-nav-tab hover:text-nav-tab-selected"
            }`}
          >
            <span
              className="material-symbols-outlined !text-xl"
              style={{ fontVariationSettings: `'FILL' 1` }}
            >
              pending_actions
            </span>
            Requests
          </Link>

        </nav>
      </div>

    </header>
  );
}