import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import { getFeedbackEnabled } from "@/api/feedback";

///  +-----------------------------------------------------------------+
///  |                    FOOTER (app-wide, in App.tsx)                |
///  +-----------------------------------------------------------------+
//
//  Extracted from LandingPage so it can sit permanently at the bottom
//  of every page, mirroring the NavBar at the top. Uses the derived
//  bg-footer-bg token (nav lightness +0.1 in dark, -0.1 in light).

const COMPANY = import.meta.env.VITE_COMPANY_NAME || "Checkout Central";

/**
 * Footer link. The basis pins exactly two links per row on mobile —
 * 50% minus half the 1.5rem column gap — so they form a tidy 2x2 block
 * beside the company name instead of wrapping raggedly wherever they
 * happen to run out of room. From sm up the basis is dropped and they sit
 * on one natural-width row as before.
 */
const FOOTER_LINK =
  "basis-[calc(50%-0.75rem)] sm:basis-auto hover:text-on-background transition-colors";

export default function Footer() {
  return (
    <footer className="border-t border-outline shadow-md bg-footer-bg">
      {/* Mobile: the company name and the links share one row, the links
          wrapping and right-aligned, at a smaller size and tighter padding.
          Four links no longer fit a phone width at text-sm, and stacking them
          vertically would have grown the footer's height — so the type scales
          down and wraps instead. Desktop is unchanged from sm up. */}
      <div className="max-w-[1160px] mx-auto px-5 sm:px-8 py-5 sm:py-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-info-light">
        <span className="shrink-0">{COMPANY}</span>
        <nav className="ml-auto flex flex-wrap gap-x-6 gap-y-1.5 sm:gap-5 font-semibold">
          <Link className={FOOTER_LINK} to="/assets">
            Request assets
          </Link>
          <Link className={FOOTER_LINK} to="/accessories">
            Request accessories
          </Link>
          <Link className={FOOTER_LINK} to="/requests">
            Requests
          </Link>
          <FeedbackNavLink />
        </nav>
      </div>
    </footer>
  );
}

///  +-----------------------------------------------------------------+
///  |                      FEEDBACK NAV LINK                          |
///  +-----------------------------------------------------------------+
//
//  Only renders when the feedback feature is switched on server-side.
//  Fetches once per mount — fine for a footer, but if you ever notice
//  it firing on every route change (footer stays mounted in App.tsx,
//  so it shouldn't), it could be lifted into a context/settings hook.

function FeedbackNavLink() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    getFeedbackEnabled()
      .then((r) => setEnabled(r.enabled))
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  return (
    <Link className={FOOTER_LINK} to="/feedback">
      Feedback
    </Link>
  );
}