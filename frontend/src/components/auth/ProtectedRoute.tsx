import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/types/authType";

interface Props {
  children: React.ReactNode;
  /** If set, only these roles can access. If omitted, any non-null role is allowed. */
  allowedRoles?: Exclude<Role, null>[];
  requireRole?: boolean;
}

export default function ProtectedRoute({ children, allowedRoles, requireRole = true }: Props) {
  const { name, role, isLoading } = useAuth();

  // Quiet, and only after a beat: the check is usually a cached answer, and
  // a message that flashes for 50 ms reads as something going wrong.
  if (isLoading) {
    return (
      <p role="status" className="animate-[fade-in_0.2s_0.4s_both] pt-24 text-center fs-13.5 text-mut">
        Checking access…
      </p>
    );
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