import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { Role } from "@/types/domain";
import { useAuthStore } from "./auth.store";
import { ROUTES } from "@/constants";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Role[];
  fallback?: ReactNode;
}

/**
 * ห่อหน้าที่ต้องล็อกอิน
 * - ไม่มี user → redirect ไป /login
 * - มี user แต่ role ไม่ตรง → redirect ไปหน้าหลัก
 */
export function ProtectedRoute({
  children,
  allowedRoles,
  fallback,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuthStore();
  const location = useLocation();

  if (isLoading) {
    return fallback ?? <FullPageLoader />;
  }

  if (!user) {
    return <Navigate to={ROUTES.LOGIN} state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return <>{children}</>;
}

function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}
