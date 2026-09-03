/**
 * ULMs tRPC contract - TEMPORARY frontend-side type source.
 * ============================================================
 *
 * This file exists so the frontend tRPC client is fully typed TODAY, before the
 * NestJS backend exports its own router type. It mirrors the agreed contract
 * (see constants/api-endpoints.ts + trpc-meeting.pdf: ว-05 domains/verbs, ว-07
 * pagination, ว-03 ctx.user).
 *
 * ⚠️ REPLACE, don't extend: once the backend's `nestjs-trpc` schema is
 * generated/exported, delete the router body below and re-export the real type:
 *
 *     export type { AppRouter } from "<path-or-package-to-backend-approuter>";
 *
 * Only the `AppRouter` *type* is consumed on the frontend (via `import type`),
 * so this router value is erased at build time - @trpc/server never ships in the
 * client bundle.
 */
import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { ServerUser } from "@/features/auth/user.adapter";
import type {
  ServerItem,
  ServerItemDetail,
  ServerItemUnit,
} from "@/features/borrower/catalog/item.adapter";
import type { ServerCredit } from "@/features/account/credit.adapter";
import type { ServerAdminUser } from "@/features/admin/users/admin-user.adapter";
import type { ServerAuditEvent } from "@/features/admin/audit/audit-event.adapter";
import type {
  EquipmentType,
  EquipmentUnit,
  LoanRequest,
  Loan,
  Appeal,
  DamageReport,
  Notification,
} from "@/types/domain";

const t = initTRPC.create();
const proc = t.procedure;

/** ว-07 shared list input. */
const pageInput = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
  q: z.string().optional(),
});

/** ว-07 shared list output. */
type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
const idInput = z.object({ id: z.string() });
/** Domains already on the real backend key by int, not string. */
const numericIdInput = z.object({ id: z.number() });

/** Cast helper for placeholder resolvers (types only; never runs in the client). */
const as = <T>() => ({}) as T;

export const appRouter = t.router({
  // ── auth ──────────────────────────────────────────────
  auth: t.router({
    // NOTE: auth returns ServerUser, not the frontend's `User`. The backend
    // sends database-shaped fields (numeric id, firstName/lastName,
    // facultyName, creditTier); features/auth/user.adapter.ts converts.
    // The other domains below still describe `User` because they are still
    // mock-only - fix each one as its router lands.
    me: proc.query(() => as<ServerUser>()),
    login: proc
      .input(z.object({ username: z.string(), password: z.string() }))
      .mutation(() => as<{ user: ServerUser }>()),
    logout: proc.mutation(() => as<{ ok: true }>()),
  }),

  // ── item ──────────────────────────────────────────────
  item: t.router({
    // NOTE: item returns ServerItem, not the frontend's EquipmentType, and its
    // ids are numbers. features/borrower/catalog/item.adapter.ts converts.
    // listCategories exists in the contract but the server answers
    // NOT_IMPLEMENTED: the schema has no category table.
    list: proc
      .input(
        pageInput.extend({
          tier: z.string().optional(),
          ownerGroupKey: z.number().optional(),
          availableOnly: z.boolean().optional(),
        }),
      )
      .query(() => as<Paginated<ServerItem>>()),
    // getById answers `itemDetail` - the summary plus every unit, so the detail
    // page needs one round trip, not two.
    getById: proc.input(numericIdInput).query(() => as<ServerItemDetail>()),
    // Polled every 15s by the detail page. Deliberately small: three numbers,
    // no units and no history.
    getAvailability: proc.input(numericIdInput).query(() =>
      as<{
        availableUnits: number;
        totalUnits: number;
        nextAvailableAt: string | null;
      }>(),
    ),
    listCategories: proc.query(() => as<{ id: string; name: string }[]>()),
    listUnits: proc.input(numericIdInput).query(() => as<ServerItemUnit[]>()),
    create: proc.input(z.object({}).passthrough()).mutation(() => as<EquipmentType>()),
    update: proc
      .input(z.object({ id: z.string() }).passthrough())
      .mutation(() => as<EquipmentType>()),
    updateUnitStatus: proc
      .input(z.object({ unitId: z.string(), status: z.string() }))
      .mutation(() => as<EquipmentUnit>()),
  }),

  // ── loan ──────────────────────────────────────────────
  loan: t.router({
    list: proc
      .input(pageInput.extend({ status: z.string().optional() }))
      .query(() => as<Paginated<Loan>>()),
    getById: proc.input(idInput).query(() => as<Loan>()),
    create: proc.input(z.object({}).passthrough()).mutation(() => as<LoanRequest>()),
    cancel: proc.input(idInput).mutation(() => as<{ ok: true }>()),
    allocate: proc
      .input(z.object({ requestId: z.string() }).passthrough())
      .mutation(() => as<LoanRequest>()),
    confirmPickup: proc
      .input(z.object({ loanId: z.string() }).passthrough())
      .mutation(() => as<Loan>()),
    return: proc
      .input(z.object({ loanId: z.string() }).passthrough())
      .mutation(() => as<Loan>()),
    requestExtension: proc.input(idInput).mutation(() => as<Loan>()),
  }),

  // ── reservation ───────────────────────────────────────
  reservation: t.router({
    list: proc.input(pageInput).query(() => as<Paginated<unknown>>()),
    getSlots: proc
      .input(z.object({ roomId: z.string(), date: z.string() }))
      .query(() => as<{ start: string; end: string; taken: boolean }[]>()),
    create: proc.input(z.object({}).passthrough()).mutation(() => as<{ id: string }>()),
    cancel: proc.input(idInput).mutation(() => as<{ ok: true }>()),
  }),

  // ── approval ──────────────────────────────────────────
  approval: t.router({
    list: proc.input(pageInput).query(() => as<Paginated<LoanRequest>>()),
    getById: proc.input(idInput).query(() => as<LoanRequest>()),
    decide: proc
      .input(z.object({ id: z.string(), decision: z.enum(["approved", "rejected"]), note: z.string().optional() }))
      .mutation(() => as<{ ok: true }>()),
  }),

  // ── appeal ────────────────────────────────────────────
  appeal: t.router({
    list: proc.input(pageInput).query(() => as<Paginated<Appeal>>()),
    getById: proc.input(idInput).query(() => as<Appeal & { damageReport: DamageReport }>()),
    create: proc
      .input(z.object({ damageReportId: z.string(), reason: z.string() }))
      .mutation(() => as<Appeal>()),
    decide: proc
      .input(z.object({ id: z.string(), decision: z.enum(["accepted", "rejected"]) }))
      .mutation(() => as<Appeal>()),
  }),

  // ── credit ────────────────────────────────────────────
  credit: t.router({
    // NOTE: credit returns ServerCredit; features/account/credit.adapter.ts
    // converts. `auth.me` already carries score and tier for the shell - this
    // adds the borrow window and the penalties actually in force.
    me: proc.query(() => as<ServerCredit>()),
    getById: proc.input(numericIdInput).query(() => as<ServerCredit>()),
  }),

  // ── inspection ────────────────────────────────────────
  inspection: t.router({
    list: proc.input(pageInput).query(() => as<Paginated<unknown>>()),
    getById: proc.input(idInput).query(() => as<unknown>()),
    create: proc.input(z.object({}).passthrough()).mutation(() => as<DamageReport>()),
    confirm: proc.input(idInput).mutation(() => as<{ ok: true }>()),
  }),

  // ── notification ──────────────────────────────────────
  // Live on the server (backend/src/notification/). Unlike the placeholder
  // domains above, `Notification` here is the real thing: the backend's
  // `notificationOutput` mirrors types/domain.ts field for field, so no
  // adapter is needed and this describes what actually comes back.
  notification: t.router({
    list: proc
      .input(pageInput.extend({ unreadOnly: z.boolean().default(false) }))
      .query(() => as<Paginated<Notification>>()),
    /** Badge only, so the bell can poll without fetching a page of rows. */
    unreadCount: proc.query(() => as<{ unread: number }>()),
    markRead: proc.input(idInput).mutation(() => as<{ ok: true }>()),
    markAllRead: proc.mutation(() => as<{ ok: true }>()),
  }),

  // ── report ────────────────────────────────────────────
  report: t.router({
    dashboard: proc.query(() => as<Record<string, number>>()),
    analytics: proc.input(z.object({ period: z.string().optional() })).query(() => as<unknown>()),
    export: proc.input(z.object({}).passthrough()).mutation(() => as<{ url: string }>()),
    consolidated: proc.input(z.object({ period: z.string().optional() })).query(() => as<unknown>()),
  }),

  // ── admin ─────────────────────────────────────────────
  admin: t.router({
    // NOTE: admin returns ServerAdminUser, not the frontend's User, and keys
    // accounts by int. features/admin/users/admin-user.adapter.ts converts.
    // Only the procedures the UI actually calls are typed here; the rest are
    // live on the server (30 procedures total) and can be added as they are
    // wired up.
    listUsers: proc
      .input(pageInput.extend({ role: z.string().optional(), status: z.string().optional() }))
      .query(() => as<Paginated<ServerAdminUser>>()),
    getUserById: proc.input(numericIdInput).query(() => as<ServerAdminUser>()),
    createUser: proc
      .input(
        z.object({
          email: z.string(),
          studentId: z.string(),
          firstName: z.string(),
          lastName: z.string(),
          role: z.string(),
          initialCredit: z.number().optional(),
        }),
      )
      .mutation(() => as<{ id: number; temporaryPassword: string | null }>()),
    changeRole: proc
      .input(z.object({ id: z.number(), role: z.string() }))
      .mutation(() => as<ServerAdminUser>()),
    setUserActive: proc
      .input(z.object({ id: z.number(), active: z.boolean() }))
      .mutation(() => as<{ ok: true }>()),
    setUserBan: proc
      .input(
        z.object({
          id: z.number(),
          banned: z.boolean(),
          reason: z.string().optional(),
          days: z.number().optional(),
        }),
      )
      .mutation(() => as<{ ok: true }>()),
    resetPassword: proc
      .input(z.object({ id: z.number(), newPassword: z.string().optional() }))
      .mutation(() => as<{ ok: true; temporaryPassword: string | null }>()),
    listAudit: proc
      .input(pageInput.extend({ action: z.string().optional() }))
      .query(() => as<Paginated<ServerAuditEvent>>()),
    getAuditById: proc.input(numericIdInput).query(() => as<ServerAuditEvent>()),
  }),
});

/** The router type the tRPC client is generic over. Replace with the backend's. */
export type AppRouter = typeof appRouter;
