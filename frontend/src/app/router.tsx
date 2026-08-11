import { lazy, Suspense } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/login-page";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { AppShell } from "@/components/layout/app-shell";
import { ROUTES } from "@/constants";
import type { Role } from "@/types/domain";

/**
 * App routing.
 *
 * - All paths come from the ROUTES constant (no hardcoded strings).
 * - Authenticated pages render inside a single layout route: ProtectedRoute →
 *   AppShell → <Outlet/>. AppShell owns the sidebar/topbar so pages don't.
 * - Role scoping uses <RoleGuard> (ProtectedRoute with allowedRoles) wrapping a
 *   nested <Outlet/>. Borrower base routes need auth only.
 * - Pages are lazy-loaded per role for code-splitting. Every page is currently
 *   a placeholder (the *-page modules under features/); real content lands later.
 */

// Borrower (auth-only base — shared by every role)
const HomePage = lazy(() => import("@/features/borrower/home/home-page"));
const CatalogPage = lazy(() => import("@/features/borrower/catalog/catalog-page"));
const EquipmentDetailPage = lazy(
  () => import("@/features/borrower/catalog/equipment-detail-page"),
);
const RoomListPage = lazy(() => import("@/features/borrower/rooms/room-list-page"));
const MyLoansPage = lazy(() => import("@/features/borrower/loans/my-loans-page"));
const MyHistoryPage = lazy(() => import("@/features/borrower/loans/my-history-page"));
const MyCreditPage = lazy(() => import("@/features/borrower/credit/my-credit-page"));
const AppealsPage = lazy(() => import("@/features/borrower/appeals/appeals-page"));

// Account (any authenticated role)
const ProfilePage = lazy(() => import("@/features/account/profile-page"));

// Staff ops
const StaffDashboardPage = lazy(() => import("@/features/staff/dashboard/dashboard-page"));
const StaffHandoverPage = lazy(() => import("@/features/staff/handover/handover-page"));
const StaffInspectionPage = lazy(
  () => import("@/features/staff/inspection/inspection-page"),
);
const StaffInventoryPage = lazy(
  () => import("@/features/staff/inventory/inventory-page"),
);

// Department management (staff + supervisor)
const StaffUsersPage = lazy(() => import("@/features/staff/users/users-page"));
const StaffPermissionsPage = lazy(
  () => import("@/features/staff/permissions/permissions-page"),
);
const StaffSettingsPage = lazy(() => import("@/features/staff/settings/settings-page"));

// Reports (staff + supervisor)
const ReportAnalyticsPage = lazy(
  () => import("@/features/reports/analytics/analytics-page"),
);
const ReportExportPage = lazy(() => import("@/features/reports/export/export-page"));

// Supervisor
const SupervisorApprovalsPage = lazy(
  () => import("@/features/supervisor/approvals/approvals-page"),
);
const SupervisorAppealsPage = lazy(
  () => import("@/features/supervisor/appeals/appeals-page"),
);

// Admin
const AdminDashboardPage = lazy(
  () => import("@/features/admin/dashboard/dashboard-page"),
);
const AdminUsersPage = lazy(() => import("@/features/admin/users/users-page"));
const AdminStatusPage = lazy(() => import("@/features/admin/status/status-page"));
const AdminAuditPage = lazy(() => import("@/features/admin/audit/audit-page"));
const AdminConfigPage = lazy(() => import("@/features/admin/config/config-page"));
const AdminSettingsPage = lazy(() => import("@/features/admin/settings/settings-page"));
const AdminReportsPage = lazy(() => import("@/features/admin/reports/reports-page"));

/** Layout: guarantees auth, then renders AppShell (which hosts <Outlet/>). */
function ProtectedShell() {
  return (
    <ProtectedRoute>
      <AppShell />
    </ProtectedRoute>
  );
}

/** Role scoping for a nested route group. */
function RoleGuard({ allowedRoles }: { allowedRoles: Role[] }) {
  return (
    <ProtectedRoute allowedRoles={allowedRoles}>
      <Outlet />
    </ProtectedRoute>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public */}
        <Route path={ROUTES.LOGIN} element={<LoginPage />} />

        {/* Authenticated app shell */}
        <Route element={<ProtectedShell />}>
          {/* Borrower base — any authenticated role */}
          <Route path={ROUTES.HOME} element={<HomePage />} />
          <Route path={ROUTES.CATALOG} element={<CatalogPage />} />
          <Route path={ROUTES.EQUIPMENT_DETAIL} element={<EquipmentDetailPage />} />
          <Route path={ROUTES.ROOMS} element={<RoomListPage />} />
          <Route path={ROUTES.MY_LOANS} element={<MyLoansPage />} />
          <Route path={ROUTES.MY_HISTORY} element={<MyHistoryPage />} />
          <Route path={ROUTES.MY_CREDIT} element={<MyCreditPage />} />
          <Route path={ROUTES.APPEALS} element={<AppealsPage />} />
          <Route path={ROUTES.PROFILE} element={<ProfilePage />} />

          {/* Staff operations — staff + admin */}
          <Route element={<RoleGuard allowedRoles={["staff", "admin"]} />}>
            <Route path={ROUTES.STAFF_DASHBOARD} element={<StaffDashboardPage />} />
            <Route path={ROUTES.STAFF_HANDOVER} element={<StaffHandoverPage />} />
            <Route path={ROUTES.STAFF_INSPECTION} element={<StaffInspectionPage />} />
            <Route path={ROUTES.STAFF_INVENTORY} element={<StaffInventoryPage />} />
          </Route>

          {/* Department management + reports — staff + supervisor + admin */}
          <Route element={<RoleGuard allowedRoles={["staff", "supervisor", "admin"]} />}>
            <Route path={ROUTES.STAFF_USERS} element={<StaffUsersPage />} />
            <Route path={ROUTES.STAFF_PERMISSIONS} element={<StaffPermissionsPage />} />
            <Route path={ROUTES.STAFF_SETTINGS} element={<StaffSettingsPage />} />
            <Route path={ROUTES.REPORT_ANALYTICS} element={<ReportAnalyticsPage />} />
            <Route path={ROUTES.REPORT_EXPORT} element={<ReportExportPage />} />
          </Route>

          {/* Supervisor — supervisor + admin */}
          <Route element={<RoleGuard allowedRoles={["supervisor", "admin"]} />}>
            <Route path={ROUTES.SUPERVISOR_APPROVALS} element={<SupervisorApprovalsPage />} />
            <Route path={ROUTES.SUPERVISOR_APPEALS} element={<SupervisorAppealsPage />} />
          </Route>

          {/* Admin — admin only */}
          <Route element={<RoleGuard allowedRoles={["admin"]} />}>
            <Route path={ROUTES.ADMIN_DASHBOARD} element={<AdminDashboardPage />} />
            <Route path={ROUTES.ADMIN_USERS} element={<AdminUsersPage />} />
            <Route path={ROUTES.ADMIN_STATUS} element={<AdminStatusPage />} />
            <Route path={ROUTES.ADMIN_AUDIT} element={<AdminAuditPage />} />
            <Route path={ROUTES.ADMIN_CONFIG} element={<AdminConfigPage />} />
            <Route path={ROUTES.ADMIN_SETTINGS} element={<AdminSettingsPage />} />
            <Route path={ROUTES.ADMIN_REPORTS} element={<AdminReportsPage />} />
          </Route>
        </Route>

        {/* Fallback */}
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
