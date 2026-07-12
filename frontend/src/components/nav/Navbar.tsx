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

  // FIXED: shared style for the square icon buttons (theme toggle + settings) —
  // rounded-md square, outline border, house shadow, 22px icon (~¾ of the old 30px).
  const ICON_BUTTON =
    "w-10 h-10 grid place-items-center rounded-md border border-outline shadow-sm hover:cursor-pointer transition";

  return (
    <header className="fixed top-0 z-50 w-full">

      {/* PRIMARY BAR */}
      <div className="bg-nav shadow-md flex justify-between items-center w-full px-8 h-16">

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

            {/* FIXED: brand text now follows the tab colour states — selected
                on the home route, nav-tab + hover elsewhere. Colour only (no
                underline), matching the settings chip's active treatment. */}
            <span
              className={`text-md font-bold md:text-xl transition-colors ${
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
              className="material-symbols-outlined mt-1 !text-3xl"
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

          {/* Settings link — FIXED: restructured from a bare icon-Link into a
              square chip wrapping the icon, matching the theme toggle. */}
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

      {/* SECONDARY BAR (mobile only) — slides in when burger is toggled.
          Hidden entirely on md+ regardless of state. */}
      {mobileNavOpen && (
        <div className="md:hidden pb-1 bg-nav border-t border-outline/20 px-8 h-10 flex items-center gap-8">

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

        </div>
      )}

    </header>
  );
}