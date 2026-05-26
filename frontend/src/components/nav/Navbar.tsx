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

  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const activeLogo = (() => {
    if (!logoLight) return null;
    if (resolvedTheme === "dark" && logoDark) return logoDark;
    return logoLight;
  })();

  return (
    <header className="fixed top-0 z-50 w-full">

      {/* PRIMARY BAR */}
      <div className="bg-nav shadow-md dark:bg-slate-900 flex justify-between items-center w-full px-8 h-16 dark:border-slate-800">

        {/* Left side */}
        <div className="flex items-center gap-8">
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

            <span className="text-md font-bold md:text-xl text-on-background">
              {companyName ? `${companyName} ` : ""}Checkout Central
            </span>
          </div>

          <nav className="hidden md:flex  gap-6">

            <Link
              to="/"
              className={`body-md font-medium pb-1 transition-colors inline-flex items-center gap-2 ${
                isActive("/")
                  ? "text-nav-tab-selected dark:text-white border-b-2 border-underline"
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
                  ? "text-nav-tab-selected dark:text-white border-b-2 border-underline"
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

        {/* Right side — burger (mobile only) + settings (always) */}
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

          {/* Settings link */}
          <Link
            to="/settings"
            className={`material-symbols-outlined !text-3xl hover:cursor-pointer text-nav-tab hover:text-nav-tab-selected transition ${
              isActive("/settings")
                ? "text-nav-tab-selected dark:text-white"
                : "text-nav-tab hover:text-nav-tab-selected"
            }`}
            style={{ fontVariationSettings: `'FILL' 1` }}
            aria-label="Settings"
          >
            settings
          </Link>

        </div>
      </div>

      {/* SECONDARY BAR (mobile only) — slides in when burger is toggled.
          Hidden entirely on md+ regardless of state. */}
      {mobileNavOpen && (
        <div className="md:hidden pb-1 bg-nav dark:bg-slate-900 border-t border-outline/20 px-8 h-10 flex items-center gap-8">

          <Link
            to="/"
            onClick={() => setMobileNavOpen(false)}
            className={`body-md font-medium pb-1 transition-colors inline-flex items-center gap-2 ${
              isActive("/")
                ? "text-nav-tab-selected dark:text-white border-b-2 border-underline"
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
                ? "text-nav-tab-selected dark:text-white border-b-2 border-underline"
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