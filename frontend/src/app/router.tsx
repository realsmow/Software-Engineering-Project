import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/login-page";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { ROUTES } from "@/constants";
import { useMe } from "@/features/auth/use-me";

/**
 * Code-splitting ต่อ role
 * ผู้ยืมโหลดเฉพาะ chunk ของ borrower ไม่โหลด admin/staff/supervisor
 */
const CatalogPage = lazy(() => import("@/features/borrower/catalog/catalog-page"));
const MyLoansPage = lazy(() => import("@/features/borrower/loans/my-loans-page"));
const StaffDashboard = lazy(() => import("@/features/staff/dashboard/dashboard-page"));
const SupervisorApprovals = lazy(
  () => import("@/features/supervisor/approvals/approvals-page")
);
const AdminUsers = lazy(() => import("@/features/admin/users/users-page"));

export function AppRouter() {
  // เรียก useMe ที่นี่เพื่อ load user data ทันทีที่แอปเริ่ม
  useMe();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />

        {/* Borrower */}
        <Route
          path={ROUTES.CATALOG}
          element={
            <ProtectedRoute>
              <CatalogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path={ROUTES.MY_LOANS}
          element={
            <ProtectedRoute>
              <MyLoansPage />
            </ProtectedRoute>
          }
        />

        {/* Staff */}
        <Route
          path={ROUTES.STAFF_DASHBOARD}
          element={
            <ProtectedRoute allowedRoles={["staff", "admin"]}>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />

        {/* Supervisor */}
        <Route
          path={ROUTES.SUPERVISOR_APPROVALS}
          element={
            <ProtectedRoute allowedRoles={["supervisor", "admin"]}>
              <SupervisorApprovals />
            </ProtectedRoute>
          }
        />

        {/* Admin */}
        <Route
          path={ROUTES.ADMIN_USERS}
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminUsers />
            </ProtectedRoute>
          }
        />

        {/* Default */}
        <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.CATALOG} replace />} />
        <Route path="*" element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </Suspense>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
    </div>
  );
}
