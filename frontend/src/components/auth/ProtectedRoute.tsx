import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { isStockKeeper } from "@/lib/permissions";
import type { Role } from "@/types/authType";

interface Props {
  children: React.ReactNode;
  /** If set, only these roles can access. If omitted, any non-null role is allowed. */
  allowedRoles?: Exclude<Role, null>[];
  requireRole?: boolean;
  /** Only admins and people who keep stock at a site. Sends anyone else to
   *  /no-access with the reason, so it can say what to ask IT for. */
  requireStockKeeper?: boolean;
}

export default function ProtectedRoute({ children, allowedRoles, requireRole = true, requireStockKeeper = false }: Props) {
  const { name, role, stockKeeperLocations, isLoading } = useAuth();

  // Quiet, and only after a beat: the check is usually a cached answer, and
  // a message that flashes for 50 ms reads as something going wrong.
  if (isLoading) {
    return (
      <p role="status" className="animate-[fade-in_0.2s_0.4s_both] pt-24 text-center fs-13.5 text-mut">
        Checking access…
      </p>
    );
  }

  if (requireStockKeeper && role !== "ADMIN" && !isStockKeeper(stockKeeperLocations)) {
    return <Navigate to="/no-access" replace state={{ reason: "stock" }} />;
  }

  if (!requireRole) {
    if (!name) {
      return <Navigate to="/no-access" replace />;
    }
    return <>{children}</>;
  }

  if (role === null) {
    return <Navigate to="/no-access" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/no-access" replace />;
  }

  return <>{children}</>;
}