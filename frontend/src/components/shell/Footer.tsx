import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { feedbackEnabledQuery } from "@/api/queries";
import { cn } from "@/lib/utils";

const COMPANY: string | undefined = import.meta.env.VITE_COMPANY_NAME;

const LINK = ({ isActive }: { isActive: boolean }) =>
  cn("rounded-4 transition-colors hover:text-tx", isActive && "text-tx");

/**
 * The small print under every page, on desktop. Phones go without, as in the
 * designs: everything here is also in the menu.
 */
export default function Footer() {
  const { data: feedback = false } = useQuery(feedbackEnabledQuery);
  return (
    <footer className="hidden h-12 flex-none items-center gap-5 border-t border-line bg-sheet px-5 fs-13.5 text-mut phone:flex">
      <NavLink to="/requests" className={LINK}>
        Request log
      </NavLink>
      <NavLink to="/settings" className={LINK}>
        Settings
      </NavLink>
      {feedback && (
        <NavLink to="/feedback" className={LINK}>
          Feedback
        </NavLink>
      )}
      <span className="ml-auto truncate">Checkout Central{COMPANY ? ` · ${COMPANY}` : ""}</span>
    </footer>
  );
}
