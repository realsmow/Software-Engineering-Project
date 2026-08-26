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
  User,
  EquipmentType,
  EquipmentUnit,
  LoanRequest,
  Loan,
  Appeal,
  DamageReport,
  Notification,
  CreditBand,
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
    list: proc.input(pageInput).query(() => as<Paginated<EquipmentType>>()),
    getById: proc.input(idInput).query(() => as<EquipmentType>()),
    getAvailability: proc
      .input(idInput)
      .query(() => as<{ availableUnits: number; nextAvailableAt?: string }>()),
    listCategories: proc.query(() => as<{ id: string; name: string }[]>()),
    listUnits: proc.input(idInput).query(() => as<EquipmentUnit[]>()),
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
    me: proc.query(() => as<{ score: number; band: CreditBand; demerits: unknown[] }>()),
    getById: proc
      .input(idInput)
      .query(() => as<{ score: number; band: CreditBand; demerits: unknown[] }>()),
  }),

  // ── inspection ────────────────────────────────────────
  inspection: t.router({
    list: proc.input(pageInput).query(() => as<Paginated<unknown>>()),
    getById: proc.input(idInput).query(() => as<unknown>()),
    create: proc.input(z.object({}).passthrough()).mutation(() => as<DamageReport>()),
    confirm: proc.input(idInput).mutation(() => as<{ ok: true }>()),
  }),

  // ── notification ──────────────────────────────────────
  notification: t.router({
    list: proc.input(pageInput.partial()).query(() => as<Paginated<Notification>>()),
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
    listUsers: proc.input(pageInput).query(() => as<Paginated<User>>()),
    getUserById: proc.input(idInput).query(() => as<User>()),
    createUser: proc.input(z.object({}).passthrough()).mutation(() => as<User>()),
    updateUser: proc.input(z.object({ id: z.string() }).passthrough()).mutation(() => as<User>()),
    setUserActive: proc
      .input(z.object({ id: z.string(), active: z.boolean() }))
      .mutation(() => as<{ ok: true }>()),
    resetPassword: proc.input(idInput).mutation(() => as<{ ok: true }>()),
    changeRole: proc.input(z.object({ id: z.string(), role: z.string() })).mutation(() => as<User>()),
    setUserBan: proc
      .input(z.object({ id: z.string(), banned: z.boolean(), reason: z.string().optional() }))
      .mutation(() => as<{ ok: true }>()),
    getLendingSettings: proc.query(() => as<Record<string, unknown>>()),
    updateLendingSettings: proc.input(z.object({}).passthrough()).mutation(() => as<{ ok: true }>()),
    getConfig: proc.query(() => as<Record<string, unknown>>()),
    updateConfig: proc.input(z.object({}).passthrough()).mutation(() => as<{ ok: true }>()),
    getSystemStatus: proc.query(() => as<Record<string, unknown>>()),
    listCronJobs: proc.query(() => as<unknown[]>()),
    runCronJob: proc.input(z.object({ job: z.string() })).mutation(() => as<{ ok: true }>()),
    listAudit: proc.input(pageInput.extend({ action: z.string().optional() })).query(() => as<Paginated<unknown>>()),
    getAuditById: proc.input(idInput).query(() => as<unknown>()),
  }),
});

/** The router type the tRPC client is generic over. Replace with the backend's. */
export type AppRouter = typeof appRouter;
