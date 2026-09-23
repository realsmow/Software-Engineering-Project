# ULMs – Testing Readiness & Implementation Checklist
**Updated:** 2026-09-23 | **SRS Version:** v1.0 | **Project:** Software-Engineering-Project

## Current implementation and connection status

> This table records current work progress for Modules 1-12. The detailed test-item rows below are the authoritative item-level status.

| Module | Backend work completed | Frontend work completed | Full-stack connection | Test progress / remaining work |
|---|---|---|---|---|
| 1. Authentication & Session | Auth service/router, cookies, throttling, profile lookup, and role middleware implemented. | Login, validation, bootstrap, protected routes, profile, and logout implemented. | [CONNECTED] Auth flows use tRPC and session cookies. | Backend auth/session/middleware tests and frontend login/auth-flow tests exist; 1.1.6 KU-domain backend enforcement remains. |
| 2. User / Account Management | Admin CRUD, search, role/password/ban/active-state operations implemented. | Admin table, filters, modals, mutations, and CSV export wired. | [CONNECTED] Admin hooks call the backend router. | Admin unit/frontend/Playwright tests exist; rerun after Prisma setup is fixed. |
| 3. Credit Tier & Borrow Limits | Tier resolution, constraints, penalties, and credit.me implemented. | Account credit hook and adapter consume server data. | [CONNECTED] auth.me and credit.me are connected. | [HAS TESTS] Module 3.1–3.5 covered by credit-tier + credit service specs: 7/7 passed. |
| 4. Lending Settings | Validated atomic rule/penalty upsert implemented. | Staff settings page reads and saves real settings. | [CONNECTED] Query and mutation are wired end-to-end. | Add rollback, validation, and form tests. |
| 5. Equipment Management | Item catalog/detail, availability, serials, inventory, lendable, and condition paths registered. | Catalog/detail and inventory pages use API queries, adapters, pagination, and polling. | [CONNECTED] item procedures are API-backed; categories remain a stub. | Item tests exist; add catalog/inventory/browser tests. |
| 6. Loan Request Submission | Eligibility, stock/window checks, create/list/cancel, and staff loan operations implemented. | Request/cart UI exists; create remains session-local and loans remain partly mock-backed. | [PARTIAL] Backend ready; primary request form is not connected. | Module 6 backend and E2E test files now exist; connect the request form and resolve login redirect before full E2E execution. |
| 7. Approval Workflow | Queue, counts, decisions, self-approval guard, and allocation rules implemented. | Supervisor queue and decision UI use real hooks. | [CONNECTED] Approval queries/mutations call the backend. | Add approval service/component/E2E tests. |
| 8. Handover / Pickup / Return | Loan queue, pickup/return, inspection, image, and damage paths partly implemented. | Queue/inspection connected; handover page and full evidence flow incomplete. | [PARTIAL] Queue/inspection connected; full handover is not. | Finish UI/maintenance jobs before full E2E. |
| 9. Notifications | List, unread count, read actions, and generation paths implemented. | Bell/popover, polling, optimistic read actions, and invalidation connected. | [CONNECTED] Notification procedures are consumed by the frontend. | Add notification lifecycle tests. |
| 10. Appeals | Appeal router/state machine not implemented. | Borrower/supervisor appeal screens remain mock-backed. | [NOT IMPLEMENTED] No real backend connection. | Only mock UI testing is currently possible. |
| 11. Admin System Management | Status, cron registry, reports, audit reads, and read-only config available; some jobs remain stubs. | Status/dashboard/audit/report/config hooks call backend procedures. | [PARTIAL] Implemented reads connected; unsupported actions remain. | Add status/audit/report and negative-stub tests. |
| 12. Non-Functional Requirements | Typed errors, Zod, Prisma access, session security, and strict TypeScript compile. | Thai errors, Sarabun, responsive layout, typecheck, and lint present. | [PARTIAL] Temporary local tRPC contract remains. | 12.1.1–12.1.4 security tests pass 4/4; 12.3.1–12.3.3 usability tests pass 3/3. Vitest/build environment remains blocked by spawn EPERM. |

## Current test execution status

| Area | Result | Details |
|---|---|---|
| Backend build | [PASS] | backend: npm run build completed successfully. |
| Module 6 targeted backend tests | [PASS] | Approval policy + loan request service: 23/23 tests passed. |
| Backend Jest/admin suites | [PASS] | Full backend Jest run: 32 suites passed, 354 tests passed, 0 failed. |
| Frontend typecheck | [PASS] | frontend: npm run typecheck passed. |
| Frontend lint | [PASS] | frontend: npm run lint passed with 0 errors and 7 warnings. |
| Frontend Vitest | [PARTIAL] | Dedicated frontend auth and NFR test files pass individually; full Vitest execution remains blocked by Vite/esbuild spawn EPERM. |
| Frontend production build | [BLOCKED] | TypeScript passes; Vite/esbuild fails with spawn EPERM. |
| Playwright E2E | [BLOCKED] | Module 6 loan-request E2E specs exist, but execution currently stops at login because the frontend login flow does not redirect; admin E2E specs also require services and a seeded database. |
| Load test | [NOT RUN] | tests/load/admin-system-load.k6.js requires a running target and k6. |

> [!IMPORTANT]
> This checklist tracks both **Implementation Status** (Backend, Frontend, Full-Stack Connection) and **Testing Readiness** across the system.
> It enables QA and developers to write:
> - **`[BE]` Backend Unit & Service Tests** (NestJS services, specs, Prisma queries, middleware)
> - **`[FE]` Frontend Component & Form Tests** (Zod validation, UI interaction, mock fixtures)
> - **`[INT/E2E]` Integration & E2E Tests** (tRPC contract calls, session cookies, full browser flows)

---

## Legend

### Implementation & Connection Status
| Badge | Status | Description |
|:---:|---|---|
| 🟢 | **CONNECTED** | Backend and Frontend are fully wired together via tRPC and session cookies. |
| 🔵 | **BE ONLY** | Backend logic/API exists; Frontend is a placeholder or not yet connected. |
| 🟡 | **FE MOCK** | Frontend UI shell/component exists using mock data; Backend router not yet implemented. |
| 🟠 | **PARTIAL** | Logic is incomplete, under construction, or intentionally returns `NOT_IMPLEMENTED`. |
| ⚪ | **NOT IMPLEMENTED** | No backing code in Backend or Frontend yet. |

### Test Readiness
| Symbol | Meaning |
|:---:|---|
| ✅ **READY** | Implementation exists — write full tests now in the specified layer |
| ⚠️ **PARTIAL / MOCK** | Scaffolding or UI mockups exist — testable with stubs or mock fixtures |
| ❌ **NOT READY** | No backing implementation — skip testing for now |
| 🧪 **HAS TESTS** | Existing automated test file found in the repository |

---

## MODULE 1 – Authentication & Session
> SRS Section 3.1 (FR-AUTH-*) | Status: [CONNECTED]
> Backend: backend/src/auth/ | Frontend: frontend/src/features/auth/ (tRPC/session connected)

### 1.1 Backend Authentication & Logic [BE]
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 1.1.1 | Login with valid KU email + password returns user profile and sets `ulms_session` cookie | BE | FR-AUTH | [CONNECTED] | [HAS TESTS] | [`auth.service.spec.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/src/auth/auth.service.spec.ts) covers `authenticate()` Test evidence: backend/src/auth/auth.service.spec.ts. |
| 1.1.2 | Login with valid UserID (staff/local account) also succeeds | BE | FR-AUTH | [CONNECTED] | [HAS TESTS] | Same spec file, covers UserID path Test evidence: backend/src/auth/auth.service.spec.ts. |
| 1.1.3 | Email matching is case-insensitive and strips surrounding whitespace | BE | FR-AUTH | [CONNECTED] | [HAS TESTS] | Covered in spec Test evidence: backend/src/auth/auth.service.spec.ts. |
| 1.1.4 | Wrong password returns `INVALID_CREDENTIALS` (not a user-enumeration message) | BE | FR-AUTH, NFR-SEC | [CONNECTED] | [HAS TESTS] | Spec: "rejects a wrong password" Test evidence: backend/src/auth/auth.service.spec.ts. |
| 1.1.5 | Non-existent account returns same `INVALID_CREDENTIALS` error (timing attack prevention) | BE | NFR-SEC | [CONNECTED] | [HAS TESTS] | Spec: "gives an unknown account the same error" Test evidence: backend/src/auth/auth.service.spec.ts. |
| 1.1.6 | Only `@ku.th` domain emails are permitted on backend | BE | SRS Appendix A: `INVALID_DOMAIN` | [PARTIAL] | [PARTIAL] | Backend KU-domain enforcement remains incomplete; add the negative-domain test when implemented. |

### 1.2 Session Management & Middleware [BE]
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 1.2.1 | Session cookie is `httpOnly: true` (no JavaScript access) | BE | NFR-SEC-02 | [CONNECTED] | [HAS TESTS] | [`session.service.spec.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/src/auth/session.service.spec.ts) Test evidence: backend/src/auth/session.service.spec.ts. |
| 1.2.2 | Session cookie is `secure: true` in production environment | BE | NFR-SEC-02 | [CONNECTED] | [HAS TESTS] | Covered in spec Test evidence: backend/src/auth/session.service.spec.ts. |
| 1.2.3 | Expired session token is rejected (returns null) | BE | NFR-SEC | [CONNECTED] | [HAS TESTS] | Covered in spec Test evidence: backend/src/auth/session.service.spec.ts. |
| 1.2.4 | Token signed with different secret is rejected | BE | NFR-SEC | [CONNECTED] | [HAS TESTS] | Covered in spec Test evidence: backend/src/auth/session.service.spec.ts. |
| 1.2.5 | Logout clears the cookie with identical attributes (path, sameSite, httpOnly) | BE | FR-AUTH | [CONNECTED] | [HAS TESTS] | Covered in spec Test evidence: backend/src/auth/session.service.spec.ts. |
| 1.2.6 | Missing `SESSION_SECRET` in production throws startup error | BE | NFR-SEC | [CONNECTED] | [HAS TESTS] | Covered in spec Test evidence: backend/src/auth/session.service.spec.ts. |
| 1.2.7 | `auth.me` procedure returns full user profile including credit tier + borrow limits | BE | FR-AUTH | [CONNECTED] | [HAS TESTS] | `getProfile()` in `auth.service.spec` Test evidence: backend/src/auth/auth.service.spec.ts. |
| 1.2.8 | Unauthenticated request to protected route returns `NOT_AUTHENTICATED` | BE | NFR-SEC | [CONNECTED] | [HAS TESTS] | Test evidence: backend/src/auth/auth.middleware.spec.ts |
| 1.2.9 | Borrower calling a Staff-only route returns `ROLE_NOT_ALLOWED` | BE | SRS §3.1 | [CONNECTED] | [HAS TESTS] | Test evidence: backend/src/auth/auth.middleware.spec.ts |
| 1.2.10 | Staff cannot access Supervisor-only approvals | BE | SRS §3.5 | [CONNECTED] | [HAS TESTS] | Test evidence: backend/src/auth/auth.middleware.spec.ts |
| 1.2.11 | Admin role has access to all routes | BE | SRS §3.1 | [CONNECTED] | [HAS TESTS] | Test evidence: backend/src/auth/auth.middleware.spec.ts |

### 1.3 Frontend Login UI & Form Validation [FE]
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 1.3.1 | KU email schema validates `@ku.ac.th` and `@ku.th` domains, rejecting others | FE | SRS Appendix A | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/login-page.test.tsx` — 7/7 login UI tests pass. |
| 1.3.2 | Empty email/password fields show required validation errors in Thai | FE | NFR-USB-03 | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/login-page.test.tsx` — covered by the 7/7 login UI tests. | Implemented in [`login-method-ku.tsx`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/features/auth/login-method-ku.tsx) |
| 1.3.3 | Local account form validates non-empty username & password | FE | FR-AUTH | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/login-page.test.tsx` — covered by the 7/7 login UI tests. | Implemented in [`login-method-local.tsx`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/features/auth/login-method-local.tsx) |
| 1.3.4 | Password visibility toggle switches input type between `password` and `text` | FE | NFR-USB | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/login-page.test.tsx` — KU and Local visibility toggles covered; 7/7 passed. | Interactive button in `login-method-local.tsx` |
| 1.3.5 | Login method accordion switches mutually exclusively between KU and Local panels | FE | SRS §5.1 | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/login-page.test.tsx` — covered by the 7/7 login UI tests. | State handled in [`login-page.tsx`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/features/auth/login-page.tsx) |

### 1.4 Full-Stack Integration & E2E Flows [INT/E2E]
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 1.4.1 | Submit valid KU email + password via UI -> calls `trpcClient.auth.login.mutate` -> receives cookie -> redirects to role home route | INT/E2E | FR-AUTH | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. |
| 1.4.2 | Submit valid Local account via UI -> calls `trpcClient.auth.login.mutate` -> receives cookie -> redirects | INT/E2E | FR-AUTH | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. | Wired end-to-end in `login-page.tsx` |
| 1.4.3 | Submit invalid credentials -> UI renders unified Thai error banner ("อีเมลหรือรหัสผ่านไม่ถูกต้อง") without revealing field error | INT/E2E | NFR-SEC, NFR-USB-03 | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. | Handled in `login-page.tsx` `signIn()` catch |
| 1.4.4 | App mount calls `trpcClient.auth.me.query()` -> populates Zustand store -> renders user profile in sidebar & header | INT/E2E | FR-AUTH | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. | Bootstrapped in [`App.tsx`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/app/app.tsx) |
| 1.4.5 | App mount without valid session cookie -> `auth.me` 401 caught cleanly -> auth store cleared -> protected routes redirect to `/login` | INT/E2E | NFR-SEC | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. | Handled in `App.tsx` & [`protected-route.tsx`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/features/auth/protected-route.tsx) |
| 1.4.6 | Click Logout in Sidebar -> calls `trpcClient.auth.logout.mutate()` -> clears cookie + store -> navigates to `/login` | INT/E2E | FR-AUTH | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. | Implemented in [`sidebar.tsx`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/components/layout/sidebar.tsx) |
| 1.4.7 | Direct access to protected page without auth cookie redirects to `/login` | INT/E2E | NFR-SEC | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. | Verified by `protected-route.tsx` |
| 1.4.8 | Direct access to route with insufficient role (e.g., borrower accessing `/admin/users`) redirects or displays forbidden | INT/E2E | SRS §3.1 | [CONNECTED] | [HAS TESTS] | `frontend/tests/auth/auth-flow.test.tsx`; Module 1.4 suite passes 8/8. |

---

## MODULE 2 – User / Account Management (Admin)
> SRS Section 3.2 (implied), Admin domain | Status: [CONNECTED]
> Backend: backend/src/admin/ | Frontend: frontend/src/features/admin/users/ (tRPC connected)

### 2.1 Backend Admin User Operations & Rules [BE]
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 2.1.1 | Admin can create new user with email, role, name, studentId, and initial credit | BE | FR-USR | [CONNECTED] | [HAS TESTS] | `AdminService.createUser()` implemented Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.2 | Creating user without password auto-generates temporary password returned once | BE | FR-USR | [CONNECTED] | [HAS TESTS] | `generateTemporaryPassword()` in `createUser()` Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.3 | Duplicate email or studentId on create is rejected with typed error | BE | FR-USR | [CONNECTED] | [HAS TESTS] | `assertIdentifiersFree()` check Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.4 | Admin can update user name, email, and studentId | BE | FR-USR | [CONNECTED] | [HAS TESTS] | `AdminService.updateUser()` Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.5 | Admin can change user role (borrower, staff, supervisor, admin) | BE | FR-USR | [CONNECTED] | [HAS TESTS] | `AdminService.changeRole()` Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.6 | Admin **cannot** demote their own account (`CANNOT_MODIFY_SELF`) | BE | FR-APV-04 analogy | [CONNECTED] | [HAS TESTS] | Self-demotion guard in `changeRole()` Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.7 | Admin can reset user password (returns one-time temporary password) | BE | FR-USR | [CONNECTED] | [HAS TESTS] | `AdminService.resetPassword()` Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.8 | Admin can list/search users by email, name, studentId, role, or suspension status | BE | FR-USR | [CONNECTED] | [HAS TESTS] | `AdminService.listUsers()` with pagination Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.9 | Admin can enable or disable another account and cannot disable their own account | BE | FR-USR | [CONNECTED] | [HAS TESTS] | Implemented in AdminService; Prisma-backed admin suite is currently blocked by test database setup. Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.10 | Staff/Admin can issue borrowing ban with reason and duration (days) | BE | SRS §3.x | [CONNECTED] | [HAS TESTS] | `setUserBan(banned: true)` creates `PenaltyInfo` Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.11 | Staff/Admin can lift borrowing ban (sets `InEffect: false`, preserves history) | BE | SRS §3.x | [CONNECTED] | [HAS TESTS] | `setUserBan(banned: false)` path Test evidence: backend/tests/admin/user-management.spec.ts. |
| 2.1.12 | Staff/Admin cannot ban themselves (`CANNOT_MODIFY_SELF`) | BE | FR-APV-04 analogy | [CONNECTED] | [HAS TESTS] | Guard in `setUserBan()` Test evidence: backend/tests/admin/user-management.spec.ts. |

### 2.2 Frontend Admin Users UI & Interactions [FE]
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 2.2.1 | Stat chips display counts for Total, Active, Suspended, and Disabled accounts and act as quick-filters | FE | SRS §5.1 | [CONNECTED] | [HAS TESTS] | `StatChip` in [`users-page.tsx`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/features/admin/users/users-page.tsx) Test evidence: frontend/tests/admin/users-page.test.tsx. |
| 2.2.2 | Search input filters table client-side across Name, Email, and Student ID | FE | NFR-USB | [CONNECTED] | [HAS TESTS] | Real-time filter in `users-page.tsx` Test evidence: frontend/tests/admin/users-page.test.tsx. |
| 2.2.3 | Dropdowns filter table rows by Role, Status, Faculty, and Department | FE | NFR-USB | [CONNECTED] | [HAS TESTS] | Select dropdowns in `users-page.tsx` Test evidence: frontend/tests/admin/users-page.test.tsx. |
| 2.2.4 | Create User modal contains required fields (name, email, role, faculty, department, auth type) | FE | FR-USR | [CONNECTED] | [HAS TESTS] | Modal form in `users-page.tsx` Test evidence: frontend/tests/admin/users-page.test.tsx. |
| 2.2.5 | Role badges render neutral tones; status badges render semantic tones (green/amber/gray) | FE | SRS §5.1 | [CONNECTED] | [HAS TESTS] | `ROLE_TONE` and `STATUS_TONE` styling Test evidence: frontend/tests/admin/users-page.test.tsx. |
| 2.2.6 | Export CSV button formats and triggers download of filtered account list | FE | NFR-USB | [CONNECTED] | [HAS TESTS] | `handleExportCsv()` in `users-page.tsx` Test evidence: frontend/tests/admin/users-page.test.tsx. |

### 2.3 Full-Stack Integration & E2E Admin Flows [INT/E2E]
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 2.3.1 | Loading `/admin/users` fetches all user accounts via `trpc.admin.listUsers.query` and populates the table | INT/E2E | FR-USR | [CONNECTED] | [HAS TESTS] | [`useAdminUsers()`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/frontend/src/features/admin/users/use-admin-users.ts) walks pages Test evidence: tests/e2e/admin/user-lifecycle.spec.ts. |
| 2.3.2 | Submit Create User modal -> calls `trpc.admin.createUser.mutate` -> pops up temporary password dialog -> table invalidates and displays new user | INT/E2E | FR-USR | [CONNECTED] | [HAS TESTS] | `useCreateUser` flow in `users-page.tsx` Test evidence: tests/e2e/admin/user-lifecycle.spec.ts. |
| 2.3.3 | Change user role from table dropdown -> calls `trpc.admin.changeRole.mutate` -> toast feedback -> table updates | INT/E2E | FR-USR | [CONNECTED] | [HAS TESTS] | `useChangeRole` mutation hook Test evidence: tests/e2e/admin/user-lifecycle.spec.ts. |
| 2.3.4 | Click Reset Password -> calls `trpc.admin.resetPassword.mutate` -> displays temporary password modal to admin | INT/E2E | FR-USR | [CONNECTED] | [HAS TESTS] | `useResetPassword` mutation hook Test evidence: tests/e2e/admin/user-lifecycle.spec.ts. |
| 2.3.5 | Issue Ban via modal -> calls `trpc.admin.setUserBan.mutate({ banned: true, ... })` -> user status updates to Suspended | INT/E2E | SRS §3.x | [CONNECTED] | [HAS TESTS] | `useSetUserBan` mutation hook Test evidence: tests/e2e/admin/user-ban-policy.spec.ts. |
| 2.3.6 | Lift Ban via modal -> calls `trpc.admin.setUserBan.mutate({ banned: false })` -> user status updates to Active | INT/E2E | SRS §3.x | [CONNECTED] | [HAS TESTS] | Lift ban mutation hook Test evidence: tests/e2e/admin/user-ban-policy.spec.ts. |
| 2.3.7 | Attempting to ban or demote logged-in admin's own account surfaces readable error (`CANNOT_MODIFY_SELF`) and cancels action | INT/E2E | FR-APV-04 analogy | [CONNECTED] | [HAS TESTS] | Handled via `mutationMessage()` Test evidence: tests/e2e/admin/user-ban-policy.spec.ts. |
| 2.3.8 | Toggling active status calls the admin mutation and refreshes the table | INT/E2E | FR-USR | [CONNECTED] | [HAS TESTS] | Implemented mutation and frontend hook are wired; previous NOT_IMPLEMENTED expectation is obsolete. Test evidence: frontend/tests/admin/users-page.test.tsx. |

---

## MODULE 3 – Credit Tier & Borrow Limits
> SRS Section 3.x (credit scoring) | Status: [CONNECTED]
> Backend: backend/src/common/credit/, backend/src/credit/ | Frontend: frontend/src/features/account/ (tRPC connected)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 3.1 | `resolveBorrowLimits()` maps a credit score to the correct tier name (D0–D3) | BE | SRS §3.4 FR-REQ-05 | [CONNECTED] | [READY] | Fully implemented in [`credit-tier.service.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/src/common/credit/credit-tier.service.ts) |
| 3.2 | A credit score with no matching tier throws `CREDIT_TIER_NOT_CONFIGURED` | BE | NFR-REL | [CONNECTED] | [READY] | Guard in `credit-tier.service.ts` |
| 3.3 | Borrow limit (`MaxBorrowDate`) is correctly returned from BorrowConstraints | BE | SRS §3.4 FR-REQ-02 | [CONNECTED] | [HAS TESTS] | `backend/src/common/credit/credit-tier.service.spec.ts` and `credit.service.spec.ts`; Module 3 suite 7/7 passed. |
| 3.4 | `MaxExtendTime` is correctly returned from BorrowConstraints | BE | SRS §3.4 | [CONNECTED] | [HAS TESTS] | `backend/src/common/credit/credit-tier.service.spec.ts` and `credit.service.spec.ts`; Module 3 suite 7/7 passed. |
| 3.5 | User credit response returns score, tier, limits, active penalties, and total deducted credit | BE | FR-AUTH | [CONNECTED] | [HAS TESTS] | `backend/src/credit/credit.service.spec.ts`; Module 3 suite 7/7 passed. |

---

## MODULE 4 – Lending Settings (Admin/Staff)
> SRS Section 3.x (configuration) | Status: [CONNECTED]
> Backend: backend/src/admin/admin.service.ts | Frontend: frontend/src/features/staff/settings/ (tRPC connected)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 4.1 | Staff/Admin can read all credit tiers and borrow rules via `getLendingSettings` | BE | SRS §3.x | [CONNECTED] | [READY] | Implemented with full Prisma query |
| 4.2 | Staff/Admin can upsert BorrowConstraints (`maxBorrowDays`, `maxExtendTimes`, `minimumAuthorityLevel`) | BE | SRS §3.x | [CONNECTED] | [READY] | Implemented in `updateLendingSettings()` |
| 4.3 | Staff/Admin can upsert PenaltyRules (`reason`, `amount`, `lengthDays`) | BE | SRS §3.x | [CONNECTED] | [READY] | Implemented in `updateLendingSettings()` |
| 4.4 | Updating with unknown `BorrowRuleKey` throws `BORROW_RULE_NOT_FOUND` | BE | SRS §3.x | [CONNECTED] | [READY] | Guard in `admin.service.ts` |
| 4.5 | The full upsert is atomic — partial failure rolls back everything | BE | NFR-REL-02 | [CONNECTED] | [READY] | `$transaction(writes)` in `admin.service.ts` |
| 4.6 | Frontend Settings Page configures lending tiers and rules | FE | SRS §3.x | [CONNECTED] | [READY] | Implemented in frontend/src/features/staff/settings/settings-page.tsx; no longer a placeholder. |
| 4.7 | Frontend saves lending settings through the tRPC mutation | INT/E2E | SRS §3.x | [CONNECTED] | [READY] | useUpdateLendingSettings calls the backend mutation and invalidates dependent queries. |

---

## MODULE 5 – Equipment Management (Catalog / Browse)
> SRS Section 3.2 (FR-EQP-*), 3.3 (FR-BRW-*) | Status: [CONNECTED]
> Backend: backend/src/item/ | Frontend: frontend/src/features/borrower/catalog/, frontend/src/features/staff/inventory/ (API-backed)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 5.1 | Staff registers new equipment type with name, price, tier (T0-T3), prep_days | BE | FR-EQP-01 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.2 | Staff registers serial numbers for T2 equipment | BE | FR-EQP-02 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.3 | T1 equipment tracked by quantity; serial assigned at allocation | BE | FR-EQP-03 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.4 | Staff registers T3 facility with seat count, slot duration, hours | BE | FR-EQP-04 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.5 | Staff can edit, delete, and temporarily disable equipment | BE | FR-EQP-05 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.6 | Borrower searches equipment by name and filters by tier/availability | FE | FR-BRW-01 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.7 | Equipment catalog cursor-based pagination UI | FE | FR-BRW-02 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.8 | Equipment detail shows name, tier, image, stock remaining, and conditions | FE | FR-BRW-03 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.9 | T2 detail page shows serial number list with individual status + available date | FE | FR-BRW-04 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.10 | T3 detail shows time slot calendar | FE | FR-BRW-05 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |
| 5.11 | Live availability is returned by the item availability query | BE | FR-EQP-07 | [PARTIAL] | [PARTIAL] | Availability is computed live by the API; scheduled precomputation remains intentionally unimplemented. |
| 5.12 | Supervisor decommission proposal and audit workflow is available | BE | FR-EQP-08 | [PARTIAL] | [PARTIAL] | Decommission proposal exists, but the complete supervisor/audit workflow remains partial. |
| 5.13 | Real-time catalog data fetching via tRPC equipment router | INT/E2E | FR-BRW-01 | [CONNECTED] | [READY] | Current item/catalog work is API-backed; add dedicated service, component, and browser coverage. |

---

## MODULE 6 – Loan Request Submission
> SRS Section 3.4 (FR-REQ-*) | Status: [PARTIAL]
> Backend: backend/src/loan/ | Frontend: frontend/src/features/borrower/request/, frontend/src/features/borrower/loans/ (submission UI partial)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 6.1 | Borrower adds multiple items to cart and submits as single request | FE | FR-REQ-01 | [PARTIAL] | [HAS TESTS] | E2E coverage exists in `tests/e2e/loan-request.spec.ts`; execution is currently blocked at login. Cart UI remains session-local. |
| 6.2 | Request specifies pickup date and return date (1–14 days range enforced) | FE | FR-REQ-02 | [PARTIAL] | [HAS TESTS] | E2E coverage exists in `tests/e2e/loan-request.spec.ts`; execution is currently blocked at login. Date validation exists, but create submission is not yet connected. |
| 6.3 | System validates eligibility, credit tier, and stock before accepting | BE | FR-REQ-03 | [CONNECTED] | [HAS TESTS] | Test evidence: `backend/src/loan/loan.request.service.spec.ts`. |
| 6.4 | T0 request is auto-approved immediately upon validation | BE | FR-REQ-04 | [CONNECTED] | [HAS TESTS] | Covered by `backend/src/loan/loan.request.service.spec.ts`. |
| 6.5 | T1 request: D0–D1 credit auto-approved; D2–D3 credit requires supervisor | BE | FR-REQ-05 | [CONNECTED] | [HAS TESTS] | Covered by `backend/src/loan/loan.request.service.spec.ts` and approval-policy tests. |
| 6.6 | T2 request always routes to supervisor regardless of credit | BE | FR-REQ-06 | [CONNECTED] | [HAS TESTS] | Covered by `backend/src/loan/loan.request.service.spec.ts` and approval-policy tests. |
| 6.7 | T2 request requires borrower to select specific serial number | FE/BE | FR-REQ-07 | [PARTIAL] | [HAS TESTS] | Backend service coverage exists in `backend/src/loan/loan.request.service.spec.ts`; frontend request-form integration remains incomplete. |
| 6.8 | T3 request: select time slot(s), max 2 simultaneous slots | BE | FR-REQ-08 | [CONNECTED] | [HAS TESTS] | Test evidence: `backend/src/common/booking/booking-window.spec.ts`. |
| 6.9 | Conflicting concurrent requests handled atomically (rollback loser) | BE | FR-REQ-09, NFR-REL-02 | [CONNECTED] | [HAS TESTS] | Test evidence: `backend/src/common/booking/booking-window.spec.ts`. |
| 6.10 | Borrower can cancel own pending request | BE/FE | FR-REQ-10 | [CONNECTED] | [READY] | loan.cancel and its hook are connected; dedicated cancel test is still needed. Request creation UI remains local. |
| 6.11 | Submit the request form through the tRPC loan router | INT/E2E | FR-REQ-01 | [PARTIAL] | [HAS TESTS] | E2E coverage exists in `tests/e2e/loan-request.spec.ts`; execution is currently blocked at login. Backend mutation exists, but the primary request form is not wired to it. |

---

## MODULE 7 – Approval Workflow (Supervisor)
> SRS Section 3.5 (FR-APV-*) | Status: [CONNECTED]
> Backend: backend/src/approval/ | Frontend: frontend/src/features/supervisor/approvals/ (tRPC connected)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 7.1 | Supervisor sees approval queue with borrower credit & loan history | FE | FR-APV-01 | [CONNECTED] | [READY] | Approval backend and supervisor hooks are connected; dedicated approval tests are still needed. |
| 7.2 | Supervisor approves/rejects individual items within multi-item request (partial approval) | FE | FR-APV-02 | [CONNECTED] | [READY] | Approval backend and supervisor hooks are connected; dedicated approval tests are still needed. |
| 7.3 | Rejection requires a reason to be entered before submit | FE | FR-APV-03 | [CONNECTED] | [READY] | Approval backend and supervisor hooks are connected; dedicated approval tests are still needed. |
| 7.4 | Approver must not be the same person as requester (self-approval guard) | BE | FR-APV-04 | [CONNECTED] | [READY] | Approval backend and supervisor hooks are connected; dedicated approval tests are still needed. |
| 7.5 | Approval creates Allocation with `pickup_deadline` = now + 24 hours | BE | FR-APV-05 | [CONNECTED] | [READY] | Approval backend and supervisor hooks are connected; dedicated approval tests are still needed. |
| 7.6 | Borrower receives notification when request status changes | BE | FR-APV-06 | [CONNECTED] | [READY] | Approval backend and supervisor hooks are connected; dedicated approval tests are still needed. |
| 7.7 | Supervisor decision submitted via tRPC approval router | INT/E2E | FR-APV-02 | [CONNECTED] | [READY] | Approval backend and supervisor hooks are connected; dedicated approval tests are still needed. |

---

## MODULE 8 – Handover / Pickup & Return (Staff)
> SRS Section 3.6–3.7 | Status: [PARTIAL]
> Backend: backend/src/loan/, backend/src/inspection/, backend/src/image/ | Frontend: frontend/src/features/staff/ (handover UI partial)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 8.1 | Staff records equipment pickup (assigns actual serial for T1) | FE | SRS §3.6 | [PARTIAL] | [PARTIAL] | Dedicated handover page is still a placeholder; staff queue allocation is the current connected path. |
| 8.2 | Expired pickup deadline auto-cancels the allocation | BE | SRS §3.6 | [PARTIAL] | [PARTIAL] | Cron registration exists, but stale-request expiration still needs completion and tests. |
| 8.3 | Staff records equipment return and triggers inspection | FE | SRS §3.7 | [PARTIAL] | [PARTIAL] | Return/inspection APIs and inspection page are partly connected; full handover UI is incomplete. |
| 8.4 | Staff uploads inspection photo evidence (max 5 MB, JPG/PNG only) | FE/BE | SRS §5.3 | [PARTIAL] | [HAS TESTS] | Image validation/upload services exist; complete handover evidence UI still needs connection. Test evidence: backend/src/image/image.service.spec.ts. |
| 8.5 | Damage assessment deducts credit and records PenaltyInfo | BE | SRS §3.7 | [CONNECTED] | [HAS TESTS] | Loan/inspection damage and penalty paths exist; add end-to-end penalty coverage. Test evidence: backend/src/common/penalty/penalty.service.spec.ts. |
| 8.6 | Pickup & return operations submitted via tRPC | INT/E2E | SRS §3.6 | [PARTIAL] | [PARTIAL] | Staff queue mutations are wired, but the dedicated handover screen is not. |

---

## MODULE 9 – Notifications
> SRS Section 3.8, Appendix B | Status: [CONNECTED]
> Backend: backend/src/notification/ | Frontend: frontend/src/features/notifications/ (tRPC connected)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 9.1 | Notification bell badge shows unread count and opens popover | FE | FR-APV-06 | [CONNECTED] | [READY] | Notification router and frontend polling/read actions are connected; lifecycle coverage is still needed. |
| 9.2 | In-app notifications polled every 60 seconds (TanStack Query) | FE | SRS Appendix B | [CONNECTED] | [READY] | Notification router and frontend polling/read actions are connected; lifecycle coverage is still needed. |
| 9.3 | Staff queue polled every 30 seconds | FE | SRS Appendix B | [CONNECTED] | [READY] | Notification router and frontend polling/read actions are connected; lifecycle coverage is still needed. |
| 9.4 | Equipment availability polled every 15 seconds | FE | SRS Appendix B | [CONNECTED] | [READY] | Notification router and frontend polling/read actions are connected; lifecycle coverage is still needed. |
| 9.5 | Backend generates notifications when request or loan status changes | BE | FR-APV-06 | [CONNECTED] | [READY] | Loan/approval services call notification generation paths. |
| 9.6 | In-app notification polling via tRPC | INT/E2E | FR-APV-06 | [CONNECTED] | [READY] | Notification router and frontend polling/read actions are connected; lifecycle coverage is still needed. |

---

## MODULE 10 – Appeals
> SRS Section 3.x | Status: [FE MOCK]
> Backend: appeal router/service not implemented | Frontend: frontend/src/features/borrower/appeals/, frontend/src/features/supervisor/appeals/ (mock-backed)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 10.1 | Borrower submits appeal against penalty with reason & evidence | FE | SRS §3.x | [FE MOCK] | [PARTIAL] | Mock appeal form only; no backend submission exists. |
| 10.2 | Supervisor reviews and approves or rejects penalty appeal | FE | SRS §3.x | [FE MOCK] | [PARTIAL] | Mock supervisor review only; no backend decision exists. |
| 10.3 | Backend penalty appeal creation and decision state machine | BE | SRS §3.x | [NOT IMPLEMENTED] | [NOT READY] | Appeal backend state machine is not implemented. |
| 10.4 | Appeal submission & decision via tRPC router | INT/E2E | SRS §3.x | [NOT IMPLEMENTED] | [NOT READY] | No real appeal tRPC router is available. |

---

## MODULE 11 – Admin System Management
> SRS Section 3.x | Status: [PARTIAL]
> Backend: backend/src/admin/, backend/src/cron/, backend/src/report/ | Frontend: frontend/src/features/admin/ (reads connected; stubs remain)

| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 11.1 | `getSystemStatus` returns DB ping latency and status (healthy / degraded / down) | BE | NFR-REL | [CONNECTED] | [HAS TESTS] | Implemented reads are connected; cron/config gaps remain explicit negative-test cases. Test evidence: tests/e2e/admin/admin-console-pages.spec.ts. |
| 11.2 | `listCronJobs` returns 8 planned cron jobs with `implemented: false` | BE | SRS §3.x | [CONNECTED] | [HAS TESTS] | Implemented reads are connected; cron/config gaps remain explicit negative-test cases. Test evidence: tests/e2e/admin/admin-console-pages.spec.ts. |
| 11.3 | `runCronJob` throws `NOT_IMPLEMENTED` | BE | SRS §3.x | [PARTIAL] | [PARTIAL] | Some cron jobs run; jobs requiring missing tables intentionally remain NOT_IMPLEMENTED. |
| 11.4 | getConfig returns read-only deployed technical configuration | BE | NFR-MNT | [CONNECTED] | [HAS TESTS] | Read-only technical config is implemented; updateConfig remains intentionally unsupported. Test evidence: tests/e2e/admin/admin-console-pages.spec.ts. |
| 11.5 | listAudit and getAuditById return audit records | BE | NFR-REL-04 | [CONNECTED] | [HAS TESTS] | Audit list/detail are implemented through AuditService. Test evidence: tests/e2e/admin/admin-console-pages.spec.ts. |
| 11.6 | Status dashboard UI renders live status, cron, audit, and service data | FE | SRS §5.1 | [CONNECTED] | [HAS TESTS] | Status/dashboard pages consume live hooks; unsupported actions show typed errors. Test evidence: tests/e2e/admin/admin-console-pages.spec.ts. |
| 11.7 | Status dashboard calls the admin system-status procedure | INT/E2E | NFR-REL | [CONNECTED] | [HAS TESTS] | `frontend/tests/admin/system-status.test.tsx` verifies `useSystemStatus` calls `trpc.admin.getSystemStatus.query()` and polls; 2/2 passed. |

---

## MODULE 12 – Non-Functional Requirements (NFRs)
> SRS Section 4 | Status: [CONNECTED & VERIFIABLE]

### 12.1 Security
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 12.1.1 | All business errors returned as typed codes (not raw stack traces) | BE | NFR-SEC | [CONNECTED] | [HAS TESTS] | `security.nfr.spec.ts`: 12.1.1–12.1.4 security checks pass 4/4. |
| 12.1.2 | Schema validation rejects malformed inputs on all implemented endpoints | BE/FE | NFR-SEC-03 | [CONNECTED] | [HAS TESTS] | `security.nfr.spec.ts` verifies malformed input rejection with Zod. |
| 12.1.3 | No raw SQL queries — all DB access goes through Prisma ORM (SQL injection prevention) | BE | NFR-SEC-04 | [CONNECTED] | [HAS TESTS] | `security.nfr.spec.ts` checks database boundary usage. |
| 12.1.4 | Session cookies use `httpOnly`, `sameSite: lax`, and conditional `secure` | BE | NFR-SEC-02 | [CONNECTED] | [HAS TESTS] | `security.nfr.spec.ts` verifies production cookie flags; session service specs also cover cookie behavior. |

### 12.2 Maintainability & Type Safety
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 12.2.1 | TypeScript strict mode compiles without errors across BE and FE | BE/FE | NFR-MNT-01 | [CONNECTED] | [READY] | Backend build and frontend typecheck passed in the current snapshot. |
| 12.2.2 | ESLint + Prettier config present and passes (`npm run lint`) | BE/FE | NFR-MNT-03 | [CONNECTED] | [READY] | Frontend lint passed with 0 errors and 7 existing Fast Refresh warnings. |
| 12.2.3 | tRPC schemas are shared between backend and frontend (end-to-end type safety) | INT | NFR-MNT-04 | [PARTIAL] | [PARTIAL] | Frontend contract is typed but remains a temporary local mirror; generated backend type export is still pending. |

### 12.3 Usability & UI Standards
| # | Test Item | Layer | SRS Req. | Impl. | Test Readiness | Notes |
|---|-----------|:-----:|----------|:-----:|:--------------:|-------|
| 12.3.1 | Error messages display Thai text from dictionary | FE | NFR-USB-03 | [CONNECTED] | [HAS TESTS] | `frontend/tests/nfr/usability.test.ts` verifies Thai error-message mappings. |
| 12.3.2 | Primary font is Sarabun (Thai-compatible) | FE | NFR-USB-01, SRS §5.1 | [CONNECTED] | [HAS TESTS] | `frontend/tests/nfr/usability.test.ts` verifies Sarabun configuration; usability suite passes 3/3. |
| 12.3.3 | Mobile breakpoint ≥375px & Desktop ≥1280px rendered correctly | FE | NFR-USB-02, NFR-PRT-01 | [CONNECTED] | [HAS TESTS] | `frontend/tests/nfr/usability.test.ts` verifies 375px/1280px responsive rules; usability suite passes 3/3. |

---

## Summary Dashboard

### 1. By Implementation & Connection Status

| Category | Modules | Current status |
|---|:---:|---|
| [CONNECTED] | 1, 2, 3, 4, 5, 7, 9 | Backend and frontend are wired for the implemented scope through tRPC/session cookies. |
| [PARTIAL] | 6, 8, 11, 12 | Connected pieces exist, but UI flows, stubs, cron work, or contract cleanup remain. |
| [FE MOCK] | 10 frontend | Appeal UI exists but still uses mock data. |
| [NOT IMPLEMENTED] | 10 backend/integration | Appeal backend router and state machine are missing. |

### 2. By Test Readiness

| Module | Test-item readiness | Main current limitation |
|---|---|---|
| 1. Auth & Session | HAS TESTS, with 1 partial item | Backend auth/session/middleware tests and frontend login/auth-flow tests pass; KU-domain backend enforcement remains. |
| 2. Admin User Management | HAS TESTS | Admin backend suite is included in the full backend run; frontend admin tests exist. Full backend run passes 32 suites / 354 tests. |
| 3. Credit Tier | HAS TESTS | Module 3.1–3.5: 7/7 tests passed. |
| 4. Lending Settings | READY | Add rollback, validation, and form tests. |
| 5. Equipment Management | READY, with 2 partial items | Add catalog/inventory/browser tests; scheduled/decommission work remains partial. |
| 6. Loan Request | HAS TESTS backend/E2E, PARTIAL frontend/integration | Approval-policy and loan-request service tests pass (23/23); E2E coverage exists but is blocked at login, and the request form create flow remains session-local. |
| 7. Approval Workflow | READY | Dedicated approval tests are still needed. |
| 8. Handover/Return | PARTIAL | Handover UI and maintenance jobs remain incomplete. |
| 9. Notifications | READY | Lifecycle tests are still needed. |
| 10. Appeals | NOT READY backend/integration | Backend does not exist; UI is mock-backed. |
| 11. Admin System | READY for implemented reads, PARTIAL for stubs | Cron/config gaps remain. |
| 12. NFRs | HAS TESTS for 12.1.1–12.1.4 and 12.3.1–12.3.3; PARTIAL contract | Security 4/4 and usability 3/3 passed; generated contract remains pending and full Vitest/build environment is still blocked. |

> Execution status is recorded in Current test execution status above: backend build/typecheck/lint and full backend Jest pass; dedicated frontend auth/NFR test files pass individually, while full frontend Vitest/build remain blocked by spawn EPERM.

---
## Existing Test Files (Reference)

| File | Type | Coverage / Scope |
|------|:----:|------------------|
| [`auth.service.spec.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/src/auth/auth.service.spec.ts) | BE Unit | `authenticate()` — 5 cases; `getProfile()` — 1 case |
| [`session.service.spec.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/src/auth/session.service.spec.ts) | BE Unit | Cookie flags, expiry, secret handling — 12 cases |
| [`app.controller.spec.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/src/app.controller.spec.ts) | BE Unit | Smoke test only (1 case) |
| [`prisma.service.spec.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/src/prisma.service.spec.ts) | BE Unit | Prisma connect/disconnect |
| `backend/src/common/approval/approval-policy.spec.ts` | BE Unit | Module 6 approval-policy matrix (T0–T3 × D0–D3) |
| `backend/src/loan/loan.request.service.spec.ts` | BE Unit | Module 6 loan request service — eligibility, validation, approval routing, and request rules |
| `tests/e2e/loan-request.spec.ts` | INT/E2E | Module 6 loan request flows — 6.1, 6.2, 6.11; currently blocked at login |
| [`app.e2e-spec.ts`](file:///C:/Users/veerasak/.gemini/antigravity-ide/scratch/Software-Engineering-Project/backend/test/app.e2e-spec.ts) | BE E2E | Smoke test (GET /) |

---

## Recommended Next Tests to Write (Prioritized by Layer)

### 🥇 Priority 1: Backend Unit Tests (`[BE]`)
> Objective: Achieve ≥60% business logic test coverage (SRS NFR-MNT-02)
1. **`admin.service.spec.ts`** — Unit test `createUser()`, `updateUser()`, `changeRole()`, `resetPassword()`, `setUserBan()`, and `listUsers()`.
2. **`credit-tier.service.spec.ts`** — Completed: tier boundaries, missing-tier, and limit cases are covered; 7/7 Module 3 tests pass.
3. **`admin.service.spec.ts` (Lending Settings)** — Unit test `getLendingSettings()` and `updateLendingSettings()` with atomic rollback.
4. **`auth.middleware.spec.ts`** — Completed: authentication and all role-guard paths are covered and pass in the full backend suite.

### 🥈 Priority 2: Full-Stack Integration & E2E Tests (`[INT/E2E]`)
> Objective: Verify connected user journeys over tRPC & Cookies
1. **`auth.e2e-spec.ts`** (Full login cycle) — Test KU email/local login -> session cookie set -> `/auth/me` profile resolution -> logout cookie removal.
2. **`admin-users.e2e-spec.ts`** (Admin CRUD cycle) — Test admin listing users -> creating user with generated temporary password -> changing user role -> banning & lifting ban -> self-ban prevention.

### 🥉 Priority 3: Frontend Component & Form Tests (`[FE]`)
> Objective: Prevent regression on client-side validation and interactive state
1. **`login-page.spec.tsx` & `login.schema.spec.ts`** — Verify `@ku.ac.th` / `@ku.th` domain validation, required error messages, and accordion switching.
2. **`users-page.spec.tsx`** — Verify stat chips filtering, search query filtering, and modal display states.