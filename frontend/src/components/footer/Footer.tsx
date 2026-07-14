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

export default function Footer() {
  return (
    <footer className="border-t border-outline shadow-md bg-footer-bg">
      <div className="max-w-[1160px] mx-auto px-8 py-8 flex items-center gap-6 text-sm text-info-light">
        <span>{COMPANY}</span>
        <nav className="ml-auto flex gap-5 font-semibold">
          <Link
            className="hover:text-on-background transition-colors"
            to="/request"
          >
            Checkouts
          </Link>
          <Link
            className="hover:text-on-background transition-colors"
            to="/requests"
          >
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
    <Link className="hover:text-on-background transition-colors" to="/feedback">
      Feedback
    </Link>
  );
}