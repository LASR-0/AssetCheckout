import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { Role } from "@/types/authType";

interface Props {
  children: React.ReactNode;
  /** If set, only these roles can access. If omitted, any non-null role is allowed. */
  allowedRoles?: Exclude<Role, null>[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-on-background">
        <div className="flex flex-col items-center gap-3">
          <span className="animate-spin border-loading h-6 w-6 border-2 border-t-transparent rounded-full" />
          <span className="text-sm font-bold text-loading">Checking access...</span>
        </div>
      </div>
    );
  }

  if (role === null) {
    return <Navigate to="/no-access" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to="/no-access" replace />;
  }

  return <>{children}</>;
}